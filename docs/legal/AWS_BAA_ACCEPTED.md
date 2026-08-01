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

## Runtime AI on Amazon Bedrock - 2026-07-24 (re-attested 2026-07-24)

Runtime AI model inference (word prediction, prediction seeding, board generation, eval narration)
now runs on **Amazon Bedrock** under this account-level BAA, replacing the prior direct
`api.anthropic.com` route (see `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`).

- **Amazon Bedrock is a HIPAA-eligible AWS service** (verified against AWS's HIPAA-eligible-services
  reference, 2026-07-24), **excluding the Fable and Mythos models**. The runtime inventory (Claude
  Haiku 4.5, Claude Opus 4.7) is on the eligible side of that exclusion; Fable/Mythos remain barred
  by policy and by the runtime model allowlist.
- **HIPAA-eligible services in use for PHI now include Amazon Bedrock** (in addition to S3, RDS, etc.).
- **Operative condition:** Bedrock calls must run under this BAA'd account (2390-4478-5114). A
  different account would need its own BAA. **Verified 2026-07-27:** the deployed Cloud Run service
  `lingolinq-web` signs Bedrock with a credential that resolves to this account, region us-west-2.
- **Bedrock model-invocation logging** (optional; CloudWatch/S3) captures prompts. For PHI it must
  stay disabled, or route to HIPAA-controlled, access-logged storage. **Verified OFF** in this
  account (2390-4478-5114), region us-west-2, on 2026-07-27.

**Attestation:** Re-attested 2026-07-24 by Scot Wahlquist, CEO (Bedrock runtime routing under this
account-level BAA). Prose corrected 2026-07-27 to remove a contradictory "re-attestation owed"
banner left in the bytes that attestation covered. Operative conditions verified and re-attested
2026-07-27 by Scot Wahlquist, CEO: the deployed runtime credential resolves to this account
(2390-4478-5114, us-west-2) and Bedrock model-invocation logging is OFF in that account/region.
