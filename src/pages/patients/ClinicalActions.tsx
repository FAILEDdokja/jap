import { useState } from "react";
import { Pill, FlaskConical, ClipboardList, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Textarea, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthContext";
import { createPrescription, createLabOrder, createTask, orgs, addClinicalNote } from "@/data/store";
import type { Patient, Role } from "@/data/types";

/* --------------------------------------------------------- New prescription */
export function NewPrescriptionModal({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: Patient }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([{ name: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  const [notes, setNotes] = useState("");

  const upd = (i: number, k: string, v: string) => setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const valid = items.every((i) => i.name.trim() && i.dosage.trim() && i.frequency.trim());
  const allergyHit = items.find((i) => patient.allergies.some((a) => i.name.toLowerCase().includes(a.substance.toLowerCase().slice(0, 4))));

  function submit() {
    if (!user) return;
    createPrescription(user, { patientId: patient.id, items, notes });
    toast.push({ tone: "success", title: "Prescription issued", body: "Sent to the pharmacy queue." });
    setItems([{ name: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
    setNotes("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`New prescription — ${patient.name}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!valid}>Issue prescription</Button></>}>
      <div className="space-y-4">
        {patient.allergies.length > 0 && (
          <div className={`rounded-lg px-3 py-2 text-[12px] ring-1 ring-inset ${allergyHit ? "bg-rose-500/10 text-rose-400 ring-rose-500/25" : "bg-amber-500/10 text-amber-300 ring-amber-500/25"}`}>
            Allergies on record: {patient.allergies.map((a) => a.substance).join(", ")}
            {allergyHit && <strong> — “{allergyHit.name}” may conflict. Review before issuing.</strong>}
          </div>
        )}
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Medicine" value={it.name} onChange={(e) => upd(i, "name", e.target.value)} />
                <Input placeholder="Dosage (e.g. 500 mg)" value={it.dosage} onChange={(e) => upd(i, "dosage", e.target.value)} />
                <Input placeholder="Frequency (e.g. Twice daily)" value={it.frequency} onChange={(e) => upd(i, "frequency", e.target.value)} />
                <Input placeholder="Duration (e.g. 5 days)" value={it.duration} onChange={(e) => upd(i, "duration", e.target.value)} />
              </div>
              <Input className="mt-2" placeholder="Instructions (optional)" value={it.instructions} onChange={(e) => upd(i, "instructions", e.target.value)} />
              {items.length > 1 && (
                <button onClick={() => setItems((cur) => cur.filter((_, idx) => idx !== i))} className="mt-2 inline-flex items-center gap-1 text-[12px] text-rose-400 hover:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setItems((cur) => [...cur, { name: "", dosage: "", frequency: "", duration: "", instructions: "" }])}>
            Add medicine
          </Button>
        </div>
        <Field label="Notes to pharmacy (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- Order a lab */
export function OrderLabModal({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: Patient }) {
  const { user } = useAuth();
  const toast = useToast();
  const labs = orgs().filter((o) => o.type === "lab");
  const [test, setTest] = useState("");
  const [panel, setPanel] = useState("");
  const [priority, setPriority] = useState<"routine" | "urgent">("routine");
  const [perf, setPerf] = useState(labs[0]?.id ?? "");

  function submit() {
    if (!user) return;
    createLabOrder(user, { patientId: patient.id, test, panel: panel || undefined, priority, performingOrgId: perf });
    toast.push({ tone: "success", title: "Lab order created", body: "Routed to the performing laboratory." });
    setTest(""); setPanel("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Order investigation — ${patient.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!test.trim() || !perf}>Send order</Button></>}>
      <div className="space-y-4">
        <Field label="Test"><Input placeholder="e.g. Serum creatinine" value={test} onChange={(e) => setTest(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Panel (optional)"><Input placeholder="e.g. Renal" value={panel} onChange={(e) => setPanel(e.target.value)} /></Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
        </div>
        <Field label="Performing laboratory">
          <Select value={perf} onChange={(e) => setPerf(e.target.value)}>
            {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- New care task */
export function NewTaskModal({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: Patient }) {
  const { user } = useAuth();
  const toast = useToast();
  const targets = orgs().filter((o) => o.type !== "platform");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [type, setType] = useState("follow_up");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [assigneeOrgId, setAssigneeOrgId] = useState(user?.orgId ?? "");
  const [assigneeRole, setAssigneeRole] = useState<Role>("DOCTOR");
  const [dueOn, setDueOn] = useState("");

  function submit() {
    if (!user) return;
    createTask(user, {
      patientId: patient.id, title, detail, type: type as any, priority,
      assigneeOrgId, assigneeRole, dueOn: dueOn || undefined,
    });
    toast.push({ tone: "success", title: "Care task created", body: "The assignee has been notified." });
    setTitle(""); setDetail("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`New care task — ${patient.name}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!title.trim() || !assigneeOrgId}>Create task</Button></>}>
      <div className="space-y-4">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Repeat renal function in 2 weeks" /></Field>
        <Field label="Detail"><Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {["lab_order", "referral", "follow_up", "medication_review", "general"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </Select>
          </Field>
          <Field label="Due date"><Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assign to organization">
            <Select value={assigneeOrgId} onChange={(e) => setAssigneeOrgId(e.target.value)}>
              {targets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
          <Field label="Assignee role">
            <Select value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value as Role)}>
              {["DOCTOR", "HOSPITAL_ADMIN", "LAB", "PHARMACY"].map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Add a note */
export function AddNoteModal({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: Patient }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  function submit() {
    if (!user) return;
    addClinicalNote(user, patient.id, text);
    toast.push({ tone: "success", title: "Note added to the record" });
    setText("");
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={`Add clinical note — ${patient.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!text.trim()}>Save note</Button></>}>
      <Field label="Note"><Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Observation, plan, or handover detail…" /></Field>
    </Modal>
  );
}
