# Stage 1 — Authentication & Onboarding (Detailed Build Spec)

> This is the first feature stage. It establishes the account lifecycle **and** the multi-company foundation so later stages slot in cleanly. Read `AGENTS.md`, `02-tech-stack.md`, and `03-database-schema.md` before coding.

## Objective

A person can create an account, verify it, sign in/out, recover a forgotten password, and — on first sign-in — create their first company and become its **owner**, on the **free plan (5 employees free, no company NPWP required)**. The company switcher exists from day one even with a single company.

## In scope

- Email + password **sign up** with email verification.
- **Sign in** (email/password) + session persistence (web cookies, mobile secure store).
- **Forgot password** → email reset link → **reset password**.
- **Change password**, **resend verification email**, **sign out**.
- **Google OAuth** sign-in (optional but recommended given GCP).
- **Onboarding wizard**: create first company (name + optional industry only).
- **Company switcher** shell + active-company context.
- DB: `profiles`, `companies`, `company_members`, `company_settings`, `company_billing` + helper functions + RLS + free-seat trigger (from `03-database-schema.md`).

## Out of scope (later stages)

Inviting members (Stage 2), employees (Stage 2), MFA (Stage 7), billing/payment (Stage 6).

---

## Database (apply these migrations now)

From `03-database-schema.md`, sections 0–3:
- enums, `profiles` (+ `handle_new_user` trigger), `companies`, `company_members`,
- helper functions `auth.user_has_company_access`, `auth.user_role_in_company`, `auth.user_is_company_admin`,
- `create_company_with_owner`, `company_settings`, `company_billing`, and the **free-seat trigger** (the trigger references `employees`, so create a minimal `employees` stub table or defer the trigger to Stage 2 — recommended: defer the trigger creation to Stage 2 and just create `company_billing.free_seat_limit = 5` now).

Regenerate types after applying: `supabase gen types typescript --local > packages/types/src/database.ts`.

## Supabase Auth configuration

- Enable Email provider; **require email confirmation**.
- Set Site URL + redirect URLs for web (`/auth/callback`) and mobile deep link (`nexis://auth/callback`).
- Configure email templates (confirm signup, reset password, magic link) — branded, **id-ID** copy with en fallback.
- SMTP: use Supabase default for dev; production via Resend/managed SMTP.
- (Optional) Enable Google OAuth provider with GCP OAuth client credentials.
- Password reset uses `resetPasswordForEmail(email, { redirectTo })` → user lands on `/reset-password` with a recovery session → `updateUser({ password })`.

---

## Web (apps/web) — routes & flows (Next.js App Router)

```
app/
  (auth)/
    sign-up/page.tsx
    sign-in/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx
    verify-email/page.tsx
    auth/callback/route.ts        ← exchanges code for session (OAuth + email confirm)
  (onboarding)/
    onboarding/page.tsx           ← create first company
  (app)/
    layout.tsx                    ← requires session + at least one company; renders switcher
    dashboard/page.tsx            ← placeholder home
  account/
    page.tsx                      ← change password, sign out
  middleware.ts                   ← route protection + session refresh
```

### Flow details

**Sign up**
1. Form: full name, email, password (Zod: email valid, password ≥ 8 with complexity).
2. `supabase.auth.signUp({ email, password, options:{ data:{ full_name }, emailRedirectTo } })`.
3. `handle_new_user` trigger creates the `profiles` row.
4. Show "check your email" screen; user clicks link → `/auth/callback` → session.
5. First authenticated load with **no company membership** → redirect to `/onboarding`.

**Onboarding (create first company) — free, minimal fields**
1. Form: company name (required), industry (optional). **No NPWP, no legal name, no tax IDs.**
2. Call RPC `create_company_with_owner(p_name, p_industry)` → returns `company_id`, creates owner membership + `company_settings` + `company_billing(plan='free', free_seat_limit=5)`.
3. Set active company in context; redirect to `/dashboard`.

**Sign in**
- `signInWithPassword`; on success route to `/dashboard` (or last active company). Handle unverified-email and bad-credential errors with i18n messages.

**Forgot / reset password**
- `/forgot-password`: email → `resetPasswordForEmail`. Always show neutral success ("if an account exists, we sent a link") to avoid user enumeration.
- `/reset-password`: detect recovery session → new password form → `updateUser({ password })` → redirect to sign-in.

**Session protection**
- `middleware.ts` uses `@supabase/ssr` to refresh the session and guard `(app)` and `(onboarding)` groups; unauthenticated → `/sign-in`.

**Company switcher**
- Top-bar Sheet/Dropdown listing `company_members` for `auth.uid()` joined to `companies`. Selecting one stores active `company_id` (React context + cookie). Shows role badge.

---

## Mobile (apps/mobile) — Expo

```
app/
  (auth)/sign-in.tsx
  (auth)/sign-up.tsx
  (auth)/forgot-password.tsx
  (auth)/reset-password.tsx
  (app)/_layout.tsx          ← tab nav, requires session
  (app)/index.tsx            ← home placeholder
  _layout.tsx                ← auth gate, session restore from SecureStore
lib/supabase.ts              ← client with SecureStore adapter + autoRefreshToken
```

- Same auth operations via `supabase-js`. Deep link `nexis://auth/callback` handles email confirm + password recovery.
- Onboarding (create first company) can be web-first; mobile employees typically arrive via invite (Stage 2), so mobile may just show "join a company / contact your admin" if the user has no membership. Still allow company creation on mobile for parity.

---

## API / server surface

Most is direct Supabase client calls. Server-only pieces:
- `/auth/callback` route handler (code → session).
- RPC `create_company_with_owner` (already `SECURITY DEFINER`).
- (Optional) Edge Function `before-user-created` hook to enforce email domain rules / disposable-email blocking — optional for Stage 1.

No service-role key in the browser. Onboarding mutation goes through the RPC, not a raw insert.

---

## Validation (Zod, shared in packages)

```ts
const SignUp = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});
const CreateCompany = z.object({
  name: z.string().min(2).max(120),
  industry: z.string().max(80).optional(),
});
```

---

## i18n keys (examples)

`auth.signUp.title`, `auth.signIn.badCredentials`, `auth.forgot.neutralSuccess`, `auth.verify.checkEmail`, `onboarding.company.nameLabel`, `onboarding.freeBadge` ("Gratis untuk 5 karyawan pertama"). Provide id + en.

---

## Tests / Acceptance criteria (definition of done)

Functional:
1. Sign up → verification email → confirm → onboarding → create company → dashboard, user is `owner`.
2. Sign in/out works; session persists & refreshes on web (reload) and mobile (app restart).
3. Forgot password sends email; reset link sets a new password; old password no longer works.
4. Change password from account settings works.
5. Unverified user cannot reach `(app)` routes.
6. (If enabled) Google OAuth completes and creates profile.

Security / data (pgTAP + e2e):
7. `company_billing` row for a new company is `plan='free'`, `free_seat_limit=5`; **no NPWP collected**.
8. RLS: a second user with no membership cannot read the first user's company or membership rows.
9. RLS: a user who is `owner` of Company A and (seeded) `employee` of Company B can read A fully but only their own row in B.
10. `create_company_with_owner` refuses when unauthenticated.

Automated test layers:
- **Vitest** unit tests for Zod schemas and auth helpers.
- **Playwright** e2e for signup→onboarding, forgot-password, protected-route redirect.
- **pgTAP** for RLS + RPC (criteria 8–10).

---

## Suggested task breakdown for Antigravity Agent Manager (parallelizable)

1. **DB agent:** write & apply Stage-1 migrations + helper fns + RLS; add pgTAP tests; regenerate types.
2. **Web auth agent:** sign-up/in, forgot/reset, callback, middleware, account settings.
3. **Web onboarding agent:** onboarding wizard + company switcher + active-company context.
4. **Mobile agent:** Expo auth screens + secure session + auth gate.
5. **i18n/design agent:** message catalogs (id/en), shadcn forms, design tokens.

Agents 2–5 depend on Agent 1's types. Keep each as a separate PR. Stop at the acceptance criteria above and report test results.
