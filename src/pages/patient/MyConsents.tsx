import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { patientBundle, orgById, decideConsent, metrics } from "@/data/store";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { CONSENT_STATUS_TONE } from "@/lib/status";
import { fmtDate, relative } from "@/lib/format";
import { ShieldCheck, ShieldX } from "lucide-react";

export default function MyConsents() {
  useStore();
  const { user } = useAuth();
  const toast = useToast();
  if (!user?.patientId) return null;
  const { consents } = patientBundle(user.patientId);
  const pending = consents.filter((c) => c.status === "pending");
  const active = consents.filter((c) => c.status === "approved");
  const past = consents.filter((c) => !["pending", "approved"].includes(c.status));

  return (
    <div>
      <PageHeader title="Consent & access" description="You decide who can see your health information, for what purpose, and for how long." />

      <Card>
        <CardHeader title="Requests awaiting your decision" description={`${pending.length} pending`} />
        <CardBody className="space-y-3">
          {pending.length === 0 && <p className="text-[13px] text-zinc-400">No requests need your attention.</p>}
          {pending.map((c) => (
            <div key={c.id} className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-zinc-100">{orgById(c.requestingOrgId)?.name}</p>
                <Badge tone="warning">Pending</Badge>
              </div>
              <dl className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-2">
                <div><dt className="text-zinc-500">Requested by</dt><dd className="text-zinc-100">{c.requestingUserName}</dd></div>
                <div><dt className="text-zinc-500">Purpose</dt><dd className="text-zinc-100">{c.purpose}</dd></div>
                <div><dt className="text-zinc-500">Information</dt><dd className="text-zinc-100">{c.scope.join(", ")}</dd></div>
                <div><dt className="text-zinc-500">Access until</dt><dd className="text-zinc-100">{c.expiresOn ? fmtDate(c.expiresOn) : "90 days from approval"}</dd></div>
              </dl>
              <div className="mt-4 flex gap-2">
                <Button size="sm" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => { decideConsent(user, c.id, "approved"); metrics.recordGrant(); toast.push({ tone: "success", title: "Access approved" }); }}>Approve</Button>
                <Button size="sm" variant="secondary" icon={<ShieldX className="h-4 w-4" />} onClick={() => { decideConsent(user, c.id, "denied", "Declined by patient."); toast.push({ tone: "info", title: "Request denied" }); }}>Deny</Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Active access" description="Organizations that can currently view your records" />
        <CardBody className="space-y-3">
          {active.length === 0 && <p className="text-[13px] text-zinc-400">No organization currently has consented access.</p>}
          {active.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
              <div>
                <p className="text-[13px] font-semibold text-zinc-100">{orgById(c.requestingOrgId)?.name}</p>
                <p className="text-[12px] text-zinc-400">{c.purpose} · {c.scope.join(", ")}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Granted {fmtDate(c.decidedOn || c.requestedOn)} · expires {c.expiresOn ? fmtDate(c.expiresOn) : "—"}</p>
              </div>
              <Button size="sm" variant="danger" icon={<ShieldX className="h-4 w-4" />} onClick={() => { decideConsent(user, c.id, "revoked", "Revoked by patient."); toast.push({ tone: "info", title: "Access revoked" }); }}>Revoke</Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="History" />
        <CardBody className="space-y-2">
          {past.length === 0 && <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No past consent activity" />}
          {past.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 text-[13px]">
              <div>
                <p className="font-medium text-zinc-100">{orgById(c.requestingOrgId)?.name}</p>
                <p className="text-[11px] text-zinc-500">{c.purpose} · {relative(c.decidedOn || c.requestedOn)}</p>
              </div>
              <Badge tone={CONSENT_STATUS_TONE[c.status]}>{c.status}</Badge>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
