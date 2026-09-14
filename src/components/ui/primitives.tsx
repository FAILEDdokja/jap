import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

/* -------------------------------------------------------------------- Button */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, icon, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        variant === "primary" && "bg-brand-500 text-brand-950 hover:bg-brand-400 font-semibold shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset]",
        variant === "secondary" && "bg-white/[0.04] text-zinc-100 ring-1 ring-inset ring-line hover:bg-white/[0.08] hover:ring-line-strong",
        variant === "ghost" && "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
        variant === "subtle" && "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]",
        variant === "danger" && "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* --------------------------------------------------------------------- Badge */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "critical" | "info" | "muted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone === "neutral" && "bg-white/[0.04] text-zinc-300 ring-white/10",
        tone === "muted" && "bg-white/[0.03] text-zinc-500 ring-white/[0.06]",
        tone === "positive" && "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
        tone === "warning" && "bg-amber-500/10 text-amber-300 ring-amber-500/25",
        tone === "critical" && "bg-rose-500/10 text-rose-300 ring-rose-500/25",
        tone === "info" && "bg-sky-500/10 text-sky-300 ring-sky-500/25",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------- Card */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)}>{children}</div>;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-4 py-3", className)}>
      <div>
        <h3 className="text-[14px] font-semibold text-zinc-100">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-3.5", className)}>{children}</div>;
}

/* --------------------------------------------------------------------- Input */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-lg border bg-canvas px-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors [color-scheme:dark]",
          "border-line focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          invalid && "border-rose-500/50 focus:border-rose-500/60 focus:ring-rose-500/20",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600",
          "focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-9 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-zinc-100 [color-scheme:dark]",
          "focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-zinc-300">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11.5px] text-zinc-500">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------- Spinner */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner label="Assembling view…" />
    </div>
  );
}

/* --------------------------------------------------------------- EmptyState */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white/[0.015] px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-white/[0.03] text-zinc-500 ring-1 ring-white/[0.06]">{icon}</div>}
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- StatCard */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "critical";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-zinc-500">{label}</p>
        {icon && (
          <span
            className={cn(
              "text-zinc-500",
              tone === "positive" && "text-emerald-400",
              tone === "warning" && "text-amber-400",
              tone === "critical" && "text-rose-400",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-[24px] font-semibold leading-none tracking-tight text-zinc-50 tabular">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] text-zinc-500">{sub}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- Avatar */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.replace(/^Dr\.?\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-brand-500/15 text-[12px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-500/20", className ?? "h-8 w-8")}>
      {initials}
    </span>
  );
}

/* --------------------------------------------------------------- SampleTag */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90", className)}>
      Sample data
    </span>
  );
}
