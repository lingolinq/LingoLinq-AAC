###############################################################################
# Incident-evidence bucket (breach runbook §4.1 step 4)
#
# Write-once, tamper-proof forensic evidence store. Object Lock MUST be enabled
# at bucket-creation time (it cannot be added to an existing bucket), so this
# module has to be correct on the first apply.
#
# Read CRITICAL irreversibility notes in README.md before `terraform apply`
# with object_lock_mode = COMPLIANCE.
###############################################################################

locals {
  use_kms = var.encryption_type == "SSE-KMS"
}

resource "aws_s3_bucket" "evidence" {
  bucket              = var.bucket_name
  object_lock_enabled = true

  # Object Lock is permanent for the life of the bucket. Guard against an
  # accidental `terraform destroy` removing the evidence store.
  lifecycle {
    prevent_destroy = true
  }
}

# Disable ACLs entirely; the bucket owner owns every object. Required for a
# clean single-writer policy model.
resource "aws_s3_bucket_ownership_controls" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Default retention: every PutObject inherits COMPLIANCE/7y unless a longer
# per-object retention is supplied. This is the irreversible control.
resource "aws_s3_bucket_object_lock_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    default_retention {
      mode  = var.object_lock_mode
      years = var.retention_years
    }
  }
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  # Fail at plan time if SSE-KMS was chosen without a key ARN.
  lifecycle {
    precondition {
      condition     = !local.use_kms || var.kms_key_arn != ""
      error_message = "encryption_type = SSE-KMS requires a non-empty kms_key_arn."
    }
  }

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = local.use_kms ? "aws:kms" : "AES256"
      kms_master_key_id = local.use_kms ? var.kms_key_arn : null
    }
    bucket_key_enabled = local.use_kms
  }
}

resource "aws_s3_bucket_logging" "evidence" {
  count         = var.enable_access_logging ? 1 : 0
  bucket        = aws_s3_bucket.evidence.id
  target_bucket = var.log_target_bucket
  target_prefix = "${var.bucket_name}/access-logs/"
}

###############################################################################
# Bucket policy
#  - Deny all non-TLS traffic.
#  - Allow PutObject / GetObject / ListBucket ONLY to the incident principals.
#  - Deny PutObject to every other principal (defense-in-depth over IAM).
###############################################################################
data "aws_iam_policy_document" "evidence" {
  # 1. Require TLS for every request.
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.evidence.arn,
      "${aws_s3_bucket.evidence.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # 2. Allow the two incident principals to write and read evidence.
  statement {
    sid    = "AllowIncidentPrincipalsReadWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:GetObjectRetention",
      "s3:GetObjectLegalHold",
    ]
    resources = [
      aws_s3_bucket.evidence.arn,
      "${aws_s3_bucket.evidence.arn}/*",
    ]
    principals {
      type        = "AWS"
      identifiers = var.write_principal_arns
    }
  }

  # 3. Deny PutObject to anyone who is NOT an incident principal.
  statement {
    sid       = "DenyWriteFromOthers"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.evidence.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "aws:PrincipalArn"
      values   = var.write_principal_arns
    }
  }
}

resource "aws_s3_bucket_policy" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  policy = data.aws_iam_policy_document.evidence.json

  # Ensure public access block exists before a policy is attached.
  depends_on = [aws_s3_bucket_public_access_block.evidence]
}
