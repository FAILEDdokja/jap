import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { clearAllSessions } from "../src/lib/session.js";
import { resetCareStore } from "../src/modules/care/service.js";
import { resetPatientStore } from "../src/modules/patients/service.js";

function cookie(res: { headers: Record<string, unknown> }): string {
  const header = res.headers["set-cookie"];
  return (Array.isArray(header) ? header[0] : header as string).split(";")[0];
}

async function doctor(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "HP-1001" } });
  return cookie(res);
}

async function patientId(app: Awaited<ReturnType<typeof buildApp>>, session: string, name: string): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/api/v1/patients?q=${encodeURIComponent(name)}`, headers: { cookie: session } });
  return res.json().patients[0].id;
}

beforeEach(() => {
  clearAllSessions();
  resetPatientStore();
  resetCareStore();
});

describe("Phase 5 care APIs", () => {
  it("creates, updates, reads, and timelines an encounter", async () => {
    const app = await buildApp();
    const session = await doctor(app);
    const id = await patientId(app, session, "Amit");

    const created = await app.inject({
      method: "POST", url: `/api/v1/patients/${id}/encounters`, headers: { cookie: session },
      payload: { date: "2026-09-14", setting: "OPD", reason: "Follow-up", assessment: "Improving" },
    });
    expect(created.statusCode).toBe(201);
    const encounter = created.json().encounter;
    expect(encounter.status).toBe("in_progress");
    expect(encounter.clinicianName).toBe("Dr. Aroha Deshpande");

    const updated = await app.inject({
      method: "PATCH", url: `/api/v1/encounters/${encounter.id}`, headers: { cookie: session },
      payload: { status: "completed", disposition: "Continue OPD" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().encounter.status).toBe("completed");

    const listed = await app.inject({ method: "GET", url: `/api/v1/patients/${id}/encounters`, headers: { cookie: session } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().encounters).toHaveLength(1);

    const timeline = await app.inject({ method: "GET", url: `/api/v1/patients/${id}/timeline`, headers: { cookie: session } });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json().events[0]).toMatchObject({ id: encounter.id, type: "ENCOUNTER", date: "2026-09-14" });
    await app.close();
  });

  it("keeps clinical records append-only and links corrections to the original", async () => {
    const app = await buildApp();
    const session = await doctor(app);
    const id = await patientId(app, session, "Priya");

    const original = await app.inject({
      method: "POST", url: `/api/v1/patients/${id}/records`, headers: { cookie: session },
      payload: { type: "DIAGNOSIS", title: "Acute asthma exacerbation", occurredOn: "2026-09-08" },
    });
    expect(original.statusCode).toBe(201);

    const correction = await app.inject({
      method: "POST", url: `/api/v1/patients/${id}/records`, headers: { cookie: session },
      payload: {
        type: "DIAGNOSIS", title: "Moderate asthma exacerbation", occurredOn: "2026-09-08",
        correctsId: original.json().record.id, correctionReason: "Severity clarified after review",
      },
    });
    expect(correction.statusCode).toBe(201);
    expect(correction.json().record.correctsId).toBe(original.json().record.id);

    const records = await app.inject({ method: "GET", url: `/api/v1/patients/${id}/records`, headers: { cookie: session } });
    expect(records.json().records).toHaveLength(2);
    expect(records.json().records.map((record: { id: string }) => record.id)).toContain(original.json().record.id);

    const missingReason = await app.inject({
      method: "POST", url: `/api/v1/patients/${id}/records`, headers: { cookie: session },
      payload: { type: "DIAGNOSIS", correctsId: original.json().record.id },
    });
    expect(missingReason.statusCode).toBe(400);
    expect(missingReason.json().error.code).toBe("validation_failed");
    await app.close();
  });

  it("rejects clinical references that belong to another patient", async () => {
    const app = await buildApp();
    const session = await doctor(app);
    const amit = await patientId(app, session, "Amit");
    const priya = await patientId(app, session, "Priya");

    const encounter = await app.inject({
      method: "POST", url: `/api/v1/patients/${amit}/encounters`, headers: { cookie: session },
      payload: { date: "2026-09-14", setting: "OPD" },
    });
    const invalid = await app.inject({
      method: "POST", url: `/api/v1/patients/${priya}/records`, headers: { cookie: session },
      payload: { type: "CONSULTATION", encounterId: encounter.json().encounter.id },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("invalid_reference");
    await app.close();
  });
});
