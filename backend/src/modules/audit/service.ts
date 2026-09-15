/**
 * Audit service — the only way the application writes audit events.
 *
 * Responsibilities:
 *   - own the active `AuditStore` (memory in tests / DB-less dev, PostgreSQL
 *     everywhere else — enforced by `parseEnv` in production)
 *   - enforce the **audit-outage policy**: a security- or clinically-relevant
 *     write whose audit record cannot be persisted FAILS the request
 *     (fail-closed). `AUDIT_FAILURE_MODE=open` exists only for local
 *     development and is rejected in production
 *     (docs/decisions/0002-audit-failure-policy.md)
 *   - bound the audit write with `AUDIT_WRITE_TIMEOUT_MS` so a wedged database
 *     cannot hang the clinical path (docs/backend/09 §2)
 *   - strip sensitive values before anything reaches the store (types.ts)
 *
 * There is deliberately no update/delete function in this module.
 */
import { createRequire } from "node:module";
import type { Env } from "../../config/env.js";
import { metrics } from "../../observability/metrics.js";
import {
  MemoryAuditStore,
  PostgresAuditStore,
  type AuditPage,
  type AuditQuery,
  type AuditStore,
} from "./store.js";
import { pgExecutor, prismaExecutor } from "./sql.js";
import { verifyAuditChain, type AuditIntegrityReport } from "./verify.js";
import {
  deviceClassOf,
  truncateIp,
  type AuditEvent,
  type AuditStatus,
} from "./types.js";

export type { AuditEvent, AuditStatus } from "./types.js";
export { verifyAuditChain } from "./verify.js";
export type { AuditIntegrityReport } from "./verify.js";

type Actor = { id: string; name: string; role: string; orgId?: string };

export interface WriteAuditEvent {
  actor?: Actor;
  patientId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  purpose?: string;
  authorizationId?: string;
  requestId?: string;
  status?: AuditStatus;
  /** Raw client IP — truncated to a network before storage. */
  sourceIp?: string;
  /** Raw user agent — reduced to a coarse device class before storage. */
  userAgent?: string;
}

/** Thrown when audit persistence failed and the policy is fail-closed. */
export class AuditUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = "audit_unavailable";
  constructor(cause?: unknown) {
    super("Audit log is unavailable — the request was rejected to preserve auditability.");
    this.name = "AuditUnavailableError";
    this.cause = cause;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Store selection
// ───────────────────────────────────────────────────────────────────────────

const memoryStore = new MemoryAuditStore();
let activeStore: AuditStore = memoryStore;

/** Lazily-created `pg` pool, used when no Prisma client is supplied. */
let ownedPool: { end(): Promise<void> } | null = null;

/**
 * Wire the audit service to the store the configuration asks for.
 *
 * When `AUDIT_STORE=postgres` the executor is either the caller's Prisma
 * client (one pool for the whole app — the normal case) or, if none is given,
 * a small `pg` pool this module owns. The second path keeps the audit writer
 * usable independently of Prisma client generation, which matters because the
 * audit chain SQL is raw parameterized SQL either way.
 */
export function configureAuditStore(env: Env, prismaClient?: unknown): AuditStore {
  if (env.AUDIT_STORE !== "postgres") {
    activeStore = memoryStore;
    return activeStore;
  }

  if (prismaClient) {
    activeStore = new PostgresAuditStore(prismaExecutor(prismaClient));
    return activeStore;
  }

  // `pg` is a direct dependency; import lazily so a memory-store deployment
  // never opens a connection pool it will not use.
  const { Pool } = createRequire(import.meta.url)("pg") as {
    Pool: new (config: { connectionString: string; max: number }) => never;
  };
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  ownedPool = pool as unknown as { end(): Promise<void> };
  activeStore = new PostgresAuditStore(pgExecutor(pool));
  return activeStore;
}

/** Close a pool this module opened. No-op otherwise. */
export async function closeAuditStore(): Promise<void> {
  await ownedPool?.end().catch(() => undefined);
  ownedPool = null;
}

/** Inject an arbitrary store (integration tests use the `pg`-backed one). */
export function setAuditStore(store: AuditStore): void {
  activeStore = store;
}

export function getAuditStore(): AuditStore {
  return activeStore;
}

/** Tests only: empty the in-memory store and re-select it. */
export function resetAuditStore(): void {
  memoryStore.reset();
  activeStore = memoryStore;
}

// ───────────────────────────────────────────────────────────────────────────
// Writing
// ───────────────────────────────────────────────────────────────────────────

/** Policy applied when the store rejects a write. Set from env at boot. */
let failureMode: "closed" | "open" = "closed";
let writeTimeoutMs = 2_000;

export function configureAuditPolicy(env: Env): void {
  failureMode = env.AUDIT_FAILURE_MODE;
  writeTimeoutMs = env.AUDIT_WRITE_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`audit write exceeded ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Append one audit event.
 *
 * Fail-closed: on any persistence error this REJECTS with
 * `AuditUnavailableError`, which the centralized error handler turns into a
 * 503 `audit_unavailable`. Callers must therefore `await` it before replying.
 */
export async function writeAuditEvent(input: WriteAuditEvent): Promise<AuditEvent | null> {
  const draft = {
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    actorRole: input.actor?.role ?? null,
    organizationId: input.actor?.orgId ?? null,
    patientId: input.patientId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    purpose: input.purpose ?? null,
    authorizationId: input.authorizationId ?? null,
    requestId: input.requestId ?? null,
    status: input.status ?? ("success" as AuditStatus),
    sourceIp: truncateIp(input.sourceIp),
    deviceClass: deviceClassOf(input.userAgent),
    timestamp: new Date().toISOString(),
  };

  try {
    const event = await withTimeout(activeStore.append(draft), writeTimeoutMs);
    metrics.auditWrites.inc({ result: "success" });
    return event;
  } catch (error) {
    metrics.auditWrites.inc({ result: "failure" });
    if (failureMode === "closed") throw new AuditUnavailableError(error);
    // fail-open is development-only; the loss is itself recorded as a metric.
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Reading
// ───────────────────────────────────────────────────────────────────────────

export async function listAuditEvents(query: AuditQuery): Promise<AuditPage> {
  return activeStore.list(query);
}

/** Verify the full persisted chain. Read-only; never repairs. */
export async function verifyAuditIntegrity(): Promise<AuditIntegrityReport> {
  return verifyAuditChain(await activeStore.chain());
}
