# AWS Business Associate Addendum (BAA): acceptance and runtime status record

**Record date:** 2026-08-11
**Supersedes:** `docs/legal/AWS_BAA_ACCEPTED.md` (`DOC-286318ff28`, attested 2026-08-04 at
sha256 `376b1e18ce5297a8d9c23257850c1b028805d502090167b2a7b0c440941da2b9`)

The predecessor is superseded, not void. Its bytes, filename, location, and attestation are frozen
and unmodified; this record does not edit it. It remains the accurate account of what was known and
signed on 2026-08-04. This record replaces it as the current statement because several of its
runtime-status claims stopped being true within an hour of the attestation that pinned them.

**Live evidence time:** all Cloud Run and AWS observations in this record were gathered on
**2026-08-11 between 18:41Z and 18:47Z**. Runtime status is a property of deployed configuration and
can change with the next deploy, so every live claim below is bound to that timestamp rather than
stated as a standing condition.

---

## 1. Acceptance details (unchanged from the predecessor)

**Date accepted:** February 7, 2026
**AWS account:** LingoLinq (2390-4478-5114)
**Status:** ACTIVE

> **Accepted agreement**
> 'AWS Business Associate Addendum' was set to 'active'.

Nothing in this record changes the acceptance itself. The BAA was accepted, is active, and is
unaffected by the runtime corrections below.

### What acceptance does and does not establish

- **BAA active.** This AWS account is designated a HIPAA Account, and AWS is legally bound as a
  Business Associate under HIPAA.
- **Necessary, not sufficient.** A signed BAA is one precondition for HIPAA compliance, not a
  compliance status in itself.
- **PHI may be processed only if** all three hold: exclusively HIPAA-eligible AWS services are used,
  the required technical safeguards (encryption, access control, logging) are in place, and the
  required administrative and physical safeguards are implemented.
- **Service restrictions apply.** Only HIPAA-eligible services may touch PHI.
- **Encryption required** for PHI in transit and at rest.

### Standing account requirements

1. **Use only HIPAA-eligible services for PHI.** S3 (encrypted), RDS (encrypted), EC2 (encrypted
   volumes). Reference list:
   https://aws.amazon.com/compliance/hipaa-eligible-services-reference/
2. **Encryption.** S3 server-side encryption (SSE-S3 or SSE-KMS), RDS encryption at rest, encrypted
   EBS volumes.
3. **Logging.** CloudTrail API logging, S3 access logging, VPC flow logs.
4. **Access controls.** Least-privilege IAM, MFA for privileged users, periodic access reviews.

### Account coverage

This BAA applies **only** to AWS account 2390-4478-5114. Any other AWS account that will process PHI
requires its own separate BAA.

---

## 2. Runtime AI on Amazon Bedrock: status as of 2026-08-11

Runtime AI model inference (word prediction, prediction seeding, board generation, eval narration)
is coded to route to **Amazon Bedrock** under this account-level BAA, replacing the earlier direct
`api.anthropic.com` route (see `docs/legal/ANTHROPIC_BAA_ACCEPTED.md`).

**Bedrock is a HIPAA-eligible AWS service** (verified against AWS's HIPAA-eligible-services
reference on 2026-07-24), **excluding the Fable and Mythos model families**. The runtime model
inventory (Claude Haiku 4.5, Claude Opus 4.7) sits on the eligible side of that exclusion. Fable and
Mythos remain barred both by policy and by the runtime model allowlist.

### 2.1 Credential mount history, fully re-verified 2026-08-11

The serving service is Cloud Run `lingolinq-web` in `us-central1`, project `lingolinq-prod`. Every
revision from `00001-2vn` through `00018-cup` was queried directly at this evidence time for all
four credential variable names that `lib/ai_client.rb` will sign Bedrock with
(`BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). The
predecessor checked a narrower set; this sweep covers all four.

| Revisions | Created | Bedrock-capable credential |
| --- | --- | --- |
| `00001-2vn` through `00012-x8z` | 2026-06-29 to 2026-08-02T20:31Z | none, on every revision |
| `00013-76w` | 2026-08-03T08:23:02Z | `BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET` |
| `00014-5rw` | 2026-08-04T06:31:46Z | **none** |
| `00015-9l9` | 2026-08-04T07:25:08Z | `BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET` |
| `00016-sl2` | 2026-08-05T18:14:14Z | `BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET` |
| `00017-n65` | 2026-08-06T23:38:30Z | `BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET` |
| `00018-cup` | 2026-08-09T23:44:53Z | `BEDROCK_AWS_KEY`, `BEDROCK_AWS_SECRET` |

**The mount history is not monotonic, and that is the central correction this record makes.**
Credentials were mounted on `00013-76w`, dropped on `00014-5rw`, and restored on `00015-9l9` fifty
three minutes later. The predecessor was attested on 2026-08-04 while `00014-5rw` served, and states
that the route is not operational and that the operative condition is "again unverifiable ... on any
future credential mount." That was accurate when written and stopped being accurate at
2026-08-04T07:25:08Z, on the same calendar day.

The practical lesson is recorded here because it will recur: a credential-presence claim about a
Cloud Run service is a claim about one revision at one instant, and a later revision can silently
reverse it. Any future statement of this kind must name the revision and the observation time, and
must be re-verified by sweeping every revision rather than by checking only the newest one.

### 2.2 Serving state at evidence time

At 2026-08-11T18:47Z, revision **`00018-cup`** (created 2026-08-09T23:44:53Z) serves **100 percent**
of traffic and mounts `BEDROCK_AWS_KEY` and `BEDROCK_AWS_SECRET` as Secret Manager references
(`secretKeyRef`), not as literals. `AWS_REGION` is set to `us-west-2`, and `BEDROCK_AWS_REGION` is
unset, so `AiClient#bedrock_region` resolves to `us-west-2`.

**What this establishes:** configuration linkage. The serving revision carries a Bedrock credential,
so `AiClient.configured?` is satisfied on that axis. Because `BEDROCK_EXPECTED_AWS_ACCOUNT` is
absent from that revision, `AiClient.account_verified?` short-circuits to `true` (see section 2.3),
so `AiClient.available?`, which is defined as `configured? && account_verified?`, reduces to
`configured?` in production today.

**What this does not establish:** that any in-app Bedrock call has succeeded in production. This
record makes no such claim, for the reasons in section 4.

### 2.3 The operative condition, and the control that now tests it

**Operative condition:** Bedrock calls must run under this BAA'd account (2390-4478-5114). A
different account would need its own BAA.

The condition was **verified on 2026-08-04** during the `00013-76w` window, and **independently
re-confirmed out of band on 2026-08-10**: `sts:GetCallerIdentity` under the production Bedrock
credential returned account **239044785114**, principal
`arn:aws:iam::239044785114:user/lingolinq-bedrock-runtime`. That is a dedicated Bedrock principal,
distinct from the shared S3 and SES pair.

The predecessor recorded that "until a deploy-time check asserts (2) automatically, the operative
condition is a documented assumption rather than a tested control." **That check now exists in
code.** PR #768 (merge commit `9470ffbd7b15980c90c53b300148a8fdd6b8a2e3`, merged to `staging`
2026-08-10) added an account assertion to `lib/ai_client.rb`: the client probes
`sts:GetCallerIdentity` under the exact credential pair it will sign Bedrock with, against an
endpoint pinned to `https://sts.<region>.amazonaws.com`, and refuses to return a client unless the
returned account equals `BEDROCK_EXPECTED_AWS_ACCOUNT`. It fails closed on mismatch, on probe error,
on a malformed expected-account value, and on a region that is not a well-formed commercial AWS
region. This is recorded in the findings register as `LL-1b0d78dbe6`, closed 2026-08-11.

**The assertion is not enforcing in production at this evidence time.** Two facts establish this
directly, without inferring which branch production runs:

1. `BEDROCK_EXPECTED_AWS_ACCOUNT` is **absent** from the environment of the serving revision
   `00018-cup`, verified 2026-08-11T18:44Z.
2. The control skips itself when that variable does not exist. `AiClient#expected_aws_account`
   returns `nil` unless `ENV.key?('BEDROCK_EXPECTED_AWS_ACCOUNT')`, and absence is deliberately
   distinguished from blank so that an empty value refuses rather than silently disabling the check.

So the operative condition is, at 2026-08-11, supported by two dated manual verifications
(2026-08-04 and 2026-08-10) and by a built and test-covered control that has not yet reached a
production process. It is no longer merely a documented assumption, and it is not yet an
automatically tested one in production. Its first production execution is expected on the next
`staging` to `main` release.

### 2.4 What Bedrock is and is not carrying today

Bedrock is the designated runtime AI path under this BAA and is covered by it whenever in use. The
HIPAA-eligible AWS services actually processing data in the ordinary course remain S3, RDS, and the
rest of the existing inventory.

### 2.5 Model-invocation logging

Bedrock model-invocation logging (optional, to CloudWatch or S3) captures prompts. For PHI it must
remain disabled, or route only to HIPAA-controlled, access-logged storage. It was **verified OFF**
in account 2390-4478-5114, region us-west-2, on **2026-07-27**.

That verification is carried forward at its original date and **could not be re-verified at this
evidence time**: `bedrock:GetModelInvocationLoggingConfiguration` is denied for the available
principal `arn:aws:iam::239044785114:user/lingolinq-app` (attempted 2026-08-11T18:46Z). The claim is
therefore as strong as it was on 2026-07-27 and no stronger. Re-verification requires a principal
holding that permission.

---

## 3. What this record corrects

Each row cites the predecessor's frozen text. The predecessor is not edited; these corrections take
effect through this successor.

| Predecessor text | Line | Status at 2026-08-11 |
| --- | --- | --- |
| "As of 2026-08-04 that route is not operational in production. No deployed revision ... currently carries a Bedrock credential" | 71-73 | **Superseded.** True on `00014-5rw`; false from `00015-9l9` (2026-08-04T07:25:08Z). Every revision created since (`00015` through `00018`) carries a Bedrock credential, and `00018-cup` serves 100 percent of traffic at this evidence time. |
| "credentials were withdrawn on revision `00014-5rw`" | 76-77 | **Incomplete.** Accurate as far as it goes, but omits the restoration 53 minutes later. |
| "It is **not in use for PHI today**" | 102 | **Unbounded.** Restated in section 2.4 as a dated observation rather than a standing condition. |
| "The condition is again unverifiable while no credential is mounted (revision `00014-5rw` onward)" | 112-113 | **Superseded.** The credential was remounted on `00015-9l9`, and the condition was verified on 2026-08-04 and re-confirmed 2026-08-10. |
| "withdrawn again on `00014-5rw` (2026-08-04T06:31:46Z)" | 135-137 | **Incomplete**, same omission. |
| "Credentials were withdrawn on `00014-5rw`, so the statement holds again from 2026-08-04T06:31:46Z onward" | 164-166 | **Superseded.** The statement holds only for the 53-minute gap, not "onward". |
| "non-functional again from `00014-5rw` (2026-08-04T06:31:46Z) onward" | 188-190 | **Superseded**, same reason. |
| "Until a deploy-time check asserts (2) automatically, the operative condition is a documented assumption rather than a tested control." | 261-262 | **Overtaken by events.** The check is built and merged to `staging` (#768) and is not yet enforcing in production. See section 2.3. |
| "Credentials were withdrawn on `00014-5rw` ... so the operative condition is again unverifiable and must be re-verified on any future credential mount." | 296-297 | **Superseded.** The future mount it anticipated occurred 53 minutes later, and the re-verification it required was performed on 2026-08-04 and again on 2026-08-10. |

### Carried forward unchanged

- **The 2026-07-27 claim stays retracted.** That attestation asserted the deployed `lingolinq-web`
  credential was verified to resolve to account 2390-4478-5114. No revision from `00001-2vn` through
  `00012-x8z` carried any Bedrock-capable credential, re-confirmed in this record's own sweep, so
  the claim was false when made. The 2026-08-04 and 2026-08-10 verifications are separate, later,
  correctly dated findings and **do not revive it**.
- **The 2026-08-02 `AiApiLog` finding.** A read-only aggregate query against the production database
  returned zero rows for the 2026-07-24 to 2026-07-30 window and zero for the table's entire history
  in that database. Its method and its four caveats stand as recorded in the predecessor, sections
  "AiApiLog verification - 2026-08-02".
- **Any direct Anthropic egress was BAA-covered** by the executed Anthropic HIPAA-Ready BAA of
  2026-07-18 (`docs/legal/ANTHROPIC_BAA_ACCEPTED.md`).
- **CI enforcement.** `scripts/ai-endpoint-guard.sh` enforces that no runtime seam constructs a
  direct `api.anthropic.com` client at HEAD.

---

## 4. Evidentiary boundaries

Stated explicitly so this record is not over-read.

1. **Configuration linkage is not call success.** Everything in section 2.2 is read from deployed
   configuration. This record does **not** claim that any in-app Bedrock call has succeeded in
   production since 2026-08-04.
2. **`AiApiLog` can under-record.** `AiApiLog.log_ai_call` rescues `ActiveRecord::ActiveRecordError`,
   so a database-side logging failure drops rows silently. A call that raised before reaching its log
   statement is also unrecorded. `lib/ai_prediction_generator.rb` does not write `AiApiLog` at all.
   A zero-row or low-row result therefore bounds *completed logged seam calls*, which is narrower
   than "no egress occurred".
3. **Vendor-side confirmation is unavailable.** CloudWatch metric confirmation of Bedrock invocations
   cannot be obtained with the credentials available: `cloudwatch:GetMetricStatistics` is denied for
   `arn:aws:iam::239044785114:user/lingolinq-app`. The same principal is denied
   `bedrock:GetModelInvocationLoggingConfiguration`.
4. **Runtime status is revision-scoped and perishable.** Section 2.2 describes `00018-cup` at
   2026-08-11T18:47Z. A deploy can change it without any change to this document, which is precisely
   how the predecessor became stale.

---

## 5. Standard for any future verification of the operative condition

Mounting a credential is not by itself evidence that the operative condition is met, because a
mounted credential can belong to a different AWS account. Re-verification requires **both**:

1. Bedrock credential environment variables are present on the **serving** revision, identified by
   revision name and observation time; and
2. `sts:GetCallerIdentity` executed under that exact credential returns account **2390-4478-5114**.

Two additions from this cycle:

3. **Sweep every revision, not the latest.** The `00014-5rw` gap would have been missed by any check
   that only inspected the newest revision, and a claim of continuity across a range is only as good
   as the weakest revision in it.
4. **Prefer the automated assertion once it reaches production.** When
   `BEDROCK_EXPECTED_AWS_ACCOUNT` is present on the serving revision, step 2 is performed by the
   application process rather than by hand, and the manual check becomes a confirmation rather than
   the control. State its behaviour precisely, because it is easy to overstate:
   - **The probe is lazy, not automatic on presence.** Setting the variable does not itself perform
     step 2. `sts:GetCallerIdentity` runs when `AiClient.account_verified?` is called, which happens
     on client construction and, in the web process, at worker boot: `config/puma.rb` calls
     `AiClient.available?` in `on_worker_boot` to move the cost off the request path, best effort,
     and it no-ops when no expected account is configured.
   - **A successful verification is memoized for the life of the process**, keyed on a fingerprint
     of the credential (access key and secret), the region, and the expected account. It is **not**
     re-probed on every client build. Changing any of those inputs forces a fresh probe. The cache
     has one other clearer, `AiClient.reset_account_verification!`, which at this record's date has
     no caller outside the test suite.
   - **A failed verification is cached too, for up to 60 seconds**, then re-probed, so one transient
     STS error does not darken AI for the life of the process and does not pin a stale failure.

   The practical consequence for evidence: the assertion proves the credential resolved correctly
   **at the time the probe ran in that process**. It is a per-process guarantee, not a per-call one.
   Until the variable reaches production, the manual standard above governs.

---

## 6. Attestation

**Attestation status:** prepared for attestation, not yet attested. This document was drafted by
Claude Code from the evidence cited above. Per the governance rule in
`audit-reports/DOCUMENT-REGISTER.json`, only Scot Wahlquist attests a compliance document, and no
attestation metadata is written until he confirms these exact bytes and their sha256.

**Scope offered for attestation:** the acceptance facts in section 1, the re-verified credential
mount history and serving state in section 2 bound to the 2026-08-11T18:41Z to 18:47Z evidence
window, the account-assertion status in section 2.3, the corrections in section 3, the evidentiary
boundaries in section 4, and the verification standard in section 5.

**Not in scope for this cycle:** redirecting inbound references that point at the predecessor path.
Attested inbound documents are redirected only in their own supersession cycles; unattested
references, capability-ledger anchors, code comments, and findings-register entries are handled
separately and are tracked in the follow-through plan for this work.
