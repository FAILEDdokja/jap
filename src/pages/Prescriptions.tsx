import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pill, PackageCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { prescriptionsFor, patientById, orgById, dispensePrescription } from "@/data/store";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { RX_STATUS_TONE } from "@/lib/status";
import { fmtDate, relative } from "@/lib/format";

export default function Prescriptions() {
  useStore();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"queue" | "all">("queue");
  if (!user) return null;

  const isPharmacy = user.role === "PHARMACY";
  const all = prescriptionsFor(user);
  const rows = useMemo(
    () => (tab === "queue" ? all.filter((r) => r.status === "issued" || r.status === "partially_dispensed") : all),
    [all, tab],
  );

  return (
    <div>
      <PageHeader
        title={isPharmacy ? "Prescription fulfilment" : "Prescriptions"}
        description={isPharmacy ? "Prescriptions issued across the network, with authorized allergy context for each patient." : "Prescriptions issued by your organization."}
      />

      <Card>
        <CardBody className="flex gap-1.5">
          {(["queue", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize ${tab === t ? "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30" : "text-zinc-400 hover:bg-white/[0.04]"}`}>
              {t === "queue" ? "To dispense" : "All"}
            </button>
          ))}
        </CardBody>
      </Card>

      <div className="mt-4 space-y-3">
        {rows.length === 0 && <EmptyState icon={<Pill className="h-5 w-5" />} title="Nothing to show" description="Prescriptions will appear here as clinicians issue them." />}
        {rows.map((r) => {
          const p = patientById(r.patientId);
          return (
            <Card key={r.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/app/patients/${r.patientId}`} className="text-[14px] font-semibold text-zinc-100 hover:text-brand-300">{p?.name}</Link>
                      <Badge tone={RX_STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
                      {p?.allergies.length ? (
                        <Badge tone="critical"><AlertTriangle className="h-3 w-3" /> {p.allergies.map((a) => a.substance).join(", ")}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-zinc-400">
                      {r.prescriberName} · {orgById(r.orgId)?.name} · issued {fmtDate(r.issuedOn)} ({relative(r.issuedOn)})
                    </p>
                  </div>
                  {isPharmacy && r.status !== "dispensed" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => { dispensePrescription(user, r.id, false); toast.push({ tone: "info", title: "Marked partially dispensed" }); }}>Partial</Button>
                      <Button size="sm" icon={<PackageCheck className="h-4 w-4" />} onClick={() => { dispensePrescription(user, r.id, true); toast.push({ tone: "success", title: "Dispensed", body: `${p?.name}'s prescription completed.` }); }}>Dispense all</Button>
                    </div>
                  )}
                </div>
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                  {r.items.map((it, i) => (
                    <li key={i} className="px-3 py-2 text-[13px]">
                      <span className="font-medium text-zinc-100">{it.name}</span>
                      <span className="text-zinc-400"> — {it.dosage}, {it.frequency}{it.duration ? `, ${it.duration}` : ""}</span>
                      {it.instructions && <span className="block text-[11px] text-zinc-500">{it.instructions}</span>}
                    </li>
                  ))}
                </ul>
                {r.notes && <p className="mt-2 text-[12px] text-zinc-400">Note: {r.notes}</p>}
                {r.dispensedByName && <p className="mt-1 text-[11px] text-zinc-500">Dispensed by {r.dispensedByName}{r.dispensedOn ? ` on ${fmtDate(r.dispensedOn)}` : ""}</p>}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
