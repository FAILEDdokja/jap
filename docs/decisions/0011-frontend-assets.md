# 0011 — Frontend runtime assets

- **Date:** 2026-09-15
- **Status:** Accepted
- **Owner:** Frontend / Backend (engineering)
- **Requirement:** docs/backend/02 §8, docs/backend/09 §7

## Context

doc 09 §7 requires that hotlinked assets be served from project hosting and
that the Tailwind CDN be pinned or vendored before any public deployment.

**Current state, verified in this phase:**

| Asset | State before Phase 4 | Action |
| --- | --- | --- |
| Tailwind | Already bundled through PostCSS + the Vite build (`tailwind.config.js`, `src/index.css`). The CDN risk doc 02 §8 described **no longer exists**. | None — confirmed, not rebuilt. |
| Inter font | Loaded at runtime from `fonts.googleapis.com` / `fonts.gstatic.com` via `<link>` in `index.html`. | **Self-hosted** (this decision). |
| National emblem / branding | **Not present in the codebase.** `grep` for emblem/Ashoka/gov.in across `src`, `public` and `index.html` returns nothing. | Nothing to resolve. The requirement is pre-emptive: see below. |
| Favicon | Local `public/favicon.svg`. | None. |
| Supabase SDK | Bundled npm dependency, not a CDN script. | None. |

## Decision

1. **Self-host Inter.** The Google Fonts `<link>` tags are removed and replaced
   by `@fontsource-variable/inter`, a normal dependency imported from
   `src/index.css`. Vite emits fingerprinted `.woff2` files into
   `dist/assets/`.

   Reasons:
   - a public-health portal must not turn every page view into a request to a
     third-party CDN that observes the user's IP, referrer and timing;
   - the app must render correctly on a restricted hospital network and offline;
   - an external `<link>` forces the CSP to allow a third-party origin in both
     `style-src` and `font-src`; self-hosting keeps both at `'self'`;
   - an unpinned CDN URL is exactly the dependency risk doc 02 §8 objected to;
     an npm dependency is in the lockfile and is scanned by CI.

2. **No external runtime asset may be added** without a new decision record.
   The production build is verified to contain no `http(s)://` reference to a
   CDN origin.

3. **If a national emblem or government branding is added later**, it must be
   committed to `public/` and served from project hosting — never hotlinked
   from a government site. Hotlinking would be an availability dependency on a
   third party, a privacy leak, and an unlicensed use of a restricted emblem.

## CSP compatibility

With all assets self-hosted, the frontend can be served under a strict policy:

```
default-src 'self';
script-src 'self';
style-src 'self';
font-src 'self';
img-src 'self' data:;
connect-src 'self' https://<api-origin>;
frame-ancestors 'none';
base-uri 'none';
object-src 'none'
```

`connect-src` must name the API origin from 0005/0006. `style-src` does **not**
need `'unsafe-inline'`: Tailwind compiles to a stylesheet, and the app sets no
inline `<style>` blocks. Setting this header is the responsibility of the
static host and is part of the open hosting decision (0005).

The **API** already sends its own CSP (`default-src 'none'`,
`frame-ancestors 'none'`) whenever the Swagger UI is disabled, which is the
default in production.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Keep Google Fonts with `crossorigin` + preconnect** | Does not address the privacy leak, the offline failure, or the CSP widening. |
| **Pin a specific Google Fonts CSS revision** | Still a third-party runtime dependency; pinning only fixes the *version* risk, not the others. |
| **Drop Inter, use a system font stack** | Zero bytes and zero risk, but changes the product's visual identity — a design decision, not an engineering one. The Tailwind config already lists a system-font fallback chain, so this remains available if the design team wants it. |

## Evidence

- `index.html` (external `<link>` tags removed, rationale in a comment)
- `src/index.css` (`@import "@fontsource-variable/inter/index.css"`)
- `package.json` (`@fontsource-variable/inter` dependency)
- Build output: `npm run build` emits `dist/assets/inter-*.woff2`; a grep of
  `dist/` for `http(s)://` origins returns only `w3.org` (an XML namespace in
  the favicon), `reactjs.org` and `github.com` (React's error-message URLs in a
  string literal) — no CDN is contacted at runtime.
