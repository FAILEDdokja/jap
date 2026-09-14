import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Toast = { id: number; title: string; body?: string; tone: "success" | "info" | "error" };
type ToastCtx = { push: (t: Omit<Toast, "id">) => void };

const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex animate-fadein items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-pop"
            >
              <span
                className={cn(
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                  t.tone === "success" && "bg-emerald-500/10 text-emerald-400",
                  t.tone === "info" && "bg-sky-500/10 text-sky-400",
                  t.tone === "error" && "bg-rose-500/10 text-rose-400",
                )}
              >
                {t.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : t.tone === "error" ? <TriangleAlert className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-zinc-100">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12px] text-zinc-400">{t.body}</p>}
              </div>
              <button
                onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
                className="text-zinc-500 hover:text-zinc-200"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}
