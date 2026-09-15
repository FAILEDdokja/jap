# Deployment and disaster-recovery readiness

Phase 4 deliverable for docs/backend/09 §7 and docs/backend/10 Phase 4.

> **No production deployment has occurred.** There is no production
> environment, no provider account, and no deployed instance of this system.
> This document records requirements and decisions; where a decision belongs to
> someone who has not made it, it says **DECISION REQUIRED** instead of
> guessing.

Decision records: `docs/decisions/0005-deployment-and-residency.md` (topology
and residency), `0006-cors-policy.md`, `0007-backup-rpo-rto.md`.

---

## 1. Topology

```
 Browser
   │  HTTPS
   ▼
 Static host / CDN  ──────────►  dist/  (Vite build: HTML, JS, CSS, woff2)
   │
   │  XHR, HTTPS, credentials: include
   ▼
 API origin (Fastify, Node 20+)          ← CORS allowlist, cookie session
   │
   ▼
 PostgreSQL (India region)               ← Prisma; append-only audit_events
```

One API process. Nothing in the current design requires more, and two accepted
decisions assume it: in-process sessions (0001) and in-process rate-limit
counters (0004). **Scaling out is a decision with prerequisites, not a slider**
— both must move to a shared store first.

---

## 2. Hosting — DECISION REQUIRED

No provider has been selected. Requirements any candidate must meet:

| Component | Requirements |
| --- | --- |
| **Frontend** | Static file hosting. Serves `index.html` at `/`, `.js` as `text/javascript`, `.woff2` as `font/woff2`. **No SPA fallback rewrite needed** — the app uses hash routing. Should set the CSP from `docs/decisions/0011-frontend-assets.md`. |
| **Backend** | Node 20+. HTTPS termination. Environment-variable secrets. Separate liveness and readiness probes. Rolling deploy. **India region.** |
| **PostgreSQL** | **India region.** Automated encrypted backups with PITR. TLS-only connections. Managed strongly preferred (0005). |

---

## 3. Data residency — DECIDED

**All personal and health data stays in India**: the database primary, any
replica, all backups, and any log sink that could contain personal data.

A provider without an India region is disqualified. Rationale and legal basis:
`docs/decisions/0005-deployment-and-residency.md`.

Static frontend assets may be edge-cached anywhere (they contain no personal
data). **No API response may be cached at an edge outside India.**

---

## 4. Environments

| | dev | staging | prod |
| --- | --- | --- | --- |
| Database | local Docker | dedicated, India region | dedicated, India region |
| `NODE_ENV` | `development` | `production` | `production` |
| ABDM | `mock` | sandbox | production (post-certification only) |
| Data | synthetic seed | synthetic only | synthetic until the 0009 gate passes |
| `/docs` | on | off (opt-in) | off |
| Secrets | `.env` (gitignored) | secrets manager | secrets manager |

Staging runs `NODE_ENV=production` deliberately: the production configuration
gate must be exercised before prod, not discovered there.

---

## 5. Configuration

Every value is an environment variable validated at boot by
`backend/src/config/env.ts`. See `backend/.env.example` for the full annotated
list.

**Production refuses to start** when any of the following is true — it never
falls back to a development default:

- `SESSION_SECRET` is a known dev default, shorter than 32 characters, looks
  like a placeholder, or has too little character variety
- `SESSION_SECURE` is not `true`; or `SameSite=None` without `Secure`
- `CORS_ORIGINS` is empty, contains `*`, contains a loopback origin, contains a
  non-`https` origin, is not an absolute origin, or has a trailing slash
- `DATABASE_URL` is the local default or points at a loopback host
- `AUDIT_STORE` is not `postgres`
- `AUDIT_FAILURE_MODE` is not `closed`
- `RATE_LIMIT_ENABLED` is `false`
- `DOCS_ENABLED` is `true`
- `METRICS_ENABLED` is `true` without a `METRICS_TOKEN`

All problems are reported at once, and the report never echoes a secret's
value. Evidence: `backend/tests/config.test.ts`.

---

## 6. HTTPS / TLS

- TLS 1.2+ everywhere. Plain HTTP is redirected, never served.
- The session cookie is `Secure` in production (enforced at boot).
- HSTS: `max-age=15552000; includeSubDomains`, emitted by the API when
  `HSTS_ENABLED=true` (the production default). **No `preload`** until the
  domain is final — preload is effectively irreversible.
- If the platform's TLS terminator already sets HSTS, set `HSTS_ENABLED=false`.
- Frontend must make no mixed-content calls; the API origin is https-only,
  which the CORS gate enforces.

---

## 7. CORS origins

Set `CORS_ORIGINS` to the exact frontend origin(s) per environment, and
`CORS_CREDENTIALS=true` (the session is a cookie). Never `*`. See
`docs/decisions/0006-cors-policy.md`.

---

## 8. Secrets management

| Secret | Notes |
| --- | --- |
| `SESSION_SECRET` | ≥32 chars from a CSPRNG. Rotating it invalidates the rate limiter's target buckets (harmless) but not sessions (they are server-side records). |
| `DATABASE_URL` | Contains the database password. Never logged — the config error reporter prints field names only. |
| `METRICS_TOKEN` | Required in production. |
| `ABDM_CLIENT_ID` / `ABDM_CLIENT_SECRET` | Not used yet (0010). Separate values per environment. |

Rules: injected as environment variables at runtime; never baked into an image;
never committed. `.gitignore` covers `.env`, `.env.local`, `.env.*.local`,
`backend/.env`. The only committed env files are `.env.example` templates.

---

## 9. Database migrations

- Applied with `prisma migrate deploy` (**never** `migrate dev`), as a separate
  step **before** the new application version is released.
- **Backward-compatible only**: add columns nullable or with a default; backfill
  in a separate step; drop only in a later release. This is what makes the
  rollback in §11 work without a database restore.
- A destructive change must be split across releases.
- CI validates that the schema and the migration files agree.

**Audit-specific:** `audit_events` carries `BEFORE UPDATE` / `BEFORE DELETE`
triggers. A migration that needs to touch existing audit rows must disable them
explicitly, which is deliberately conspicuous in review.

---

## 10. Backup and restore

Targets are **proposed, not accepted** — see
`docs/decisions/0007-backup-rpo-rto.md`.

| | Proposed | Status |
| --- | --- | --- |
| RPO | 5 minutes (continuous WAL / PITR, 30-day window) | **DECISION REQUIRED** |
| RTO | 4 hours | **DECISION REQUIRED** |
| Encryption at rest | required | decided |
| Backup region | India | decided |
| Restore rehearsal | quarterly, timed, recorded | decided (not yet possible) |

**Restore verification uses the audit hash chain.** After any restore, run the
integrity verifier and require `ok: true`; the chain turns "did this restore
silently lose rows?" into an answerable question. Full runbook skeleton in 0007.

**No backup has been configured and no restore has been rehearsed**, because no
production database exists.

---

## 11. Deploy and rollback

**Deploy**

1. CI green: frontend typecheck + build, backend typecheck + tests, Prisma
   schema/migration validation, dependency audit.
2. `prisma migrate deploy`.
3. Deploy the new version. The platform must wait for `GET /health/ready` to
   return 200 before routing traffic.
4. Watch the 0008 alert conditions for one release window.

**Rollback**

Redeploy the previous application version. Migrations are backward-compatible,
so the old version runs against the new schema; **the schema is not rolled
back**. A change that cannot satisfy this must be split across releases.

**Rollback does not require a database restore.** That is the point of the
migration discipline in §9.

---

## 12. Probes

| Probe | Endpoint | Expected | Notes |
| --- | --- | --- | --- |
| Liveness | `GET /health` | 200 always while the process is healthy | Performs no downstream I/O. **Must not** be pointed at `/health/ready`, or a database blip causes a restart loop. |
| Readiness | `GET /health/ready` | 200 ready / 503 not_ready | Checks PostgreSQL. 503 drains the instance without killing it. |

Suggested: liveness every 10 s with 3 failures to restart; readiness every 5 s
with 2 failures to drain.

---

## 13. Open items summary

| Item | Status |
| --- | --- |
| Provider selection | **DECISION REQUIRED** (Dhishan/Linus) |
| RPO / RTO acceptance | **DECISION REQUIRED** (Dhishan/Linus) |
| Audit retention | **DECISION REQUIRED** (0003, needs legal) |
| On-call rota and alert routing | **not established** |
| Custom domains | not chosen |
| Backup configuration | not possible before a provider exists |
| Restore rehearsal | not possible before a database exists |
