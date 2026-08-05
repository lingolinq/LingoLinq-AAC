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

**As of 2026-08-04 that route is not operational in production.** No deployed revision of the Cloud
Run service `lingolinq-web` currently carries a Bedrock credential, so `AiClient.configured?` is
false and no runtime AI seam can egress.

**Operational window, recorded 2026-08-04.** The route was operational once. Revision `00013-76w`
(created 2026-08-03T08:23:02Z) mounted `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET`; credentials were
withdrawn on revision `00014-5rw` (created 2026-08-04T06:31:46Z). Revisions `00011-l7f` and
`00012-x8z` carried no Bedrock credential, confirming the route was not operational before
2026-08-03. Exactly one logged seam call completed in the window: an internal verification call at
2026-08-04T05:44:42Z (`request_type: word_prediction`, no user attached, no user or student data in
the payload), the first and only row written to `AiApiLog`. During the window,
`sts:GetCallerIdentity` under the mounted credential returned account **239044785114**, principal
`arn:aws:iam::239044785114:user/lingolinq-bedrock-runtime` -- a dedicated Bedrock principal, not the
shared S3/SES pair. This satisfies **both halves** of the verification standard defined in this
document (a mounted credential *and* a caller-identity confirmation), and is the first time that
standard has been met. It does not retroactively validate the retracted 2026-07-27 claim, which was
false when made. See the 2026-08-01 correction below, as re-corrected 2026-08-04.

**Scope of the `AiApiLog` evidence.** `AiApiLog` is written by three logged runtime seams
(`lib/ai_word_predictor.rb`, `lib/ai_board_generator.rb`, `lib/eval_narrator.rb`). A zero-row or
single-row result therefore establishes that **no other logged seam call completed**, which is
narrower than "no data egressed." It does not cover `lib/ai_prediction_generator.rb` (unlogged), a
cache hit that returns before the log write, a request whose instance terminates after the HTTP call
but before the post-response write, or non-model third-party egress paths (Google TTS / Translate /
Places, OpenSymbols). Those are governed separately and are not in scope for this record.

- **Amazon Bedrock is a HIPAA-eligible AWS service** (verified against AWS's HIPAA-eligible-services
  reference, 2026-07-24), **excluding the Fable and Mythos models**. The runtime inventory (Claude
  Haiku 4.5, Claude Opus 4.7) is on the eligible side of that exclusion; Fable/Mythos remain barred
  by policy and by the runtime model allowlist.
- **Amazon Bedrock is the designated runtime AI path under this BAA**, and is covered by it once in
  use. It is **not in use for PHI today** (see the correction below); the HIPAA-eligible services
  actually processing data remain S3, RDS, and the rest of the existing inventory.
- **Operative condition:** Bedrock calls must run under this BAA'd account (2390-4478-5114). A
  different account would need its own BAA. This condition was **UNVERIFIED from the 2026-07-27
  attestation through the 2026-08-01 evidence gather**, and was unverifiable in that period because
  no Bedrock call could be made from production. It became verifiable when a Bedrock credential was
  first mounted on revision `00013-76w` (2026-08-03T08:23:02Z), and **was verified on 2026-08-04**:
  `sts:GetCallerIdentity` under the mounted credential returned account 239044785114, principal
  `user/lingolinq-bedrock-runtime`. See the operational-window section above. The prior
  "Verified 2026-07-27" statement here remains retracted: it was false when made, and the later
  2026-08-04 verification does not revive it. The condition is again unverifiable while no
  credential is mounted (revision `00014-5rw` onward) and must be re-verified on any future mount.
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
Bedrock invoke permission. None of those four Bedrock-capable variable names was present on any
revision of `lingolinq-web` from `00001-2vn` (2026-06-29) through `00012-x8z` (2026-08-02T20:31Z),
which is the range this correction covers. `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET` were first
mounted on `00013-76w` (2026-08-03T08:23:02Z) and withdrawn again on `00014-5rw`
(2026-08-04T06:31:46Z); see the operational-window section above.

**Evidence (gathered 2026-08-01).**

| Check | Result |
| --- | --- |
| Bedrock credential env vars on the serving revision `lingolinq-web-00011-l7f` (deployed 2026-07-30) | none |
| Bedrock credential env vars across all 11 revisions, `00001-2vn` (2026-06-29) through `00011-l7f` | none, on every revision |
| Serving revision on 2026-07-27, `lingolinq-web-00010-95c` | none |
| AWS-related env vars actually present on the serving revision | `AWS_KEY`, `AWS_SECRET`, `AWS_REGION`, plus the retired `ANTHROPIC_API_KEY` |
| `BEDROCK_AWS_KEY` / `BEDROCK_AWS_SECRET` in `.github/workflows/deploy-cloudrun.yml` on `staging` as of this 2026-08-01 evidence gather (pre-#719) | absent |

The claim was therefore not true at any point in the period it covered: from the 2026-07-27
attestation through the 2026-08-01 evidence gather, spanning revisions `00001-2vn` to `00011-l7f`.
It is not a case of a control that held when attested and later regressed. It is also not
contradicted by the 2026-08-03 credential mount recorded above: that mount occurred six days after
the attestation and cannot make a 2026-07-27 statement retroactively true.

**Effect on PHI.** Stated precisely, because an earlier draft of this correction overreached here,
and the overreach is instructive: it inferred runtime behaviour from deployment configuration, which
is the same error the 2026-07-27 claim above made.

- **Bedrock egress did not occur on any revision through `00012-x8z` (2026-08-02T20:31Z).** Verified
  by the evidence table above: no `lingolinq-web` revision up to and including `00012-x8z` carried a
  Bedrock credential, so `AiClient.configured?` was false and `AiClient.build` returned nil
  throughout that period. **This changed on 2026-08-03.** Revision `00013-76w` mounted the
  credentials and one logged seam call completed on 2026-08-04 (an internal verification call
  carrying no user or student data). Credentials were withdrawn on `00014-5rw`, so the statement
  holds again from 2026-08-04T06:31:46Z onward. It does **not** hold for the window in between, and
  must not be quoted as an unbounded claim.
- **Direct `api.anthropic.com` egress was possible until 2026-07-30.** The Bedrock routing change
  (commit `abd6d8c8c`, PR #681) merged 2026-07-27 11:45 MDT, but the revision serving production
  from 2026-07-24T23:21Z was `lingolinq-web-00010-95c`, whose image predates that commit by three
  days. It therefore ran pre-#681 code, which constructed a direct client
  (`::Anthropic::Client.new(api_key: ENV['ANTHROPIC_API_KEY'])`, `lib/eval_narrator.rb:237` at
  `abd6d8c8c^`), and `ANTHROPIC_API_KEY` is mounted on that revision. The first revision running
  Bedrock code is `00011-l7f`, deployed 2026-07-30T16:37Z, and it carries no Bedrock credential.
  Runtime AI therefore became non-functional on **2026-07-30**, not 2026-07-24.
- **Whether direct calls actually occurred is not answerable from deployment configuration.** It
  required a production query of `AiApiLog` by `ai_provider` and `created_at` across 2026-07-24 to
  2026-07-30. **That query was run 2026-08-02 and returned zero rows.** Detail, caveats, and method
  are in the "AiApiLog verification" subsection below.
- **Any such egress was BAA-covered.** The direct Anthropic path is covered by the executed
  Anthropic HIPAA-Ready BAA of 2026-07-18 (`docs/legal/ANTHROPIC_BAA_ACCEPTED.md`), so this is not
  an uncovered disclosure even if the log shows calls.

`scripts/ai-endpoint-guard.sh` enforces in CI that no runtime seam constructs a direct
`api.anthropic.com` client at HEAD, and all four seams gate on `AiClient.configured?`
(`lib/ai_word_predictor.rb:165`, `lib/ai_prediction_generator.rb:111`,
`lib/ai_board_generator.rb:532`, `lib/eval_narrator.rb:330`) with no bypass.

**Operational consequence.** Board generation, word prediction, prediction seeding, and eval
narration were non-functional in production from `00011-l7f` (2026-07-30T16:37Z) through
`00012-x8z`, and are non-functional again from `00014-5rw` (2026-08-04T06:31:46Z) onward.

For the single window on `00013-76w` (2026-08-03T08:23Z to 2026-08-04T06:31Z), stated narrowly to
what was actually verified rather than inferred:

- **Verified:** the Bedrock-backed path was configured (`AiClient.configured?` true), and **one
  word-prediction call completed** at 2026-08-04T05:44:42Z, an internal verification call carrying
  no user or student data.
- **Not exercised:** board generation and prediction seeding. Both resolve to
  `anthropic.claude-haiku-4-5`, the one alias mapped on the classic plane, so both were reachable,
  but no call was made and none is recorded in `AiApiLog`. "Reachable" is a configuration
  statement, not an observation.
- **Remained unavailable:** eval narration. Its default model `anthropic.claude-opus-4-7` has no
  classic-plane inference profile and the account is not entitled to the mantle plane, so it stayed
  on its deterministic template fallback (`lib/eval_narrator.rb:243-249`) throughout the window.

### AiApiLog verification - 2026-08-02

The open question left by the correction above, whether direct `api.anthropic.com` calls actually
occurred while revision `00010-95c` served (2026-07-24T23:21Z to 2026-07-30T16:37Z), was resolved by
querying the production database.

**Result: zero `AiApiLog` rows in the window, and zero in the table's entire history in this
database.**

**Method.** A read-only aggregate query executed inside the production VPC via a one-off Cloud Run
job execution against `lingolinq-prod-pg` (the database is private-IP only, so no external client can
reach it). Aggregates and counts only: `ai_provider`, `ai_model`, `request_type`, `success`,
`created_at`. No prompt content, no `request_summary` / `response_summary`, no `pii_findings`, no
identifiers or IP addresses were selected or returned. The job definition was not modified; the query
ran as a per-execution argument override.

**Why zero is meaningful here rather than merely absent.** A null result only carries weight if the
logging path existed and the database was live. Both were confirmed:

| Control question | Finding |
| --- | --- |
| Did the window-era code log these calls? | Yes. At `abd6d8c8c^`, the code `00010-95c` was built from, all three user-facing seams carry `AiApiLog` instrumentation: `ai_word_predictor.rb`, `ai_board_generator.rb`, `eval_narrator.rb`, at the same reference counts as HEAD. |
| Was the database live and accepting writes across the window? | Yes. 31 users, 2,105 boards, 5,518 log sessions, with the most recent `LogSession` written 2026-07-31 09:28 UTC, spanning and outlasting the window. |
| Did the table exist? | Yes, `ai_api_logs` present. |

So the database was actively written throughout the window, the table existed, and the deployed code
logged every user-facing AI call. Zero rows is therefore positive evidence that no word-prediction,
board-generation, or eval-narration call completed in production during that period.

**Caveats, stated so this is not over-read.**

1. `AiApiLog.log_ai_call` rescues `ActiveRecord::ActiveRecordError`, so a persistent database-side
   logging failure would drop rows silently. Other tables were demonstrably accepting writes, which
   makes a systematic silent failure unlikely, but it cannot be excluded from this evidence alone.
2. A call that raised before reaching its log statement would not be recorded. The claim this
   supports is therefore about calls that **completed**, which is the relevant question for whether
   data reached the provider.
3. The all-time zero reflects this database only. Production cut over to GCP on 2026-07-22 and
   pre-cutover `AiApiLog` history, if any, remained on Render and appears not to have been migrated.
   The window is entirely post-cutover, so this does not weaken the window finding.
4. `lib/ai_prediction_generator.rb` does not write `AiApiLog`. It is an offline batch tool that sends
   static word lists and no user content, so it is out of scope for a PHI-egress question.

**Effect on the retraction above.** The fourth bullet, that any such egress would have been covered
by the Anthropic HIPAA-Ready BAA of 2026-07-18, is unchanged and remains the correct fallback
position. This finding narrows the question rather than replacing that coverage: the evidence now
indicates there was no completed runtime model egress to answer for in that window.

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
  us-west-2)." Not verifiable at any point in the period it covered (2026-07-27 through the
  2026-08-01 evidence gather, revisions `00001-2vn` to `00011-l7f`), because no Bedrock credential
  was deployed then. The equivalent condition was first verified on 2026-08-04, during the
  `00013-76w` window; that is a separate, later finding and does not un-retract this one. See the
  correction above.
- **Stands:** Bedrock model-invocation logging is OFF in account 2390-4478-5114, region us-west-2,
  verified 2026-07-27. That check was performed in the AWS account, independently of the
  deployment, and is unaffected by this correction.

**Re-attestation status.** The correction below the 2026-08-01 heading was prepared by Claude Code
from the evidence above and is **not** an attestation; per the governance rule in
`audit-reports/DOCUMENT-REGISTER.json`, only Scot Wahlquist changes a document's attestation.

**Discharged 2026-08-04.** Scot Wahlquist re-attested this document on 2026-08-04, so its
attestation is no longer open. Two things the earlier text made conditional have since happened, and
they are recorded rather than pending:

- Bedrock became operational on `00013-76w` (2026-08-03T08:23:02Z), and both verification steps
  passed on 2026-08-04: a Bedrock credential was mounted on the serving revision, and
  `sts:GetCallerIdentity` under it returned account 239044785114, principal
  `user/lingolinq-bedrock-runtime`.
- The retracted 2026-07-27 operative-condition claim **stays retracted**. It was false when made,
  and the 2026-08-04 verification is a separate, later, correctly-dated finding that does not revive
  it.

Credentials were withdrawn on `00014-5rw` (2026-08-04T06:31:46Z), so the operative condition is
again unverifiable and must be re-verified on any future credential mount.
