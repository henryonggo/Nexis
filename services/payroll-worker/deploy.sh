#!/usr/bin/env bash
set -euo pipefail

# Default values
GCP_PROJECT_ID=${GCP_PROJECT_ID:-"nexis-499908"}
GCP_REGION=${GCP_REGION:-"asia-southeast1"}
SERVICE_NAME="nexis-payroll-worker"
QUEUE_NAME="nexis-payroll"
MODE=${MODE:-"beta"} # "beta" or "prod"

# Supabase details (can be pre-configured or passed in env)
SUPABASE_URL=${SUPABASE_URL:-""}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-""}

echo "=========================================================="
echo " Nexis Payroll Worker Deployment Script ($MODE mode)"
echo "=========================================================="

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Error: docker is not installed or not in PATH."
    exit 1
fi

if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed or not in PATH."
    echo "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Ensure Supabase URL is set
if [ -z "$SUPABASE_URL" ]; then
    echo "❓ Enter your NEXT_PUBLIC_SUPABASE_URL:"
    read -r SUPABASE_URL
fi

# Ensure Supabase Service Role Key is set
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❓ Enter your SUPABASE_SERVICE_ROLE_KEY:"
    read -r -s SUPABASE_SERVICE_ROLE_KEY
    echo ""
fi

# Validate credentials
echo "🔑 Checking Google Cloud authentication..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
if [ "$CURRENT_PROJECT" != "$GCP_PROJECT_ID" ]; then
    echo "⚠️ Current gcloud project is '$CURRENT_PROJECT', switching to '$GCP_PROJECT_ID'..."
    gcloud config set project "$GCP_PROJECT_ID"
fi

IMAGE_TAG="gcr.io/$GCP_PROJECT_ID/payroll-worker:latest"

# 1. Build the Docker container (must run from monorepo root)
# Locate monorepo root (where Dockerfile resides)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📦 Building Docker image from monorepo root: $ROOT_DIR"
docker build -t "$SERVICE_NAME:latest" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "🏷️ Tagging image as $IMAGE_TAG..."
docker tag "$SERVICE_NAME:latest" "$IMAGE_TAG"

# Configure docker credential helper for gcr.io
echo "🐳 Authenticating Docker with Google Container Registry..."
gcloud auth configure-docker gcr.io --quiet

echo "🚀 Pushing image to GCR..."
docker push "$IMAGE_TAG"

if [ "$MODE" = "beta" ]; then
    echo "🌐 Deploying to Cloud Run in BETA mode (Public access)..."
    gcloud run deploy "$SERVICE_NAME" \
      --image="$IMAGE_TAG" \
      --platform="managed" \
      --region="$GCP_REGION" \
      --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
      --allow-unauthenticated

    # Get Cloud Run URL
    RUN_URL=$(gcloud run services describe "$SERVICE_NAME" --platform="managed" --region="$GCP_REGION" --format="value(status.url)")
    
    echo "=========================================================="
    echo " ✅ Deployment Completed Successfully!"
    echo " Mode: BETA (Public)"
    echo " Cloud Run URL: $RUN_URL"
    echo "=========================================================="
    echo "👉 Action Required on Vercel:"
    echo "1. Set the following environment variable on Vercel:"
    echo "   PAYROLL_WORKER_URL = $RUN_URL"
    echo "2. Ensure the other 4 vars are UNSET (so Vercel uses direct-POST fallback):"
    echo "   GCP_PROJECT_ID, GCP_REGION, CLOUD_TASKS_QUEUE, PAYROLL_WORKER_INVOKER_SA"
    echo "=========================================================="

else
    echo "🔒 Deploying to Cloud Run in PRODUCTION mode (Private access)..."
    
    # 1. Ensure Secret Manager secret exists and upload the key
    SECRET_NAME="SUPABASE_SERVICE_ROLE_KEY"
    echo "🤫 Configuring Secret Manager secret '$SECRET_NAME'..."
    if ! gcloud secrets describe "$SECRET_NAME" &>/dev/null; then
        gcloud secrets create "$SECRET_NAME" --replication-policy="automatic"
    fi
    echo -n "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --quiet

    # 2. Get Cloud Run Service Account (we will use default compute SA or prompt to create one)
    # Let's grant secret accessor to Compute Engine default service account for simplicity,
    # or a dedicated Cloud Run runtime service account if configured.
    PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectNumber)")
    RUN_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

    echo "🔐 Granting Secret Accessor permission to Cloud Run service account: $RUN_SA..."
    gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
      --member="serviceAccount:$RUN_SA" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet

    # 3. Deploy Cloud Run service as private
    gcloud run deploy "$SERVICE_NAME" \
      --image="$IMAGE_TAG" \
      --platform="managed" \
      --region="$GCP_REGION" \
      --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL" \
      --set-secrets="SUPABASE_SERVICE_ROLE_KEY=$SECRET_NAME:latest" \
      --no-allow-unauthenticated

    RUN_URL=$(gcloud run services describe "$SERVICE_NAME" --platform="managed" --region="$GCP_REGION" --format="value(status.url)")

    # 4. Create the invoker SA if it doesn't exist
    INVOKER_SA_NAME="payroll-enqueuer"
    INVOKER_SA_EMAIL="$INVOKER_SA_NAME@$GCP_PROJECT_ID.iam.gserviceaccount.com"
    echo "👥 Setting up invoker service account: $INVOKER_SA_EMAIL..."
    if ! gcloud iam service-accounts describe "$INVOKER_SA_EMAIL" &>/dev/null; then
        gcloud iam service-accounts create "$INVOKER_SA_NAME" \
          --display-name="Nexis Payroll Worker Invoker SA"
    fi

    # 5. Bind run.invoker to the invoker SA
    echo "🔗 Binding run.invoker permission on $SERVICE_NAME..."
    gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
      --platform="managed" \
      --region="$GCP_REGION" \
      --member="serviceAccount:$INVOKER_SA_EMAIL" \
      --role="roles/run.invoker" \
      --quiet

    # 6. Create the Cloud Tasks Queue
    echo "📬 Creating Cloud Tasks queue '$QUEUE_NAME' in '$GCP_REGION'..."
    if ! gcloud tasks queues describe "$QUEUE_NAME" --location="$GCP_REGION" &>/dev/null; then
        gcloud tasks queues create "$QUEUE_NAME" --location="$GCP_REGION"
    fi

    echo "=========================================================="
    echo " ✅ Deployment Completed Successfully!"
    echo " Mode: PRODUCTION (Private OIDC)"
    echo " Cloud Run URL: $RUN_URL"
    echo " Invoker SA: $INVOKER_SA_EMAIL"
    echo " Cloud Tasks Queue: $QUEUE_NAME"
    echo "=========================================================="
    echo "👉 Action Required on Vercel:"
    echo "Set all 5 environment variables on Vercel:"
    echo "1. GCP_PROJECT_ID = $GCP_PROJECT_ID"
    echo "2. GCP_REGION = $GCP_REGION"
    echo "3. CLOUD_TASKS_QUEUE = $QUEUE_NAME"
    echo "4. PAYROLL_WORKER_URL = $RUN_URL"
    echo "5. PAYROLL_WORKER_INVOKER_SA = $INVOKER_SA_EMAIL"
    echo ""
    echo "⚠️ Note: Ensure your Vercel deployment credentials have permissions to:"
    echo " - cloudtasks.tasks.create (on queue $QUEUE_NAME)"
    echo " - iam.serviceAccounts.actAs (on service account $INVOKER_SA_EMAIL)"
    echo "=========================================================="
fi
