# Handoff — Sign-up confirmation email (config)

**Owner:** Human (Supabase dashboard + Vercel env) · 2026-06-08

The app can send its **own** branded confirmation email on sign-up via Resend, using a
link minted by `auth.admin.generateLink` (see `apps/web/app/(auth)/actions.ts` →
`signUp`, and `apps/web/lib/email.ts` → `sendVerificationEmail`). The code is done; it
only takes the branded path when the Resend + service-role env vars are set, otherwise
it falls back to Supabase's default email. No code change is needed either way — only
config.

> ## ✅ Current decision: Option 1 — Supabase's email for now (no domain yet)
>
> Branded sending via Resend needs a **domain you control DNS for** (for SPF/DKIM).
> `nexishr.vercel.app` can't be verified (no DNS control over a `.vercel.app`
> subdomain). Until a real domain exists, we use **Supabase's built-in email** and just
> fix the broken link.
>
> **To do right now (only this):**
> 1. Supabase → **Authentication → URL Configuration → Site URL** =
>    `https://nexishr.vercel.app`, and add `https://nexishr.vercel.app/**` to
>    **Redirect URLs**. *This alone fixes the `localhost:3000` link.*
> 2. (Recommended) Vercel → set `NEXT_PUBLIC_SITE_URL=https://nexishr.vercel.app`, then
>    **redeploy** (it's a build-time var).
> 3. **Do NOT set** `RESEND_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` yet → the app
>    automatically uses Supabase's email. Keep "Confirm email" ON.
>
> Result: confirmation emails are Supabase-branded (not ours) but the link works and
> lands on the login page. The branded path (section 2 below) switches on later with a
> pure env-var flip — no code change.
>
> ### When you get a domain (upgrade to branded email)
> - Buy a cheap domain (e.g. `nexishr.com` / `.id`), verify it in Resend (add the DNS
>   records Resend shows you).
> - Set the three vars in section 2 (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
>   `EMAIL_FROM=Nexis <noreply@yourdomain>`), redeploy. Done.
> - *Test-only shortcut without a domain:* `EMAIL_FROM=Nexis <onboarding@resend.dev>`
>   sends the branded email but **only delivers to your own Resend-account address** —
>   fine to preview it yourself, not for real users.

## How the flow works (so the config makes sense)

- `signUp` calls `admin.generateLink({ type: "signup", ... })`. **`generateLink` does
  NOT send an email** — it returns the confirmation link, which we email via Resend.
- So Supabase never auto-sends its own confirmation email in production. There is
  **nothing to disable**, and no double-email risk.
- The generated link points at Supabase's `/auth/v1/verify?...&redirect_to=...`, where
  `redirect_to = ${NEXT_PUBLIC_SITE_URL}/auth/callback?next=/sign-in`. After verifying,
  the user lands on the **login page**.

## 1. Supabase dashboard

- **Authentication → Sign In / Providers → Confirm email: keep ON.** This only controls
  whether verification is required (we want it). It is *not* the email template and is
  *not* something to turn off.
- **Authentication → URL Configuration:**
  - **Site URL** = `https://nexishr.vercel.app`  ← this is the real fix for the old
    `localhost:3000` link.
  - **Redirect URLs**: add `https://nexishr.vercel.app/**` (must allow-list the
    `redirect_to` used by the verify link, i.e. `/auth/callback`).
- **Authentication → Emails → Templates → "Confirm signup":** no change needed. It's
  only used by the dev fallback (`auth.signUp`) when the env vars below are absent.

## 2. Vercel environment variables (Production)

Already present (app runs today): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

| Variable | When | Value | Source |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | **now (Option 1)** | `https://nexishr.vercel.app` | prod URL; drives the verify redirect |
| `SUPABASE_SERVICE_ROLE_KEY` | later (branded) | the `service_role` secret | Supabase → Settings → API → `service_role` (secret, **not** anon) |
| `RESEND_API_KEY` | later (branded) | `re_...` | Resend → API Keys |
| `EMAIL_FROM` | later (branded) | e.g. `Nexis <noreply@yourdomain.com>` | a **verified domain** in Resend (the `onboarding@resend.dev` default only delivers to your own Resend-account email) |

Notes:
- The branded path runs only when **both** `SUPABASE_SERVICE_ROLE_KEY` **and**
  `RESEND_API_KEY` are set; otherwise it falls back to Supabase's default email
  (this is Option 1).
- `NEXT_PUBLIC_*` vars are baked in at **build time** → **redeploy** after adding
  `NEXT_PUBLIC_SITE_URL`. The other three are server-side, read at runtime.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — server-only (used in
  `apps/web/lib/supabase/admin.ts`); never prefix with `NEXT_PUBLIC_`.

## 3. Sanity test

**Option 1 (now):** sign up with an email you control →
- ✅ Confirmation email arrives (Supabase-branded — that's expected for now).
- ✅ Clicking the link lands on `https://nexishr.vercel.app/sign-in` (no `localhost`).
  If it still goes to `localhost`, the Supabase **Site URL** isn't set to prod yet.

**Branded path (later, after the Resend vars are set):**
- ✅ Branded email arrives (subject: "Verifikasi email Anda untuk Nexis").
- ❌ If you still get the plain Supabase email, one of `SUPABASE_SERVICE_ROLE_KEY` /
  `RESEND_API_KEY` is missing/misnamed and it fell back.

## Related

- Dev switch: the redirect target is commented in `signUp`
  (`verifyRedirect` → `/sign-in`, with a `/dashboard` dev line commented out).
- Optional: **Authentication → Sessions** lifetime / refresh-token rotation — review so
  the server session timebox matches the app's 2h idle auto-logout.
