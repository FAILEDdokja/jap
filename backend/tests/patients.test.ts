/**
 * Phase 4 patient tests — the record contract.
 *
 * Lock the contract and the phase's invariants:
 *   - ABHA is never mandatory: a patient can be created, listed, fetched,
 *     registered and updated with zero identifiers
 *   - external identifiers live only in patient_identities, canonicalized,
 *     unique per (type, value), and returned MASKED only
 *   - verification state is server-owned: declared ≠ verified
 *   - provisional → registered lifecycle; derived abha_linked state
 *   - opaque ids only; unknown → 404 with no oracle; 401 without a session
 *
 * Authorization (who may call what, and whose records they reach) has its own
 * suites: `rbac.test.ts` (the layers as units) and `patients-authz.test.ts`
 * (the same endpoints driven by every role and across tenants). The counts in
 * this file are therefore *scoped* counts: the actor throughout is Dr. Aroha
 * (DOCTOR, org-nmc), so an org-sanjivani record only appears where a consent
 * artifact puts it in scope.
 *
 * Runs against an injected Fastify app (no socket, no DB), same as the auth
 * suite; the in-memory stores are reset between tests.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { resetAuditStore } from "../src/modules/audit/service.js";
import { clearAllSessions } from "../src/lib/session.js";
import { resetPatientStore } from "../src/modules/patients/service.js";

function extractSessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : (raw as string);
  return first.split(";")[0].trim();
}

/** Sign in as Dr. Aroha (DOCTOR, org-nmc) and return the session Cookie header. */
async function doctorCookie(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/authenticate",
    payload: { role: "DOCTOR", identifier: "HP-1001" },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().status).toBe("authenticated");
  return extractSessionCookie(res);
}

beforeEach(() => {
  clearAllSessions();
  resetPatientStore();
  resetAuditStore();
});

describe("session boundary", () => {
  it("401s every endpoint without a valid session", async () => {
    const app = await buildApp();
    for (const req of [
      { method: "GET", url: "/api/v1/patients" },
      { method: "POST", url: "/api/v1/patients", payload: { name: "X" } },
      { method: "GET", url: "/api/v1/patients/00000000-0000-4000-8000-000000000101" },
      { method: "PATCH", url: "/api/v1/patients/00000000-0000-4000-8000-000000000101", payload: {} },
    ]) {
      const res = await app.inject(req as never);
      expect(res.statusCode, `${req.method} ${req.url}`).toBe(401);
      expect(res.json().error.code).toBe("unauthenticated");
    }
    await app.close();
  });
});

describe("POST /api/v1/patients — ABHA is optional", () => {
  it("creates a registered patient with a declared ABHA stored UNVERIFIED and masked", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: {
        name: "Leena Shah",
        gender: "Female",
        dob: "1993-06-21",
        bloodGroup: "B+",
        contact: { phone: "98111 22334", address: "Ward 12, Nashik" },
        identities: [
          { type: "ABHA_NUMBER", value: "91-2345-6789-0123" },
          { type: "ABHA_ADDRESS", value: "Leena.Shah@ABDM" },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const { patient, access } = res.json();
    expect(patient.status).toBe("registered");
    expect(patient.state).toBe("registered"); // declared ≠ verified
    expect(patient.identities).toHaveLength(2);
    // The record lands in the actor's tenant, and the decision says why it is
    // readable: same tenant, not "has an ABHA".
    expect(patient.orgId).toBe("org-nmc");
    expect(access).toEqual({ allowed: true, reason: "same_tenant", consent: null });

    const number = patient.identities.find((i: { type: string }) => i.type === "ABHA_NUMBER");
    expect(number.masked).toBe("ABHA •••• 0123");
    expect(number.verified).toBe(false);
    expect(number.primary).toBe(true);
    const address = patient.identities.find((i: { type: string }) => i.type === "ABHA_ADDRESS");
    expect(address.masked).toBe("••••@abdm"); // canonicalized to lowercase
    expect(address.verified).toBe(false);

    // No identifier value anywhere in the response — identities carry `masked`
    // and no `value` field at all.
    expect(number.value).toBeUndefined();
    expect(address.value).toBeUndefined();
    expect(res.body).not.toContain("91234567890123");
    expect(res.body).not.toContain('"leena.shah@abdm"');
    await app.close();
  });

  it("creates a patient with NO ABHA at all — healthcare delivery proceeds", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: { name: "No-ABHA Patient", gender: "Male", dob: "1970-02-02" },
    });

    expect(res.statusCode).toBe(201);
    const { patient } = res.json();
    expect(patient.identities).toEqual([]);
    expect(patient.state).toBe("registered");

    // And it is retrievable by its opaque id, with the same access a record
    // with a verified ABHA would get — linkage is not an access rule.
    const got = await app.inject({
      method: "GET",
      url: `/api/v1/patients/${patient.id}`,
      headers: { cookie },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().patient.name).toBe("No-ABHA Patient");
    expect(got.json().access).toMatchObject({ allowed: true, reason: "same_tenant" });
    await app.close();
  });

  it("creates a provisional walk-in with a name only", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: { name: "Unidentified Emergency Case", status: "provisional" },
    });

    expect(res.statusCode).toBe(201);
    const { patient } = res.json();
    expect(patient.status).toBe("provisional");
    expect(patient.state).toBe("provisional");
    // Unknown demographics are NULL, not invented placeholders: a fabricated
    // `1980-01-01` on file is indistinguishable from a captured one.
    expect(patient.gender).toBeNull();
    expect(patient.dob).toBeNull();
    await app.close();
  });

  it("rejects an explicitly registered create without gender/dob (400) — never an ABHA requirement", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: { name: "Incomplete", gender: "Male", status: "registered" }, // no dob
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_transition");
    // The refusal names demographics, not ABHA: no identifier was requested.
    expect(res.json().error.message).not.toMatch(/abha/i);
    await app.close();
  });

  it("downgrades an incomplete create to provisional instead of refusing care", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    // No `status` asked for and no dob supplied ⇒ the record is accepted as a
    // provisional intake rather than rejected: a missing field must not block
    // treatment, the same principle that keeps ABHA optional.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: { name: "Incomplete Walk-in", gender: "Male" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().patient.status).toBe("provisional");
    expect(res.json().patient.state).toBe("provisional");
    await app.close();
  });

  it("rejects impossible calendar dates", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    // 2026-02-30 parses as a date but is not the day it claims to be.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: { name: "Impossible Date", gender: "Male", dob: "2026-02-30" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");
    await app.close();
  });

  it("rejects duplicate identifiers within one create request", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    // The same ABHA written two ways in a single request: the store cannot see
    // the collision until the first row exists, so the request is checked too.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: {
        name: "Duplicate In Request",
        gender: "Male",
        dob: "1980-02-02",
        identities: [
          { type: "ABHA_NUMBER", value: "11-1111-1111-1111" },
          { type: "ABHA_NUMBER", value: "11111111111111" },
        ],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("identity_conflict");
    await app.close();
  });

  it("rejects malformed ABHA with 400 and no existence hint", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      payload: {
        name: "Bad ABHA",
        gender: "Male",
        dob: "1980-02-02",
        identities: [{ type: "ABHA_NUMBER", value: "12345" }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");
    await app.close();
  });

  it("enforces canonical (type, value) uniqueness — formatted/case variants conflict (409)", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    // Seeded Amit carries 23456789123401 / amit.kumar@abdm.
    for (const identities of [
      [{ type: "ABHA_NUMBER", value: "23-4567-8912-3401" }],
      [{ type: "ABHA_NUMBER", value: "23456789123401" }],
      [{ type: "ABHA_NUMBER", value: " 23 4567 8912 3401 " }],
      [{ type: "ABHA_ADDRESS", value: "AMIT.KUMAR@ABDM" }],
      [{ type: "ABHA_ADDRESS", value: "  amit.kumar@abdm  " }],
    ]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/patients",
        headers: { cookie },
        payload: { name: "Duplicate Attempt", gender: "Male", dob: "1980-02-02", identities },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("identity_conflict");
      // The conflict response leaks no patient data — not even that the holder
      // is in this tenant (uniqueness is platform-wide: one ABHA, one person).
      expect(res.body).not.toContain("Amit");
      expect(res.body).not.toContain("org-");
    }
    await app.close();
  });

  it("ignores an orgId in the body — the tenant comes from the session", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { cookie },
      // `orgId` is not in the schema: a caller cannot register a patient into
      // somebody else's tenant.
      payload: { name: "Tenant Probe", gender: "Male", dob: "1980-02-02", orgId: "org-sanjivani" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().patient.orgId).toBe("org-nmc");
    await app.close();
  });
});

describe("GET /api/v1/patients", () => {
  it("lists seeded patients with masked identities and derived states", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const res = await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Scoped to org-nmc: 5 own-tenant records + Sunita Deshmukh (org-sanjivani)
    // through an ACTIVE consent = 6 readable, plus 1 sealed stub (Iqbal Ansari,
    // consent pending) = 7 rows. Rahul Sharma is abha_linked, Meera Joshi is
    // registered-with-unverified-ABHA, the walk-in is provisional with none.
    expect(body.total).toBe(7);
    expect(body.sealedCount).toBe(1);
    expect(body.patients).toHaveLength(7);
    expect(body.scope).toEqual({ kind: "tenant", orgId: "org-nmc" });

    const amit = body.patients.find((p: { name?: string }) => p.name === "Amit Kumar");
    expect(amit.state).toBe("abha_linked"); // verified ABHA number + address
    expect(amit.identities[0].masked).toBe("ABHA •••• 3401");
    expect(amit.access).toEqual({ allowed: true, reason: "same_tenant", consent: null });

    const meera = body.patients.find((p: { name?: string }) => p.name === "Meera Joshi");
    expect(meera.state).toBe("registered"); // ABHA on file but UNVERIFIED
    expect(meera.identities.every((i: { verified: boolean }) => !i.verified)).toBe(true);

    const walkIn = body.patients.find((p: { status?: string }) => p.status === "provisional");
    expect(walkIn.state).toBe("provisional");
    expect(walkIn.identities).toEqual([]); // ABHA never required

    // The one readable cross-tenant row carries the artifact that opened it.
    const sunita = body.patients.find((p: { name?: string }) => p.name === "Sunita Deshmukh");
    expect(sunita.orgId).toBe("org-sanjivani");
    expect(sunita.access).toMatchObject({ allowed: true, reason: "consent_active" });
    expect(sunita.access.consent.id).toBe("con-01");

    // The sealed stub: id + tenant + decision, and NO demographics at all.
    const sealed = body.patients.filter((p: { sealed: boolean }) => p.sealed);
    expect(sealed).toHaveLength(1);
    expect(sealed[0].id).toBeTruthy();
    expect(sealed[0].orgId).toBe("org-sanjivani");
    expect(sealed[0].access).toMatchObject({ allowed: false, reason: "consent_pending" });
    expect(sealed[0].name).toBeUndefined();
    expect(sealed[0].dob).toBeUndefined();
    expect(sealed[0].identities).toBeUndefined();
    expect(res.body).not.toContain("Iqbal");

    // The response never carries a full identifier value. (Amit's *contact
    // email* legitimately contains the same local part as his ABHA address —
    // what must never appear is the address as an identifier value.)
    expect(res.body).not.toContain("23456789123401");
    expect(res.body).not.toContain('"amit.kumar@abdm"');
    await app.close();
  });

  it("filters by q, orgId, state and status; paginates", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const byQ = await app.inject({
      method: "GET",
      url: "/api/v1/patients?q=priya",
      headers: { cookie },
    });
    expect(byQ.json().total).toBe(1);
    expect(byQ.json().patients[0].name).toBe("Priya Patel");

    // `orgId` narrows within the scope — it can select the consented external
    // tenant, but only ever rows already in scope.
    const byOrg = await app.inject({
      method: "GET",
      url: "/api/v1/patients?orgId=org-sanjivani",
      headers: { cookie },
    });
    expect(byOrg.json().total).toBe(2); // Sunita (readable) + Iqbal (sealed)
    expect(byOrg.json().sealedCount).toBe(1);
    expect(byOrg.json().patients.map((p: { name?: string }) => p.name ?? null)).toContain(
      "Sunita Deshmukh",
    );

    // A content filter drops sealed rows: answering `state=` for a record the
    // caller cannot read would leak the answer through inclusion alone.
    const byState = await app.inject({
      method: "GET",
      url: "/api/v1/patients?state=abha_linked",
      headers: { cookie },
    });
    expect(byState.json().total).toBe(4); // Amit, Priya, Rahul + consented Sunita
    expect(byState.json().sealedCount).toBe(0);

    const byStatus = await app.inject({
      method: "GET",
      url: "/api/v1/patients?status=provisional",
      headers: { cookie },
    });
    expect(byStatus.json().total).toBe(1);

    const page = await app.inject({
      method: "GET",
      url: "/api/v1/patients?limit=2&offset=1",
      headers: { cookie },
    });
    const paged = page.json();
    expect(paged.patients).toHaveLength(2);
    expect(paged.total).toBe(7);
    expect(paged.offset).toBe(1);
    await app.close();
  });

  it("returns 404 for an unknown id with no oracle, 400 for a malformed id", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);

    const unknown = await app.inject({
      method: "GET",
      url: "/api/v1/patients/00000000-0000-4000-8000-999999999999",
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("not_found");

    const malformed = await app.inject({
      method: "GET",
      url: "/api/v1/patients/not-a-uuid",
      headers: { cookie },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("validation_failed");
    await app.close();
  });
});

describe("PATCH /api/v1/patients/:id", () => {
  it("updates demographics and contact fields", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);
    const list = await app.inject({ method: "GET", url: "/api/v1/patients?q=priya", headers: { cookie } });
    const id = list.json().patients[0].id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${id}`,
      headers: { cookie },
      payload: {
        bloodGroup: "O-",
        contact: { email: "priya.patel@abdm.example.in" },
        emergencyContact: { phone: "98000 11122" },
      },
    });
    expect(res.statusCode).toBe(200);
    const { patient } = res.json();
    expect(patient.bloodGroup).toBe("O-");
    expect(patient.contact.email).toBe("priya.patel@abdm.example.in");
    expect(patient.emergencyContact.phone).toBe("98000 11122");
    expect(patient.contact.phone).toBe("98500 21436"); // untouched
    await app.close();
  });

  it("declares an additional identity (unverified) and conflicts on duplicates", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);
    const list = await app.inject({ method: "GET", url: "/api/v1/patients?q=meera", headers: { cookie } });
    const meera = list.json().patients[0];

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${meera.id}`,
      headers: { cookie },
      payload: { addIdentity: { type: "ABHA_ADDRESS", value: "Meera.J@ABDM" } },
    });
    expect(res.statusCode).toBe(200);
    const added = res.json().patient.identities.find(
      (i: { type: string; id: string }) =>
        i.type === "ABHA_ADDRESS" && !meera.identities.some((m: { id: string }) => m.id === i.id),
    );
    expect(added).toBeTruthy();
    expect(added.masked).toBe("••••@abdm");
    expect(added.verified).toBe(false);
    expect(res.json().patient.state).toBe("registered"); // still unverified

    const dup = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${meera.id}`,
      headers: { cookie },
      payload: { addIdentity: { type: "ABHA_ADDRESS", value: "meera.j@abdm" } },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("identity_conflict");
    await app.close();
  });

  it("transitions provisional → registered, then abha_linked once verified (server-owned)", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);
    const list = await app.inject({ method: "GET", url: "/api/v1/patients?status=provisional", headers: { cookie } });
    const walkIn = list.json().patients[0];

    // Promotion without the demographics in the request is rejected: intake
    // placeholders are not captured data.
    const incomplete = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${walkIn.id}`,
      headers: { cookie },
      payload: { status: "registered", gender: "Male" }, // still no dob
    });
    expect(incomplete.statusCode).toBe(400);
    expect(incomplete.json().error.code).toBe("invalid_transition");

    // Complete registration in one PATCH — still with no ABHA involved.
    const registered = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${walkIn.id}`,
      headers: { cookie },
      payload: {
        name: "Vitthal Shinde",
        gender: "Male",
        dob: "1980-01-01",
        status: "registered",
        addIdentity: { type: "ABHA_NUMBER", value: "19-8765-4321-0987" },
      },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json().patient.status).toBe("registered");
    expect(registered.json().patient.state).toBe("registered");
    const declared = registered.json().patient.identities.find(
      (i: { type: string }) => i.type === "ABHA_NUMBER",
    );
    expect(declared.masked).toBe("ABHA •••• 0987");
    expect(declared.verified).toBe(false);
    expect(declared.primary).toBe(true);

    // Verification is a separate, explicit server-side action.
    const verified = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${walkIn.id}`,
      headers: { cookie },
      payload: { markIdentityVerified: declared.id },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().patient.state).toBe("abha_linked");
    const verifiedIdentity = verified.json().patient.identities.find(
      (i: { id: string }) => i.id === declared.id,
    );
    expect(verifiedIdentity.verified).toBe(true);
    expect(verifiedIdentity.verifiedAt).toBeTruthy();

    // A client cannot bulk-set identities or assert their verification state:
    // `identities`/`verified` are not PATCH inputs, so they are stripped and the
    // request is a no-op on the identifier set.
    const smuggled = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${walkIn.id}`,
      headers: { cookie },
      payload: { identities: [{ type: "ABHA_NUMBER", value: "11111111111111", verified: true }] },
    });
    expect(smuggled.statusCode).toBe(200);
    expect(smuggled.json().patient.identities).toHaveLength(1); // nothing added
    expect(smuggled.json().patient.identities[0].id).toBe(declared.id);

    // A foreign/unknown identity id is a 404, not a cross-patient oracle.
    const foreign = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${walkIn.id}`,
      headers: { cookie },
      payload: { markIdentityVerified: "00000000-0000-4000-8000-999999999999" },
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe("identity_not_found");
    await app.close();
  });

  it("returns 404 for an unknown patient id", async () => {
    const app = await buildApp();
    const cookie = await doctorCookie(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/patients/00000000-0000-4000-8000-999999999999",
      headers: { cookie },
      payload: { name: "Nobody" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
    await app.close();
  });
});
