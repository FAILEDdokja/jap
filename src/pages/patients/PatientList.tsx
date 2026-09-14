import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Search, Users, ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { visiblePatients, orgById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Button, Input, Badge, EmptyState, Avatar } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { ConsentPill } from "@/components/ConsentPill";
import { NewPatientModal } from "./NewPatientModal";
import { ageFrom, fmtDate } from "@/lib/format";

export default function PatientList() {
  useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "external">("all");
  const [showNew, setShowNew] = useState(false);
  if (!user) return null;

  const all = visiblePatients(user);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((p) => {
      if (term && !(p.name.toLowerCase().includes(term) || p.abha.number.includes(term) || p.abha.address.toLowerCase().includes(term) || p.contact.phone.includes(term))) return false;
      if (filter === "mine" && p.orgId !== user.orgId) return false;
      if (filter === "external" && p.orgId === user.orgId) return false;
      return true;
    });
  }, [all, q, filter, user.orgId]);

  const canRegister = user.role === "DOCTOR" || user.role === "HOSPITAL_ADMIN";

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Patients registered by your organization, plus anyone who has granted your organization access."
        actions={canRegister && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setShowNew(true)}>New patient</Button>}
      />

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ABHA number or phone" className="pl-9" />
          </div>
          <div className="flex rounded-lg border border-line p-0.5 text-[13px]">
            {(["all", "mine", "external"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30" : "text-zinc-400 hover:bg-white/[0.04]"}`}
              >
                {f === "external" ? "Consented" : f}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="mt-4">
        <Card>
          <CardBody className="p-0">
            <DataTable
              rows={rows}
              rowKey={(p) => p.id}
              onRowClick={(p) => nav(`/app/patients/${p.id}`)}
              empty={<EmptyState icon={<Users className="h-5 w-5" />} title="No matching patients" description="Try a different search, or register a new patient." />}
              columns={[
                {
                  key: "name",
                  header: "Patient",
                  render: (p) => (
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} />
                      <div>
                        <p className="font-medium text-zinc-100">{p.name}</p>
                        <p className="text-[12px] text-zinc-400">{p.gender} · {ageFrom(p.dob)} yrs · {p.bloodGroup}</p>
                      </div>
                    </div>
                  ),
                },
                { key: "abha", header: "ABHA", render: (p) => <span className="tabular text-[12.5px]">{p.abha.number}<br /><span className="text-zinc-500">{p.abha.address}</span></span> },
                { key: "org", header: "Home facility", render: (p) => orgById(p.orgId)?.name ?? "—" },
                { key: "cond", header: "Key conditions", render: (p) => !p.access.allowed ? <span className="text-zinc-500">Sealed — consent required</span> : p.chronicConditions.length ? p.chronicConditions.slice(0, 2).join(", ") : <span className="text-zinc-500">None recorded</span> },
                { key: "reg", header: "Registered", render: (p) => fmtDate(p.registeredOn) },
                { key: "access", header: "Access", align: "right", render: (p) => <ConsentPill decision={p.access} /> },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <NewPatientModal open={showNew} onClose={() => setShowNew(false)} onCreated={(id) => nav(`/app/patients/${id}`)} />
    </div>
  );
}
