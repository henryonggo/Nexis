# Handoff — Billing payment gateway (Stage 6) — 🟡 PROPOSED

**Requested by:** Claude (app layer) · **Owner:** Antigravity (DB + Edge) / human (gateway acct) · 2026-06-09

Replaces the sandbox plan-flip with a real checkout. Today `upgradePlan` in
`apps/web/app/(app)/billing/actions.ts` writes `company_billing.plan` + `companies.plan`
directly (see its `TODO(infra)`). That must become: **app → Edge fn (create checkout)
→ gateway → webhook (service role) flips the plan + writes `subscriptions`/`invoices`**.

Those two tables are service-role-only by RLS, so the app **cannot** populate them — this
is the seam. Agree the contract below before either side starts.

## Gateway choice (human decision)

Recommend **Xendit** or **Midtrans** for the ID market (VA, e-wallet, QRIS, cards).
Stripe only if international cards are needed. Whichever is chosen, the app stays
gateway-agnostic — it only talks to our Edge function, never the gateway SDK.

## Contract — Edge fn `create-billing-checkout` (Antigravity)

Invoked by the app with the caller's JWT (owner only; verify role server-side).

**Request (POST, JSON):**
```jsonc
{
  "companyId": "uuid",
  "plan": "starter" | "growth",
  "billingEmail": "string",
  "npwp": "string (digits, 15 or 16)",      // captured up-front for tax filing
  "bpjsKes": "string (digits)",
  "bpjsTk": "string (digits)",
  "returnUrl": "https://app/billing?checkout=return"
}
```

**Response (JSON):**
```jsonc
{ "checkoutUrl": "https://gateway/...", "sessionId": "string", "status": "pending" }
```

Behavior: verify `auth.uid()` is owner of `companyId`; persist the legal fields onto
`company_billing` immediately (plan stays unchanged until paid; optionally a
`pending_plan` column); create the gateway session; return its hosted-checkout URL.
The app redirects the browser there.

## Contract — Edge fn `billing-webhook` (Antigravity, service role)

Gateway → us, on payment events. (NB: a `scratch/test_billing_webhook.js` prototype
already exists — fold it in or supersede it.)

- Verify the gateway signature; ignore unverified calls.
- On **paid/active**: set `company_billing.plan` + `companies.plan` to the purchased
  tier; insert a `subscriptions` row (status `active`, `current_period_end`); insert an
  `invoices` row (amount in **integer rupiah**, `status='paid'`, `pdf_url` when available).
- On **expired/failed**: leave plan unchanged; record an `open`/`uncollectible` invoice.
- On **canceled / past_due** (renewals): update `subscriptions.status`; downgrade logic
  per product decision (grace period vs immediate).

### TODO(db)
1. Confirm `subscriptions` columns: `status`, `current_period_start/end`, `plan`,
   `gateway_subscription_id`, `gateway_customer_id`.
2. Confirm `invoices` columns the app reads: `created_at`, `period_start`, `period_end`,
   `amount` (bigint rupiah), `status` (`paid|open|uncollectible|void`), `pdf_url`.
   (App read side in `apps/web/lib/billing.ts` already targets these — keep them stable.)
3. Add owner/admin **read** RLS on `subscriptions` (invoices already readable) so the app
   can show live subscription status. Writes stay service-role only.
4. Regenerate `packages/types`.

## App-side follow-up (Claude, after the above lands)

- Replace the direct flip in `billing/actions.ts`: `upgradePlan` POSTs to
  `create-billing-checkout` and returns `{ checkoutUrl }`; the upgrade form redirects.
  Keep the Zod validation (`upgradeSchema`) — send the same fields to the Edge fn.
- Handle the **return URL** on `/billing` (`?checkout=return`): show a "pembayaran sedang
  diproses" pending state until the webhook flips the plan (poll/realtime on
  `company_billing.plan` or `subscriptions.status`).
- Add a **subscription status** block (active / past_due / canceled, `current_period_end`)
  via a new `getSubscription` read in `lib/billing.ts`.
- The plan-comparison UI (`billing/plan-cards.tsx`) and invoice history already exist and
  need no change.
- Acceptance: `docs/stages/stage-06-reporting-billing.md` #1, #4.
