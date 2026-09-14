import { useState } from "react";
import { Fingerprint, ShieldCheck, Loader2, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, Input, Field, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthContext";
import { registerPatient } from "@/data/store";
import { lookupAbha, sendAbhaOtp, verifyAbhaOtp, type AbhaLookup } from "@/lib/abdm";

type Step = "identify" | "otp" | "confirm";

export function NewPatientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<Step>("identify");
  const [abhaInput, setAbhaInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lookup, setLookup] = useState<AbhaLookup | null>(null);
  const [txnId, setTxnId] = useState("");
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [blood, setBlood] = useState("O+");

  function reset() {
    setStep("identify"); setAbhaInput(""); setErr(null); setLookup(null); setOtp(""); setTxnId(""); setPhone(""); setAddress(""); setBusy(false);
  }

  async function doLookup() {
    setBusy(true); setErr(null);
    try {
      const res = await lookupAbha(abhaInput);
      setLookup(res);
      const { txnId } = await sendAbhaOtp(res.abhaNumber);
      setTxnId(txnId);
      setStep("otp");
    } catch (e: any) {
      setErr(e.message ?? "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doVerify() {
    setBusy(true); setErr(null);
    const ok = await verifyAbhaOtp(txnId, otp);
    setBusy(false);
    if (!ok) { setErr("Incorrect code. In demo mode the code is 123456."); return; }
    setStep("confirm");
  }

  function doCreate(verified: boolean) {
    if (!user || !lookup) return;
    const p = registerPatient(user, {
      name: lookup.name,
      gender: lookup.gender,
      dob: `${lookup.yearOfBirth}-01-01`,
      abhaNumber: lookup.abhaNumber,
      abhaAddress: lookup.abhaAddress,
      abhaVerified: verified,
      phone: phone || "—",
      address: address || "—",
      bloodGroup: blood,
    });
    toast.push({ tone: "success", title: "Patient registered", body: `${p.name} added to ${"your organization"}.` });
    reset();
    onClose();
    onCreated(p.id);
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Register a new patient"
      description="Identity is anchored to an ABHA number. This is a simulated ABDM flow — no government system is contacted."
      size="md"
      footer={
        step === "identify" ? (
          <>
            <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button onClick={doLookup} loading={busy} disabled={!abhaInput.trim()} icon={<ArrowRight className="h-4 w-4" />}>Look up ABHA</Button>
          </>
        ) : step === "otp" ? (
          <>
            <Button variant="secondary" onClick={() => setStep("identify")}>Back</Button>
            <Button onClick={doVerify} loading={busy} disabled={otp.length < 6}>Verify OTP</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => doCreate(false)}>Save without verified ABHA</Button>
            <Button onClick={() => doCreate(true)} icon={<ShieldCheck className="h-4 w-4" />}>Register patient</Button>
          </>
        )
      }
    >
      {step === "identify" && (
        <div className="space-y-4">
          <Field label="ABHA number or ABHA address" hint="Try any 14-digit number, or e.g. ravi.kumar@abdm">
            <div className="relative">
              <Fingerprint className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input value={abhaInput} onChange={(e) => setAbhaInput(e.target.value)} placeholder="14-2345-6789-0123" className="pl-9" />
            </div>
          </Field>
          {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-400 ring-1 ring-inset ring-rose-500/25">{err}</p>}
          <div className="rounded-lg bg-canvas p-3 text-[12px] text-zinc-400">
            <span className="font-medium text-zinc-200">Simulated.</span> A production build resolves this through the ABDM Gateway on the server; the anon browser never holds ABDM credentials.
          </div>
        </div>
      )}

      {step === "otp" && lookup && (
        <div className="space-y-4">
          <div className="rounded-lg border border-line p-3">
            <p className="text-[13px] font-semibold text-zinc-100">{lookup.name}</p>
            <p className="text-[12px] text-zinc-400">{lookup.gender} · b. {lookup.yearOfBirth} · {lookup.abhaNumber}</p>
          </div>
          <Field label={`Enter the 6-digit OTP sent to ${lookup.maskedMobile}`} hint="Demo code: 123456">
            <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="••••••" className="tracking-[0.4em]" />
          </Field>
          {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-400 ring-1 ring-inset ring-rose-500/25">{err}</p>}
        </div>
      )}

      {step === "confirm" && lookup && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
            <ShieldCheck className="h-4 w-4" /> ABHA verified — {lookup.abhaNumber}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxx xxxxx" /></Field>
            <Field label="Blood group">
              <select value={blood} onChange={(e) => setBlood(e.target.value)} className="h-9 w-full rounded-lg border border-line px-3 text-sm">
                {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Area, city, state" /></Field>
        </div>
      )}
    </Modal>
  );
}
