/**
 * Dual-mode (dark / light) toggle.
 *
 * The app is designed dark-first. Rather than re-deriving every color token,
 * light mode is produced with a single reversible filter on <html> — the same
 * technique used by most "quick invert" dark-mode bookmarklets, run in reverse.
 * `invert(1)` flips every lightness value (near-black canvas -> near-white,
 * near-white text -> near-black); the paired `hue-rotate(180deg)` cancels the
 * hue shift invert() introduces, so the teal accent and status colors stay
 * approximately teal/amber/rose/emerald instead of drifting to their
 * complements. Persisted in localStorage; defaults to dark.
 */
const KEY = "jan-arogya-nexus:theme";
export type ThemeMode = "dark" | "light";

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Call once on app start so the stored preference paints before first content. */
export function initTheme() {
  applyTheme(getStoredTheme());
}
