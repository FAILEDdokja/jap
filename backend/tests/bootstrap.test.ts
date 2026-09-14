/**
 * Boot-state tests — what a freshly started server sees.
 *
 * Every other suite calls `resetPatientStore()` in `beforeEach`, which seeds the
 * demo tables as a side effect. That is the right thing for those suites and the
 * reason they stayed green while the running API served an empty registry: the
 * store's seeding ran on an explicit call that production code never made, so
 * `GET /api/v1/patients` answered `total: 0` and every record read answered 404
 * while 100+ tests passed.
 *
 * This file therefore deliberately does NOT import `resetPatientStore`. It
 * observes the store exactly as `src/server.ts` finds it after importing the
 * app, which is the only way to pin "boots with data". Vitest isolates files
 * (backend/vitest.config.ts), so nothing here leaks into the other suites.
 */

import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { DEMO_ORG_ID, DEMO_PATIENT_ID } from "../src/lib/demo-ids.js";

type App = Awaited<ReturnType<typeof buildApp>>;

const PLATFORM = { role: "SUPER_ADMIN", identifier: "SUPER-001" };

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : (raw as string);
  return first.split(";")[0].trim();
}

async function withApp(run: (app: App) => Promise<void>): Promise<void> {
  const app = await buildApp();
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

/** Sign in as the platform role: it is the one actor whose scope is unscoped. */
async function platformCookie(app: App): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/authenticate",
    payload: PLATFORM,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().status).toBe("authenticated");
  return cookieOf(res);
}

describe("boot state", () => {
  it("serves a populated registry with no explicit seeding call", async () => {
    await withApp(async (app) => {
      const cookie = await platformCookie(app);
      const res = await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } });
      expect(res.statusCode).toBe(200);

      const body = res.json();
      // The demo seed table (src/modules/patients/store.ts) holds seven people:
      // six registered patients across two tenants and one provisional walk-in.
      expect(body.total).toBe(7);
      expect(body.sealedCount).toBe(0);
      expect(body.scope).toEqual({ kind: "platform", orgId: DEMO_ORG_ID.platform });
      expect(body.patients.map((p: { name: string }) => p.name).sort()).toEqual([
        "Amit Kumar",
        "Iqbal Ansari",
        "Meera Joshi",
        "Priya Patel",
        "Rahul Sharma",
        "Sunita Deshmukh",
        "Vitthal Shinde (Emergency Intake)",
      ]);
    });
  });

  it("seeds every external identifier (identity ids must not collide)", async () => {
    await withApp(async (app) => {
      const cookie = await platformCookie(app);
      const body = (
        await app.inject({ method: "GET", url: "/api/v1/patients", headers: { cookie } })
      ).json();

      const byId = new Map(body.patients.map((p: { id: string }) => [p.id, p]));
      const walkIn = byId.get(DEMO_PATIENT_ID.vitthalShinde);
      expect(walkIn?.identities).toEqual([]); // ABHA is never mandatory

      const withAbha = body.patients.filter((p: { id: string }) => p.id !== DEMO_PATIENT_ID.vitthalShinde);
      expect(withAbha).toHaveLength(6);
      for (const p of withAbha) {
        // An ABHA number and an ABHA address each — the pair from src/data/seed.ts.
        expect(p.identities, p.name).toHaveLength(2);
        expect(p.identities.map((i: { type: string }) => i.type).sort()).toEqual([
          "ABHA_ADDRESS",
          "ABHA_NUMBER",
        ]);
      }

      // Identity ids are unique across the whole store: minting them from a
      // counter that restarts per patient overwrote 10 of the 12 rows and left
      // every patient but the last with no identifiers at all.
      const ids = withAbha.flatMap((p: { identities: { id: string }[] }) =>
        p.identities.map((i) => i.id),
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(12);
    });
  });

  it("answers a record read by id, masked, on the first request after boot", async () => {
    await withApp(async (app) => {
      const cookie = await platformCookie(app);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/patients/${DEMO_PATIENT_ID.amitKumar}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);

      const { patient } = res.json();
      expect(patient.name).toBe("Amit Kumar");
      expect(patient.state).toBe("abha_linked");
      const raw = JSON.stringify(patient);
      expect(raw).not.toContain("23456789123401"); // the value never crosses the wire
      expect(raw).toContain("ABHA •••• 3401"); // only the masked form does
    });
  });
});
