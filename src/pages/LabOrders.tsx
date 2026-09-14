import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { labQueueFor, patientById, orgById, updateLabOrder, visiblePatients } from "@/data/store";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/primitives";
import { OrderLabModal } from "@/pages/patients/ClinicalActions";
import { LAB_STATUS_TONE } from "@/lib/status";
import { fmtDate, relative } from "@/lib/format";
import type { LabOrder, LabStatus } from "@/data/types";

export default function LabOrders() {
  useStore();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"open" | "resulted" | "all">("open");
  const [result, setResult] = useState<LabOrder | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  if (!user) return null;

  const isLab = user.role === "LAB";
  const all = labQueueFor(user);
  const rows = useMemo(() => {
    if (tab === "open") return all.filter((l) => l.status !== "resulted" && l.status !== "cancelled");
    if (tab === "resulted") return all.filter((l) => l.status === "resulted");
    return all;
  }, [all, tab]);

  const patient = target ? patientById(target) : null;
  const patients = visiblePatients(user);

  const nextStatus: Record<LabStatus, LabStatus | null> = {
    ordered: "collected", collected: "in_progress", in_progress: "resulted", resulted: null, cancelled: null,
  };

  return (
    <div>
      <PageHeader
        title={isLab ? "Order queue" : "Lab orders"}
        description={isLab ? "Diagnostic requests routed to your laboratory from every connected organization." : "Investigations you've ordered and their results."}
        actions={user.role === "DOCTOR" && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setPickOpen(true)}>New order</Button>}
      />

      <Card>
        <CardBody className="flex gap-1.5">
          {(["open", "resulted", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize ${tab === t ? "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30" : "text-zinc-400 hover:bg-white/[0.04]"}`}>
              {t}
            </button>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody className="p-0">
          <DataTable
            rows={rows}
            rowKey={(l) => l.id}
            empty={<EmptyState icon={<FlaskConical className="h-5 w-5" />} title="Queue is clear" />}
            columns={[
              { key: "test", header: "Test", render: (l) => <div><p className="font-medium text-zinc-100">{l.test}</p><p className="text-[11px] text-zinc-500">{l.panel ?? "—"}</p></div> },
              { key: "patient", header: "Patient", render: (l) => <Link to={`/app/patients/${l.patientId}`} className="hover:text-brand-300">{patientById(l.patientId)?.name}</Link> },
              { key: "by", header: isLab ? "From" : "Lab", render: (l) => isLab ? orgById(l.orderedByOrgId)?.name : orgById(l.performingOrgId)?.name },
              { key: "prio", header: "Priority", render: (l) => <Badge tone={l.priority === "urgent" ? "critical" : "neutral"}>{l.priority}</Badge> },
              { key: "status", header: "Status", render: (l) => <Badge tone={LAB_STATUS_TONE[l.status]}>{l.status.replace(/_/g, " ")}</Badge> },
              { key: "result", header: "Result", render: (l) => l.status === "resulted" ? <span className={l.abnormal ? "font-semibold text-rose-400 tabular" : "font-semibold text-emerald-400 tabular"}>{l.resultValue} {l.unit}</span> : <span className="text-zinc-500">—</span> },
              { key: "when", header: "Ordered", align: "right", render: (l) => <span title={fmtDate(l.orderedOn)}>{relative(l.orderedOn)}</span> },
              {
                key: "act", header: "", align: "right", render: (l) => {
                  if (!isLab) return null;
                  if (l.status === "in_progress") return <Button size="sm" onClick={() => setResult(l)}>Enter result</Button>;
                  const n = nextStatus[l.status];
                  return n ? <Button size="sm" variant="secondary" onClick={() => { updateLabOrder(user, l.id, { status: n }); toast.push({ tone: "info", title: `Marked ${n.replace(/_/g, " ")}` }); }}>{n === "collected" ? "Collect" : "Start"}</Button> : null;
                },
              },
            ]}
          />
        </CardBody>
      </Card>

      {result && <ResultModal order={result} onClose={() => setResult(null)} onSave={(patch) => {
        updateLabOrder(user, result.id, { status: "resulted", ...patch });
        toast.push({ tone: "success", title: "Result released", body: "The ordering clinician has been notified." });
        setResult(null);
      }} />}

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="Order an investigation" description="Choose the patient.">
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {patients.map((p) => (
            <li key={p.id}>
              <button onClick={() => { setTarget(p.id); setPickOpen(false); }} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left hover:border-brand-500/40 hover:bg-brand-500/10">
                <span className="text-[13px] font-medium text-zinc-100">{p.name}</span>
                <span className="text-[11px] text-zinc-400">{orgById(p.orgId)?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {patient && <OrderLabModal open={!!target} onClose={() => setTarget(null)} patient={patient} />}
    </div>
  );
}

function ResultModal({ order, onClose, onSave }: { order: LabOrder; onClose: () => void; onSave: (p: Partial<LabOrder>) => void }) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [ref, setRef] = useState("");
  const [summary, setSummary] = useState("");
  const [abnormal, setAbnormal] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Result — ${order.test}`} description={`Patient: ${patientById(order.patientId)?.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave({ resultValue: value, unit, referenceRange: ref, resultSummary: summary, abnormal })} disabled={!value.trim()}>Release result</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value"><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 1.4" /></Field>
          <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mg/dL" /></Field>
        </div>
        <Field label="Reference range"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="0.7 - 1.3" /></Field>
        <Field label="Interpretation"><Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Within range / Elevated / Low" /></Field>
        <label className="flex items-center gap-2 text-[13px] text-zinc-200">
          <input type="checkbox" checked={abnormal} onChange={(e) => setAbnormal(e.target.checked)} className="rounded border-line text-brand-400" />
          Flag as outside reference range
        </label>
      </div>
    </Modal>
  );
}
