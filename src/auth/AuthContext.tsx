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
import type { User } from "@/data/types";
import { usersAll, orgById, subscribe } from "@/data/store";
import { supabase, dataMode } from "@/lib/supabase";

const SESSION_KEY = "jan-arogya-nexus:session:userId";

type AuthState = {
  user: User | null;
  org: ReturnType<typeof orgById>;
  loading: boolean;
  error: string | null;
  mode: "demo" | "supabase";
  signIn: (email: string, password?: string) => Promise<boolean>;
  signInAs: (userId: string) => void;
  signOut: () => void;
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
  const [, force] = useState(0);

  // keep in sync with store mutations (e.g. staff edits)
  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (dataMode === "supabase" && supabase) {
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

  const user = useMemo(() => usersAll().find((u) => u.id === userId) ?? null, [userId]);
  const org = user ? orgById(user.orgId) : null;

  async function signIn(email: string, password?: string) {
    setError(null);
    const normalized = email.trim().toLowerCase();
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
    setError(null);
    setUserId(id);
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* noop */ }
  }

  function signOut() {
    if (dataMode === "supabase" && supabase) void supabase.auth.signOut();
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
