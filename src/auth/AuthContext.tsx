/**
 * Session layer.
 *
 * DEMO MODE (default): sign-in resolves a seeded user by email; the session is
 * kept in localStorage. The chosen persona drives tenant + role everywhere.
 *
 * SUPABASE MODE: when configured, real email/password auth runs through
 * supabase.auth and the app maps the authenticated email onto an app user row.
 * The surface below (user, signIn, signOut, loading) is identical either way.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Organization, Role, User } from "@/data/types";
import { usersAll, orgById, subscribe } from "@/data/store";
import { supabase, dataMode } from "@/lib/supabase";
import { ApiError, apiEnabled } from "@/api/client";
import { authenticate, getSession, signOut as apiSignOut, type SessionUser } from "@/api/auth";

const SESSION_KEY = "jan-arogya-nexus:session:userId";

type AuthState = {
  user: User | null;
  org: Organization | null;
  loading: boolean;
  error: string | null;
  mode: "demo" | "supabase" | "api";
  signIn: (identifier: string, password?: string, role?: Role) => Promise<boolean>;
  signInAs: (userId: string) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUser, setApiUser] = useState<SessionUser | null>(null);
  const [, force] = useState(0);

  // keep in sync with store mutations (e.g. staff edits)
  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (dataMode === "api" && apiEnabled) {
        try {
          const session = await getSession();
          if (active) setApiUser(session);
        } catch (e) {
          if (active && !(e instanceof ApiError && e.status === 401)) setError("Unable to restore the server session.");
        }
      } else if (dataMode === "supabase" && supabase) {
        const { data } = await supabase.auth.getSession();
        if (active && data.session?.user?.email) {
          const match = usersAll().find((u) => u.email.toLowerCase() === data.session!.user.email!.toLowerCase());
          if (match) {
            setUserId(match.id);
            try { localStorage.setItem(SESSION_KEY, match.id); } catch { /* noop */ }
          }
        }
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const user = useMemo(() => {
    if (dataMode !== "api") return usersAll().find((u) => u.id === userId) ?? null;
    if (!apiUser) return null;
    const seed = usersAll().find((candidate) => candidate.id === apiUser.id);
    return {
      ...(seed ?? { email: "", orgId: apiUser.orgId ?? "platform" }),
      id: apiUser.id,
      name: apiUser.name,
      role: apiUser.role as Role,
      orgId: apiUser.orgId ?? "platform",
      patientId: apiUser.patientId ?? undefined,
    } as User;
  }, [apiUser, userId]);
  const org = useMemo(() => {
    if (!user) return null;
    return orgById(user.orgId) ?? {
      id: user.orgId,
      name: "Connected organization",
      code: user.orgId.slice(0, 8).toUpperCase(),
      type: user.role === "SUPER_ADMIN" ? "platform" as const : "hospital" as const,
      city: "",
      state: "",
      createdOn: "",
    };
  }, [user]);

  async function signIn(identifier: string, password?: string, role?: Role) {
    setError(null);
    const normalized = identifier.trim().toLowerCase();
    if (dataMode === "api") {
      if (!role) {
        setError("Choose the role you are signing in as.");
        return false;
      }
      try {
        const result = await authenticate(role, normalized);
        if (result.status !== "authenticated") {
          setError("This identifier is not available for that role.");
          return false;
        }
        setApiUser(result.user);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign in failed.");
        return false;
      }
    }
    if (dataMode === "supabase" && supabase) {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email: normalized, password: password ?? "" });
      if (e || !data.user) {
        setError(e?.message ?? "Sign in failed.");
        return false;
      }
    }
    const match = usersAll().find((u) => u.email.toLowerCase() === normalized);
    if (!match) {
      setError("No account matches that email in this workspace.");
      return false;
    }
    setUserId(match.id);
    try { localStorage.setItem(SESSION_KEY, match.id); } catch { /* noop */ }
    return true;
  }

  function signInAs(id: string) {
    if (dataMode === "api") return;
    setError(null);
    setUserId(id);
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* noop */ }
  }

  async function signOut() {
    if (dataMode === "api") {
      try { await apiSignOut(); } catch { /* Local state must still be cleared. */ }
      setApiUser(null);
    }
    if (dataMode === "supabase" && supabase) await supabase.auth.signOut();
    setUserId(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  }

  return (
    <Ctx.Provider value={{ user, org, loading, error, mode: dataMode, signIn, signInAs, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
