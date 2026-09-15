# 0008 — Observability

- **Date:** 2026-09-15
- **Status:** Accepted
- **Owner:** Backend (engineering)
- **Requirement:** docs/backend/09 §5 (Observability)

## Decision

### Logs

Structured JSON (pino), one `http.request` completion line per request with a
fixed field set:

`requestId`, `traceId?`, `method`, `route`, `status`, `durationMs`,
`actorId?`, `role?`, `orgId?`

- `route` is the Fastify **route template** (`/api/v1/patients/:id`), never the
  raw URL — raw URLs carry patient ids and query strings.
- `actorId`/`orgId` are internal opaque ids, present only when a session exists.
- **Never logged:** OTPs, passwords, session ids or secrets, full ABHA values,
  clinical record contents, patient names, raw request bodies. The pino
  `redact` list covers `cookie`, `authorization`, `set-cookie`, and the
  credential-bearing body fields as defence in depth.

### Metrics

An in-process Prometheus registry exposed at `GET /metrics` (unversioned, not
in the OpenAPI document, bearer-token protected — the token is **mandatory in
production**).

| Metric | Type | Labels |
| --- | --- | --- |
| `jap_http_requests_total` | counter | method, route, status class |
| `jap_http_errors_total` | counter | method, route, status class |
| `jap_http_request_duration_ms` | histogram | method, route |
| `jap_auth_attempts_total` | counter | result, role |
| `jap_session_events_total` | counter | event |
| `jap_patient_verification_total` | counter | stage, result |
| `jap_audit_writes_total` | counter | result |
| `jap_database_failures_total` | counter | source |
| `jap_upstream_failures_total` | counter | (for the ABDM adapter, Phase 5) |
| `jap_rate_limited_total` | counter | policy, dimension |

**Label discipline:** every label is a low-cardinality, server-chosen value.
No user id, patient id, ABHA, IP or free text is ever a label — that would turn
the metrics endpoint into a PHI side channel and blow up cardinality at the
same time.

### Probes

`GET /health` is liveness and does **no** downstream I/O.
`GET /health/ready` checks PostgreSQL and returns 503 when the instance should
be drained. Keeping them separate is the point: a database blip must drain
traffic, not restart the process.

### Tracing

A `Tracer` interface with a no-op default, plus W3C `traceparent` parsing so an
edge-initiated trace id flows into our logs. No tracing backend is deployed —
Phase 4 forbids infrastructure no requirement has asked for, and correlation by
`requestId` is sufficient at one service. Adopting OpenTelemetry later means
implementing `Tracer` and calling `setTracer()`; no call site changes.

## Alert conditions

| Alert | Condition | Severity | Why |
| --- | --- | --- | --- |
| **Audit write failures** | `increase(jap_audit_writes_total{result="failure"}[5m]) > 0` | **critical, page** | Fail-closed means users are being refused, and auditability is at risk. Never a warning. |
| **Readiness failing** | `/health/ready` non-200 for > 2 min | critical, page | The instance cannot serve. |
| **Database failures** | `increase(jap_database_failures_total[5m]) > 0` | critical | Precedes the above. |
| **5xx rate** | `rate(jap_http_errors_total{status="5xx"}[5m]) / rate(jap_http_requests_total[5m]) > 0.02` for 10 min | high | Sustained server-side breakage. |
| **Auth failure ratio** | failures / attempts > 0.5 for 15 min, with attempts > 20 | high | Credential-stuffing signature, distinct from ordinary typos. |
| **Rate-limit rejections** | `increase(jap_rate_limited_total[10m]) > 100` | medium | Abuse or a broken client; the `dimension` label distinguishes them. |
| **Latency** | p95 `jap_http_request_duration_ms` > 1000 ms for 10 min | medium | Degradation before it becomes an outage. |
| **Upstream (ABDM) failures** | `increase(jap_upstream_failures_total[5m]) > 5` | medium | Becomes meaningful when the adapter ships. |

Alert *routing* (who is paged, through what) is **not decided** — there is no
on-call rota yet. That is a prerequisite of going live, tracked in 0005.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **`prom-client`** | A dependency for a fixed, small metric set we can render in ~120 lines. Swapping it in later touches one file. Revisit if exemplars or native histograms are needed. |
| **OpenTelemetry + a collector now** | Speculative infrastructure for a single service; `requestId` correlation already answers the questions we have. The seam is in place. |
| **Logging patient ids for debuggability** | Rejected outright — that is PHI in a log store with a different retention and access model than the database. |
| **Exposing `/metrics` unauthenticated** | Allowed in dev; in production the configuration gate requires a token, because traffic shape is itself information. |

## Evidence

- Implementation: `backend/src/observability/{metrics,http,tracing}.ts`,
  `backend/src/modules/health/routes.ts`,
  `backend/src/modules/observability/routes.ts`
- Tests: `backend/tests/observability.test.ts`, `backend/tests/health.test.ts`
