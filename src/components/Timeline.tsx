import { Stethoscope, Pill, FlaskConical, ClipboardCheck, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, relative } from "@/lib/format";
import { Badge } from "./ui/primitives";
import type { TimelineEvent } from "@/data/store";

const ICON: Record<TimelineEvent["type"], any> = {
  encounter: Stethoscope,
  prescription: Pill,
  lab: FlaskConical,
  diagnosis: Activity,
  consent: ShieldCheck,
  task: ClipboardCheck,
};

const TONE: Record<TimelineEvent["tone"], string> = {
  neutral: "bg-raised text-zinc-400 ring-line",
  positive: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25",
  warning: "bg-amber-500/10 text-amber-400 ring-amber-500/25",
  critical: "bg-rose-500/10 text-rose-400 ring-rose-500/25",
};

const BADGE_TONE: Record<TimelineEvent["tone"], Parameters<typeof Badge>[0]["tone"]> = {
  neutral: "neutral",
  positive: "positive",
  warning: "warning",
  critical: "critical",
};

export function Timeline({ events, limit }: { events: TimelineEvent[]; limit?: number }) {
  const list = limit ? events.slice(0, limit) : events;
  if (!list.length) {
    return <p className="px-1 py-6 text-center text-sm text-zinc-400">No recorded events yet.</p>;
  }
  return (
    <ol className="relative space-y-0">
      {list.map((e, i) => {
        const Icon = ICON[e.type];
        return (
          <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i !== list.length - 1 && <span className="absolute left-[15px] top-8 h-full w-px bg-raised" aria-hidden />}
            <span className={cn("z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1", TONE[e.tone])}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-zinc-100">{e.title}</p>
                <Badge tone={BADGE_TONE[e.tone]}>{e.status}</Badge>
              </div>
              <p className="mt-0.5 text-[13px] text-zinc-400">{e.summary}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {fmtDate(e.date)} · {relative(e.date)} · {e.provider}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
