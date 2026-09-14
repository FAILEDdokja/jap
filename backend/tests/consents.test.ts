import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { clearAllSessions } from "../src/lib/session.js";
import { resetConsentStore } from "../src/modules/consents/service.js";
import { resetPatientStore } from "../src/modules/patients/service.js";

function cookie(res: { headers: Record<string, unknown> }): string {
  const value = res.headers["set-cookie"];
  return (Array.isArray(value) ? value[0] : value as string).split(";")[0];
}

async function signIn(app: Awaited<ReturnType<typeof buildApp>>, role: string, identifier: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role, identifier } });
  return cookie(res);
}

async function patientId(app: Awaited<ReturnType<typeof buildApp>>, session: string, name = "Amit"): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/api/v1/patients?q=${name}`, headers: { cookie: session } });
  return res.json().patients[0].id;
}

beforeEach(() => {
  clearAllSessions();
  resetPatientStore();
  resetConsentStore();
});

describe("Phase 6 consent APIs", () => {
  it("creates a purpose- and record-type-scoped request from the authenticated requester", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const targetId = await patientId(app, doctor);
    const res = await app.inject({
      method: "POST", url: "/api/v1/consents", headers: { cookie: doctor },
      payload: { patientId: targetId, purpose: "TREATMENT", recordTypes: ["DIAGNOSIS", "LAB_RESULT", "DIAGNOSIS"], validUntil: "2026-12-31" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().consent).toMatchObject({ status: "REQUESTED", requesterId: "u-aroha", requesterOrganizationId: "org-nmc", purpose: "TREATMENT" });
    expect(res.json().consent.recordTypes).toEqual(["DIAGNOSIS", "LAB_RESULT"]);
    await app.close();
  });

  it("allows only a patient to approve, then revoke, a requested consent", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const targetId = await patientId(app, doctor);
    const created = await app.inject({ method: "POST", url: "/api/v1/consents", headers: { cookie: doctor }, payload: { patientId: targetId, purpose: "TREATMENT", recordTypes: ["PRESCRIPTION"], validUntil: "2026-12-31" } });
    const id = created.json().consent.id;

    const forbidden = await app.inject({ method: "POST", url: `/api/v1/consents/${id}/approve`, headers: { cookie: doctor }, payload: {} });
    expect(forbidden.statusCode).toBe(403);

    const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");
    const approved = await app.inject({ method: "POST", url: `/api/v1/consents/${id}/approve`, headers: { cookie: patient }, payload: { note: "Approved for treatment" } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().consent.status).toBe("APPROVED");

    const revoked = await app.inject({ method: "POST", url: `/api/v1/consents/${id}/revoke`, headers: { cookie: patient }, payload: {} });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().consent.status).toBe("REVOKED");
    expect(revoked.json().consent.revokedAt).toBeTruthy();
    await app.close();
  });

  it("expires a consent automatically and blocks later approval", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const targetId = await patientId(app, doctor);
    const created = await app.inject({ method: "POST", url: "/api/v1/consents", headers: { cookie: doctor }, payload: { patientId: targetId, purpose: "RESEARCH", recordTypes: ["OBSERVATION"], validFrom: "2020-01-01", validUntil: "2020-01-02" } });
    const patient = await signIn(app, "PATIENT", "23-4567-8912-3401");
    const approval = await app.inject({ method: "POST", url: `/api/v1/consents/${created.json().consent.id}/approve`, headers: { cookie: patient }, payload: {} });
    expect(approval.statusCode).toBe(400);
    expect(approval.json().error.code).toBe("invalid_transition");

    const listed = await app.inject({ method: "GET", url: "/api/v1/consents?status=EXPIRED", headers: { cookie: doctor } });
    expect(listed.json().consents).toHaveLength(1);
    await app.close();
  });

  it("does not let one patient decide another patient's consent", async () => {
    const app = await buildApp();
    const doctor = await signIn(app, "DOCTOR", "HP-1001");
    const priya = await patientId(app, doctor, "Priya");
    const created = await app.inject({ method: "POST", url: "/api/v1/consents", headers: { cookie: doctor }, payload: { patientId: priya, purpose: "TREATMENT", recordTypes: ["LAB_RESULT"], validUntil: "2026-12-31" } });
    const amit = await signIn(app, "PATIENT", "23-4567-8912-3401");

    const response = await app.inject({ method: "POST", url: `/api/v1/consents/${created.json().consent.id}/approve`, headers: { cookie: amit }, payload: {} });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
