variable "project_id" {
  type        = string
  description = "The ID of the GCP project to deploy resources into"
  default     = "nexis-499908"
}

variable "region" {
  type        = string
  description = "The GCP region to deploy resources to"
  default     = "asia-southeast1"
}

variable "service_name" {
  type        = string
  description = "Name of the Cloud Run service for the payroll worker"
  default     = "nexis-payroll-worker"
}

variable "queue_name" {
  type        = string
  description = "Name of the Cloud Tasks queue to deploy"
  default     = "nexis-payroll"
}

variable "invoker_sa_name" {
  type        = string
  description = "Account ID for the Service Account that invokes the Cloud Run worker"
  default     = "payroll-enqueuer"
}

variable "runtime_sa_name" {
  type        = string
  description = "Account ID for the Service Account that the Cloud Run worker runs as"
  default     = "payroll-worker-runtime"
}

variable "supabase_url" {
  type        = string
  description = "The public URL of the Supabase project"
}

variable "supabase_service_role_key" {
  type        = string
  description = "The secret service role key for Supabase, to bypass RLS"
  sensitive   = true
}

variable "vercel_sa_email" {
  type        = string
  description = "Optional: The email of the service account used by Vercel / App to authenticate with GCP (to grant Cloud Tasks Enqueuer and Service Account User permissions)"
  default     = ""
}
