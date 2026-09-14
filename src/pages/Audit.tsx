import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScrollText, Download, ShieldX, ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { auditFeed, patientById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, Button, EmptyState, Input, StatCard } from "@/components/ui/primitives";
import { fmtDate, fmtTime, relative } from "@/lib/format";
import { ROLE_LABEL } from "@/auth/roles";

export default function Audit() {
  useStore();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "success" | "blocked">("all");
  if (!user) return null;

  const feed = auditFeed(user);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return feed.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!term) return true;
      return [a.actorName, a.action, a.resourceType, a.detail, a.orgName, patientById(a.patientId ?? "")?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(term));
    });
  }, [feed, q, status]);

  const blocked = feed.filter((a) => a.status === "blocked").length;

  function exportCsv() {
    const header = ["timestamp", "actor", "role", "organization", "action", "resource", "patient", "status", "detail"];
    const lines = rows.map((a) =>
      [a.ts, a.actorName, a.actorRole, a.orgName, a.action, `${a.resourceType} ${a.resourceId ?? ""}`.trim(), patientById(a.patientId ?? "")?.name ?? "", a.status, (a.detail ?? "").replace(/"/g, "'")]
        .map((v) => `"${v}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nexus-audit-export.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const patientView = user.role === "PATIENT";

  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const a of rows) {
      const day = a.ts.slice(0, 10);
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(a);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <div>
      <PageHeader
        title={patientView ? "Who accessed my data" : "Audit trail"}
        description={
          patientView
            ? "Every time someone opened or acted on your record — with the authority they used."
            : "An append-only event stream of every sensitive access and action in your scope."
        }
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Events in scope" value={feed.length} icon={<ScrollText className="h-4 w-4" />} />
        <StatCard label="Successful accesses" value={feed.length - blocked} icon={<ShieldCheck className="h-4 w-4" />} tone="positive" />
        <StatCard label="Blocked attempts" value={blocked} icon={<ShieldX className="h-4 w-4" />} tone={blocked ? "critical" : "neutral"} />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by actor, action, resource or patient"
          className="flex-1"
        />
        <div className="flex rounded border border-line p-0.5 text-[13px]">
          {(["all", "success", "blocked"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-[3px] px-3 py-1.5 font-medium capitalize ${
                status === s ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No matching events" />
          </CardBody>
        ) : (
          <div>
            {groups.map(([day, events]) => (
              <div key={day}>
                <div className="flex items-center gap-2 border-b border-line bg-white/[0.015] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  {fmtDate(day)}
                  <span className="text-zinc-700">·</span>
                  <span className="font-normal normal-case tracking-normal text-zinc-600">
                    {events.length} event{events.length > 1 ? "s" : ""}
                  </span>
                </div>
                <ol>
                  {events.map((a) => (
                    <li
                      key={a.id}
                      className="flex gap-3.5 border-b border-line px-4 py-3 last:border-0 hover:bg-white/[0.015]"
                    >
                      <div className="w-12 shrink-0 pt-px text-right">
                        <p className="font-mono text-[12px] text-zinc-400 tabular">{fmtTime(a.ts)}</p>
                      </div>
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          a.status === "blocked" ? "bg-rose-500" : "bg-emerald-500"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-zinc-200">
                          <span className="font-semibold text-zinc-100">{a.actorName}</span>
                          <span className="text-zinc-500">
                            {" "}
                            · {ROLE_LABEL[a.actorRole]} · {a.orgName}
                          </span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                          <code className="rounded-[3px] bg-raised px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                            {a.action}
                          </code>
                          <span className="text-zinc-500">
                            {a.resourceType}
                            {a.resourceId ? ` ${a.resourceId}` : ""}
                          </span>
                          {a.patientId && (
                            <Link
                              to={`/app/patients/${a.patientId}`}
                              className="text-brand-400 hover:text-brand-300"
                            >
                              {patientById(a.patientId)?.name ?? a.patientId}
                            </Link>
                          )}
                        </p>
                        {a.detail && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{a.detail}</p>}
                      </div>
                      <div className="shrink-0 pt-px">
                        <Badge tone={a.status === "blocked" ? "critical" : "positive"}>
                          {a.status === "blocked" ? "Blocked" : "OK"}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-3 text-[11.5px] text-zinc-600">
        Showing {rows.length} of {feed.length} events · newest first
      </p>
    </div>
  );
}
