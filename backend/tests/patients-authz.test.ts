/**
 * Phase 4 authorization tests — RBAC + tenant isolation through the HTTP API.
 *
 * `rbac.test.ts` pins the layers as units; this suite drives the real endpoints
 * with real sessions, once per role and once per cross-tenant combination, and
 * asserts the four things the phase has to get right:
 *
 *   1. Layer 1 — no session, no data (401), including after revocation.
 *   2. Layer 2 — a role may only do what the matrix grants (403
 *      `role_not_permitted`), and the grant is per FIELD on PATCH: a role that
 *      may edit demographics cannot also attest an ABHA verification.
 *   3. Layers 3/4 — a tenant reaches its own records and nobody else's. Consent
 *      opens a cross-tenant READ and never a write; without an artifact the
 *      record is not sealed-but-listed, it is absent. A patient reaches exactly
 *      one record: their own.
 *   4. Layer 5 — every allow and every deny is in the audit trail, correlated to
 *      the request id, carrying no PHI (not even a search term).
 *
 * Also asserted: the sealed shape leaks nothing, the OpenAPI document declares
 * the authorization responses, and no denial body carries patient data.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { resetAuditStore } from "../src/modules/audit/service.js";
import { allEvents, type AuditEvent } from "../src/modules/audit/store.js";
import { DEMO_ORG_ID, DEMO_PATIENT_ID } from "../src/lib/demo-ids.js";
import { clearAllSessions } from "../src/lib/session.js";
import { resetPatientStore } from "../src/modules/patients/service.js";

type App = Awaited<ReturnType<typeof buildApp>>;

interface Persona {
  name: string;
  role: string;
  identifier: string;
  userId: string;
  orgId: string;
}

/** One persona per role, plus a second tenant for the cross-tenant cases. */
const PERSONA = {
  doctorNmc: {
    name: "doctorNmc", role: "DOCTOR", identifier: "HP-1001",
    userId: "u-aroha", orgId: DEMO_ORG_ID.nmc,
  },
  doctorSanjivani: {
    name: "doctorSanjivani", role: "DOCTOR", identifier: "HP-2001",
    userId: "u-farah", orgId: DEMO_ORG_ID.sanjivani,
  },
  adminNmc: {
    name: "adminNmc", role: "HOSPITAL_ADMIN", identifier: "HOSP-ADM-1001",
    userId: "u-nmc-admin", orgId: DEMO_ORG_ID.nmc,
  },
  adminSanjivani: {
    name: "adminSanjivani", role: "HOSPITAL_ADMIN", identifier: "HOSP-ADM-2001",
    userId: "u-sanj-admin", orgId: DEMO_ORG_ID.sanjivani,
  },
  lab: {
    name: "lab", role: "LAB", identifier: "LAB-3001",
    userId: "u-lab", orgId: DEMO_ORG_ID.pathcare,
  },
  pharmacy: {
    name: "pharmacy", role: "PHARMACY", identifier: "PHARM-4001",
    userId: "u-pharm", orgId: DEMO_ORG_ID.medplus,
  },
  platform: {
    name: "platform", role: "SUPER_ADMIN", identifier: "SUPER-001",
    userId: "u-super", orgId: DEMO_ORG_ID.platform,
  },
  patient: {
    name: "patient", role: "PATIENT", identifier: "23456789123401",
    userId: "u-amit", orgId: DEMO_ORG_ID.nmc,
  },
  /** Legacy mock login whose ABHA has no clinical record at all. */
  patientNoRecord: {
    name: "patientNoRecord", role: "PATIENT", identifier: "12345678912345",
    userId: "abha-12345678912345", orgId: DEMO_ORG_ID.nmc,
  },
} satisfies Record<string, Persona>;

const AMIT = DEMO_PATIENT_ID.amitKumar;
const PRIYA = DEMO_PATIENT_ID.priyaPatel;
const RAHUL = DEMO_PATIENT_ID.rahulSharma;
const SUNITA = DEMO_PATIENT_ID.sunitaDeshmukh;
const IQBAL = DEMO_PATIENT_ID.iqbalAnsari;
const MEERA = DEMO_PATIENT_ID.meeraJoshi;
const WALK_IN = DEMO_PATIENT_ID.vitthalShinde;
const UNKNOWN = "00000000-0000-4000-8000-999999999999";

/** Everything the demo store holds about people — must never reach a log. */
const PHI = [
  "Amit Kumar", "Priya Patel", "Rahul Sharma", "Sunita Deshmukh", "Iqbal Ansari",
  "Meera Joshi", "Vitthal Shinde",
  "1991-03-14", "1985-11-02", "1963-01-09",
  "23456789123401", "amit.kumar@abdm", "98230 45671", "Panchavati",
];

/** The whole trail, in order. `modules/audit` is the one writer for the API. */
function auditTrail(): readonly AuditEvent[] {
  return allEvents();
}

interface TrailQuery {
  patientId?: string;
  actorId?: string;
  action?: string;
  status?: "success" | "blocked";
}

/** Filtered view of the trail (`listAuditEvents` is the paginated feed side). */
function queryAudit(query: TrailQuery = {}): readonly AuditEvent[] {
  return allEvents().filter(
    (e) =>
      (query.patientId === undefined || e.patientId === query.patientId) &&
      (query.actorId === undefined || e.actorId === query.actorId) &&
      (query.action === undefined || e.action === query.action) &&
      (query.status === undefined || e.status === query.status),
  );
}

beforeEach(() => {
  clearAllSessions();
  resetPatientStore();
  resetAuditStore();
});

/** Build an app, run the test, always close it (no socket is ever opened). */
async function withApp(run: (app: App) => Promise<void>): Promise<void> {
  const app = await buildApp();
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : (raw as string);
  return first.split(";")[0].trim();
}

async function signIn(app: App, persona: Persona): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/authenticate",
    payload: { role: persona.role, identifier: persona.identifier },
  });
  expect(res.statusCode, `${persona.name} sign-in`).toBe(200);
  expect(res.json().status, `${persona.name} sign-in`).toBe("authenticated");
  return cookieOf(res);
}

/** The list of readable (unsealed) names a persona's search returns. */
async function listedNames(app: App, cookie: string, query = ""): Promise<string[]> {
  const res = await app.inject({ method: "GET", url: `/api/v1/patients${query}`, headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return res
    .json()
    .patients.filter((p: { sealed: boolean }) => !p.sealed)
    .map((p: { name: string }) => p.name);
}

// ── Layer 1 — session boundary ──────────────────────────────────────────────

describe("Layer 1 — session boundary", () => {
  it("401s every endpoint once the session is revoked, and audits the attempts", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.doctorNmc);
      const out = await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { cookie } });
      expect(out.statusCode).toBe(200);

      for (const req of [
        { method: "GET", url: "/api/v1/patients" },
        { method: "POST", url: "/api/v1/patients", payload: { name: "X", gender: "Male", dob: "1980-01-01" } },
        { method: "GET", url: `/api/v1/patients/${AMIT}` },
        { method: "PATCH", url: `/api/v1/patients/${AMIT}`, payload: { name: "Y" } },
      ]) {
        const res = await app.inject({ ...req, headers: { cookie } } as never);
        expect(res.statusCode, `${req.method} ${req.url}`).toBe(401);
        expect(res.json().error.code).toBe("unauthenticated");
      }

      const blocked = queryAudit({ status: "blocked" });
      expect(blocked).toHaveLength(4);
      // A revoked session has no actor: the trail says so rather than guessing.
      for (const entry of blocked) {
        expect(entry.actorId).toBeNull();
        expect(entry.reason).toBe("unauthenticated");
      }
      expect(blocked.map((e) => e.action)).toEqual([
        "LIST_RECORDS",
        "CREATE_RECORD",
        "VIEW_RECORD",
        "UPDATE_RECORD",
      ]);
    });
  });

  it("refuses a forged session cookie", async () => {
    await withApp(async (app) => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/patients",
        headers: { cookie: "jap_session=00000000-0000-4000-8000-000000000000" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("unauthenticated");
    });
  });
});

// ── Layer 2 — role permissions ──────────────────────────────────────────────

describe("Layer 2 — role permissions (403 role_not_permitted)", () => {
  const mayNotRegister = [
    PERSONA.lab, PERSONA.pharmacy, PERSONA.platform, PERSONA.patient, PERSONA.patientNoRecord,
  ];

  it("refuses patient registration for every role the matrix does not grant", async () => {
    await withApp(async (app) => {
      for (const persona of mayNotRegister) {
        const cookie = await signIn(app, persona);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/patients",
          headers: { cookie },
          payload: { name: "Should Not Exist", gender: "Male", dob: "1980-01-01" },
        });
        expect(res.statusCode, persona.name).toBe(403);
        const body = res.json();
        expect(body.error.code).toBe("forbidden");
        expect(body.error.reason).toBe("role_not_permitted");
        expect(body.error.capability).toBe("patient.register");
        expect(typeof body.error.requestId).toBe("string");
        // A denial carries no record data, and no hint about what IS allowed.
        expect(res.body).not.toContain("Should Not Exist");
        expect(res.body).not.toContain("patient.update");

        const entry = queryAudit({ status: "blocked" }).at(-1)!;
        expect(entry.action).toBe("CREATE_RECORD");
        expect(entry.actorId).toBe(persona.userId);
        expect(entry.actorRole).toBe(persona.role);
        expect(entry.organizationId).toBe(persona.orgId);
        expect(entry.capability).toBe("patient.register");
      }
      // Nothing was created by any of them.
      const cookie = await signIn(app, PERSONA.doctorNmc);
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?q=Should", headers: { cookie } })).json().total).toBe(0);
    });
  });

  it("grants registration to the facility roles explicitly", async () => {
    await withApp(async (app) => {
      for (const persona of [PERSONA.doctorNmc, PERSONA.adminNmc, PERSONA.doctorSanjivani]) {
        const cookie = await signIn(app, persona);
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/patients",
          headers: { cookie },
          payload: { name: `Registered by ${persona.name}`, gender: "Female", dob: "1990-01-01" },
        });
        expect(res.statusCode, persona.name).toBe(201);
        // The tenant comes from the session, never the caller.
        expect(res.json().patient.orgId).toBe(persona.orgId);
        expect(res.json().access).toEqual({ allowed: true, reason: "same_tenant", consent: null });
      }
    });
  });

  it("refuses patient updates for every role that may not write the registry", async () => {
    await withApp(async (app) => {
      for (const persona of [PERSONA.lab, PERSONA.pharmacy, PERSONA.platform, PERSONA.patient, PERSONA.patientNoRecord]) {
        const cookie = await signIn(app, persona);
        const res = await app.inject({
          method: "PATCH",
          url: `/api/v1/patients/${AMIT}`,
          headers: { cookie },
          payload: { name: "Renamed By Somebody Else" },
        });
        expect(res.statusCode, persona.name).toBe(403);
        expect(res.json().error.reason).toBe("role_not_permitted");
        expect(res.json().error.capability).toBe("patient.update");
      }
      // The record is untouched — verify through its own tenant.
      const cookie = await signIn(app, PERSONA.doctorNmc);
      const read = await app.inject({ method: "GET", url: `/api/v1/patients/${AMIT}`, headers: { cookie } });
      expect(read.json().patient.name).toBe("Amit Kumar");
    });
  });

  it("splits PATCH capabilities per field: declaring an identifier ≠ attesting verification", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.adminNmc); // HOSPITAL_ADMIN

      // May declare an ABHA (registration desk) …
      const declared = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${MEERA}`,
        headers: { cookie },
        payload: { addIdentity: { type: "ABHA_ADDRESS", value: "meera.j@abdm" } },
      });
      expect(declared.statusCode).toBe(200);
      const identity = declared.json().patient.identities.find(
        (i: { type: string; masked: string }) => i.type === "ABHA_ADDRESS" && !i.verified && i.masked === "••••@abdm",
      );
      expect(identity).toBeTruthy();

      // … but may NOT record a verification outcome (that attests an ABDM
      // result the facility role is not the point-of-care clinician for).
      const verify = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${MEERA}`,
        headers: { cookie },
        payload: { markIdentityVerified: identity.id },
      });
      expect(verify.statusCode).toBe(403);
      expect(verify.json().error.reason).toBe("role_not_permitted");
      expect(verify.json().error.capability).toBe("patient.verify_identity");
      expect(queryAudit({ status: "blocked" }).at(-1)!.action).toBe("VERIFY_IDENTITY");

      // The identifier is still unverified, so the state did not move.
      const read = await app.inject({ method: "GET", url: `/api/v1/patients/${MEERA}`, headers: { cookie } });
      expect(read.json().patient.state).toBe("registered");
      expect(read.json().patient.identities.every((i: { verified: boolean }) => !i.verified)).toBe(true);

      // A DOCTOR may — the same request, different role, different answer.
      const doctor = await signIn(app, PERSONA.doctorNmc);
      const verified = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${MEERA}`,
        headers: { cookie: doctor },
        payload: { markIdentityVerified: identity.id },
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json().patient.state).toBe("abha_linked");
    });
  });

  it("refuses the capability a mixed PATCH is not fully covered by, without applying any of it", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.adminNmc);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${MEERA}`,
        headers: { cookie },
        // Demographics (allowed) + verification (not allowed) in one request.
        payload: {
          bloodGroup: "O+",
          // Capability is checked before the identity is looked up, so an
          // unknown id proves the same point without depending on seed ids.
          markIdentityVerified: UNKNOWN,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.capability).toBe("patient.verify_identity");

      // Refused as a whole: the demographics did not sneak through.
      const read = await app.inject({ method: "GET", url: `/api/v1/patients/${MEERA}`, headers: { cookie } });
      expect(read.json().patient.bloodGroup).toBe("O-");
    });
  });

  it("lets every role read and search — the capability is broad, the SCOPE is not", async () => {
    await withApp(async (app) => {
      for (const persona of Object.values(PERSONA)) {
        const cookie = await signIn(app, persona);
        const list = await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } });
        expect(list.statusCode, `${persona.name} list`).toBe(200);
      }
    });
  });
});

// ── Layers 3/4 — tenant isolation ───────────────────────────────────────────

describe("Layers 3/4 — tenant isolation on the list", () => {
  it("scopes every role's list to what it may see", async () => {
    await withApp(async (app) => {
      const expectations: Array<[Persona, number, number, string, string[]]> = [
        // own tenant (5) + Sunita through an ACTIVE consent = 6 readable,
        // + Iqbal sealed (pending) = 7 rows.
        [PERSONA.doctorNmc, 7, 1, "tenant", ["Amit Kumar", "Meera Joshi", "Priya Patel", "Rahul Sharma", "Sunita Deshmukh", "Vitthal Shinde (Emergency Intake)"]],
        // own tenant (2) + three sealed stubs for its pending/expired/denied
        // requests into org-nmc. Meera and the walk-in: no artifact ⇒ absent.
        [PERSONA.doctorSanjivani, 5, 3, "tenant", ["Iqbal Ansari", "Sunita Deshmukh"]],
        [PERSONA.adminNmc, 7, 1, "tenant", ["Amit Kumar", "Meera Joshi", "Priya Patel", "Rahul Sharma", "Sunita Deshmukh", "Vitthal Shinde (Emergency Intake)"]],
        [PERSONA.adminSanjivani, 5, 3, "tenant", ["Iqbal Ansari", "Sunita Deshmukh"]],
        // Tenants with no patients and no consent history see an empty registry
        // — not somebody else's.
        [PERSONA.lab, 0, 0, "tenant", []],
        [PERSONA.pharmacy, 0, 0, "tenant", []],
        // Platform oversight lists every record (still audited, still read-only).
        [PERSONA.platform, 7, 0, "platform", ["Amit Kumar", "Iqbal Ansari", "Meera Joshi", "Priya Patel", "Rahul Sharma", "Sunita Deshmukh", "Vitthal Shinde (Emergency Intake)"]],
        // A patient sees exactly one record: their own.
        [PERSONA.patient, 1, 0, "self", ["Amit Kumar"]],
        [PERSONA.patientNoRecord, 0, 0, "self", []],
      ];

      for (const [persona, total, sealed, scopeKind, names] of expectations) {
        const cookie = await signIn(app, persona);
        const res = await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } });
        const body = res.json();
        expect(body.total, `${persona.name} total`).toBe(total);
        expect(body.sealedCount, `${persona.name} sealed`).toBe(sealed);
        expect(body.scope.kind, `${persona.name} scope`).toBe(scopeKind);
        expect(body.scope.orgId).toBe(scopeKind === "platform" ? DEMO_ORG_ID.platform : persona.orgId);
        expect(await listedNames(app, cookie), persona.name).toEqual(names);
      }
    });
  });

  it("leaks no demographics of an out-of-tenant record, sealed or absent", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.doctorSanjivani);
      const res = await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } });
      const body = res.json();

      // The three org-nmc records with artifacts are listed as stubs only.
      const sealed = body.patients.filter((p: { sealed: boolean }) => p.sealed);
      expect(sealed).toHaveLength(3);
      expect(sealed.map((p: { id: string }) => p.id).sort()).toEqual([AMIT, PRIYA, RAHUL].sort());
      for (const stub of sealed) {
        expect(Object.keys(stub).sort()).toEqual(["access", "id", "orgId", "sealed"]);
        expect(stub.access.allowed).toBe(false);
      }
      expect(sealed.map((p: { access: { reason: string } }) => p.access.reason).sort()).toEqual(
        ["consent_denied", "consent_expired", "consent_pending"].sort(),
      );

      // Nobody outside the tenant appears by name, and no org-nmc demographic
      // crosses the wire at all.
      for (const forbidden of ["Amit Kumar", "Priya Patel", "Rahul Sharma", "Meera Joshi", "1991-03-14", "98230 45671"]) {
        expect(res.body).not.toContain(forbidden);
      }
      // The own-tenant rows are full records.
      expect(body.patients.filter((p: { sealed: boolean }) => !p.sealed).every((p: { name: string }) => Boolean(p.name))).toBe(true);
    });
  });

  it("cannot be turned into a cross-tenant search by q, state, status or orgId", async () => {
    await withApp(async (app) => {
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);
      const nmc = await signIn(app, PERSONA.doctorNmc);

      // A record with no artifact is not findable by name from another tenant.
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?q=meera", headers: { cookie: sanjivani } })).json().total).toBe(0);
      // A sealed record is dropped under a content filter: answering the
      // question would leak the answer through inclusion alone.
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?q=amit", headers: { cookie: sanjivani } })).json().total).toBe(0);
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?q=iqbal", headers: { cookie: nmc } })).json().total).toBe(0);
      // But the consented external IS findable by its own tenant's doctor.
      const sunita = await app.inject({ method: "GET", url: "/api/v1/patients?q=sunita", headers: { cookie: nmc } });
      expect(sunita.json().total).toBe(1);
      expect(sunita.json().patients[0].access).toMatchObject({ allowed: true, reason: "consent_active" });

      // `orgId` narrows within the scope; it never widens it.
      const otherTenant = await app.inject({ method: "GET", url: `/api/v1/patients?orgId=${DEMO_ORG_ID.sanjivani}`, headers: { cookie: nmc } });
      expect(otherTenant.json().total).toBe(2); // Sunita readable + Iqbal sealed
      expect(otherTenant.json().sealedCount).toBe(1);
      const unreachable = await app.inject({ method: "GET", url: `/api/v1/patients?orgId=${DEMO_ORG_ID.pathcare}`, headers: { cookie: nmc } });
      expect(unreachable.json().total).toBe(0);
      // A tenant filter selecting a foreign tenant yields only that tenant's
      // sealed stubs — still no demographics.
      const stubs = await app.inject({ method: "GET", url: `/api/v1/patients?orgId=${DEMO_ORG_ID.nmc}`, headers: { cookie: sanjivani } });
      expect(stubs.json().total).toBe(3);
      expect(stubs.json().sealedCount).toBe(3);

      // Derived-state filters cannot be used to profile sealed records either.
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?state=abha_linked", headers: { cookie: sanjivani } })).json().total).toBe(2);
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?status=provisional", headers: { cookie: sanjivani } })).json().total).toBe(0);
    });
  });

  it("keeps a newly created record inside the creating tenant", async () => {
    await withApp(async (app) => {
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/patients",
        headers: { cookie: sanjivani },
        payload: { name: "Pune Walk-in", status: "provisional" },
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().patient.id as string;
      expect(created.json().patient.orgId).toBe(DEMO_ORG_ID.sanjivani);

      // Its own tenant reads it; another tenant's doctor cannot — no artifact,
      // so it is neither readable nor listable.
      expect((await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie: sanjivani } })).statusCode).toBe(200);

      const nmc = await signIn(app, PERSONA.doctorNmc);
      const denied = await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie: nmc } });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.reason).toBe("no_consent");
      expect(denied.body).not.toContain("Pune Walk-in");
      expect((await app.inject({ method: "GET", url: "/api/v1/patients?q=pune", headers: { cookie: nmc } })).json().total).toBe(0);
    });
  });
});

describe("Layers 3/4 — tenant isolation on a single record", () => {
  it("returns the AccessDecision reason for every cross-tenant state", async () => {
    await withApp(async (app) => {
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);
      const cases: Array<[string, number, string, string | null]> = [
        [AMIT, 403, "consent_pending", "con-03"],
        [PRIYA, 403, "consent_expired", "con-04"],
        [RAHUL, 403, "consent_denied", "con-05"],
        [MEERA, 403, "no_consent", null], // no artifact at all
        [WALK_IN, 403, "no_consent", null], // …including one with no ABHA
        [SUNITA, 200, "same_tenant", null], // own tenant ⇒ allowed
      ];

      for (const [id, status, reason, consentId] of cases) {
        const res = await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie: sanjivani } });
        expect(res.statusCode, id).toBe(status);
        if (status === 200) {
          expect(res.json().access).toMatchObject({ allowed: true, reason: "same_tenant" });
          continue;
        }
        const body = res.json();
        expect(body.error.code).toBe("forbidden");
        expect(body.error.reason).toBe(reason);
        expect(body.error.access).toMatchObject({ allowed: false, reason });
        expect(body.error.access.consent?.id ?? null).toBe(consentId);
        // Sealed: the reason and the artifact, never the record.
        expect(body.error.patient).toBeUndefined();
        for (const forbidden of ["Amit Kumar", "Priya Patel", "Rahul Sharma", "Meera Joshi", "1991-03-14"]) {
          expect(res.body).not.toContain(forbidden);
        }
        // And every denial wrote a blocked row naming the reason.
        const entry = queryAudit({ status: "blocked", patientId: id }).at(-1)!;
        expect(entry.action).toBe("VIEW_RECORD");
        expect(entry.actorId).toBe(PERSONA.doctorSanjivani.userId);
        expect(entry.reason).toBe(reason);
        expect(entry.requestId).toBe(res.headers["x-request-id"]);
      }
    });
  });

  it("allows the cross-tenant read an active consent grants, and says why", async () => {
    await withApp(async (app) => {
      const nmc = await signIn(app, PERSONA.doctorNmc);
      const res = await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie: nmc } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.patient.name).toBe("Sunita Deshmukh");
      expect(body.access).toMatchObject({ allowed: true, reason: "consent_active" });
      expect(body.access.consent).toMatchObject({ id: "con-01", status: "approved", purpose: expect.any(String) });

      const entry = queryAudit({ status: "success", patientId: SUNITA }).at(-1)!;
      expect(entry.reason).toBe("consent_active");
      expect(entry.authorizationId).toBe(body.access.consent.id);
    });
  });

  it("never lets a consent open a WRITE: cross-tenant updates are refused", async () => {
    await withApp(async (app) => {
      const nmc = await signIn(app, PERSONA.doctorNmc);
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);

      // con-01 makes Sunita readable by org-nmc …
      expect((await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie: nmc } })).statusCode).toBe(200);

      for (const payload of [
        { name: "Edited From Another Tenant" },
        { addIdentity: { type: "ABHA_ADDRESS", value: "sunita.d@abdm" } },
        { status: "registered" },
      ]) {
        const res = await app.inject({
          method: "PATCH",
          url: `/api/v1/patients/${SUNITA}`,
          headers: { cookie: nmc },
          payload,
        });
        expect(res.statusCode, JSON.stringify(payload)).toBe(403);
        expect(res.json().error.code).toBe("forbidden");
        expect(res.json().error.reason).toBe("cross_tenant_write");
        // No AccessDecision on a write denial: consent is not the question.
        expect(res.json().error.access).toBeUndefined();
      }

      // The record is unchanged, seen from its own tenant.
      const read = await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie: sanjivani } });
      expect(read.json().patient.name).toBe("Sunita Deshmukh");
      expect(read.json().access.reason).toBe("same_tenant");

      expect(queryAudit({ status: "blocked", patientId: SUNITA }).every((e) => e.reason === "cross_tenant_write")).toBe(true);
    });
  });

  it("refuses a verification outcome across tenants even for a DOCTOR who holds the capability", async () => {
    await withApp(async (app) => {
      const nmc = await signIn(app, PERSONA.doctorNmc);
      const owner = await signIn(app, PERSONA.doctorSanjivani);
      // Sunita's primary ABHA number identity — readable by org-nmc (con-01),
      // so the refusal must come from write scope, not from visibility.
      const read = await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie: nmc } });
      const identity = read.json().patient.identities.find((i: { type: string }) => i.type === "ABHA_NUMBER");
      expect(identity.verified).toBe(true); // already verified by its own tenant
      const before = (await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie: owner } }))
        .json().patient.identities.find((i: { id: string }) => i.id === identity.id);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${SUNITA}`,
        headers: { cookie: nmc },
        payload: { markIdentityVerified: identity.id },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.reason).toBe("cross_tenant_write");

      const after = await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie: owner } });
      const unchanged = after.json().patient.identities.find((i: { id: string }) => i.id === identity.id);
      // The verification timestamp is exactly what the owning tenant set: the
      // refused call neither re-verified nor touched it.
      expect(unchanged.verifiedAt).toBe(before.verifiedAt);
      expect(unchanged.verified).toBe(true);
    });
  });

  it("gives a patient their own record and nothing else", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.patient); // Amit Kumar

      const own = await app.inject({ method: "GET", url: `/api/v1/patients/${AMIT}`, headers: { cookie } });
      expect(own.statusCode).toBe(200);
      expect(own.json().access).toMatchObject({ allowed: true, reason: "self" });

      // Same tenant, different person: `self` is not `same_tenant`.
      for (const id of [PRIYA, MEERA, WALK_IN]) {
        const res = await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie } });
        expect(res.statusCode, id).toBe(403);
        expect(res.json().error.reason).toBe("no_consent");
      }
      // Another tenant entirely.
      expect((await app.inject({ method: "GET", url: `/api/v1/patients/${SUNITA}`, headers: { cookie } })).statusCode).toBe(403);

      expect(await listedNames(app, cookie)).toEqual(["Amit Kumar"]);
    });
  });

  it("gives a patient account with no record access to nothing", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.patientNoRecord);
      expect((await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } })).json().total).toBe(0);
      for (const id of [AMIT, PRIYA, MEERA]) {
        expect((await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie } })).statusCode).toBe(403);
      }
    });
  });

  it("treats platform oversight as read-only, and audits every read it makes", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.platform);

      const read = await app.inject({ method: "GET", url: `/api/v1/patients/${IQBAL}`, headers: { cookie } });
      expect(read.statusCode).toBe(200);
      expect(read.json().access).toMatchObject({ allowed: true, reason: "platform", consent: null });

      // Oversight may not register or edit records (Layer 2 refuses first).
      expect((await app.inject({
        method: "POST", url: "/api/v1/patients", headers: { cookie },
        payload: { name: "Platform Patient", gender: "Male", dob: "1980-01-01" },
      })).statusCode).toBe(403);
      expect((await app.inject({
        method: "PATCH", url: `/api/v1/patients/${IQBAL}`, headers: { cookie }, payload: { name: "Platform Edit" },
      })).statusCode).toBe(403);

      const reads = queryAudit({ actorId: PERSONA.platform.userId, action: "VIEW_RECORD" });
      expect(reads).toHaveLength(1);
      expect(reads[0]!.status).toBe("success");
      expect(reads[0]!.reason).toBe("platform");
    });
  });

  it("refuses a laboratory with no consent history, ABHA linkage notwithstanding", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.lab);
      // Amit has a VERIFIED ABHA number and address; the walk-in has none. Both
      // are equally out of reach: an identifier is not an access grant.
      for (const id of [AMIT, WALK_IN]) {
        const res = await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie } });
        expect(res.statusCode, id).toBe(403);
        expect(res.json().error.reason).toBe("no_consent");
      }
      expect((await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } })).json().total).toBe(0);
    });
  });

  it("keeps 404 for unknown ids and 403 for known-but-sealed ones", async () => {
    await withApp(async (app) => {
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);
      const unknown = await app.inject({ method: "GET", url: `/api/v1/patients/${UNKNOWN}`, headers: { cookie: sanjivani } });
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json().error.code).toBe("not_found");
      expect(queryAudit({ status: "blocked", patientId: UNKNOWN }).at(-1)!.reason).toBe("not_found");

      const sealed = await app.inject({ method: "GET", url: `/api/v1/patients/${AMIT}`, headers: { cookie: sanjivani } });
      expect(sealed.statusCode).toBe(403);
      // The distinction is safe only because ids are opaque UUIDv4 — recorded
      // here so nobody "simplifies" it into an existence oracle for guessable ids.
      expect(sealed.json().error.code).toBe("forbidden");
    });
  });

  it("keeps identifier uniqueness platform-wide without revealing the holder", async () => {
    await withApp(async (app) => {
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);
      // Amit's ABHA number belongs to an org-nmc record; a second tenant
      // registering the same person's identifier must collide, not fork.
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/patients",
        headers: { cookie: sanjivani },
        payload: {
          name: "Duplicate Across Tenants", gender: "Male", dob: "1980-01-01",
          identities: [{ type: "ABHA_NUMBER", value: "23-4567-8912-3401" }],
        },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("identity_conflict");
      for (const forbidden of ["Amit", DEMO_ORG_ID.nmc, AMIT, "23456789123401"]) {
        expect(res.body, forbidden).not.toContain(forbidden);
      }
    });
  });
});

// ── Layer 5 — audit ─────────────────────────────────────────────────────────

describe("Layer 5 — audit trail", () => {
  it("records every allow and every deny, correlated to the request id", async () => {
    await withApp(async (app) => {
      const nmc = await signIn(app, PERSONA.doctorNmc);
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);
      const lab = await signIn(app, PERSONA.lab);

      const allowed = await app.inject({ method: "GET", url: `/api/v1/patients/${AMIT}`, headers: { cookie: nmc } });
      const deniedRead = await app.inject({ method: "GET", url: `/api/v1/patients/${AMIT}`, headers: { cookie: sanjivani } });
      const deniedRole = await app.inject({
        method: "POST", url: "/api/v1/patients", headers: { cookie: lab },
        payload: { name: "Nope", gender: "Male", dob: "1980-01-01" },
      });
      const search = await app.inject({ method: "GET", url: "/api/v1/patients?q=amit", headers: { cookie: nmc } });
      const created = await app.inject({
        method: "POST", url: "/api/v1/patients", headers: { cookie: nmc },
        payload: { name: "Audited Patient", gender: "Female", dob: "1992-02-02" },
      });

      const trail = auditTrail();
      expect(trail.map((e) => e.sequence)).toEqual(trail.map((_, i) => i + 1));

      const read1 = trail.find((e) => e.action === "VIEW_RECORD" && e.status === "success")!;
      expect(read1.reason).toBe("same_tenant");
      expect(read1.requestId).toBe(allowed.headers["x-request-id"]);

      const read2 = trail.find((e) => e.action === "VIEW_RECORD" && e.status === "blocked")!;
      expect(read2.reason).toBe("consent_pending");
      expect(read2.requestId).toBe(deniedRead.headers["x-request-id"]);

      const register = trail.find((e) => e.action === "CREATE_RECORD" && e.status === "blocked")!;
      expect(register.reason).toBe("role_not_permitted");
      expect(register.requestId).toBe(deniedRole.headers["x-request-id"]);

      const searched = trail.find((e) => e.action === "LIST_RECORDS")!;
      expect(searched.status).toBe("success");
      expect(searched.requestId).toBe(search.headers["x-request-id"]);

      const registered = trail.find((e) => e.action === "CREATE_RECORD" && e.status === "success")!;
      expect(registered.patientId).toBe(created.json().patient.id);
      expect(registered.resourceType).toBe("PATIENT");
      expect(registered.capability).toBe("patient.register");
    });
  });

  it("records the identity actions separately from the demographic update", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.doctorNmc);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${WALK_IN}`,
        headers: { cookie },
        payload: {
          name: "Vitthal Shinde", gender: "Male", dob: "1980-01-01", status: "registered",
          addIdentity: { type: "ABHA_NUMBER", value: "19-8765-4321-0987" },
        },
      });
      expect(res.statusCode).toBe(200);
      const identity = res.json().patient.identities[0];

      expect(queryAudit({ patientId: WALK_IN }).map((e) => e.action)).toEqual([
        "UPDATE_RECORD",
        "LINK_IDENTITY",
      ]);

      const verified = await app.inject({
        method: "PATCH",
        url: `/api/v1/patients/${WALK_IN}`,
        headers: { cookie },
        payload: { markIdentityVerified: identity.id },
      });
      expect(verified.statusCode).toBe(200);
      const last = queryAudit({ patientId: WALK_IN }).at(-1)!;
      expect(last.action).toBe("VERIFY_IDENTITY");
      expect(last.resourceType).toBe("PATIENT_IDENTITY");
      expect(last.resourceId).toBe(identity.id);
    });
  });

  it("holds no PHI — no names, no dates of birth, no identifier values, no search terms", async () => {
    await withApp(async (app) => {
      const nmc = await signIn(app, PERSONA.doctorNmc);
      const sanjivani = await signIn(app, PERSONA.doctorSanjivani);

      // A sweep of calls that would be tempting to log verbosely: a name
      // search, an address search, creates with identifiers, reads, denials.
      await app.inject({ method: "GET", url: "/api/v1/patients?q=amit%20kumar", headers: { cookie: nmc } });
      await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie: sanjivani } });
      await app.inject({
        method: "POST", url: "/api/v1/patients", headers: { cookie: nmc },
        payload: {
          name: "Sneaky Mcpherson", gender: "Other", dob: "1975-12-25",
          contact: { phone: "98765 43210", address: "14 Secret Street" },
          identities: [
            { type: "ABHA_NUMBER", value: "99-8877-6655-4433" },
            { type: "ABHA_ADDRESS", value: "sneaky.mcpherson@abdm" },
          ],
        },
      });
      for (const id of [AMIT, SUNITA, MEERA, UNKNOWN]) {
        await app.inject({ method: "GET", url: `/api/v1/patients/${id}`, headers: { cookie: sanjivani } });
      }
      await app.inject({
        method: "PATCH", url: `/api/v1/patients/${AMIT}`, headers: { cookie: sanjivani },
        payload: { name: "Renamed Illegally" },
      });

      const serialized = JSON.stringify(auditTrail());
      for (const forbidden of [
        ...PHI,
        "Sneaky Mcpherson", "1975-12-25", "99887766554433", "sneaky.mcpherson@abdm",
        "98765 43210", "14 Secret Street", "Renamed Illegally",
        "amit kumar", "amit", // the search term is PHI too
      ]) {
        expect(serialized, forbidden).not.toContain(forbidden);
      }
      // Masked forms are acceptable (doc 04 §3) but the trail does not need
      // them: ids and reasons are enough, and that is what it holds.
      expect(serialized).not.toContain("••••");

      // The one name the trail does carry is the ACTING account's own snapshot
      // (`audit_events.actor_name` in prisma/schema.prisma) — the professional
      // who made the call, never the subject of the call.
      expect(serialized).toContain("Dr. Aroha Deshpande");
      expect(serialized).toContain("Dr. Farah Sheikh");
    });
  });
});

// ── contract surface ────────────────────────────────────────────────────────

describe("OpenAPI contract", () => {
  it("declares the authorization responses on every patient route", async () => {
    await withApp(async (app) => {
      const spec = (await app.inject({ method: "GET", url: "/docs/json" })).json();
      const collection = spec.paths["/api/v1/patients/"];
      const item = spec.paths["/api/v1/patients/{id}"];

      expect(Object.keys(collection.post.responses)).toEqual(["201", "400", "401", "403", "404", "409"]);
      expect(Object.keys(collection.get.responses)).toEqual(["200", "400", "401", "403", "404"]);
      expect(Object.keys(item.get.responses)).toEqual(["200", "400", "401", "403", "404"]);
      expect(Object.keys(item.patch.responses)).toEqual(["200", "400", "401", "403", "404", "409"]);

      // The 403 body documents the authorization fields a sealed view needs.
      const forbiddenSchema = item.get.responses["403"].content["application/json"].schema;
      const properties = forbiddenSchema.properties.error.properties;
      expect(Object.keys(properties)).toEqual(["code", "message", "requestId", "reason", "capability", "access"]);
      expect(properties.access.properties.reason.enum).toEqual([
        "same_tenant", "consent_active", "self", "platform",
        "no_consent", "consent_pending", "consent_expired", "consent_revoked", "consent_denied",
        "role_not_permitted",
      ]);

      // The list documents the sealed shape, so a caller cannot mistake a stub
      // for a record.
      const listSchema = collection.get.responses["200"].content["application/json"].schema;
      expect(Object.keys(listSchema.properties)).toEqual([
        "patients", "total", "sealedCount", "limit", "offset", "scope",
      ]);
      expect(JSON.stringify(listSchema.properties.patients)).toContain("sealed");
      // …and the read documents the decision that travels with a record.
      const readSchema = item.get.responses["200"].content["application/json"].schema;
      expect(Object.keys(readSchema.properties)).toEqual(["patient", "access"]);
    });
  });

  it("accepts both the bare and the trailing-slash collection path", async () => {
    await withApp(async (app) => {
      const cookie = await signIn(app, PERSONA.doctorNmc);
      for (const url of ["/api/v1/patients", "/api/v1/patients/"]) {
        const res = await app.inject({ method: "GET", url, headers: { cookie } });
        expect(res.statusCode, url).toBe(200);
        expect(res.json().total).toBe(7);
      }
    });
  });
});
