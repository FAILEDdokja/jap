/**
 * Session management — in-memory cookie sessions for Phase 3 (authentication).
 *
 * This is a deliberately small, dependency-free session store that mirrors the
 * contract described in docs/backend/03-authentication-and-session.md §5:
 *   - backend-owned session boundary
 *   - HttpOnly, SameSite=Lax cookie (`jap_session` by default)
 *   - every API call can re-validate via `getSession()`
 *   - expiry + revocation (sign-out) — the cookie is not the authority, the
 *     server-side map is.
 *
 * Persistence is in-memory only for Phase 3. A later phase can swap this for
 * Redis / Postgres + signed cookies without changing the route layer — only
 * this module's internals would change. The cookie value is an opaque
 * randomUUID; session contents never leave the server.
 *
 * Notes:
 *  - medical records stay off-chain; sessions carry only `{ id, role, name }`
 *  - the cookie is HttpOnly so the browser JS cannot read it (XSS mitigation)
 *  - `Secure` is on in production and off in dev/test (see env.SESSION_SECURE)
 *  - `SameSite=Lax` allows top-level navigation but blocks CSRF on cross-site
 *    form posts
 */

import { randomUUID } from "node:crypto";
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
  expiresAt: Date;
}

// In-memory store. Exported only for tests / introspection.
export const sessionStore = new Map<string, Session>();

function cookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME;
}

function ttlMs(env: Env): number {
  return env.SESSION_TTL_HOURS * 60 * 60 * 1000;
}

export function createSession(env: Env, user: SessionUser): string {
  const id = randomUUID();
  const now = new Date();
  const session: Session = {
    id,
    user,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs(env)),
  };
  sessionStore.set(id, session);
  return id;
}

export function getSession(sessionId: string): Session | null {
  const s = sessionStore.get(sessionId);
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    sessionStore.delete(sessionId);
    return null;
  }
  return s;
}

export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export function clearAllSessions(): void {
  sessionStore.clear();
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

export function setSessionCookie(reply: FastifyReply, env: Env, sessionId: string): void {
  const name = cookieName(env);
  const encoded = encodeURIComponent(sessionId);
  const secure = env.SESSION_SECURE ? "; Secure" : "";
  // Path=/ so every API route sees the cookie. HttpOnly + Lax are non-negotiable.
  const cookie = `${name}=${encoded}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  // Fastify's `header` appends by default for set-cookie; use raw header.
  reply.header("set-cookie", cookie);
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  const name = cookieName(env);
  const secure = env.SESSION_SECURE ? "; Secure" : "";
  // Expire immediately.
  const cookie = `${name}=; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
  reply.header("set-cookie", cookie);
}

/**
 * Resolve the current session user from the request cookie, or null if the
 * request carries no valid, unexpired session.
 */
export function requireSession(request: FastifyRequest, env: Env): Session | null {
  const sessionId = getSessionIdFromRequest(request, env);
  if (!sessionId) return null;
  return getSession(sessionId);
}
