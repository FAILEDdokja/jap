import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  return (
    <button
      onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={
        className ??
        "grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
      }
    >
      {mode === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
