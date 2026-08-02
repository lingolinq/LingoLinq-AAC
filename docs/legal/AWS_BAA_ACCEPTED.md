# AWS Business Associate Addendum (BAA) - ACCEPTED ✅

## Acceptance Details

**Date**: February 7, 2026  
**AWS Account**: LingoLinq (2390-4478-5114)  
**Status**: **ACTIVE**

## Confirmation Message

> **Accepted agreement**  
> 'AWS Business Associate Addendum' was set to 'active'.

## What This Means

✅ **BAA Active**: This AWS account is designated as a HIPAA Account — AWS is now legally bound as a Business Associate under HIPAA  
✅ **Legal Foundation**: A signed BAA is a necessary (but not sufficient) condition for HIPAA compliance  
⚠️ **PHI May Only Be Processed If**: (1) you use exclusively HIPAA-eligible AWS services, AND (2) all required technical safeguards (encryption, access controls, logging) are in place, AND (3) the required administrative and physical safeguards are also implemented  
✅ **Service Restrictions Apply**: Must only use HIPAA-eligible services with PHI  
✅ **Encryption Required**: Must encrypt all PHI in-transit and at-rest  

## Important Requirements

1. **Use ONLY HIPAA-Eligible Services** for PHI data
   - S3 (with encryption) ✓
   - RDS (with encryption) ✓
   - EC2 (with encrypted volumes) ✓
   - See full list: https://aws.amazon.com/compliance/hipaa-eligible-services-reference/

2. **Enable Encryption**
   - S3: Server-side encryption (SSE-S3 or SSE-KMS)
   - RDS: Encryption at rest
   - EBS: Encrypted volumes

3. **Enable Logging**
   - CloudTrail for API logging
   - S3 access logging
   - VPC Flow Logs

4. **Access Controls**
   - IAM policies with least privilege
   - MFA for privileged users
   - Regular access reviews

## Next Steps for LingoLinq AAC

Now that the BAA is active, we can proceed with:

1. ✅ Create HIPAA-compliant S3 buckets with encryption
2. ✅ Configure proper IAM policies
3. ✅ Enable CloudTrail and S3 logging
4. ✅ Set up separate buckets for dev/staging/production
5. ✅ Implement the full S3 architecture plan

## Account Coverage

**IMPORTANT**: This BAA applies ONLY to this specific AWS account (2390-4478-5114). If you have other AWS accounts that will process PHI, you must accept a separate BAA for each account.

---

**Status**: Ready to proceed with HIPAA-compliant infrastructure setup!

---

## Runtime AI on Amazon Bedrock - 2026-07-24 (re-attested 2026-07-24; corrected 2026-08-01, amended 2026-08-02)

Runtime AI model inference (word prediction, prediction seeding, board generation, eval narration)
is **coded to route** to **Amazon Bedrock** under this account-level BAA, replacing the prior direct
`api.anthropic.com` route (see `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`).

**As of 2026-08-01 that route is not operational in production.** No deployed revision of the Cloud
Run service `lingolinq-web` carries a Bedrock credential, so `AiClient.configured?` is false and no
runtime AI seam can egress at all. See the 2026-08-01 correction below.

- **Amazon Bedrock is a HIPAA-eligible AWS service** (verified against AWS's HIPAA-eligible-services
  reference, 2026-07-24), **excluding the Fable and Mythos models**. The runtime inventory (Claude
  Haiku 4.5, Claude Opus 4.7) is on the eligible side of that exclusion; Fable/Mythos remain barred
  by policy and by the runtime model allowlist.
- **Amazon Bedrock is the designated runtime AI path under this BAA**, and is covered by it once in
  use. It is **not in use for PHI today** (see the correction below); the HIPAA-eligible services
  actually processing data remain S3, RDS, and the rest of the existing inventory.
- **Operative condition:** Bedrock calls must run under this BAA'd account (2390-4478-5114). A
  different account would need its own BAA. **This condition is currently UNVERIFIED**, and cannot
  be verified while no Bedrock call is made from production. It becomes verifiable, and must be
  verified, at the moment a Bedrock credential is first mounted. The prior "Verified 2026-07-27"
  statement here is retracted; see the 2026-08-01 correction below.
- **Bedrock model-invocation logging** (optional; CloudWatch/S3) captures prompts. For PHI it must
  stay disabled, or route to HIPAA-controlled, access-logged storage. **Verified OFF** in this
  account (2390-4478-5114), region us-west-2, on 2026-07-27.

### Correction - 2026-08-01

The 2026-07-27 re-attestation recorded a verification that could not have been performed. This
subsection retracts it and states the verified facts. The retracted text is quoted in full so the
record stays auditable.

**Retracted claim** (previously in the Operative condition bullet above, and repeated in the
attestation block below):

> **Verified 2026-07-27:** the deployed Cloud Run service `lingolinq-web` signs Bedrock with a
> credential that resolves to this account, region us-west-2.

**Why it is wrong.** `lib/ai_client.rb` signs Bedrock only with `BEDROCK_AWS_KEY` +
`BEDROCK_AWS_SECRET`, or with `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`. It deliberately does
not fall back to `AWS_KEY` / `AWS_SECRET`, which are the S3/SES least-privilege pair and carry no
Bedrock invoke permission. None of those four Bedrock-capable variable names is present on any
revision of `lingolinq-web`.

**Evidence (gathered 2026-08-01).**

| Check | Result |
| --- | --- |
| Bedrock credential env vars on the serving revision `lingolinq-web-00011-l7f` (deployed 2026-07-30) | none |
| Bedrock credential env vars across all 11 revisions, `00001-2vn` (2026-06-29) through `00011-l7f` | none, on every revision |
| Serving revision on 2026-07-27, `lingolinq-web-00010-95c` | none |
| AWS-related env vars actually present on the serving revision | `AWS_KEY`, `AWS_SECRET`, `AWS_REGION`, plus the retired `ANTHROPIC_API_KEY` |
| `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET` in `.github/workflows/deploy-cloudrun.yml` on `staging` | absent |

The claim was therefore never true at any point. It is not a case of a control that held when
attested and later regressed.

**Effect on PHI.** Stated precisely, because an earlier draft of this correction overreached here,
and the overreach is instructive: it inferred runtime behaviour from deployment configuration, which
is the same error the 2026-07-27 claim above made.

- **Bedrock egress has never occurred, on any revision.** Verified by the evidence table above: no
  `lingolinq-web` revision has ever carried a Bedrock credential, so `AiClient.configured?` has
  never been true in production and `AiClient.build` has always returned nil.
- **Direct `api.anthropic.com` egress was possible until 2026-07-30.** The Bedrock routing change
  (commit `abd6d8c8c`, PR #681) merged 2026-07-27 11:45 MDT, but the revision serving production
  from 2026-07-24T23:21Z was `lingolinq-web-00010-95c`, whose image predates that commit by three
  days. It therefore ran pre-#681 code, which constructed a direct client
  (`::Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'])`, `lib/eval_narrator.rb:237` at
  `abd6d8c8c^`), and `ANTHROPIC_API_KEY` is mounted on that revision. The first revision running
  Bedrock code is `00011-l7f`, deployed 2026-07-30T16:37Z, and it carries no Bedrock credential.
  Runtime AI therefore became non-functional on **2026-07-30**, not 2026-07-24.
- **Whether direct calls actually occurred is not answerable from deployment configuration.** It
  requires a production query of `AiApiLog` by `ai_provider` and `created_at` across 2026-07-24 to
  2026-07-30. That query has not been run. Do not restate "no egress occurred" until it has.
- **Any such egress was BAA-covered.** The direct Anthropic path is covered by the executed
  Anthropic HIPAA-Ready BAA of 2026-07-18 (`docs/legal/ANTHROPIC_BAA_ACCEPTED.md`), so this is not
  an uncovered disclosure even if the log shows calls.

`scripts/ai-endpoint-guard.sh` enforces in CI that no runtime seam constructs a direct
`api.anthropic.com` client at HEAD, and all four seams gate on `AiClient.configured?`
(`lib/ai_word_predictor.rb:165`, `lib/ai_prediction_generator.rb:111`,
`lib/ai_board_generator.rb:532`, `lib/eval_narrator.rb:330`) with no bypass.

**Operational consequence.** Board generation, word prediction, prediction seeding, and eval
narration are non-functional in production, and have been since `00011-l7f` deployed
2026-07-30T16:37Z.

**Standard for any future verification of this condition.** Mounting a credential is not by itself
evidence that the operative condition is met, because a mounted credential can belong to a different
AWS account. Re-attestation requires both:

1. the Bedrock credential env vars are present on the serving revision, and
2. `sts:GetCallerIdentity` executed under that exact credential returns account `2390-4478-5114`.

Until a deploy-time check asserts (2) automatically, the operative condition is a documented
assumption rather than a tested control.

**Attestation:** Re-attested 2026-07-24 by Scot Wahlquist, CEO (Bedrock runtime routing under this
account-level BAA). Prose corrected 2026-07-27 to remove a contradictory "re-attestation owed"
banner left in the bytes that attestation covered.

The 2026-07-27 operative-conditions re-attestation is **partially retracted as of 2026-08-01**:

- **Retracted:** "the deployed runtime credential resolves to this account (2390-4478-5114,
  us-west-2)." Never verifiable; see the correction above.
- **Stands:** Bedrock model-invocation logging is OFF in account 2390-4478-5114, region us-west-2,
  verified 2026-07-27. That check was performed in the AWS account, independently of the
  deployment, and is unaffected by this correction.

**Re-attestation pending.** This correction was prepared 2026-08-01 by Claude Code from the evidence
above and is **not** an attestation. Per the governance rule in
`audit-reports/DOCUMENT-REGISTER.json`, only Scot Wahlquist changes a document's attestation. The
operative-condition claim stays retracted, and this document's attestation stays open, until Bedrock
is operational and both verification steps above pass.
