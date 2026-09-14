import { apiRequest } from "./client";

export type ApiRole = "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "LAB" | "PHARMACY" | "SUPER_ADMIN";

export type SessionUser = {
  id: string;
  name: string;
  role: ApiRole;
  orgId?: string | null;
  patientId?: string | null;
};

type SessionResponse = { user: SessionUser | null };
export type AuthenticationResult =
  | { status: "authenticated"; user: SessionUser }
  | { status: "identifier-not-found" | "role-unavailable" };

export function authenticate(role: ApiRole, identifier: string) {
  return apiRequest<AuthenticationResult>("/auth/authenticate", { method: "POST", body: { role, identifier } });
}

export async function getSession() {
  return (await apiRequest<SessionResponse>("/auth/session")).user;
}

export function signOut() {
  return apiRequest<void>("/auth/sign-out", { method: "POST" });
}
