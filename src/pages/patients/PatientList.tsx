import { useEffect, useMemo, useState } from "react";
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
import { ApiError } from "@/api/client";
import { listPatients, type ApiPatientListItem, type ApiPatientPage } from "@/api/patients";

export default function PatientList() {
  const { mode } = useAuth();
  return mode === "api" ? <ApiPatientList /> : <DemoPatientList />;
}

function DemoPatientList() {
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

/**
 * API-mode list: the server's masked patient view, not demo-only clinical
 * fields.
 *
 * Two differences from the demo list are the point of the API contract:
 *
 *  - identities render MASKED (`identity.masked`) — the full ABHA number never
 *    reaches the browser, so there is nothing to reveal;
 *  - a row whose consent is not active arrives SEALED: id, owning tenant and
 *    the decision, with no name, no demographics and no identifiers. The demo
 *    list shows a name there because its data is local; the API is stricter on
 *    purpose, so a sealed row is rendered as a sealed row rather than dressed
 *    up with fields the server deliberately withheld.
 *
 * `access` on every row is the server's decision (architecture §4.1), which is
 * why the Access column is the same `ConsentPill` the demo uses: one
 * vocabulary, one component, no re-derivation in the browser.
 */
function ApiPatientList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [page, setPage] = useState<ApiPatientPage | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "external">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listPatients()
      .then((result) => { if (active) setPage(result); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : "Unable to load patients."); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const inScope = (orgId: string) =>
      filter === "all" || (filter === "mine" ? orgId === user?.orgId : orgId !== user?.orgId);

    return (page?.patients ?? []).filter((row) => {
      if (!inScope(row.orgId)) return false;
      // A sealed row has no content to match on, so a search hides it — the
      // same rule the server applies when `q` is present.
      if (row.sealed) return !term;
      if (!term) return true;
      const identities = row.identities.map((identity) => identity.masked).join(" ").toLowerCase();
      return [row.name, identities, row.contact.phone ?? ""].some((value) => value.toLowerCase().includes(term));
    });
  }, [filter, page, q, user?.orgId]);

  const sealedCount = page?.sealedCount ?? 0;
  const description = sealedCount > 0
    ? `Server-backed patient records. ${sealedCount} row${sealedCount === 1 ? "" : "s"} sealed: your organization has a consent request that is not active.`
    : "Server-backed patient records. Identities are masked by the API.";

  if (!user) return null;
  return (
    <div>
      <PageHeader title="Patients" description={description} />
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, masked identity or phone" className="pl-9" />
          </div>
          <div className="flex rounded-lg border border-line p-0.5 text-[13px]">
            {(["all", "mine", "external"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${filter === item ? "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30" : "text-zinc-400 hover:bg-white/[0.04]"}`}>{item === "external" ? "Other" : item}</button>)}
          </div>
        </CardBody>
      </Card>
      {error && <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300 ring-1 ring-inset ring-rose-500/25">{error}</p>}
      <div className="mt-4"><Card><CardBody className="p-0"><DataTable<ApiPatientListItem>
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => nav(`/app/patients/${row.id}`)}
        empty={<EmptyState icon={<Users className="h-5 w-5" />} title="No matching patients" description="The server returned no records in this scope." />}
        columns={[
          {
            key: "name",
            header: "Patient",
            render: (row) => row.sealed ? (
              <div className="flex items-center gap-3">
                <Avatar name="Sealed" />
                <div>
                  <p className="font-medium text-zinc-400">Sealed record</p>
                  <p className="text-[12px] text-zinc-500">Withheld until consent is active</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Avatar name={row.name} />
                <div>
                  <p className="font-medium text-zinc-100">{row.name}</p>
                  <p className="text-[12px] text-zinc-400">{row.gender ?? "—"} · {row.dob ? `${ageFrom(row.dob)} yrs` : "Age unavailable"} · {row.bloodGroup ?? "—"}</p>
                </div>
              </div>
            ),
          },
          {
            key: "identity",
            header: "Identity",
            render: (row) => row.sealed ? <span className="text-[12px] text-zinc-600">Withheld</span> : (
              <span className="tabular text-[12.5px]">
                {row.identities.length === 0 ? "—" : row.identities.map((identity) => (
                  <span key={identity.id} className="flex items-center gap-1">
                    {identity.type === "ABHA_NUMBER" ? "ABHA" : "ABHA address"}: {identity.masked}
                    {identity.verified && <ShieldCheck className="h-3 w-3 text-emerald-400" aria-label="Verified" />}
                  </span>
                ))}
              </span>
            ),
          },
          { key: "org", header: "Organization", render: (row) => row.orgId },
          { key: "state", header: "State", render: (row) => row.sealed ? <Badge tone="warning">Sealed</Badge> : <Badge tone="neutral">{row.state}</Badge> },
          { key: "registered", header: "Registered", render: (row) => row.sealed ? "—" : fmtDate(row.registeredOn) },
          { key: "access", header: "Access", align: "right", render: (row) => <ConsentPill decision={row.access} /> },
        ]}
      /></CardBody></Card></div>
    </div>
  );
}
