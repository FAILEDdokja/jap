import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { clearAllSessions } from "../src/lib/session.js";
import { resetAccessStore } from "../src/modules/access/service.js";
import { resetConsentStore } from "../src/modules/consents/service.js";
import { resetPatientStore } from "../src/modules/patients/service.js";

/**
 * A validity end computed from now. A hardcoded `2026-12-31` would silently
 * turn every consent in this file into an expired one the day after, and the
 * suite would start failing for a reason nobody edited.
 */
function validityEnd(daysFromNow = 90): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function cookie(res: { headers: Record<string, unknown> }): string {
  const value = res.headers["set-cookie"];
  return (Array.isArray(value) ? value[0] : value as string).split(";")[0];
}

async function signIn(app: Awaited<ReturnType<typeof buildApp>>, role: string, identifier: string): Promise<string> {
  return cookie(await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role, identifier } }));
}

async function patientId(app: Awaited<ReturnType<typeof buildApp>>, session: string, name = "Amit"): Promise<string> {
  return (await app.inject({ method: "GET", url: `/api/v1/patients?q=${name}`, headers: { cookie: session } })).json().patients[0].id;
}

async function approvedConsent(app: Awaited<ReturnType<typeof buildApp>>, doctor: string, patientIdValue: string) {
  const created = await app.inject({
    method: "POST", url: "/api/v1/consents", headers: { cookie: doctor },
    payload: { patientId: patientIdValue, purpose: "TREATMENT", recordTypes: ["DIAGNOSIS"], validUntil: validityEnd() },
  });
  const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");
  await app.inject({ method: "POST", url: `/api/v1/consents/${created.json().consent.id}/approve`, headers: { cookie: patient }, payload: {} });
  return { id: created.json().consent.id, patient };
}

beforeEach(() => {
  clearAllSessions();
  resetPatientStore();
  resetConsentStore();
  resetAccessStore();
});

describe("Phase 7 access evaluation", () => {
  it("allows a clinical role only when its organization has a matching active consent", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const id = await patientId(app, doctor);
    const consent = await approvedConsent(app, doctor, id);

    const response = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor }, payload: { patientId: id, purpose: "TREATMENT", recordType: "DIAGNOSIS" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().decision).toMatchObject({ allowed: true, reason: "consent_active", consentId: consent.id });
    await app.close();
  });

  it("denies purpose/type mismatch, revoked consent, and a different organization", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const id = await patientId(app, doctor);
    const consent = await approvedConsent(app, doctor, id);

    const wrongPurpose = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor }, payload: { patientId: id, purpose: "RESEARCH", recordType: "DIAGNOSIS" } });
    expect(wrongPurpose.json().decision).toMatchObject({ allowed: false, reason: "no_consent", detail: "purpose_not_allowed" });
    const wrongType = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor }, payload: { patientId: id, purpose: "TREATMENT", recordType: "LAB_RESULT" } });
    expect(wrongType.json().decision).toMatchObject({ allowed: false, reason: "no_consent", detail: "record_type_not_allowed" });

    const lab = await signIn(app, "LAB", "LAB-3001");
    const otherOrg = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: lab }, payload: { patientId: id, purpose: "TREATMENT", recordType: "DIAGNOSIS" } });
    expect(otherOrg.json().decision).toMatchObject({ allowed: false, reason: "no_consent", detail: null });

    const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");
    await app.inject({ method: "POST", url: `/api/v1/consents/${consent.id}/revoke`, headers: { cookie: patient }, payload: {} });
    const revoked = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor }, payload: { patientId: id, purpose: "TREATMENT", recordType: "DIAGNOSIS" } });
    expect(revoked.json().decision).toMatchObject({ allowed: false, reason: "consent_revoked" });
    await app.close();
  });

  it("names an undecided grant consent_pending and a refused one consent_denied", async () => {
    // The canonical vocabulary (§2.5) has one word for "not effective yet" and
    // one for "the patient refused"; the plane's REQUESTED/REJECTED map onto
    // them rather than being re-published as their own reasons.
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const id = await patientId(app, doctor);
    const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");
    const created = await app.inject({
      method: "POST", url: "/api/v1/consents", headers: { cookie: doctor },
      payload: { patientId: id, purpose: "TREATMENT", recordTypes: ["DIAGNOSIS"], validUntil: validityEnd() },
    });
    const evaluate = () => app.inject({
      method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor },
      payload: { patientId: id, purpose: "TREATMENT", recordType: "DIAGNOSIS" },
    });

    expect((await evaluate()).json().decision).toMatchObject({ allowed: false, reason: "consent_pending", detail: null });

    await app.inject({ method: "POST", url: `/api/v1/consents/${created.json().consent.id}/reject`, headers: { cookie: patient }, payload: {} });
    expect((await evaluate()).json().decision).toMatchObject({ allowed: false, reason: "consent_denied", detail: null });
    await app.close();
  });

  it("names a grant that has not started yet consent_pending, with the window in detail", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const id = await patientId(app, doctor);
    const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");
    const created = await app.inject({
      method: "POST", url: "/api/v1/consents", headers: { cookie: doctor },
      payload: {
        patientId: id, purpose: "TREATMENT", recordTypes: ["DIAGNOSIS"],
        validFrom: validityEnd(7), validUntil: validityEnd(37),
      },
    });
    await app.inject({ method: "POST", url: `/api/v1/consents/${created.json().consent.id}/approve`, headers: { cookie: patient }, payload: {} });

    const response = await app.inject({
      method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor },
      payload: { patientId: id, purpose: "TREATMENT", recordType: "DIAGNOSIS" },
    });
    expect(response.json().decision).toMatchObject({
      allowed: false, reason: "consent_pending", detail: "not_yet_valid", consentId: created.json().consent.id,
    });
    await app.close();
  });

  it("404s an evaluation for a patient that does not exist — there is no record to decide about", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const response = await app.inject({
      method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: doctor },
      payload: { patientId: randomUUID(), purpose: "TREATMENT", recordType: "DIAGNOSIS" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatchObject({ code: "not_found" });
    await app.close();
  });

  it("allows a patient only to evaluate access to their own clinical record", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const amit = await patientId(app, doctor);
    const priya = await patientId(app, doctor, "Priya");
    const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");

    const self = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: patient }, payload: { patientId: amit, purpose: "PERSONAL_RECORD", recordType: "OBSERVATION" } });
    expect(self.json().decision).toMatchObject({ allowed: true, reason: "self" });
    const other = await app.inject({ method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: patient }, payload: { patientId: priya, purpose: "PERSONAL_RECORD", recordType: "OBSERVATION" } });
    expect(other.json().decision).toMatchObject({ allowed: false, reason: "role_not_permitted" });
    await app.close();
  });
});
