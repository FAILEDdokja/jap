import { Link } from "react-router-dom";
import { HeartPulse, ShieldCheck, FileText, ClipboardList, AlertTriangle, Pill } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { patientBundle, patientTimeline, getDb, orgById, decideConsent, metrics } from "@/data/store";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard, Badge, Button, SampleTag } from "@/components/ui/primitives";
import { Timeline } from "@/components/Timeline";
import { fmtDate, relative, ageFrom } from "@/lib/format";

export default function PatientDashboard() {
  useStore();
  const { user } = useAuth();
  const toast = useToast();
  if (!user?.patientId) return null;
  const pid = user.patientId;
  const { patient, consents, careTasks, prescriptions, labOrders } = patientBundle(pid);
  const timeline = patientTimeline(pid);
  const db = getDb();
  if (!patient) return null;

  const pendingConsents = consents.filter((c) => c.status === "pending");
  const activeConsents = consents.filter((c) => c.status === "approved");
  const myTasks = careTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const whoAccessed = db.audit.filter((a) => a.patientId === pid && a.action.includes("context")).slice(0, 4);

  return (
    <div>
      <PageHeader
        title={`Your health overview`}
        description={<>Everything recorded about you across the network — and who has looked at it. <SampleTag /></>}
      />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active conditions" value={patient.chronicConditions.length} sub={patient.chronicConditions[0] ?? "None recorded"} icon={<HeartPulse className="h-4 w-4" />} />
        <StatCard label="Access requests pending" value={pendingConsents.length} sub="Awaiting your decision" icon={<ShieldCheck className="h-4 w-4" />} tone={pendingConsents.length ? "warning" : "positive"} />
        <StatCard label="Organizations with access" value={activeConsents.length} sub="Currently approved" icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Open care tasks" value={myTasks.length} icon={<ClipboardList className="h-4 w-4" />} />
      </div>

      {patient.allergies.length > 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="text-[13px] font-semibold text-rose-300">Allergies on record</p>
            <p className="text-[13px] text-rose-400">
              {patient.allergies.map((a) => `${a.substance} (${a.reaction})`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {pendingConsents.length > 0 && (
            <Card>
              <CardHeader title="Access requests for your decision" description="A clinician outside your regular hospital is asking to see part of your record." />
              <CardBody className="space-y-3">
                {pendingConsents.map((c) => (
                  <div key={c.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold text-zinc-100">{orgById(c.requestingOrgId)?.name}</p>
                      <Badge tone="warning">Pending</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-zinc-400">Requested by {c.requestingUserName}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                      <div><dt className="text-zinc-500">Purpose</dt><dd className="text-zinc-100">{c.purpose}</dd></div>
                      <div><dt className="text-zinc-500">Information</dt><dd className="text-zinc-100">{c.scope.join(", ")}</dd></div>
                      <div><dt className="text-zinc-500">Requested</dt><dd className="text-zinc-100">{fmtDate(c.requestedOn)}</dd></div>
                      <div><dt className="text-zinc-500">Access until</dt><dd className="text-zinc-100">{c.expiresOn ? fmtDate(c.expiresOn) : "90 days from approval"}</dd></div>
                    </dl>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" onClick={() => { decideConsent(user, c.id, "approved"); metrics.recordGrant(); toast.push({ tone: "success", title: "Access approved", body: `${orgById(c.requestingOrgId)?.name} can now view the selected records.` }); }}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { decideConsent(user, c.id, "denied", "Declined by patient."); toast.push({ tone: "info", title: "Request denied" }); }}>
                        Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Recent activity" description="Your health events across every organization" action={<Link to="/app/my-timeline" className="text-[13px] font-medium text-brand-400">Full timeline</Link>} />
            <CardBody><Timeline events={timeline} limit={5} /></CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Who accessed my data" action={<Link to="/app/audit" className="text-[13px] font-medium text-brand-400">All</Link>} />
            <CardBody className="space-y-3">
              {whoAccessed.length === 0 && <p className="text-[13px] text-zinc-400">No record accesses yet.</p>}
              {whoAccessed.map((a) => (
                <div key={a.id} className="text-[13px]">
                  <p className="font-medium text-zinc-100">{a.actorName}</p>
                  <p className="text-[12px] text-zinc-400">{a.orgName}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{relative(a.ts)} · <span className={a.status === "blocked" ? "text-rose-400" : "text-emerald-400"}>{a.status}</span></p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Current medications" action={<Link to="/app/my-records" className="text-[13px] font-medium text-brand-400">Records</Link>} />
            <CardBody className="space-y-2.5">
              {patient.currentMedications.map((m) => (
                <div key={m.name} className="flex items-start gap-2.5">
                  <Pill className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-[13px] font-medium text-zinc-100">{m.name}</p>
                    <p className="text-[11px] text-zinc-400">{m.dosage} · {m.frequency}</p>
                  </div>
                </div>
              ))}
              {patient.currentMedications.length === 0 && <p className="text-[13px] text-zinc-400">No active medications.</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
