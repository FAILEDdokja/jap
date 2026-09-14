# Jan Arogya Nexus

**Consent-Aware Continuity of Care** — a healthcare coordination platform that
assembles the *authorized* parts of a patient's history, spread across separate
hospitals, laboratories and pharmacies, into one reviewed clinical view, and
writes every access to an immutable audit trail.

Built for the Avishkar Engineering & Technology competition. All patient data in
the app is **synthetic** and labelled as sample data. Not affiliated with any
government body; ABHA / ABDM identity is a clearly-marked simulation, not a live
integration.

---

## Run it

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** (Vite prints the exact URL; it uses the next
free port if 5173 is taken).

Other commands:

```bash
npm run build      # type-check + production build to dist/
npm run preview     # serve the production build
npm run typecheck   # tsc --noEmit
```

Node 18+ recommended (developed on Node 24).

---

## Demo mode & sign-in

The app runs **fully offline in demo mode** — seeded data, persisted in the
browser (`localStorage`), no backend required.

On the sign-in screen, pick a **demo persona** (one click), or type any seeded
email — the password is not checked in demo mode.

| Persona | Role | What to show |
| --- | --- | --- |
| Dr. Aroha Deshpande | Clinician · Nashik City Medical College | In-tenant patient workspace, prescribe / order labs / tasks |
| **Dr. Farah Sheikh** | Clinician · Sanjivani (Pune) | **Cross-tenant access gate** → request consent → unified context |
| Sanjay Gupta | Hospital Admin · Nashik | Org dashboard, staff, analytics, audit |
| Amit Kumar | Patient | Approve/deny/revoke consent, personal timeline, "who accessed my data" |
| Anil Menon | Laboratory · PathCare | Inbound order queue, enter results |
| Deepa Iyer | Pharmacy · MedPlus | Prescription fulfilment with allergy cross-check |
| Kavita Rao | Platform Admin | All tenants, all users, platform-wide audit |

Switch personas any time from **Switch persona** at the bottom of the sidebar.
**Reset demo data** (same menu) restores the original seed.

### Golden demo flow (~2 minutes)

1. Sign in as **Dr. Farah Sheikh**. Dashboard shows patients with mixed access
   states (granted / pending / expired / denied).
2. Open **Amit Kumar** → *Access pending* gate. No clinical data is shown; the
   attempt is logged. Click **Request access** (or it's already pending).
3. **Switch persona → Amit Kumar** → *Consent & access* → **Approve**.
4. **Switch persona → Dr. Farah Sheikh** → open **Amit Kumar** again → the
   **unified clinical context** loads: problems, allergies, medications, labs,
   encounters, prescriptions, timeline — assembled from 3 organizations in one
   screen, under a named consent with an expiry.
5. **Access log** → the full chain is there: request → approve → blocked attempt
   → successful cross-tenant assembly. Export CSV.
6. **Analytics** → context-assembly time, records unified per view, blocked
   unauthorized attempts, consent grants — the measures the platform is built to
   capture for a study.

---

## Architecture

```
Identity  →  Authentication  →  Consent  →  Authorized clinical context  →  Coordination  →  Audit
```

- **React 18 + Vite + TypeScript + Tailwind**, React Router, Lucide icons.
- **Multi-tenant model** — `Organization` → `User` (with `Role`) → `Patient`,
  plus `Consent`, `Encounter`, `Prescription`, `LabOrder`, `CareTask`,
  `Notification`, `AuditEvent`. Every query is tenant-scoped.
- **Consent engine** (`src/data/store.ts` → `evaluateAccess`) mirrors what
  server-side RLS would enforce: same-tenant care relationship *or* an active
  (approved, unexpired) consent for the requesting organization — otherwise the
  clinical context is sealed and the attempt is audited.
- **Roles**: `PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `LAB`, `PHARMACY`,
  `SUPER_ADMIN`, each with its own navigation and permissions.
- **Research instrumentation** (`metrics` in `src/data/store.ts`) records
  context-assembly time, records unified, blocked attempts and consent grants
  from real interactions. These are session measurements, not study results.

### Data layer

`src/data/store.ts` is a self-contained, tenant- and consent-aware store that
persists to `localStorage` and notifies the UI on every change. The function
surface (`visiblePatients`, `patientBundle`, `requestConsent`, `decideConsent`,
`createLabOrder`, …) is written so it can be re-implemented against Supabase +
Postgres RLS without changing any calling component.

### Supabase (optional)

The app needs **no configuration** to run. To point it at a real Supabase
project, copy `.env.example` to `.env` and set:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The anon key is browser-safe. **A service-role key must never be placed in any
`VITE_*` variable or committed.** With both values set, `src/auth/AuthContext.tsx`
routes sign-in through `supabase.auth`; without them the app stays in demo mode.
`.env` is git-ignored.

---

## Project layout

```
src/
  auth/            session + role/nav config
  data/            domain types, demo seed, tenant/consent-aware store, metrics
  lib/             supabase client, ABDM/ABHA mock, formatting, status tokens
  components/      design system (ui/), layout shell, timeline, charts, tables
  pages/           landing, login, dashboards (per role), patients, consent,
                   coordination, lab orders, prescriptions, audit, admin, patient
```

The original static prototype is preserved under `frontend/` and `docs/`.
