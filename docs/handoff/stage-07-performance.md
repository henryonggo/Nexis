# Handoff — Stage 7: Performance & KPI

> **Status:** ✅ **COMPLETE.** Schema landed (Antigravity,
> `supabase/migrations/20260605030000_stage7_performance.sql`); app wired to
> generated types — the `perfDb()` quarantine cast is gone and no `TODO(db)`
> remains in `apps/web/lib/performance.ts`.
> Branch: `claude/stage-07-performance`. This doc is the `TODO(db)` tracking item per
> the handoff protocol in `docs/08-agent-boundaries.md` (mirrors the loans handoff).

## What's already built (Claude, app layer)

- `apps/web/lib/performance.ts` — data access + RPC wrappers. Every Supabase call
  goes through a single quarantined cast (`perfDb()`) so the branch typechecks before
  the tables exist. **Delete that cast and point at generated types once the
  migration + `pnpm db:types` land.**
- `apps/web/app/(app)/performance/*` — admin/manager page: create review cycle,
  manage per-employee goals (add + progress), record & submit reviews (rating +
  summary). Route-gated (owner/admin/manager), added to nav + middleware.
- `apps/mobile/lib/performance.ts` + `app/(app)/performance.tsx` — employee
  self-service: see own goals, update progress, read submitted review, acknowledge.
- `apps/web/e2e/performance.spec.ts` — auth-guard spec.

The UI is fully typed against local interfaces in `lib/performance.ts`; only the DB
boundary is cast. The agreed shapes below are what those interfaces expect — keep the
column/RPC names or tell me and I'll adjust the `SELECT`s.

## TODO(db) — required for Antigravity

### 1. Enums
```sql
create type goal_status   as enum ('on_track','at_risk','off_track','done','cancelled');
create type review_status as enum ('draft','submitted','acknowledged');
```

### 2. Table `review_cycles`
| column | type | notes |
|---|---|---|
| id | uuid pk | default gen_random_uuid() |
| company_id | uuid not null → companies(id) on delete cascade | |
| name | text not null | e.g. "2026 H1" |
| start_date | date not null | |
| end_date | date not null | check (end_date >= start_date) |
| status | text not null check (status in ('draft','active','closed')) default 'draft' | |
| created_at | timestamptz not null default now() | |

### 3. Table `performance_goals`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid not null → companies(id) on delete cascade | for RLS |
| employee_id | uuid not null → employees(id) on delete cascade | |
| cycle_id | uuid → review_cycles(id) on delete set null | nullable (ad-hoc goals) |
| title | text not null | |
| description | text | |
| weight | int not null default 0 check (weight between 0 and 100) | KPI weighting |
| progress | int not null default 0 check (progress between 0 and 100) | percent |
| status | goal_status not null default 'on_track' | |
| created_at | timestamptz not null default now() | |
| updated_at | timestamptz not null default now() | |

### 4. Table `performance_reviews`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid not null → companies(id) on delete cascade | |
| employee_id | uuid not null → employees(id) on delete cascade | the reviewee |
| cycle_id | uuid not null → review_cycles(id) on delete cascade | |
| reviewer_id | uuid → auth.users(id) | set to auth.uid() on write |
| overall_rating | numeric(2,1) check (overall_rating between 1.0 and 5.0) | nullable until rated |
| summary | text | |
| status | review_status not null default 'draft' | |
| submitted_at | timestamptz | set by submit_review |
| acknowledged_at | timestamptz | set by acknowledge_review |
| created_at | timestamptz not null default now() | |

Unique `(cycle_id, employee_id)` — one review per employee per cycle. The app
upserts on that pair when saving a draft.

### 5. RPCs (security definer, mirror `approve_claim` / `approve_loan`)
```text
submit_review(p_review_id uuid) returns void
  -- draft → submitted, set submitted_at; assert caller is owner/admin/manager of company
acknowledge_review(p_review_id uuid) returns void
  -- submitted → acknowledged, set acknowledged_at; assert caller is the reviewee
  --   (employees.user_id = auth.uid() for this review's employee_id)
```
Both write an `audit_logs` row (`submit_review` / `acknowledge_review`) so the action
shows in the audit center (`apps/web/lib/audit.ts` already labels action strings).

Cycle creation, goal create/update, and review draft upsert are **direct RLS writes**
(no RPC) — see policies below.

### 6. RLS
- `review_cycles`: select = members of `company_id`; insert/update = owner/admin/manager.
- `performance_goals`: select = owner/admin/manager of `company_id` **or** the goal's
  own employee (`employees.user_id = auth.uid()`). insert/update = owner/admin/manager;
  **plus** the owning employee may `update` their own goal's `progress`/`status`.
- `performance_reviews`: select = owner/admin/manager **or** the reviewee. insert/update
  (draft) = owner/admin/manager. State transitions via the two RPCs only.
- pgTAP: cross-company isolation; employee sees only own goals/reviews; employee
  cannot edit another's goal; non-manager cannot create cycles/reviews.

### 7. Regenerate types
`pnpm db:types` so `review_cycles` / `performance_goals` / `performance_reviews`,
the two enums, and the RPCs land in `packages/types`. Then Claude deletes `perfDb()`
and the local row interfaces in both `lib/performance.ts` files and points at the
generated types, removing every `TODO(db)`.

## Acceptance (when both halves land)
- Manager creates a cycle, adds weighted goals per employee, and records a review
  with an overall rating; submit locks it to `submitted`.
- Employee sees only their own goals, updates progress, reads the submitted review,
  and acknowledges it (`acknowledged`).
- All role-gated; submit/acknowledge audited; cross-company isolation holds.
