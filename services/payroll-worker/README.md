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

The worker exposes two `POST` endpoints for processing async jobs:

### 1. Payroll Run Processing

Processes a queued monthly or THR payroll run:

```bash
curl -X POST http://localhost:3001/process \
  -H "Content-Type: application/json" \
  -d '{"runId": "your-payroll-run-uuid"}'
```

### 2. Report Job Export Processing

Asynchronously generates Excel exports (e.g. Payroll Summary, BPJS Contributions, e-Bupot PPh 21, BPJS SIPP) and writes them to the private `reports` Storage bucket:

```bash
curl -X POST http://localhost:3001/process-report \
  -H "Content-Type: application/json" \
  -d '{"jobId": "your-report-job-uuid"}'
```

*Trigger Seam*: In local development, these are triggered via direct inline HTTP requests from Next.js server actions (found in `apps/web/lib/report-worker.ts`). In production, these should be queued via GCP Cloud Tasks to enforce rate-limiting and OIDC-authorized invocation.

## Cloud Run Deployment

To deploy this worker to Google Cloud Run, you can use the provided deployment script `deploy.sh` or Terraform configurations in `infra/gcp/`.

### Method A: Using the Deployment Script

A helper script [deploy.sh](file:///c:/GIT/nexis/services/payroll-worker/deploy.sh) is provided to build the Docker image, push it to GCR, and deploy to Cloud Run.

#### Option 1: Beta Mode (Public Cloud Run / Direct POST)
In Beta mode, the Cloud Run worker is public, and the app connects directly via a POST request, bypassing Cloud Tasks.
```bash
# Set variables and run in beta mode
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export MODE="beta"

./services/payroll-worker/deploy.sh
```
*Note:* After deploying, configure `PAYROLL_WORKER_URL` on Vercel and ensure the other 4 vars are unset.

#### Option 2: Production Mode (Private Cloud Run / Cloud Tasks)
In Production mode, the worker is secure (private) and requests are routed through a Cloud Tasks queue using OIDC authentication.
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export MODE="prod"

./services/payroll-worker/deploy.sh
```
*Note:* Configure all 5 environment variables on Vercel as shown in the script output.

---

### Method B: Using Terraform (Production Mode)

Terraform configurations are located in [infra/gcp/](file:///c:/GIT/nexis/infra/gcp/).

1. Initialize Terraform:
   ```bash
   cd infra/gcp
   terraform init
   ```
2. Apply the configuration:
   ```bash
   terraform apply \
     -var="supabase_url=https://your-project.supabase.co" \
     -var="supabase_service_role_key=your-service-role-key"
   ```
3. Set all 5 outputs as environment variables on Vercel.
