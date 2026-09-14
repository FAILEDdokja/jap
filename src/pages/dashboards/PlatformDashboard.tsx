import { Link } from "react-router-dom";
import { Building2, Users, ShieldCheck, ScrollText, Activity } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { platformStats, orgDirectory, getDb, metrics } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard, Badge } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { BarChart } from "@/components/charts/Charts";
import { relative } from "@/lib/format";

export default function PlatformDashboard() {
  useStore();
  const { user } = useAuth();
  if (!user) return null;
  const s = platformStats();
  const dir = orgDirectory().filter((o) => o.type !== "platform");
  const db = getDb();
  const m = metrics.summary();

  const byType = ["hospital", "lab", "pharmacy"].map((t) => ({
    label: t + "s",
    value: dir.filter((o) => o.type === t).length,
    tone: (t === "hospital" ? "brand" : t === "lab" ? "amber" : "sky") as "brand" | "amber" | "sky",
  }));

  return (
    <div>
      <PageHeader title="Platform overview" description="Every tenant, every user and every audited action across Jan Arogya Nexus." />
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={s.orgs} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="User accounts" value={s.users} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active consents" value={s.activeConsents} sub={`${s.pendingConsents} pending`} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Audit events" value={s.auditEvents} sub={`${s.blocked} blocked attempts`} icon={<ScrollText className="h-4 w-4" />} tone={s.blocked ? "critical" : "positive"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Tenants by type" />
          <CardBody><BarChart data={byType} /></CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Organizations" action={<Link to="/app/organizations" className="text-[13px] font-medium text-brand-400">Manage</Link>} />
          <CardBody className="p-0">
            <DataTable
              rows={dir}
              rowKey={(o) => o.id}
              columns={[
                { key: "name", header: "Organization", render: (o) => <span className="font-medium text-zinc-100">{o.name}</span> },
                { key: "type", header: "Type", render: (o) => <Badge tone="neutral">{o.type}</Badge> },
                { key: "city", header: "Location", render: (o) => `${o.city}, ${o.state}` },
                { key: "staff", header: "Staff", align: "right", render: (o) => o.staff },
                { key: "patients", header: "Patients", align: "right", render: (o) => o.patients },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Audit overview" action={<Link to="/app/audit" className="text-[13px] font-medium text-brand-400">Full trail</Link>} />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {db.audit.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.status === "blocked" ? "bg-rose-500" : "bg-emerald-500"}`} />
                  <span className="font-medium text-zinc-100">{a.actorName}</span>
                  <span className="text-zinc-400">{a.action}</span>
                  <span className="ml-auto text-[11px] text-zinc-500">{relative(a.ts)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Research instrumentation" description="Aggregate, this browser" />
          <CardBody className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-zinc-400">Context assemblies</span><span className="font-semibold tabular">{m.runs}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Avg time</span><span className="font-semibold tabular">{m.avgAssembledMs || "—"} ms</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Avg records unified</span><span className="font-semibold tabular">{m.avgRecords || "—"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Blocked attempts</span><span className="font-semibold tabular">{m.blockedAttempts}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Consent grants</span><span className="font-semibold tabular">{m.consentGrants}</span></div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
