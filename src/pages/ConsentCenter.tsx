import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldX, RefreshCw } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { getDb, patientById, orgById, visiblePatients, decideConsent } from "@/data/store";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { RequestConsentModal } from "@/components/RequestConsentModal";
import { Modal } from "@/components/ui/Modal";
import { CONSENT_STATUS_TONE } from "@/lib/status";
import { fmtDate, relative } from "@/lib/format";
import type { ConsentStatus } from "@/data/types";

const FILTERS: (ConsentStatus | "all")[] = ["all", "pending", "approved", "expired", "revoked", "denied"];

export default function ConsentCenter() {
  useStore();
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [pickOpen, setPickOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  if (!user) return null;
  const db = getDb();

  const isAdmin = user.role === "HOSPITAL_ADMIN";
  const rows = useMemo(() => {
    const inScope = new Set(visiblePatients(user).map((p) => p.id));
    return db.consents
      .filter((c) => c.requestingOrgId === user.orgId || inScope.has(c.patientId))
      .filter((c) => filter === "all" || c.status === filter)
      .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
  }, [db.consents, filter, user]);

  const patient = target ? patientById(target) : null;
  const pickCandidates = visiblePatients(user).filter((p) => p.orgId !== user.orgId);

  return (
    <div>
      <PageHeader
        title="Consent"
        description={isAdmin ? "Every access request involving your organization or its patients." : "Access you've requested, and its current authorization state."}
        actions={
          <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setPickOpen(true)}>Request patient access</Button>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${filter === f ? "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30" : "text-zinc-400 hover:bg-white/[0.04]"}`}
            >
              {f} {f !== "all" && <span className="opacity-70">({db.consents.filter((c) => (c.requestingOrgId === user.orgId || visiblePatients(user).some((p) => p.id === c.patientId)) && c.status === f).length})</span>}
            </button>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody className="p-0">
          <DataTable
            rows={rows}
            rowKey={(c) => c.id}
            empty={<EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No consent records" description="Requests you raise will appear here with their live status." />}
            columns={[
              { key: "patient", header: "Patient", render: (c) => <Link to={`/app/patients/${c.patientId}`} className="font-medium text-zinc-100 hover:text-brand-300">{patientById(c.patientId)?.name ?? "—"}</Link> },
              { key: "req", header: "Requested by", render: (c) => <span className="text-[12.5px]">{c.requestingUserName}<br /><span className="text-zinc-500">{orgById(c.requestingOrgId)?.name}</span></span> },
              { key: "purpose", header: "Purpose", render: (c) => <span className="text-[12.5px] text-zinc-400">{c.purpose}</span> },
              { key: "scope", header: "Scope", render: (c) => <span className="text-[12px] text-zinc-400">{c.scope.join(", ")}</span> },
              { key: "when", header: "Requested", render: (c) => <span title={fmtDate(c.requestedOn)}>{relative(c.requestedOn)}</span> },
              { key: "expiry", header: "Expires", render: (c) => c.expiresOn ? fmtDate(c.expiresOn) : "—" },
              { key: "status", header: "Status", align: "right", render: (c) => <Badge tone={CONSENT_STATUS_TONE[c.status]}>{c.status}</Badge> },
              {
                key: "act", header: "", align: "right", render: (c) =>
                  c.status === "approved" && c.requestingOrgId === user.orgId ? (
                    <Button size="sm" variant="ghost" icon={<ShieldX className="h-3.5 w-3.5" />}
                      onClick={() => { decideConsent(user, c.id, "revoked", "Access no longer required."); toast.push({ tone: "info", title: "Access revoked" }); }}>
                      Revoke
                    </Button>
                  ) : c.status === "expired" || c.status === "denied" ? (
                    <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setTarget(c.patientId)}>Re-request</Button>
                  ) : null,
              },
            ]}
          />
        </CardBody>
      </Card>

      {/* patient picker */}
      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="Request access to a patient" description="Choose a patient outside your organization. Same-tenant patients don't need consent.">
        {pickCandidates.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No external patients in view" description="Search a patient by ABHA first; their base identity becomes visible, and you can then request clinical access." />
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {pickCandidates.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => { setTarget(p.id); setPickOpen(false); }}
                  className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left hover:border-brand-500/40 hover:bg-brand-500/10"
                >
                  <span>
                    <span className="block text-[13px] font-medium text-zinc-100">{p.name}</span>
                    <span className="block text-[11px] text-zinc-400">{orgById(p.orgId)?.name} · {p.abha.number}</span>
                  </span>
                  <Badge tone="neutral">{p.access.reason.replace(/_/g, " ")}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {patient && <RequestConsentModal open={!!target} onClose={() => setTarget(null)} patient={patient} />}
    </div>
  );
}
