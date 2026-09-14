import { Link } from "react-router-dom";
import {
  ShieldCheck, Fingerprint, Layers, Network, ScrollText, ArrowRight,
  HeartPulse, Stethoscope, Building2, FlaskConical, Check,
} from "lucide-react";
import { Wordmark, NexusMark } from "@/components/Wordmark";
import { Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#model" },
  { label: "For teams", href: "#teams" },
  { label: "Research", href: "#research" },
];

const STEPS = [
  { icon: Fingerprint, k: "01", title: "Identity", body: "An ABHA-linked identity anchors every record to one verified person — not a dozen local MRNs." },
  { icon: ShieldCheck, k: "02", title: "Consent", body: "The patient decides who sees what, why, and for how long. Nothing opens without an active grant." },
  { icon: Layers, k: "03", title: "Clinical context", body: "Authorised records from every facility are assembled into one reviewed view, not a document hunt." },
  { icon: Network, k: "04", title: "Coordination", body: "Lab orders, referrals and follow-ups move between organisations as tracked, accountable tasks." },
  { icon: ScrollText, k: "05", title: "Audit", body: "Every access and decision is written to an append-only log the patient and hospital both read." },
];

const TEAMS = [
  { icon: HeartPulse, title: "Patients", points: ["One health timeline across every visit", "Approve or revoke access in one step", "See exactly who opened your records"] },
  { icon: Stethoscope, title: "Clinicians", points: ["Unified context before the consult starts", "Consent state shown on every patient", "Order labs and referrals inside the chart"] },
  { icon: Building2, title: "Hospitals", points: ["Tenant-isolated data, role-based access", "Coordination and access analytics", "A defensible trail for every record touched"] },
  { icon: FlaskConical, title: "Labs & pharmacies", points: ["Inbound orders and scripts in one queue", "Results and dispense status flow back", "Patient context only where authorised"] },
];

const PRODUCT = [
  { title: "Clinical context", body: "Problems, allergies, medications, encounters, labs and prescriptions from separate systems, reconciled into a single screen with a clear information hierarchy." },
  { title: "Consent", body: "A control surface, not a form. Who, what, why, for how long — with pending, approved, expired and revoked states enforced end to end." },
  { title: "Care coordination", body: "Cross-organisation tasks with owner, priority, source and destination, moving from pending to complete without a phone call." },
  { title: "Auditability", body: "An append-only event stream of every sensitive access — blocked attempts included — exportable for review." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas text-zinc-100">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-100">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100" />
            <Link to="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/login">
              <Button size="sm" icon={<ArrowRight className="h-4 w-4" />}>Explore the demo</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          <div className="max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Healthcare coordination infrastructure
            </p>
            <h1 className="mt-4 text-[30px] font-semibold leading-[1.12] tracking-tight sm:text-[38px]">
              Consent-Aware Continuity of Care
            </h1>
            <p className="mt-4 text-[14.5px] leading-relaxed text-zinc-400">
              A patient's history is scattered across hospitals, labs and pharmacies that don't share systems.
              Jan Arogya Nexus assembles the <span className="text-zinc-200">authorised</span> parts of that history
              into one clinical view, and records every access — so the patient stays in control.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/login">
                <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>Explore the demo</Button>
              </Link>
              <a href="#model">
                <Button size="lg" variant="secondary">How it works</Button>
              </a>
            </div>
            <p className="mt-6 text-[12px] text-zinc-600">
              Synthetic data only · Not a government service · Not a production ABDM integration
            </p>
          </div>

          <ProductVisual />
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">The fragmentation problem</p>
          <h2 className="mt-3 max-w-2xl text-[22px] font-semibold tracking-tight">
            Care is delayed because the record is somewhere else
          </h2>
          <div className="mt-8 grid divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              ["Every referral", "starts with a phone call, a photo of a prescription, or the patient's memory of what was said."],
              ["Repeat tests", "get ordered because the previous result is held in another hospital's system."],
              ["No one can say", "with certainty who has looked at a patient's history, or on what authority."],
            ].map(([h, b]) => (
              <div key={h} className="py-6 sm:px-6 sm:first:pl-0">
                <p className="text-[14px] font-semibold text-zinc-100">{h}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Model */}
      <section id="model" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">The Nexus model</p>
          <h2 className="mt-3 text-[22px] font-semibold tracking-tight">
            Identity → Consent → Context → Coordination → Audit
          </h2>
          <div className="mt-8 grid border border-line md:grid-cols-5 md:divide-x md:divide-line [&>*]:border-b [&>*]:border-line md:[&>*]:border-b-0">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="p-5">
                  <div className="flex items-center justify-between">
                    <Icon className="h-4 w-4 text-brand-500" />
                    <span className="text-[11px] font-semibold text-zinc-600">{s.k}</span>
                  </div>
                  <p className="mt-3 text-[13.5px] font-semibold text-zinc-100">{s.title}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{s.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Product */}
      <section id="product" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-[22px] font-semibold tracking-tight">Four surfaces, one product</h2>
          <p className="mt-2 max-w-xl text-[13px] text-zinc-500">Each is functional in the demo — not a screenshot.</p>
          <div className="mt-8 grid border border-line sm:grid-cols-2 sm:divide-x sm:divide-line [&>*]:border-b [&>*]:border-line sm:[&>*:nth-last-child(-n+2)]:border-b-0">
            {PRODUCT.map((p) => (
              <div key={p.title} className="p-6">
                <p className="text-[14px] font-semibold">{p.title}</p>
                <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-400">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Teams */}
      <section id="teams" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-[22px] font-semibold tracking-tight">Built for every participant in a care episode</h2>
          <div className="mt-8 grid border border-line sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-line sm:[&>*]:border-r sm:[&>*:nth-child(2n)]:border-r-0 lg:[&>*]:border-r lg:[&>*:nth-child(4n)]:border-r-0 sm:[&>*:nth-last-child(-n+2)]:border-b-0 lg:[&>*:nth-last-child(-n+4)]:border-b-0">
            {TEAMS.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="p-5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-zinc-400" />
                    <p className="text-[13.5px] font-semibold">{a.title}</p>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {a.points.map((pt) => (
                      <li key={pt} className="flex gap-2 text-[12.5px] leading-snug text-zinc-400">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Research */}
      <section id="research" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">Research direction</p>
          <p className="mt-4 max-w-3xl text-[17px] font-medium leading-relaxed text-zinc-100">
            "Can consent-aware clinical context assembly reduce the time and fragmentation involved in retrieving
            relevant patient information, while preserving patient control and access accountability?"
          </p>
          <p className="mt-4 max-w-2xl text-[13px] text-zinc-500">
            The prototype instruments context-assembly time, records unified, navigation steps, blocked unauthorised
            attempts and consent enforcement — so the question can be studied with real interaction data. It does not
            claim results that have not been measured.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-zinc-500">
            {["Context assembly time", "Records unified", "Navigation steps", "Blocked access attempts", "Consent enforcement", "Task completion time"].map((m) => (
              <span key={m}>— {m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">Explore Nexus</h2>
            <p className="mt-1.5 text-[13px] text-zinc-500">Seven personas. The full consent-to-context flow. No sign-up.</p>
          </div>
          <Link to="/login">
            <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>Open the demo workspace</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[12px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <NexusMark className="h-5 w-5" />
            <span>Jan Arogya Nexus — Consent-Aware Continuity of Care</span>
          </div>
          <p className="max-w-md sm:text-right">
            Prototype for the Avishkar Engineering &amp; Technology competition. Synthetic data only. No government
            affiliation. Not a certified ABDM / DPDP / HIPAA implementation.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* One real product surface — the authorised clinical context view. */
function ProductVisual() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="ml-2 text-[11px] text-zinc-600">Patient · clinical context</span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded bg-brand-500/15 text-[12px] font-bold text-brand-300 ring-1 ring-inset ring-brand-500/20">AK</span>
            <div>
              <p className="text-[13px] font-semibold text-zinc-100">Amit Kumar</p>
              <p className="text-[11px] text-zinc-500">Male · 34 · ABHA verified · NMC-NAS</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
            <Check className="h-3 w-3" /> Access granted
          </span>
        </div>

        <div className="grid grid-cols-2 divide-x divide-line border-b border-line text-[12px]">
          <Row label="Allergies" value="Penicillin" tone="rose" />
          <Row label="Active problems" value="T2DM · Hypertension" />
          <Row label="Last encounter" value="IPD · Pneumonia" />
          <Row label="HbA1c" value="8.4% · above target" tone="amber" />
        </div>

        <div className="flex items-center justify-between px-1 py-2.5 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-brand-500" /> 16 records unified · 3 organisations · one screen
          </span>
          <span className="font-mono text-zinc-600">consent con-03</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "rose" | "amber" }) {
  return (
    <div className="px-3 py-2.5">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={`mt-0.5 text-[12px] font-medium ${tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : "text-zinc-200"}`}>
        {value}
      </p>
    </div>
  );
}
