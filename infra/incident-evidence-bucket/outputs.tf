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
  description = "Principals permitted to write/read evidence."
  value       = var.write_principal_arns
}
