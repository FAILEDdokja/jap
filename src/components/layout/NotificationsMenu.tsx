import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { notificationsFor, markNotificationRead, markAllNotificationsRead } from "@/data/store";
import { relative } from "@/lib/format";
import { Button } from "@/components/ui/primitives";

export function NotificationsMenu() {
  useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;
  const items = notificationsFor(user);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,360px)] animate-fadein overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-zinc-100">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markAllNotificationsRead(user)}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-zinc-400">You're all caught up.</li>}
            {items.slice(0, 12).map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    markNotificationRead(n.id);
                    setOpen(false);
                    if (n.href) nav(n.href);
                  }}
                  className="flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-white/[0.04]"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-400"}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-100">{n.title}</span>
                    <span className="mt-0.5 block text-[12px] text-zinc-400">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">{relative(n.createdOn)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { setOpen(false); nav("/app/audit"); }}>
              View full access log
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
