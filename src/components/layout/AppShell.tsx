import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Search, LogOut, ChevronsUpDown, ArrowLeftRight, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/auth/AuthContext";
import { NAV_BY_ROLE, ROLE_LABEL, ROLE_ACCENT } from "@/auth/roles";
import { usersAll, resetDemoData } from "@/data/store";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { NotificationsMenu } from "./NotificationsMenu";
import { GlobalSearch } from "./GlobalSearch";
import { Wordmark } from "@/components/Wordmark";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppShell() {
  const { user, org, signOut, signInAs, mode } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => setMobileNav(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!user || !org) return null;
  const groups = NAV_BY_ROLE[user.role];

  const SidebarInner = (
    <>
      <div className="flex h-16 items-center border-b border-line px-5">
        <Wordmark />
      </div>
      <OrgCard orgName={org.name} orgCode={org.code} role={user.role} />
      <nav className="scroll-slim flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.section}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{g.section}</p>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <SideLink key={it.to} to={it.to} end={it.end} label={it.label} icon={it.icon} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <PersonaSwitcher
        currentId={user.id}
        currentName={user.name}
        currentRole={user.role}
        onPick={signInAs}
        onReset={() => {
          resetDemoData();
          nav("/app");
        }}
        mode={mode}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        {SidebarInner}
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[17rem] flex-col bg-surface shadow-pop">
            <button
              onClick={() => setMobileNav(false)}
              aria-label="Close menu"
              className="absolute right-3 top-5 z-10 grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
            {SidebarInner}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-md sm:px-6">
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] lg:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="group flex h-9 flex-1 items-center gap-2.5 rounded-lg border border-line bg-canvas px-3 text-sm text-zinc-500 transition-colors hover:border-line-strong hover:text-zinc-400 sm:max-w-sm"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search patients, records, orders…</span>
            <kbd className="ml-auto hidden rounded border border-line bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationsMenu />
            <div className="mx-1.5 hidden h-7 w-px bg-line sm:block" />
            <div className="hidden items-center gap-2.5 pl-1 sm:flex">
              <Avatar name={user.name} />
              <div className="leading-tight">
                <p className="text-[13px] font-semibold text-zinc-100">{user.name}</p>
                <p className="text-[11px] text-zinc-500">{user.title ?? ROLE_LABEL[user.role]}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                nav("/");
              }}
              className="h-9 w-9 p-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function SideLink({ to, end, label, icon: Icon }: { to: string; end?: boolean; label: string; icon: any }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
          isActive ? "bg-white/[0.05] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 bottom-1.5 top-1.5 w-0.5 bg-brand-500" />}
          <Icon className={cn("h-[17px] w-[17px] shrink-0", isActive ? "text-brand-400" : "text-zinc-500 group-hover:text-zinc-400")} />
          {label}
        </>
      )}
    </NavLink>
  );
}

function OrgCard({ orgName, orgCode, role }: { orgName: string; orgCode: string; role: any }) {
  return (
    <div className="border-b border-line px-4 py-3.5">
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas px-3 py-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-500/15 text-[11px] font-bold text-brand-300 ring-1 ring-inset ring-brand-500/20">
          {orgCode.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-zinc-100">{orgName}</p>
          <p className="text-[10.5px] text-zinc-500">{orgCode}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
            ROLE_ACCENT[role as keyof typeof ROLE_ACCENT],
          )}
        >
          {ROLE_LABEL[role as keyof typeof ROLE_LABEL]}
        </span>
      </div>
    </div>
  );
}

function PersonaSwitcher({
  currentId,
  currentName,
  currentRole,
  onPick,
  onReset,
  mode,
}: {
  currentId: string;
  currentName: string;
  currentRole: any;
  onPick: (id: string) => void;
  onReset: () => void;
  mode: "demo" | "supabase";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const people = usersAll();

  return (
    <div className="border-t border-line p-3" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left hover:bg-white/[0.03]"
        >
          <Avatar name={currentName} className="h-7 w-7" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-zinc-200">{currentName}</span>
            <span className="block text-[10.5px] text-zinc-500">{ROLE_LABEL[currentRole as keyof typeof ROLE_LABEL]}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        </button>

        {open && (
          <div className="scroll-slim absolute bottom-full left-0 z-40 mb-2 max-h-[min(26rem,64vh)] w-full animate-fadein overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop">
            <p className="flex items-center justify-between px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              <span className="inline-flex items-center gap-1.5">
                <ArrowLeftRight className="h-3 w-3" /> Switch persona
              </span>
              <Badge tone={mode === "demo" ? "warning" : "positive"}>{mode === "demo" ? "Demo" : "Live"}</Badge>
            </p>
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onPick(p.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.04]",
                  p.id === currentId && "bg-white/[0.05]",
                )}
              >
                <Avatar name={p.name} className="h-7 w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-zinc-100">{p.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{ROLE_LABEL[p.role]}</span>
                </span>
                {p.id === currentId && <Check className="h-3.5 w-3.5 shrink-0 text-brand-400" />}
              </button>
            ))}
            <button
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-2 py-2 text-left text-[12px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset demo data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
