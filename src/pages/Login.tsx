import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, ShieldCheck, Layers, ScrollText } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { usersAll } from "@/data/store";
import { ROLE_LABEL } from "@/auth/roles";
import { Wordmark } from "@/components/Wordmark";
import { Button, Input, Field, Avatar, Badge } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ThemeToggle";

const PERSONA_ORDER = ["u-aroha", "u-farah", "u-nmc-admin", "u-amit", "u-lab", "u-pharm", "u-super"];

export default function Login() {
  const { signIn, signInAs, error, mode } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("aroha.deshpande@nmc.example.in");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const personas = PERSONA_ORDER.map((id) => usersAll().find((u) => u.id === id)!).filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalErr(null);
    const ok = await signIn(email, password);
    setBusy(false);
    if (ok) nav("/app");
    else setLocalErr("We couldn't sign you in. Try a demo persona on the right.");
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between border-r border-line p-12 lg:flex">
        <div className="flex items-center justify-between">
          <Link to="/">
            <Wordmark />
          </Link>
          <ThemeToggle />
        </div>
        <div className="max-w-sm">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-zinc-100">
            One patient. One authorised view. Every access on the record.
          </h1>
          <ul className="mt-9 space-y-5 text-[13px] text-zinc-400">
            <li className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-brand-500" />
              Consent decides what opens — pending, approved, expired or revoked, enforced everywhere.
            </li>
            <li className="flex gap-3">
              <Layers className="h-5 w-5 shrink-0 text-brand-500" />
              Records from separate hospitals, labs and pharmacies reconciled into one clinical context.
            </li>
            <li className="flex gap-3">
              <ScrollText className="h-5 w-5 shrink-0 text-brand-500" />
              An append-only audit trail the patient and the hospital can both read.
            </li>
          </ul>
        </div>
        <p className="text-[11px] text-zinc-600">Synthetic demonstration data only. Not a government service.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-200">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <ThemeToggle />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Sign in to your workspace</h2>
          <p className="mt-1.5 text-[13px] text-zinc-500">
            {mode === "demo"
              ? "Demo environment — choose a persona below, or use any seeded email. Password is not checked."
              : "Enter the email and password for your Supabase account."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Work email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {(localErr || error) && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300 ring-1 ring-inset ring-rose-500/25">{localErr || error}</p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<ArrowRight className="h-4 w-4" />}>
              Continue
            </Button>
          </form>

          <div className="my-7 flex items-center gap-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            <span className="h-px flex-1 bg-line" /> Demo personas <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-1 gap-2">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  signInAs(p.id);
                  nav("/app");
                }}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand-500/40 hover:bg-white/[0.03]"
              >
                <Avatar name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-zinc-100">{p.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{p.title ?? ROLE_LABEL[p.role]}</span>
                </span>
                <Badge tone="neutral">{ROLE_LABEL[p.role]}</Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
