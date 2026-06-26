terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Custom Service Account for running the Cloud Run worker (least-privilege)
resource "google_service_account" "worker_runtime" {
  account_id   = var.runtime_sa_name
  display_name = "Nexis Payroll Worker Runtime SA"
}

# 2. Secret Manager configuration for SUPABASE_SERVICE_ROLE_KEY
resource "google_secret_manager_secret" "supabase_service_key" {
  secret_id = "SUPABASE_SERVICE_ROLE_KEY"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "supabase_service_key_version" {
  secret      = google_secret_manager_secret.supabase_service_key.id
  secret_data = var.supabase_service_role_key
}

# Grant Secret Accessor to the worker runtime service account
resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  secret_id = google_secret_manager_secret.supabase_service_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker_runtime.email}"
}

# 3. Service Account for invoking the Cloud Run worker (used by Cloud Tasks)
resource "google_service_account" "payroll_invoker" {
  account_id   = var.invoker_sa_name
  display_name = "Nexis Payroll Worker Invoker SA"
}

# 4. Cloud Tasks Queue
resource "google_cloud_tasks_queue" "payroll_queue" {
  name     = var.queue_name
  location = var.region

  retry_config {
    max_attempts       = 5
    max_retry_duration = "3600s"
    min_backoff        = "5s"
    max_backoff        = "300s"
    max_doublings      = 4
  }

  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }
}

# 5. Cloud Run Service (Production Mode - Private)
resource "google_cloud_run_v2_service" "payroll_worker" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.worker_runtime.email

    containers {
      # Default image path on Artifact Registry
      image = "${var.region}-docker.pkg.dev/${var.project_id}/nexis-repo/payroll-worker:latest"

      env {
        name  = "NEXT_PUBLIC_SUPABASE_URL"
        value = var.supabase_url
      }

      env {
        name = "SUPABASE_SERVICE_ROLE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.supabase_service_key.secret_id
            version = "latest"
          }
        }
      }

      ports {
        container_port = 3001
      }
    }
  }

  # Dependencies check: ensure Secret version and IAM binding exist first
  depends_on = [
    google_secret_manager_secret_version.supabase_service_key_version,
    google_secret_manager_secret_iam_member.secret_accessor
  ]
}

# 6. IAM Policy Binding to allow the invoker service account to call Cloud Run
resource "google_cloud_run_v2_service_iam_member" "invoker_run_binding" {
  name     = google_cloud_run_v2_service.payroll_worker.name
  location = google_cloud_run_v2_service.payroll_worker.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.payroll_invoker.email}"
}

# 7. Web/Vercel Enqueuer IAM Bindings (Conditional: active only if vercel_sa_email is provided)
resource "google_cloud_tasks_queue_iam_member" "vercel_queue_enqueuer" {
  count      = var.vercel_sa_email != "" ? 1 : 0
  project    = var.project_id
  location   = var.region
  queue_name = google_cloud_tasks_queue.payroll_queue.name
  role       = "roles/cloudtasks.enqueuer"
  member     = "serviceAccount:${var.vercel_sa_email}"
}

resource "google_service_account_iam_member" "vercel_service_account_user" {
  count              = var.vercel_sa_email != "" ? 1 : 0
  service_account_id = google_service_account.payroll_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.vercel_sa_email}"
}
