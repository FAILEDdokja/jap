import { Link } from "react-router-dom";
import { Users, UserRound, ShieldCheck, Network, ScrollText, Activity } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { getDb, visiblePatients, tasksFor, auditFeed, orgById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard, Badge, Avatar } from "@/components/ui/primitives";
import { BarChart, Donut } from "@/components/charts/Charts";
import { relative, fmtDateTime } from "@/lib/format";

export default function AdminDashboard() {
  useStore();
  const { user, org } = useAuth();
  if (!user || !org) return null;
  const db = getDb();

  const patients = visiblePatients(user);
  const staff = db.users.filter((u) => u.orgId === user.orgId);
  const tasks = tasksFor(user);
  const openTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const consents = db.consents.filter((c) => c.requestingOrgId === user.orgId || patients.some((p) => p.id === c.patientId));
  const pending = consents.filter((c) => c.status === "pending");
  const audit = auditFeed(user);
  const blocked = audit.filter((a) => a.status === "blocked");

  const taskByStatus = [
    { label: "Pending", value: tasks.filter((t) => t.status === "pending").length, color: "#fbbf24" },
    { label: "In progress", value: tasks.filter((t) => t.status === "in_progress").length, color: "#38bdf8" },
    { label: "Completed", value: tasks.filter((t) => t.status === "completed").length, color: "#2dd4bf" },
  ];
  const consentMix = [
    { label: "Approved", value: consents.filter((c) => c.status === "approved").length, color: "#2dd4bf" },
    { label: "Pending", value: consents.filter((c) => c.status === "pending").length, color: "#fbbf24" },
    { label: "Denied / revoked", value: consents.filter((c) => c.status === "denied" || c.status === "revoked").length, color: "#fb7185" },
    { label: "Expired", value: consents.filter((c) => c.status === "expired").length, color: "#71717a" },
  ];

  return (
    <div>
      <PageHeader title={`${org.name}`} description="Organization health: people, patients, coordination load and access accountability." />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered patients" value={db.patients.filter((p) => p.orgId === user.orgId).length} sub={`${patients.length} in reach incl. consented`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active providers" value={staff.filter((s) => s.role === "DOCTOR").length} sub={`${staff.length} staff accounts`} icon={<UserRound className="h-4 w-4" />} />
        <StatCard label="Consent requests pending" value={pending.length} icon={<ShieldCheck className="h-4 w-4" />} tone={pending.length ? "warning" : "neutral"} />
        <StatCard label="Access denials logged" value={blocked.length} sub="Blocked unauthorized attempts" icon={<ScrollText className="h-4 w-4" />} tone={blocked.length ? "critical" : "positive"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Care coordination" description="Task load across the organization" action={<Link to="/app/coordination" className="text-[13px] font-medium text-brand-400">Board</Link>} />
          <CardBody>
            <Donut segments={taskByStatus} centerLabel={String(openTasks.length)} centerSub="open tasks" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Consent register" description="Distribution of access decisions" action={<Link to="/app/consent" className="text-[13px] font-medium text-brand-400">Register</Link>} />
          <CardBody>
            <Donut segments={consentMix} centerLabel={String(consents.length)} centerSub="total requests" />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" description="Latest audited actions touching this organization" action={<Link to="/app/audit" className="text-[13px] font-medium text-brand-400">Full trail</Link>} />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {audit.slice(0, 7).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.status === "blocked" ? "bg-rose-500" : "bg-emerald-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-zinc-100"><span className="font-medium">{a.actorName}</span> · <span className="text-zinc-400">{a.action}</span></p>
                    <p className="text-[12px] text-zinc-400">{a.detail}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{fmtDateTime(a.ts)} · {relative(a.ts)}</p>
                  </div>
                  <Badge tone={a.status === "blocked" ? "critical" : "positive"}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Staff" action={<Link to="/app/staff" className="text-[13px] font-medium text-brand-400">Manage</Link>} />
          <CardBody className="space-y-2.5">
            {staff.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5">
                <Avatar name={s.name} className="h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-100">{s.name}</p>
                  <p className="truncate text-[11px] text-zinc-400">{s.title}</p>
                </div>
                <Badge tone="neutral">{s.role.replace("_", " ").toLowerCase()}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
