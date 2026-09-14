import type { LabStatus, ConsentStatus, CareTaskStatus, PrescriptionStatus } from "@/data/types";

type Tone = "neutral" | "positive" | "warning" | "critical" | "info" | "muted";

export const LAB_STATUS_TONE: Record<LabStatus, Tone> = {
  ordered: "info",
  collected: "warning",
  in_progress: "warning",
  resulted: "positive",
  cancelled: "muted",
};

export const CONSENT_STATUS_TONE: Record<ConsentStatus, Tone> = {
  pending: "warning",
  approved: "positive",
  denied: "critical",
  expired: "muted",
  revoked: "critical",
};

export const TASK_STATUS_TONE: Record<CareTaskStatus, Tone> = {
  pending: "warning",
  in_progress: "info",
  completed: "positive",
  cancelled: "muted",
};

export const RX_STATUS_TONE: Record<PrescriptionStatus, Tone> = {
  issued: "info",
  partially_dispensed: "warning",
  dispensed: "positive",
  cancelled: "muted",
};

export const PRIORITY_TONE: Record<"low" | "normal" | "high", Tone> = {
  low: "muted",
  normal: "neutral",
  high: "critical",
};
