import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, UserRound, FlaskConical, Pill, Building2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { visiblePatients, labQueueFor, prescriptionsFor, orgs, patientById } from "@/data/store";
import { ageFrom } from "@/lib/format";
import { ConsentPill } from "@/components/ConsentPill";

type Hit = { id: string; icon: any; title: string; sub: string; to: string; right?: React.ReactNode };

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    if (!user) return [];
    const term = q.trim().toLowerCase();
    const patients = visiblePatients(user)
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.abha.number.includes(term) || p.abha.address.includes(term))
      .slice(0, 6)
      .map((p) => ({
        id: `p-${p.id}`,
        icon: UserRound,
        title: p.name,
        sub: `${p.gender} · ${ageFrom(p.dob)} yrs · ${p.abha.number}`,
        to: `/app/patients/${p.id}`,
        right: <ConsentPill decision={p.access} />,
      }));

    const labs = term
      ? labQueueFor(user)
          .filter((l) => l.test.toLowerCase().includes(term) || (patientById(l.patientId)?.name ?? "").toLowerCase().includes(term))
          .slice(0, 4)
          .map((l) => ({ id: `l-${l.id}`, icon: FlaskConical, title: l.test, sub: `${patientById(l.patientId)?.name ?? ""} · ${l.status.replace(/_/g, " ")}`, to: "/app/lab-orders" }))
      : [];

    const rx = term
      ? prescriptionsFor(user)
          .filter((r) => r.items.some((i) => i.name.toLowerCase().includes(term)) || (patientById(r.patientId)?.name ?? "").toLowerCase().includes(term))
          .slice(0, 4)
          .map((r) => ({ id: `r-${r.id}`, icon: Pill, title: r.items.map((i) => i.name).join(", "), sub: `${patientById(r.patientId)?.name ?? ""} · ${r.status.replace(/_/g, " ")}`, to: "/app/prescriptions" }))
      : [];

    const orgHits = term && (user.role === "SUPER_ADMIN" || user.role === "HOSPITAL_ADMIN")
      ? orgs().filter((o) => o.name.toLowerCase().includes(term)).slice(0, 3).map((o) => ({ id: `o-${o.id}`, icon: Building2, title: o.name, sub: `${o.type} · ${o.city}`, to: "/app/organizations" }))
      : [];

    return [...patients, ...labs, ...rx, ...orgHits];
  }, [q, user]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const go = (h: Hit) => {
    onClose();
    nav(h.to);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-xl animate-fadein overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && hits[active]) go(hits[active]);
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search patients by name or ABHA, tests, medicines…"
            className="h-12 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-zinc-500">Esc</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-zinc-400">
              {q ? "No matches in your authorized scope." : "Start typing to search your workspace."}
            </li>
          )}
          {hits.map((h, i) => {
            const Icon = h.icon;
            return (
              <li key={h.id}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? "bg-brand-500/10" : "hover:bg-white/[0.04]"}`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised text-zinc-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-zinc-100">{h.title}</span>
                    <span className="block truncate text-[12px] text-zinc-400">{h.sub}</span>
                  </span>
                  {h.right}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
