import { ShieldCheck, ShieldAlert, ShieldX, Clock, ShieldQuestion } from "lucide-react";
import { Badge } from "./ui/primitives";
import type { AccessDecision } from "@/data/store";

const MAP: Record<AccessDecision["reason"], { label: string; tone: Parameters<typeof Badge>[0]["tone"]; icon: any }> = {
  self: { label: "Your record", tone: "info", icon: ShieldCheck },
  platform: { label: "Platform oversight", tone: "neutral", icon: ShieldCheck },
  same_tenant: { label: "In-tenant care", tone: "positive", icon: ShieldCheck },
  consent_active: { label: "Access granted", tone: "positive", icon: ShieldCheck },
  consent_pending: { label: "Access pending", tone: "warning", icon: Clock },
  consent_expired: { label: "Access expired", tone: "muted", icon: ShieldAlert },
  consent_revoked: { label: "Access revoked", tone: "critical", icon: ShieldX },
  consent_denied: { label: "Access denied", tone: "critical", icon: ShieldX },
  no_consent: { label: "No access", tone: "muted", icon: ShieldQuestion },
};

export function ConsentPill({ decision }: { decision: AccessDecision }) {
  const cfg = MAP[decision.reason];
  const Icon = cfg.icon;
  return (
    <Badge tone={cfg.tone}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export function consentLabel(reason: AccessDecision["reason"]) {
  return MAP[reason].label;
}
