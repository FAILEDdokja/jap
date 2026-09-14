import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { getDb, platformStats, auditFeed, tasksFor, metrics } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard } from "@/components/ui/primitives";
import { BarChart, Donut } from "@/components/charts/Charts";
import { Clock, Layers, ShieldX, ShieldCheck, Route } from "lucide-react";

export default function Analytics() {
  useStore();
  const { user } = useAuth();
  if (!user) return null;
  const db = getDb();
  const isPlatform = user.role === "SUPER_ADMIN";
  const audit = auditFeed(user);
  const tasks = tasksFor(user);
  const m = metrics.summary();
  const s = platformStats();

  const consentMix = [
    { label: "Approved", value: db.consents.filter((c) => c.status === "approved").length, color: "#2dd4bf" },
    { label: "Pending", value: db.consents.filter((c) => c.status === "pending").length, color: "#fbbf24" },
    { label: "Denied", value: db.consents.filter((c) => c.status === "denied").length, color: "#fb7185" },
    { label: "Expired", value: db.consents.filter((c) => c.status === "expired").length, color: "#71717a" },
    { label: "Revoked", value: db.consents.filter((c) => c.status === "revoked").length, color: "#a78bfa" },
  ];
  const actionCounts = Object.entries(
    audit.reduce<Record<string, number>>((acc, a) => {
      const k = a.action.split(".")[0];
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const completed = tasks.filter((t) => t.status === "completed" && t.completedOn);
  const avgTaskHrs = completed.length
    ? Math.round(
        completed.reduce((sum, t) => sum + (new Date(t.completedOn!).getTime() - new Date(t.createdOn).getTime()) / 36e5, 0) / completed.length,
      )
    : 0;

  return (
    <div>
      <PageHeader
        title={isPlatform ? "Platform metrics" : "Analytics"}
        description="Operational health and the research-relevant measures the prototype is built to capture."
      />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Avg. context assembly" value={`${m.avgAssembledMs || "—"} ms`} sub={`${m.runs} assemblies this session`} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Avg. records unified / view" value={m.avgRecords || "—"} sub="Was: one screen per source" icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Unauthorized attempts blocked" value={m.blockedAttempts} icon={<ShieldX className="h-4 w-4" />} tone={m.blockedAttempts ? "critical" : "positive"} />
        <StatCard label="Navigation to full context" value="1 screen" sub="vs. multi-portal retrieval" icon={<Route className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Consent decisions" description="How access requests resolve" />
          <CardBody><Donut segments={consentMix} centerLabel={String(db.consents.length)} centerSub="requests" /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Audited actions by type" description="Volume across your scope" />
          <CardBody><BarChart data={actionCounts} /></CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <StatCard label="Care tasks completed" value={completed.length} sub={`avg ${avgTaskHrs} h to close`} icon={<ShieldCheck className="h-4 w-4" />} tone="positive" />
        <StatCard label="Consent enforcement rate" value={`${db.consents.length ? Math.round((db.consents.filter((c) => c.status !== "pending").length / db.consents.length) * 100) : 0}%`} sub="requests with a recorded decision" />
        <StatCard label="Audit coverage" value={`${s.auditEvents} events`} sub={`${s.blocked} blocked · append-only`} />
      </div>

      <p className="mt-6 rounded-xl border border-line bg-white/[0.03] p-4 text-[12px] text-zinc-400">
        These figures are measured from interactions in this browser session against synthetic data. They demonstrate
        the metrics the platform can capture for a controlled study — they are not experimental results.
      </p>
    </div>
  );
}
