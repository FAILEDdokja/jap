import { Link } from "react-router-dom";
import { Pill, PackageCheck, Clock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { prescriptionsFor, patientById, orgById, getDb } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, StatCard, Badge } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { fmtDate, relative } from "@/lib/format";
import { RX_STATUS_TONE } from "@/lib/status";

export default function PharmacyDashboard() {
  useStore();
  const { user, org } = useAuth();
  if (!user || !org) return null;
  const rx = prescriptionsFor(user);
  const toDispense = rx.filter((r) => r.status === "issued");
  const partial = rx.filter((r) => r.status === "partially_dispensed");
  const done = rx.filter((r) => r.status === "dispensed");
  const allergyFlags = rx.filter((r) => {
    const p = patientById(r.patientId);
    return p?.allergies.length && r.status !== "dispensed";
  });

  return (
    <div>
      <PageHeader title={org.name} description="Network prescriptions to fulfil, with the patient allergy context you're authorized to see." />
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting dispense" value={toDispense.length} icon={<Clock className="h-4 w-4" />} tone={toDispense.length ? "warning" : "positive"} />
        <StatCard label="Partially filled" value={partial.length} icon={<Pill className="h-4 w-4" />} />
        <StatCard label="Completed" value={done.length} icon={<PackageCheck className="h-4 w-4" />} tone="positive" />
        <StatCard label="Allergy cross-checks" value={allergyFlags.length} icon={<AlertTriangle className="h-4 w-4" />} tone={allergyFlags.length ? "critical" : "neutral"} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Prescription queue" action={<Link to="/app/prescriptions" className="text-[13px] font-medium text-brand-400">Open queue</Link>} />
        <CardBody className="p-0">
          <DataTable
            rows={rx.slice(0, 10)}
            rowKey={(r) => r.id}
            columns={[
              { key: "patient", header: "Patient", render: (r) => <span className="font-medium text-zinc-100">{patientById(r.patientId)?.name}</span> },
              { key: "items", header: "Items", render: (r) => r.items.map((i) => i.name).join(", ") },
              { key: "by", header: "Prescriber", render: (r) => <span className="text-[12px]">{r.prescriberName}<br /><span className="text-zinc-500">{orgById(r.orgId)?.name}</span></span> },
              { key: "allergy", header: "Allergy", render: (r) => {
                const p = patientById(r.patientId);
                return p?.allergies.length ? <Badge tone="critical">{p.allergies.map((a) => a.substance).join(", ")}</Badge> : <span className="text-zinc-500">None</span>;
              } },
              { key: "status", header: "Status", render: (r) => <Badge tone={RX_STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge> },
              { key: "when", header: "Issued", align: "right", render: (r) => <span title={fmtDate(r.issuedOn)}>{relative(r.issuedOn)}</span> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
