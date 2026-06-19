# Incident-evidence S3 bucket (Terraform)

Provisions the write-once, tamper-proof forensic evidence bucket required by
`docs/legal/BREACH_RUNBOOK.md` §4.1 step 4 and open-gap #2 (§12). The runbook
hardcodes the name `s3://lingolinq-incident-evidence`; its commands assume this
bucket exists before the first district contract redline.

## What it creates

| Resource | Setting |
|----------|---------|
| S3 bucket | `lingolinq-incident-evidence`, Object Lock enabled at creation |
| Object Lock | `COMPLIANCE` mode, 7-year default retention (Decision D2) |
| Versioning | Enabled |
| Encryption | SSE-S3 (AES-256) by default; SSE-KMS optional (Decision D3) |
| Public access | All four blocks ON |
| Ownership | `BucketOwnerEnforced` (ACLs disabled) |
| Bucket policy | TLS-only; write/read allowed ONLY to the Incident Commander + Tech Lead role ARNs; PutObject denied to everyone else |
| IAM roles | `lingolinq-incident-commander` + `lingolinq-tech-lead` (created by default), each assumable WITH MFA by the principals you name, each scoped to read/write only this bucket |

MFA-delete is intentionally NOT configured: COMPLIANCE-mode Object Lock blocks
deletion before retention expiry under any credentials, which supersedes it
(runbook §4.1 step 4).

Chain-of-custody sidecars (`.sha256`, `.custody.json`, per-prefix `CUSTODY.md`)
are an operational practice performed at evidence-capture time, not bucket
config. See the runbook.

## ⚠️ CRITICAL: COMPLIANCE mode is irreversible

Once an object is written with COMPLIANCE retention, **no one** -- not you, not
AWS root, not AWS support -- can delete or shorten it before the retention
elapses (7 years). That is the point: it makes the evidence admissible. The
consequences:

- A wrong file uploaded by mistake is **stuck and billed for 7 years**.
- The default retention can be **raised** later but **never lowered**.
- Test/junk objects written into a COMPLIANCE bucket are **permanent**.

Therefore: **validate everything in a throwaway GOVERNANCE bucket first** (Step
1 below), then create the real COMPLIANCE bucket clean and only write real
evidence to it.

`prevent_destroy` is set on the bucket so `terraform destroy` cannot remove it.

## Prerequisites (who can apply this)

- **Admin AWS credentials.** The app user `lingolinq-app` cannot create buckets
  with Object Lock, attach bucket policies, or read IAM. Apply with an
  admin/elevated principal in account `239044785114`.
- **Who may assume the two roles.** The module creates the
  `lingolinq-incident-commander` and `lingolinq-tech-lead` roles and wires their
  stable ARNs into the bucket policy automatically. You only supply the IAM
  principal ARNs allowed to assume each (runbook §3.1: Scot -> IC, Melissa ->
  Tech Lead) via `incident_commander_trusted_principal_arns` and
  `tech_lead_trusted_principal_arns`. Assumption requires MFA by default. To
  skip role creation and use existing principals instead, set
  `create_incident_roles = false` and supply `write_principal_arns`.
- Terraform >= 1.5, AWS provider >= 5.40.

## Step 1: validate in a throwaway bucket (do this first)

```bash
cd infra/incident-evidence-bucket
cp test.tfvars.example test.tfvars   # edit: unique TEST name + real principal ARNs
terraform init
terraform apply -var-file=test.tfvars
./validate.sh <your-test-bucket-name> --probe-write   # write must succeed; delete must fail
# tear the test bucket down (GOVERNANCE mode allows it):
terraform destroy -var-file=test.tfvars
```

`validate.sh` asserts: Object Lock present, versioning on, public access fully
blocked, default encryption set, TLS-only + restricted-write policy present,
and (with `--probe-write`) that an upload succeeds while deleting the locked
object is refused.

## Step 2: create the real bucket

```bash
cp terraform.tfvars.example terraform.tfvars   # fill D1-D4 + principal ARNs
terraform init
terraform plan -var-file=terraform.tfvars      # review carefully -- this is the irreversible one
terraform apply -var-file=terraform.tfvars
./validate.sh lingolinq-incident-evidence      # NO --probe-write on the real bucket
```

## Step 3: close the runbook gap

Record the bucket ARN and creation date, then mark `BREACH_RUNBOOK.md` §12
open-gap #2 closed.

## Decisions (confirmed by Scot, 2026-06-19)

- **D1 region:** `us-west-2` (co-located with prod data buckets)
- **D2 lock mode:** `COMPLIANCE`, 7-year retention (irreversibility accepted)
- **D3 encryption:** `SSE-S3` / AES-256
- **D4 name:** `lingolinq-incident-evidence`
- **D5 method:** Terraform (this module)

These are the module defaults. `terraform.tfvars.example` is now pre-filled
with the two assume-role principal ARNs for this account (`239044785114`):
`wahlquist-admin` -> Incident Commander, `melissa-oneil` -> Tech Lead. Confirm
both usernames are correct at apply time (the apply fails clearly if either ARN
does not resolve). Full rationale:
`~/ai-company-brain/outputs/plans/2026-06-19-incident-evidence-bucket-provisioning-plan.md`.
