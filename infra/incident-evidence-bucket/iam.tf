###############################################################################
# Dedicated incident roles (breach runbook §3.1)
#
# Two assumable roles -- Incident Commander (Scot) and Tech Lead (Melissa) --
# are the bucket's write principals. Using STABLE role ARNs (not personal user
# ARNs) in a 7-year-locked bucket policy means staff changes never require
# editing the locked policy: re-point the role's trust policy instead.
#
# Each role is assumed (with MFA by default) by the trusted principals, and
# carries a scoped identity policy granting only the evidence-bucket actions.
###############################################################################

# Scoped permissions both roles get: read/write THIS bucket only.
data "aws_iam_policy_document" "evidence_rw" {
  count = var.create_incident_roles ? 1 : 0

  statement {
    sid    = "EvidenceReadWrite"
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
  }
}

# Incident Commander trust policy.
data "aws_iam_policy_document" "ic_trust" {
  count = var.create_incident_roles ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = var.incident_commander_trusted_principal_arns
    }
    dynamic "condition" {
      for_each = var.require_mfa_to_assume ? [1] : []
      content {
        test     = "Bool"
        variable = "aws:MultiFactorAuthPresent"
        values   = ["true"]
      }
    }
  }
}

# Tech Lead trust policy.
data "aws_iam_policy_document" "tl_trust" {
  count = var.create_incident_roles ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = var.tech_lead_trusted_principal_arns
    }
    dynamic "condition" {
      for_each = var.require_mfa_to_assume ? [1] : []
      content {
        test     = "Bool"
        variable = "aws:MultiFactorAuthPresent"
        values   = ["true"]
      }
    }
  }
}

resource "aws_iam_role" "incident_commander" {
  count                = var.create_incident_roles ? 1 : 0
  name                 = "lingolinq-incident-commander"
  description          = "Breach runbook IC role; writes/reads incident evidence. Assumed by the Incident Commander (Scot)."
  assume_role_policy   = data.aws_iam_policy_document.ic_trust[0].json
  max_session_duration = 3600

  lifecycle {
    precondition {
      condition     = length(var.incident_commander_trusted_principal_arns) > 0
      error_message = "incident_commander_trusted_principal_arns must name who can assume the IC role (e.g. Scot's IAM user ARN)."
    }
  }
}

resource "aws_iam_role" "tech_lead" {
  count                = var.create_incident_roles ? 1 : 0
  name                 = "lingolinq-tech-lead"
  description          = "Breach runbook Tech Lead role; writes/reads incident evidence. Assumed by the Tech Lead (Melissa)."
  assume_role_policy   = data.aws_iam_policy_document.tl_trust[0].json
  max_session_duration = 3600

  lifecycle {
    precondition {
      condition     = length(var.tech_lead_trusted_principal_arns) > 0
      error_message = "tech_lead_trusted_principal_arns must name who can assume the Tech Lead role (e.g. Melissa's IAM user ARN)."
    }
  }
}

resource "aws_iam_role_policy" "ic_evidence" {
  count  = var.create_incident_roles ? 1 : 0
  name   = "evidence-read-write"
  role   = aws_iam_role.incident_commander[0].id
  policy = data.aws_iam_policy_document.evidence_rw[0].json
}

resource "aws_iam_role_policy" "tl_evidence" {
  count  = var.create_incident_roles ? 1 : 0
  name   = "evidence-read-write"
  role   = aws_iam_role.tech_lead[0].id
  policy = data.aws_iam_policy_document.evidence_rw[0].json
}
