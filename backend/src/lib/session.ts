/**
 * Server-side sessions (Phase 3, hardened in Phase 4).
 *
 * Design (docs/backend/03 §5, docs/backend/09 §4,
 * docs/decisions/0001-session-security.md):
 *
 *   - the cookie carries an opaque, server-minted 256-bit random id; session
 *     contents never leave the server, so a client cannot forge or inflate one
 *   - the server-side map is the authority: expiry and sign-out revocation are
 *     enforced there, not by the cookie
 *   - **absolute expiry** — `SESSION_TTL_HOURS` after creation the session dies
 *     regardless of activity
 *   - **idle expiry** — `SESSION_IDLE_MINUTES` without a request revokes it
 *     (0 disables; dev convenience only)
 *   - **fixation resistance** — ids are never accepted from the client as new
 *     sessions, and `createSession` always mints a fresh id while
 *     `rotateOnAuthentication` destroys any session the caller already carried
 *   - cookie flags: `HttpOnly` always, `Secure` when `SESSION_SECURE=true`
 *     (mandatory in production), `SameSite` from `SESSION_SAMESITE` (Lax
 *     default), `Path=/`, and `Max-Age` bounded by the absolute TTL
 *
 * Persistence is in-memory for now. A later phase can move this to Postgres
 * without changing the route layer — only this module's internals.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Env } from "../config/env.js";

export interface SessionUser {
  id: string;
  role: string;
  name: string;
  orgId?: string;
  patientId?: string;
}

export interface Session {
  id: string;
  user: SessionUser;
  createdAt: Date;
  /** Last time this session was presented on a request (idle-timeout clock). */
  lastSeenAt: Date;
  /** Absolute expiry — never extended. */
  expiresAt: Date;
}

// In-memory store. Exported only for tests / introspection.
export const sessionStore = new Map<string, Session>();

/** Why a session lookup failed — surfaced for audit/metrics, never to clients verbatim. */
export type SessionRejection = "absent" | "unknown" | "expired" | "idle";

function cookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME;
}

function ttlMs(env: Env): number {
  return env.SESSION_TTL_HOURS * 60 * 60 * 1000;
}

function idleMs(env: Env): number {
  return env.SESSION_IDLE_MINUTES * 60 * 1000;
}

/** 256 bits of CSPRNG entropy, URL-safe. Opaque: carries no user data. */
function mintSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function createSession(env: Env, user: SessionUser): string {
  const id = mintSessionId();
  const now = new Date();
  sessionStore.set(id, {
    id,
    user,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ttlMs(env)),
  });
  return id;
}

/**
 * Session-fixation guard: called at authentication time. Any session id the
 * caller already presented is destroyed before a brand-new id is minted, so an
 * attacker-planted cookie can never be "upgraded" into an authenticated one.
 */
export function rotateOnAuthentication(
  request: FastifyRequest,
  env: Env,
  user: SessionUser,
): string {
  const existing = getSessionIdFromRequest(request, env);
  if (existing) sessionStore.delete(existing);
  return createSession(env, user);
}

/**
 * Resolve a session id, enforcing absolute and idle expiry. On success the
 * idle clock is refreshed; the absolute expiry is never extended.
 */
export function readSession(
  sessionId: string,
  env?: Env,
): { session: Session } | { rejection: Exclude<SessionRejection, "absent"> } {
  const session = sessionStore.get(sessionId);
  if (!session) return { rejection: "unknown" };

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    sessionStore.delete(sessionId);
    return { rejection: "expired" };
  }

  const idle = env ? idleMs(env) : 0;
  if (idle > 0 && now - session.lastSeenAt.getTime() > idle) {
    sessionStore.delete(sessionId);
    return { rejection: "idle" };
  }

  session.lastSeenAt = new Date(now);
  return { session };
}

/** Back-compatible lookup used by existing route code. */
export function getSession(sessionId: string, env?: Env): Session | null {
  const result = readSession(sessionId, env);
  return "session" in result ? result.session : null;
}

export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export function clearAllSessions(): void {
  sessionStore.clear();
}

/** Revoke every session belonging to one account (e.g. after a role change). */
export function revokeSessionsForUser(userId: string): number {
  let revoked = 0;
  for (const [id, session] of sessionStore) {
    if (session.user.id === userId) {
      sessionStore.delete(id);
      revoked += 1;
    }
  }
  return revoked;
}

/** Constant-time comparison helper for opaque session ids. */
export function sessionIdsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Extract the session id from the incoming `Cookie` header.
 * Manual parsing avoids a hard dependency on `@fastify/cookie`; if that
 * plugin is added later, this helper can be replaced with `request.cookies`.
 */
export function getSessionIdFromRequest(request: FastifyRequest, env: Env): string | null {
  const name = cookieName(env);
  const header = request.headers.cookie;
  if (!header || typeof header !== "string") return null;
  // Cookie header is `k1=v1; k2=v2` — values may be quoted.
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (!k || rest.length === 0) continue;
    const key = k.trim();
    if (key !== name) continue;
    const raw = rest.join("=").trim();
    // Strip optional quotes.
    const value = raw.replace(/^"|"$/g, "");
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** Serialize the session cookie with the hardened attribute set. */
export function buildSessionCookie(env: Env, sessionId: string): string {
  const attributes = [
    `${cookieName(env)}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${env.SESSION_SAMESITE}`,
    // Bound the browser-side lifetime by the server's absolute expiry.
    `Max-Age=${Math.floor(ttlMs(env) / 1000)}`,
  ];
  if (env.SESSION_SECURE) attributes.push("Secure");
  return attributes.join("; ");
}

export function setSessionCookie(reply: FastifyReply, env: Env, sessionId: string): void {
  reply.header("set-cookie", buildSessionCookie(env, sessionId));
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  const attributes = [
    `${cookieName(env)}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${env.SESSION_SAMESITE}`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (env.SESSION_SECURE) attributes.push("Secure");
  reply.header("set-cookie", attributes.join("; "));
}

/**
 * Resolve the current session user from the request cookie, or null if the
 * request carries no valid, unexpired, non-idle session.
 */
export function requireSession(request: FastifyRequest, env: Env): Session | null {
  const sessionId = getSessionIdFromRequest(request, env);
  if (!sessionId) return null;
  return getSession(sessionId, env);
}

/** Like `requireSession` but reports *why* the session was rejected. */
export function resolveSession(
  request: FastifyRequest,
  env: Env,
): { session: Session } | { rejection: SessionRejection } {
  const sessionId = getSessionIdFromRequest(request, env);
  if (!sessionId) return { rejection: "absent" };
  return readSession(sessionId, env);
}
