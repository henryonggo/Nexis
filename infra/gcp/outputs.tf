output "gcp_project_id" {
  value       = var.project_id
  description = "The GCP project ID"
}

output "gcp_region" {
  value       = var.region
  description = "The GCP region resources are deployed to"
}

output "cloud_tasks_queue_name" {
  value       = google_cloud_tasks_queue.payroll_queue.name
  description = "The name of the Cloud Tasks queue"
}

output "payroll_worker_url" {
  value       = google_cloud_run_v2_service.payroll_worker.uri
  description = "The URL of the deployed Cloud Run worker service"
}

output "payroll_worker_invoker_sa" {
  value       = google_service_account.payroll_invoker.email
  description = "The email of the Service Account authorized to invoke the worker"
}
