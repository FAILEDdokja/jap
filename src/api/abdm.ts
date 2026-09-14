import { apiRequest } from "./client";

/** ABDM is intentionally reached only through JAP server endpoints. No ABDM credentials belong in this bundle. */
export function startPatientVerification(input: { abhaAddress?: string; abhaNumber?: string }) {
  return apiRequest<{ transactionId: string }>("/patient-verifications", { method: "POST", body: input });
}

export function confirmPatientVerification(transactionId: string, otp: string) {
  return apiRequest<{ verified: boolean }>(`/patient-verifications/${encodeURIComponent(transactionId)}/confirm`, { method: "POST", body: { otp } });
}
