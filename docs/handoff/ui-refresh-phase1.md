# Handoff — UI Refresh (Phase 1: Web App)

> Branch: `claude/ui-refresh` · Owner: **Claude Code** (application layer) · Status: **plan / pre-implementation**
> Grounded with the `ui-ux-pro-max` skill. Phase 1 = `apps/web` only. Landing (`_landing`)
> and Expo mobile are **Phase 2**.

## Goal

Restyle the entire web admin app onto a real component system. Two things change together:

1. **Architecture:** adopt **shadcn/ui** (Radix primitives + Tailwind) to replace the
   hand-rolled `.nx-*` utility classes in `globals.css`. Matches the documented intent
   in `docs/06-design-system.md` ("shadcn/ui over Tailwind").
2. **Visual direction:** a **new look** (not a rebrand) — deeper trust palette, a true
   elevation system, higher data density. Typography stays **Inter** (Minimal Swiss).

## Design direction — "Nexis v2"

Skill recommendation for HR/payroll SaaS = *SaaS (General) + Financial Dashboard* →
**Minimalism/Swiss + Data-Dense + Soft-UI-Evolution (dimensional layering)**, trust-blue
core with semantic data accents.

### Tokens (move to CSS variables in `globals.css`, consumed by `tailwind.config.ts`)

Colors become HSL CSS variables so shadcn theming + a future dark mode work cleanly.
Replaces the current hardcoded hex tokens (keeps the "colors are tokens, never inline hex"
rule from `06-design-system.md`).

| Token | Light value | Role |
|---|---|---|
| `--brand` | `#2452E6` (richer indigo-blue) | primary actions |
| `--brand-dark` | `#1A3FC0` | hover/active |
| `--brand-light` | `#EAF0FF` | tinted backgrounds/badges |
| `--accent` | `#0EA5A4` (teal) | money-in / positive |
| `--success` | `#16A34A` | success states |
| `--warning` | `#F59E0B` | warnings |
| `--danger` | `#DC2626` | money-out / destructive |
| `--info` | `#0EA5E9` | informational |
| `--bg` | `#F7F8FA` | app background (cooler neutral) |
| `--surface` | `#FFFFFF` | cards/panels |
| `--surface-2` | `#F1F4F9` | inset/secondary surface |
| `--border` | `#E3E8EF` | hairlines |
| `--ink` | `#0B1220` | primary text (deeper) |
| `--muted` | `#5B6675` | secondary text (AA on surface) |

- **Radius:** `--radius` base `10px` (cards `12px`, inputs/buttons `8px`).
- **Elevation (4 levels):** `--elev-1 … --elev-4`, soft multi-layer shadows (dimensional layering).
- **Spacing:** standardize on Tailwind 4px scale; dense tables use 8–12px padding, 36px row height.
- **Chart palette:** brand → teal → indigo → amber → rose sequence + success/warning/danger semantics.
- **Dark mode:** wired in token structure but **out of scope for Phase 1** (light-first).

### Typography

Keep **Inter** only (single family, weight variation). No new font load.

## shadcn/ui setup decisions

- Primitives live in **`apps/web/components/ui/**`** for Phase 1 (matches existing tailwind
  `content` globs; lowest friction). Promotion to `packages/ui` is a later, optional step —
  noted, not done now. (`packages/ui` does not yet exist as a directory.)
- Add `cn()` util (`apps/web/lib/utils.ts`), `tailwindcss-animate`, `components.json`.
- Primitive set to generate: Button, Input, Label, Textarea, Select, Checkbox, Switch,
  Form (RHF), Dialog, Sheet, DropdownMenu, Popover, Tooltip, Tabs, Table, Card, Badge,
  Separator, Avatar, Skeleton, Sonner (toast), Alert, Breadcrumb, Pagination.
- App shell: collapsible left sidebar nav, top bar (company switcher + user menu), content area.

## Migration order (batched — each batch: typecheck + `next build` + fix e2e + preview verify)

0. **Foundation** — tokens, shadcn install, primitive set, `cn()`, app shell (sidebar/topbar/company-switcher).
1. **Auth + onboarding** — `(auth)`, `(onboarding)`, `invite`, `auth/`.
2. **Dashboard + employees** — highest traffic; `employees/**` (11 tsx) is the density template.
3. **Payroll** — most complex (run wizard, review, payslip viewer); money-masked inputs.
4. **Time & requests** — attendance, leave, claims.
5. **Money & admin** — billing, reports, analytics, loans, performance.
6. **Org & system** — settings, members, companies, audit, developer.

## Constraints (Claude DoD — `docs/08-agent-boundaries.md`)

- `pnpm --filter @nexis/web typecheck` **and** `next build` pass. ⚠️ `next build` is the real
  gate — async fn inside `startTransition` passes `tsc` but **fails the build** (bitten before).
- All user-facing strings via i18n (`messages/{id,en}.json`); id-ID default. No literal strings.
- Money = **integer rupiah** end-to-end; masked rupiah inputs; never float.
- Update Playwright e2e selectors broken by component swaps; keep happy-path + key-guard green.
- No `TODO(db)` left unresolved.

---

## Coordination note → Antigravity

**This is a pure application-layer (front-of-client) change. No schema, RLS, RPC, Edge,
or `services/**` work is planned.** Requests/asks:

1. **File overlap:** `claude/ui-refresh` will touch `apps/web/**` *broadly* and add
   `apps/web/components/ui/**`. All Claude-lane per the ownership table — please avoid
   queuing app-surface edits in `apps/web/**` during this window, or expect to rebase.
2. **Types:** I consume `packages/types` read-only. I do **not** expect to need new columns/
   RPCs for a restyle. If a screen surfaces a genuine data gap, I'll file it as a
   `TODO(db):` here and ping — none anticipated.
3. **Merge order:** app-only and independent of schema PRs — can merge on its own; I'll
   rebase onto `dev` before opening the PR.

### TODO(db) for this refresh

_(none — append here if a gap appears)_

---

## Progress log

### Batch 0 — Foundation (in progress)

**Done:**
- **Tokens (Nexis v2):** `app/globals.css` `:root` rewritten with v2 hex tokens + 4-level
  elevation (`--elev-1..4`) + `--radius`, plus shadcn HSL semantic vars
  (`--background`, `--primary`, …). `body` text now `var(--ink)`.
- **`tailwind.config.ts`:** `darkMode: ["class"]`, v2 brand/accent/etc, `surface`/`surface-2`,
  `info`, `boxShadow.elev-*`, shadcn semantic colors mapped to HSL vars, `tailwindcss-animate` plugin.
- **shadcn wiring:** `components.json` (new-york, `@/` aliases, lucide), `lib/utils.ts` (`cn`).
- **Deps added** to `apps/web/package.json` + installed: CVA, clsx, tailwind-merge, lucide-react,
  sonner, react-hook-form, @hookform/resolvers, radix (slot/dialog/dropdown/label/select/separator/
  switch/checkbox/avatar/tabs/tooltip/popover), tailwindcss-animate.
- **Primitives** in `apps/web/components/ui/`: button, input, label, card, badge, skeleton,
  separator, dialog, dropdown-menu, tabs, tooltip, table, sonner.
- **App shell:** `components/app-sidebar.tsx` → `DesktopSidebar` (collapsible, active highlight,
  lucide icons) + `MobileNav` (drawer). `(app)/layout.tsx` rebuilt: sticky 56px topbar +
  left sidebar + `max-w-7xl` content. `Toaster` mounted in root `app/layout.tsx`.
- **Verify:** `typecheck` passes. `next build` — see status below.

**Token-clash decision (important for whoever continues):**
`text-muted` (209×) and `text-accent` (13×) are legacy flat utilities. We did **not** mass-rename.
Legacy `accent` (teal, money-positive) and `muted` (grey text) stay flat in tailwind config.
Our hand-authored primitives use `brand-light`/`surface-2` where upstream shadcn would use
`accent`/`muted`. **Consequence:** when you run `npx shadcn add <comp>` later, post-process the
output — swap `bg-accent`→`bg-brand-light`, `text-accent-foreground`→`text-brand-dark`,
`bg-muted`→`bg-surface-2`, `text-muted-foreground`→`text-muted`.

**Also done:**
- Primitives added: `form` (RHF), `select`, `sheet`, `avatar`, `checkbox`, `switch`,
  `popover`, `alert`. Total 21 in `components/ui/`.
- Refit onto primitives: `submit-button.tsx` (→ Button), `password-input.tsx` (→ Input +
  lucide Eye/EyeOff), `company-switcher.tsx` (→ DropdownMenu + Badge + Button).
  `locale-switcher.tsx` left as native `<select>` (functional, v2 tokens already apply).
- `typecheck` clean; `next build` re-run (see status below).

**Not yet done (optional / next):**
- Primitives not yet authored (add on demand): `breadcrumb`, `pagination`, `accordion`,
  `radio-group`, `command`.
- Preview-verify the shell (sidebar collapse, mobile drawer, topbar) in a browser.
- Decide whether to promote `components/ui` → `packages/ui` (deferred; fine to leave in app).
- **Batch 0 is functionally complete** — ready to start Batch 1 (auth/onboarding).

### Next batches
1 Auth/onboarding · 2 Dashboard+employees · 3 Payroll · 4 Attendance/leave/claims ·
5 Billing/reports/analytics/loans/performance · 6 Settings/members/companies/audit/developer.
Each batch: migrate to primitives → `typecheck` + `next build` → fix Playwright selectors → preview-verify.

### Batches 1–4 — DONE (committed on `claude/ui-refresh`)
- **Batch 1** (`56c8888`) auth + onboarding + invite → Card/Input/Label/Alert/Button.
  Form ids `#email`/`#password` + `button[type=submit]` preserved for e2e auth setup.
- **Batch 2** (`5169c09`) dashboard (KPI Cards) + employees (Table/Badge/Alert/forms).
  Added `Card asChild` (Slot) and `input.fieldClasses` for native select/textarea reuse.
- **Batch 3** (`6c706ea`) payroll list/run/new → Table/Card/Alert; StatusBadge → Badge.
- **Batch 4** attendance live-board + leave + claims → Table/Card/Badge/Alert; both
  status-badges + decision-buttons onto primitives. (build verifying)

**Convention for remaining batches 5–6:** server-action forms keep native `<select>`/
`<textarea>` styled with `fieldClasses` (Radix Select needs a hidden input — not worth it
for posted forms). Status enums → `Badge` variant maps. Lists → `Table` in `Card className="p-0"`.
Banners → `Alert` (info/success/warning/destructive). Links-as-buttons → `Button asChild`.
