import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { resetAccessStore } from "../src/modules/access/service.js";
import { resetAuditStore } from "../src/modules/audit/service.js";
import { resetCareStore } from "../src/modules/care/service.js";
import { resetConsentStore } from "../src/modules/consents/service.js";
import { clearAllSessions } from "../src/lib/session.js";
import { resetPatientStore } from "../src/modules/patients/service.js";

function cookie(res: { headers: Record<string, unknown> }): string {
  const value = res.headers["set-cookie"];
  return (Array.isArray(value) ? value[0] : value as string).split(";")[0];
}

async function doctor(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  return cookie(await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "HP-1001" } }));
}

beforeEach(() => {
  clearAllSessions(); resetPatientStore(); resetCareStore(); resetConsentStore(); resetAccessStore(); resetAuditStore();
});

describe("Phase 8 audit trail", () => {
  it("records a hash-chained event trail and returns patient-scoped events", async () => {
    const app = await buildApp();
    const session = await doctor(app);
    const patients = await app.inject({ method: "GET", url: "/api/v1/patients?q=Amit", headers: { cookie: session } });
    const patientId = patients.json().patients[0].id;

    await app.inject({ method: "GET", url: `/api/v1/patients/${patientId}`, headers: { cookie: session } });
    const record = await app.inject({
      method: "POST", url: `/api/v1/patients/${patientId}/records`, headers: { cookie: session },
      payload: { type: "OBSERVATION", title: "Follow-up observation", occurredOn: "2026-09-15" },
    });
    await app.inject({
      method: "POST", url: "/api/v1/access/evaluate", headers: { cookie: session },
      payload: { patientId, purpose: "TREATMENT", recordType: "OBSERVATION" },
    });

    const audit = await app.inject({ method: "GET", url: `/api/v1/patients/${patientId}/audit`, headers: { cookie: session } });
    expect(audit.statusCode).toBe(200);
    const events = audit.json().events;
    expect(events.map((event: { action: string }) => event.action)).toEqual(expect.arrayContaining(["VIEW_RECORD", "CREATE_RECORD", "ACCESS_DENIED"]));
    const created = events.find((event: { resourceId: string | null }) => event.resourceId === record.json().record.id);
    expect(created.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.sequence).toBeGreaterThan(1);
    expect(created.prevEventId).toBeTruthy();
    await app.close();
  });

  it("records successful and failed logins without logging credentials", async () => {
    const app = await buildApp();
    const session = await doctor(app);
    await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "not-a-real-identifier" } });

    const audit = await app.inject({ method: "GET", url: "/api/v1/audit?action=FAILED_LOGIN", headers: { cookie: session } });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().events).toHaveLength(1);
    expect(audit.json().events[0]).toMatchObject({ action: "FAILED_LOGIN", status: "blocked", actorId: null });
    expect(audit.body).not.toContain("not-a-real-identifier");
    await app.close();
  });
});
