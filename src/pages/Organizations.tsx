import { Building2, Hospital, FlaskConical, Pill } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { orgDirectory, getDb } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, StatCard } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/lib/format";

const ICON: Record<string, any> = { hospital: Hospital, lab: FlaskConical, pharmacy: Pill, platform: Building2 };

export default function Organizations() {
  useStore();
  const { user } = useAuth();
  if (!user) return null;
  const dir = orgDirectory().filter((o) => o.type !== "platform");
  const db = getDb();

  return (
    <div>
      <PageHeader title="Organizations" description="Every tenant on the platform. Each has isolated data; cross-tenant access requires patient consent." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Hospitals" value={dir.filter((o) => o.type === "hospital").length} icon={<Hospital className="h-4 w-4" />} />
        <StatCard label="Laboratories" value={dir.filter((o) => o.type === "lab").length} icon={<FlaskConical className="h-4 w-4" />} />
        <StatCard label="Pharmacies" value={dir.filter((o) => o.type === "pharmacy").length} icon={<Pill className="h-4 w-4" />} />
      </div>
      <Card className="mt-4">
        <CardBody className="p-0">
          <DataTable
            rows={dir}
            rowKey={(o) => o.id}
            columns={[
              { key: "name", header: "Organization", render: (o) => {
                const Icon = ICON[o.type];
                return <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-raised text-zinc-400"><Icon className="h-4 w-4" /></span><div><p className="font-medium text-zinc-100">{o.name}</p><p className="text-[11px] text-zinc-500">{o.code}</p></div></div>;
              } },
              { key: "type", header: "Type", render: (o) => <Badge tone="neutral">{o.type}</Badge> },
              { key: "loc", header: "Location", render: (o) => `${o.city}, ${o.state}` },
              { key: "staff", header: "Staff", align: "right", render: (o) => o.staff },
              { key: "patients", header: "Patients", align: "right", render: (o) => o.patients },
              { key: "consentsOut", header: "Consents requested", align: "right", render: (o) => db.consents.filter((c) => c.requestingOrgId === o.id).length },
              { key: "since", header: "Onboarded", align: "right", render: (o) => fmtDate(o.createdOn) },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
