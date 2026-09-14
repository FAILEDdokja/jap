/**
 * Supabase client — created only when both public env vars are present.
 *
 * The app is designed to run fully without Supabase (DEMO MODE, see src/data).
 * When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are provided, this exposes a
 * typed client that the data layer can progressively adopt. A service-role key
 * must never be referenced here or anywhere in client code.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const forceDemo = import.meta.env.VITE_DEMO_MODE?.trim() === "true";
const requestedMode = import.meta.env.VITE_DATA_MODE?.trim().toLowerCase();

export const supabaseConfigured = Boolean(url && anonKey) && !forceDemo;

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export const dataMode: "supabase" | "demo" | "api" = forceDemo ? "demo" : requestedMode === "api" && Boolean(import.meta.env.VITE_API_URL?.trim()) ? "api" : supabaseConfigured ? "supabase" : "demo";
