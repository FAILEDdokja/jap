import { useState } from "react";
import { Link } from "react-router-dom";
import { Network, ArrowRight, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { tasksFor, advanceTask, patientById, orgById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { NewTaskModal } from "@/pages/patients/ClinicalActions";
import { visiblePatients } from "@/data/store";
import { Modal } from "@/components/ui/Modal";
import { fmtDate, relative } from "@/lib/format";
import { PRIORITY_TONE } from "@/lib/status";
import { cn } from "@/lib/cn";
import type { CareTask, CareTaskStatus } from "@/data/types";

const COLUMNS: { id: CareTaskStatus; label: string; tone: string }[] = [
  { id: "pending", label: "Pending", tone: "bg-amber-500" },
  { id: "in_progress", label: "In progress", tone: "bg-sky-500" },
  { id: "completed", label: "Completed", tone: "bg-brand-600" },
];

export default function Coordination() {
  useStore();
  const { user } = useAuth();
  const [pickOpen, setPickOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  if (!user) return null;

  const tasks = tasksFor(user);
  const canCreate = user.role === "DOCTOR" || user.role === "HOSPITAL_ADMIN";
  const patient = target ? patientById(target) : null;
  const patients = visiblePatients(user);

  const next = (t: CareTask): CareTaskStatus | null =>
    t.status === "pending" ? "in_progress" : t.status === "in_progress" ? "completed" : null;

  return (
    <div>
      <PageHeader
        title="Care coordination"
        description="Tasks that move between organizations — lab orders, referrals and follow-ups — tracked from request to completion."
        actions={canCreate && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setPickOpen(true)}>New task</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="rounded-xl border border-line bg-white/[0.03]">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span className={cn("h-2 w-2 rounded-full", col.tone)} />
                <p className="text-[13px] font-semibold text-zinc-100">{col.label}</p>
                <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-line">{items.length}</span>
              </div>
              <div className="space-y-2.5 p-3">
                {items.length === 0 && <p className="px-1 py-6 text-center text-[12px] text-zinc-500">Nothing here</p>}
                {items.map((t) => {
                  const n = next(t);
                  const canAct = user.orgId === t.assigneeOrgId || user.orgId === t.orgId || user.role === "SUPER_ADMIN";
                  return (
                    <div key={t.id} className="rounded-lg border border-line bg-surface p-3 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-zinc-100">{t.title}</p>
                        <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-zinc-400">{t.detail}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                        <Link to={`/app/patients/${t.patientId}`} className="font-medium text-brand-400 hover:text-brand-300">{patientById(t.patientId)?.name}</Link>
                        <span>·</span>
                        <span>{t.type.replace(/_/g, " ")}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px] text-zinc-500">
                        <span>{orgById(t.createdById ? t.orgId : t.orgId)?.code} → {orgById(t.assigneeOrgId)?.code}</span>
                        <span>{t.dueOn ? `due ${fmtDate(t.dueOn)}` : relative(t.createdOn)}</span>
                      </div>
                      {n && canAct && (
                        <Button size="sm" variant="secondary" className="mt-2 w-full" icon={<ArrowRight className="h-3.5 w-3.5" />}
                          onClick={() => advanceTask(user, t.id, n)}>
                          Move to {n.replace(/_/g, " ")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && (
        <div className="mt-6"><EmptyState icon={<Network className="h-5 w-5" />} title="No coordination tasks yet" description="Create a task from a patient's chart or here to route work to a lab, pharmacy or another clinician." /></div>
      )}

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="New care task" description="Pick the patient this task is about.">
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
      {patient && <NewTaskModal open={!!target} onClose={() => setTarget(null)} patient={patient} />}
    </div>
  );
}
