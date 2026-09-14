import { cn } from "@/lib/cn";

export function NexusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0b0b0d" stroke="#2dd4bf" strokeOpacity="0.5" strokeWidth="1.5" />
      <path
        d="M7 16h3.4l2.1-6 3.4 12 2.1-6H25"
        fill="none"
        stroke="#2dd4bf"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className, subtitle }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <NexusMark />
      <div className="leading-none">
        <span className="block text-[15px] font-semibold tracking-tight text-zinc-100">
          Jan Arogya <span className="text-brand-400">Nexus</span>
        </span>
        {subtitle && (
          <span className="mt-1 block text-[11px] font-medium text-zinc-500">Consent-Aware Continuity of Care</span>
        )}
      </div>
    </div>
  );
}
