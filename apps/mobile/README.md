# @nexis/mobile — Employee app (Expo / React Native)

Stage 1 provides the Supabase client (`lib/supabase.ts`). The employee-facing
screens (sign in, attendance clock-in with GPS + selfie, payslips, leave/claims)
are built starting in Stage 2/3 — see `docs/stages/`.

## Getting started

```bash
pnpm install
cp ../../.env.example .env   # set EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
pnpm --filter @nexis/mobile dev
```

## Planned structure (per docs/06-design-system.md)

```
app/
  (auth)/sign-in.tsx
  (auth)/forgot-password.tsx
  (app)/_layout.tsx      ← bottom tabs: Home, Attendance, Payslips, Requests, Profile
  (app)/index.tsx
  _layout.tsx            ← auth gate, session restore from SecureStore
lib/supabase.ts          ← done (Stage 1)
```
