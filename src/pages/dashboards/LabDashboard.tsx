import { Link } from "react-router-dom";
import { FlaskConical, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { labQueueFor, patientById, orgById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard, Badge } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { fmtDate, relative } from "@/lib/format";
import { LAB_STATUS_TONE } from "@/lib/status";

export default function LabDashboard() {
  useStore();
  const { user, org } = useAuth();
  if (!user || !org) return null;
  const queue = labQueueFor(user);
  const open = queue.filter((l) => l.status !== "resulted" && l.status !== "cancelled");
  const urgent = open.filter((l) => l.priority === "urgent");
  const resultedToday = queue.filter((l) => l.status === "resulted");

  return (
    <div>
      <PageHeader title={org.name} description="Inbound diagnostic orders from across the network, and their turnaround." />
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open orders" value={open.length} icon={<FlaskConical className="h-4 w-4" />} />
        <StatCard label="Urgent in queue" value={urgent.length} tone={urgent.length ? "critical" : "positive"} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Awaiting collection" value={open.filter((l) => l.status === "ordered").length} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Resulted" value={resultedToday.length} tone="positive" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Order queue" description="Ordered by most recent" action={<Link to="/app/lab-orders" className="text-[13px] font-medium text-brand-400">Open queue</Link>} />
        <CardBody className="p-0">
          <DataTable
            rows={queue.slice(0, 10)}
            rowKey={(r) => r.id}
            columns={[
              { key: "test", header: "Test", render: (r) => <span className="font-medium text-zinc-100">{r.test}</span> },
              { key: "patient", header: "Patient", render: (r) => patientById(r.patientId)?.name ?? "—" },
              { key: "from", header: "Ordered by", render: (r) => <span className="text-[12px]">{r.orderedByName}<br /><span className="text-zinc-500">{orgById(r.orderedByOrgId)?.name}</span></span> },
              { key: "priority", header: "Priority", render: (r) => <Badge tone={r.priority === "urgent" ? "critical" : "neutral"}>{r.priority}</Badge> },
              { key: "status", header: "Status", render: (r) => <Badge tone={LAB_STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge> },
              { key: "when", header: "Ordered", align: "right", render: (r) => <span title={fmtDate(r.orderedOn)}>{relative(r.orderedOn)}</span> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
