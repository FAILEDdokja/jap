/** Small dependency-free SVG charts, tuned for a dark clinical interface. */
import { cn } from "@/lib/cn";

const BAR = { brand: "#2dd4bf", amber: "#fbbf24", rose: "#fb7185", sky: "#38bdf8" };

export function Sparkline({ data, className, stroke = "#2dd4bf" }: { data: number[]; className?: string; stroke?: string }) {
  if (data.length < 2) return <div className={cn("h-10", className)} />;
  const w = 120;
  const h = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / span) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-10 w-full", className)} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BarChart({
  data,
  className,
  height = 160,
}: {
  data: { label: string; value: number; tone?: "brand" | "amber" | "rose" | "sky" }[];
  className?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end gap-3 border-b border-line" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[11px] font-medium text-zinc-400 tabular">{d.value}</span>
            <div
              className="w-full max-w-[44px] rounded-t transition-all"
              style={{
                height: `${(d.value / max) * (height - 24)}px`,
                background: `linear-gradient(180deg, ${BAR[d.tone ?? "brand"]}, ${BAR[d.tone ?? "brand"]}44)`,
                minHeight: d.value > 0 ? 3 : 0,
              }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        {data.map((d) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-zinc-500">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export function Donut({
  segments,
  size = 132,
  thickness = 16,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#26262b" strokeWidth={thickness} />
          {segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-[22px] font-semibold tracking-tight text-zinc-50 tabular">{centerLabel}</span>
          </div>
        )}
      </div>
      <ul className="space-y-1.5 text-[13px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-zinc-400">{s.label}</span>
            <span className="ml-auto pl-3 font-semibold text-zinc-100 tabular">{s.value}</span>
          </li>
        ))}
        {centerSub && <li className="pt-1 text-xs text-zinc-500">{centerSub}</li>}
      </ul>
    </div>
  );
}
