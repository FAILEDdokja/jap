import { Link } from "react-router-dom";
import { Users, ShieldCheck, ClipboardList, FlaskConical, ArrowRight, Stethoscope, Activity } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { visiblePatients, tasksFor, labQueueFor, getDb, patientById, metrics } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard, Badge, Button, EmptyState, Avatar } from "@/components/ui/primitives";
import { ConsentPill } from "@/components/ConsentPill";
import { fmtDate, relative, ageFrom } from "@/lib/format";

export default function DoctorDashboard() {
  useStore();
  const { user } = useAuth();
  if (!user) return null;
  const db = getDb();

  const patients = visiblePatients(user);
  const myConsentReqs = db.consents.filter((c) => c.requestingUserId === user.id);
  const pendingReqs = myConsentReqs.filter((c) => c.status === "pending");
  const inboundPending = db.consents.filter((c) => c.status === "pending" && c.requestingOrgId === user.orgId);
  const myTasks = tasksFor(user).filter((t) => t.assigneeOrgId === user.orgId && t.status !== "completed" && t.status !== "cancelled");
  const labs = labQueueFor(user);
  const labsNeedingAttention = labs.filter((l) => l.status === "resulted" && l.abnormal);
  const allowedIds = new Set(patients.filter((p) => p.access.allowed).map((p) => p.id));
  const recentEncounters = [...db.encounters]
    .filter((e) => allowedIds.has(e.patientId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const m = metrics.summary();

  return (
    <div>
      <PageHeader
        title={`Good day, ${user.name.replace(/^Dr\.?\s*/, "Dr. ")}`}
        description="Your patients in scope, the consent decisions you're waiting on, and today's coordination work."
        actions={<Link to="/app/patients"><Button icon={<Users className="h-4 w-4" />}>Patient search</Button></Link>}
      />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Patients in scope" value={patients.length} sub={`${patients.filter((p) => p.access.allowed).length} with active access`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Consent requests pending" value={inboundPending.length} sub={`${pendingReqs.length} raised by you`} icon={<ShieldCheck className="h-4 w-4" />} tone={inboundPending.length ? "warning" : "neutral"} />
        <StatCard label="Open care tasks" value={myTasks.length} sub={`${myTasks.filter((t) => t.priority === "high").length} high priority`} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="Lab results to review" value={labsNeedingAttention.length} sub="Flagged outside reference range" icon={<FlaskConical className="h-4 w-4" />} tone={labsNeedingAttention.length ? "critical" : "positive"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: patients + encounters */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Your patients"
              description="Same-tenant patients and those who granted your organization access."
              action={<Link to="/app/patients" className="text-[13px] font-medium text-brand-400 hover:text-brand-300">View all</Link>}
            />
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {patients.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link to={`/app/patients/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04]">
                      <Avatar name={p.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-zinc-100">{p.name}</p>
                        <p className="truncate text-[12px] text-zinc-400">
                          {p.gender} · {ageFrom(p.dob)} yrs · {p.access.allowed ? (p.chronicConditions[0] ?? "No chronic conditions") : "Clinical details sealed"}
                        </p>
                      </div>
                      <ConsentPill decision={p.access} />
                      <ArrowRight className="h-4 w-4 text-zinc-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent encounters" description="Across patients in your scope" />
            <CardBody className="p-0">
              {recentEncounters.length === 0 ? (
                <div className="p-5"><EmptyState icon={<Stethoscope className="h-5 w-5" />} title="No recent encounters" /></div>
              ) : (
                <ul className="divide-y divide-line">
                  {recentEncounters.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-zinc-400">
                        <Stethoscope className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/app/patients/${e.patientId}`} className="text-[13.5px] font-medium text-zinc-100 hover:text-brand-300">
                            {patientById(e.patientId)?.name}
                          </Link>
                          <Badge tone={e.setting === "Emergency" ? "critical" : "neutral"}>{e.setting}</Badge>
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-zinc-400">{e.reason} — {e.assessment}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">{fmtDate(e.date)} · {e.clinicianName} · {e.facilityName}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right: consent, tasks, labs, metrics */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Pending consent" action={<Link to="/app/consent" className="text-[13px] font-medium text-brand-400">Manage</Link>} />
            <CardBody className="space-y-3">
              {inboundPending.length === 0 && <p className="text-[13px] text-zinc-400">No requests awaiting a patient decision.</p>}
              {inboundPending.map((c) => (
                <div key={c.id} className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                  <p className="text-[13px] font-medium text-zinc-100">{patientById(c.patientId)?.name}</p>
                  <p className="mt-0.5 text-[12px] text-zinc-400">{c.purpose}</p>
                  <p className="mt-1.5 text-[11px] text-zinc-500">Requested {relative(c.requestedOn)} · by {c.requestingUserName}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Care tasks due" action={<Link to="/app/coordination" className="text-[13px] font-medium text-brand-400">Board</Link>} />
            <CardBody className="space-y-2.5">
              {myTasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.priority === "high" ? "bg-rose-500" : t.priority === "normal" ? "bg-amber-500" : "bg-zinc-600"}`} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-100">{t.title}</p>
                    <p className="text-[11px] text-zinc-400">{patientById(t.patientId)?.name} · {t.status.replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}
              {myTasks.length === 0 && <p className="text-[13px] text-zinc-400">Nothing outstanding.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Research instrumentation" description="This session's context-assembly metrics" />
            <CardBody className="space-y-2 text-[13px]">
              <Row k="Context assemblies" v={m.runs} />
              <Row k="Avg. assembly time" v={`${m.avgAssembledMs || "—"} ms`} />
              <Row k="Avg. records unified" v={m.avgRecords || "—"} />
              <Row k="Unauthorized attempts blocked" v={m.blockedAttempts} />
              <Row k="Consent grants observed" v={m.consentGrants} />
              <p className="pt-1 text-[11px] text-zinc-500">Measured from your interactions in this browser. Not a study result.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{k}</span>
      <span className="font-semibold text-zinc-100 tabular">{v}</span>
    </div>
  );
}
