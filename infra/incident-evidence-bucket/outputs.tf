output "bucket_name" {
  description = "Name of the evidence bucket."
  value       = aws_s3_bucket.evidence.id
}

output "bucket_arn" {
  description = "ARN of the evidence bucket (record this in BREACH_RUNBOOK §12 open-gap #2 when closing it)."
  value       = aws_s3_bucket.evidence.arn
}

output "object_lock_mode" {
  description = "Active Object Lock mode (COMPLIANCE is irreversible)."
  value       = var.object_lock_mode
}

output "retention_years" {
  description = "Default object retention applied to every uploaded artifact."
  value       = var.retention_years
}

output "write_principal_arns" {
  description = "Effective principals permitted to write/read evidence (created role ARNs plus any extra write_principal_arns)."
  value       = local.effective_write_principals
}

output "incident_commander_role_arn" {
  description = "ARN of the incident-commander role (null if create_incident_roles = false). The IC assumes this to write evidence."
  value       = var.create_incident_roles ? aws_iam_role.incident_commander[0].arn : null
}

output "tech_lead_role_arn" {
  description = "ARN of the tech-lead role (null if create_incident_roles = false). The Tech Lead assumes this to write evidence."
  value       = var.create_incident_roles ? aws_iam_role.tech_lead[0].arn : null
}
