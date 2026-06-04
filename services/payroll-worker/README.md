# Payroll Worker Service

This is the background payroll calculation worker. It runs as a stateless Express HTTP service deployed on Google Cloud Run and triggered via GCP Cloud Tasks (or direct local trigger during development).

## Features

- Enforced idempotency checking: processes `queued` runs only.
- Connects to Supabase with the service role key to bypass Row-Level Security (RLS) for processing.
- Computes gross, BPJS, PPh 21, overtime pay, and December progressive tax reconciliations using the pure `@nexis/payroll` engine.
- Generates downloadable PDF payslips and saves them to the private `payslips` Storage bucket.
- Updates the final run totals and sets the status to `completed` or `failed`.

## Setup and Running Locally

1. Make sure Node.js (>=20) and pnpm are installed.
2. The worker loads environment variables from the monorepo root `.env` file. Ensure `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are defined.
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Start the worker in development mode (hot-reloading):
   ```bash
   pnpm --filter @nexis/payroll-worker dev
   ```
   The server will start listening on port `3001` (by default).

## API Trigger

The worker exposes a single `POST` endpoint to process a run:

```bash
curl -X POST http://localhost:3001/process \
  -H "Content-Type: application/json" \
  -d '{"runId": "your-payroll-run-uuid"}'
```

## Cloud Run Deployment

To deploy this worker to Google Cloud Run:

1. Build a Docker container of this service.
2. Push the image to GCP Artifact Registry.
3. Deploy to Cloud Run:
   ```bash
   gcloud run deploy nexis-payroll-worker \
     --image=gcr.io/your-project-id/payroll-worker:latest \
     --platform=managed \
     --region=asia-southeast1 \
     --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=..." \
     --no-allow-unauthenticated
   ```
4. Configure GCP Cloud Tasks with a service account containing the permission `run.routes.invoke` to trigger the worker URL securely.
