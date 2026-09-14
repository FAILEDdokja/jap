import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthContext";
import { requestConsent } from "@/data/store";
import type { Patient } from "@/data/types";

const SCOPES = ["Diagnoses", "Medications", "Lab results", "Encounters", "Prescriptions", "Immunizations"];
const HI_TYPES = ["OPConsultation", "DiagnosticReport", "Prescription", "DischargeSummary", "ImmunizationRecord"];

export function RequestConsentModal({ open, onClose, patient }: { open: boolean; onClose: () => void; patient: Patient }) {
  const { user } = useAuth();
  const toast = useToast();
  const [purpose, setPurpose] = useState("Clinical review for a referred consultation");
  const [scope, setScope] = useState<string[]>(["Diagnoses", "Medications", "Lab results", "Encounters"]);
  const [hiTypes, setHiTypes] = useState<string[]>(["OPConsultation", "DiagnosticReport", "Prescription"]);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function submit() {
    if (!user) return;
    setBusy(true);
    requestConsent(user, { patientId: patient.id, purpose, scope, hiTypes, durationDays: days });
    setBusy(false);
    toast.push({ tone: "success", title: "Consent request sent", body: `${patient.name} will be asked to approve access.` });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Request access to ${patient.name}'s records`}
      description="The patient decides. Until they approve, clinical context stays sealed and every attempt is logged."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!purpose.trim() || scope.length === 0} icon={<ShieldCheck className="h-4 w-4" />}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Purpose of access">
          <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label="Information requested">
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(scope, setScope, s)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors ${scope.includes(s) ? "bg-brand-500 text-brand-950 ring-brand-500" : "bg-surface text-zinc-400 ring-line hover:bg-white/[0.04]"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="ABDM health-information types">
          <div className="flex flex-wrap gap-2">
            {HI_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(hiTypes, setHiTypes, s)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors ${hiTypes.includes(s) ? "bg-zinc-200 text-zinc-900 ring-zinc-200" : "bg-surface text-zinc-400 ring-line hover:bg-white/[0.04]"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Access duration (days)" hint="Access auto-expires; the patient can revoke sooner.">
          <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} className="w-32" />
        </Field>
      </div>
    </Modal>
  );
}
