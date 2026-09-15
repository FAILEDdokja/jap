# 0005 — Deployment topology and data residency

- **Date:** 2026-09-15
- **Status:** **DECISION REQUIRED** (with one part decided — see below)
- **Owner:** Dhishan / Linus (hosting/provider); legal review for residency
- **Requirement:** docs/backend/09 §7, docs/backend/10 Phase 4

## What IS decided

### India-region data residency — **decided, mandatory**

All personal and health data — the PostgreSQL primary, its replicas, its
backups, and any log store that could contain personal data — **must be located
in India**. Any provider chosen must offer an India region and must be
configured to use it for every one of those stores.

This is not a preference. The ABDM Health Data Management Policy governs health
data handled in the ABDM ecosystem, and DPDP Act 2023 §16 empowers the
Government to restrict transfer of personal data to notified countries. A
health-records platform intending to integrate with ABDM cannot plan on
non-Indian storage and hope to sort it out later. Choosing a region is cheap on
day one and extremely expensive to change after the first real record exists.

**Consequence:** a provider without an India region is disqualified regardless
of price or convenience.

### Environment separation — decided

Three environments: **dev**, **staging**, **prod**. Each has its own database,
its own secrets, and its own ABDM credentials. No environment shares a database
with another. Staging is the only environment permitted to talk to the ABDM
sandbox; prod talks only to ABDM production once certified (0010).

### Configuration model — decided

Everything is environment variables validated at boot by
`backend/src/config/env.ts`. Production fails fast on unsafe defaults. No
environment-specific code branches beyond what that file exposes.

## What is NOT decided

**No cloud provider has been selected.** The repository contains no
provider-specific infrastructure, and none will be invented here.

Concretely undecided:

| Item | Options | Notes |
| --- | --- | --- |
| Backend hosting | Managed container service / a VM / a PaaS | Must support: an India region, HTTPS termination, environment secrets, a liveness and a readiness probe with independent semantics, and rolling deploys. |
| PostgreSQL hosting | Managed Postgres / self-managed on a VM | Must support: an India region, automated encrypted backups, PITR, TLS-only connections. Managed is strongly preferred — see Rationale. |
| Frontend hosting | Static host or CDN | The build is static. Hash routing means **no SPA fallback rewrite is needed**. The host must serve `index.html` at `/` and `.js` as `text/javascript`. If it fronts an India-region origin, the CDN's edge caching of *static assets only* is not a residency concern; no API response may be cached at an edge outside India. |
| Custom domains | — | Drives the CORS allowlist (0006) and the cookie `Secure`/`SameSite` posture (0001). |
| Secrets manager | Provider secret store / a dedicated manager | Requirement: secrets are injected as environment variables at runtime, never baked into an image, never in the repository. |

## Rationale for the preferences stated above

- **Managed PostgreSQL over self-managed:** the backup, PITR and restore-testing
  obligations in 0007 are the hard part of running a database, and there is no
  on-call rota for this project. Buying that is cheaper than staffing it.
- **Single API instance to start:** nothing in the current design needs more,
  and two current decisions (in-process sessions in 0001, in-process rate-limit
  counters in 0004) assume one. Scaling out is a *decision with prerequisites*,
  not a slider.

## TLS / HTTPS

- TLS 1.2+ everywhere; plain HTTP is not served, only redirected.
- HSTS: emitted by the API when `HSTS_ENABLED=true` (the default in
  production), `max-age` 180 days, `includeSubDomains`, **no `preload`** until
  the domain is final — preload is effectively irreversible.
- If the chosen platform's TLS terminator already sets HSTS, set
  `HSTS_ENABLED=false` to avoid a duplicate header.

## Database migrations

- Applied with `prisma migrate deploy` (never `migrate dev`) as a **separate
  step before** the new application version is released.
- Migrations must be backward-compatible with the currently running version:
  add columns nullable or with defaults, backfill separately, and only drop in
  a later release. This is what makes the rollback below possible.
- The CI gate validates that the schema and the migration files agree.

## Deploy and rollback

1. CI green (typecheck, tests, migration validation, dependency audit).
2. `prisma migrate deploy`.
3. Deploy the new version; the platform waits for `GET /health/ready` before
   sending traffic.
4. Watch the alert conditions in 0008 for one release window.

**Rollback:** redeploy the previous application version. Because migrations are
backward-compatible, the old version runs against the new schema; the schema is
*not* rolled back. A migration that cannot satisfy this (a destructive change)
must be split across releases instead.

## Probes

| Probe | Endpoint | Semantics |
| --- | --- | --- |
| Liveness | `GET /health` | Process-only. **Must not** be pointed at `/health/ready` — a database blip would otherwise cause a restart loop. |
| Readiness | `GET /health/ready` | Checks PostgreSQL. 503 drains the instance. |

## Next step

Escalated to Dhishan/Linus: choose a provider that satisfies the India-region
constraint. Until then the deployment section of the Phase 4 checklist is
**PARTIAL by design** — the requirements and the residency decision are
recorded, the provider-specific pipeline deliberately is not invented.
