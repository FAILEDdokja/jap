import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { patientBundle, orgById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, Badge, EmptyState, SampleTag } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/lib/format";
import { LAB_STATUS_TONE, RX_STATUS_TONE } from "@/lib/status";
import { Pill, FlaskConical, Stethoscope, Activity } from "lucide-react";

export default function MyRecords() {
  useStore();
  const { user } = useAuth();
  if (!user?.patientId) return null;
  const b = patientBundle(user.patientId);
  const p = b.patient!;

  return (
    <div>
      <PageHeader title="My records" description={<>Diagnoses, encounters, investigations and prescriptions recorded about you. <SampleTag /></>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Conditions & allergies" />
          <CardBody className="space-y-4 text-[13px]">
            <div>
              <p className="mb-1 font-medium text-zinc-400">Active conditions</p>
              {p.chronicConditions.length ? p.chronicConditions.map((c) => <Badge key={c} tone="warning" className="mr-1.5 mb-1.5">{c}</Badge>) : <span className="text-zinc-500">None recorded</span>}
            </div>
            <div>
              <p className="mb-1 font-medium text-zinc-400">Allergies</p>
              {p.allergies.length ? p.allergies.map((a) => <Badge key={a.substance} tone="critical" className="mr-1.5 mb-1.5">{a.substance} — {a.reaction}</Badge>) : <span className="text-zinc-500">None recorded</span>}
            </div>
            <div>
              <p className="mb-1 font-medium text-zinc-400">Current medications</p>
              <ul className="space-y-1.5">
                {p.currentMedications.map((m) => (
                  <li key={m.name} className="flex items-center gap-2"><Pill className="h-3.5 w-3.5 text-zinc-500" /> {m.name} — {m.dosage}, {m.frequency}</li>
                ))}
                {p.currentMedications.length === 0 && <li className="text-zinc-500">None</li>}
              </ul>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Diagnoses" />
          <CardBody className="space-y-2.5">
            {b.diagnoses.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 text-[13px]">
                <div>
                  <p className="font-medium text-zinc-100">{d.label}</p>
                  <p className="text-[11px] text-zinc-500">{fmtDate(d.date)} · {d.clinicianName}</p>
                </div>
                <Badge tone={d.status === "active" ? "warning" : "neutral"}>{d.status}</Badge>
              </div>
            ))}
            {b.diagnoses.length === 0 && <EmptyState icon={<Activity className="h-5 w-5" />} title="No diagnoses" />}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Investigations" />
        <CardBody className="p-0">
          <DataTable
            rows={b.labOrders}
            rowKey={(l) => l.id}
            empty={<EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No lab records" />}
            columns={[
              { key: "test", header: "Test", render: (l) => <span className="font-medium text-zinc-100">{l.test}</span> },
              { key: "result", header: "Result", render: (l) => l.status === "resulted" ? <span className={l.abnormal ? "font-semibold text-rose-400 tabular" : "font-semibold text-emerald-400 tabular"}>{l.resultValue} {l.unit}</span> : "—" },
              { key: "lab", header: "Laboratory", render: (l) => orgById(l.performingOrgId)?.name },
              { key: "status", header: "Status", render: (l) => <Badge tone={LAB_STATUS_TONE[l.status]}>{l.status.replace(/_/g, " ")}</Badge> },
              { key: "when", header: "Date", align: "right", render: (l) => fmtDate(l.resultedOn || l.orderedOn) },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Prescriptions" />
        <CardBody className="space-y-3">
          {b.prescriptions.map((r) => (
            <div key={r.id} className="rounded-lg border border-line p-4">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-zinc-500" />
                <span className="text-[13px] font-semibold text-zinc-100">{fmtDate(r.issuedOn)}</span>
                <Badge tone={RX_STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
                <span className="ml-auto text-[11px] text-zinc-500">{r.prescriberName} · {orgById(r.orgId)?.name}</span>
              </div>
              <ul className="mt-2 space-y-1 text-[13px]">
                {r.items.map((it, i) => <li key={i}><span className="font-medium text-zinc-100">{it.name}</span> <span className="text-zinc-400">— {it.dosage}, {it.frequency}</span></li>)}
              </ul>
            </div>
          ))}
          {b.prescriptions.length === 0 && <EmptyState icon={<Pill className="h-5 w-5" />} title="No prescriptions" />}
        </CardBody>
      </Card>
    </div>
  );
}
