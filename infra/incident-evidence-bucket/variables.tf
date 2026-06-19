variable "region" {
  description = "AWS region for the evidence bucket. Default us-west-2 to co-locate with the prod data buckets (lingolinq-prod-uploads/static) so forensic snapshots and access logs land in the same region. (Decision D1.)"
  type        = string
  default     = "us-west-2"
}

variable "bucket_name" {
  description = "Bucket name. The breach runbook (docs/legal/BREACH_RUNBOOK.md §4.1 step 4) hardcodes this exact name; do NOT rename without updating the runbook. (Decision D4.)"
  type        = string
  default     = "lingolinq-incident-evidence"
}

variable "object_lock_mode" {
  description = "Object Lock retention mode. COMPLIANCE (runbook default) is IRREVERSIBLE: no principal, including AWS root, can delete or shorten a locked object before retention expiry. GOVERNANCE is override-able by a principal holding s3:BypassGovernanceRetention (weaker evidence). (Decision D2.)"
  type        = string
  default     = "COMPLIANCE"

  validation {
    condition     = contains(["COMPLIANCE", "GOVERNANCE"], var.object_lock_mode)
    error_message = "object_lock_mode must be COMPLIANCE or GOVERNANCE."
  }
}

variable "retention_years" {
  description = "Default Object Lock retention in years, applied to every uploaded object. Runbook requires 7 (matches the 7-year incident-record retention floor in §4.1/§6). Can be RAISED later but never lowered under COMPLIANCE mode."
  type        = number
  default     = 7

  validation {
    condition     = var.retention_years >= 1 && var.retention_years <= 100
    error_message = "retention_years must be between 1 and 100."
  }
}

variable "encryption_type" {
  description = "Server-side encryption. 'SSE-S3' (AES-256, runbook default, no key to manage) or 'SSE-KMS' (customer-managed CMK: per-key CloudTrail audit and the ability to gate decryption to the two incident roles). (Decision D3.)"
  type        = string
  default     = "SSE-S3"

  validation {
    condition     = contains(["SSE-S3", "SSE-KMS"], var.encryption_type)
    error_message = "encryption_type must be SSE-S3 or SSE-KMS."
  }
}

variable "kms_key_arn" {
  description = "CMK ARN used when encryption_type = SSE-KMS. Leave empty for SSE-S3. If SSE-KMS is chosen and this is empty, apply fails (intentional: forces an explicit key)."
  type        = string
  default     = ""
}

variable "write_principal_arns" {
  description = "IAM principal ARNs allowed to write evidence (s3:PutObject) and read it back. Per runbook §3.1 these are the Incident Commander (Scot, CEO) and Tech Lead (Melissa). Supply the actual user OR role ARNs in this account. Everyone else is denied write. Must be non-empty."
  type        = list(string)

  validation {
    condition     = length(var.write_principal_arns) > 0
    error_message = "write_principal_arns must list at least the Incident Commander and Tech Lead ARNs. The bucket is useless and unsafe with an empty writer set."
  }
}

variable "enable_access_logging" {
  description = "When true, send S3 server access logs to log_target_bucket. Optional; CloudTrail S3 data events on this bucket are the stronger audit source. Default off to avoid a hard dependency on a logging bucket."
  type        = bool
  default     = false
}

variable "log_target_bucket" {
  description = "Destination bucket for server access logs when enable_access_logging = true. Must already exist and be in the same region."
  type        = string
  default     = ""
}
