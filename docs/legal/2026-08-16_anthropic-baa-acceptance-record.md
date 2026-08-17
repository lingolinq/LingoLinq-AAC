# Anthropic HIPAA-Ready BAA: acceptance and runtime status record

**Record date:** 2026-08-16
**Supersedes:** `docs/legal/ANTHROPIC_BAA_ACCEPTED.md` (`DOC-ab3a8c3ed4`, attested 2026-08-04 at
sha256 `bb1ff239ec4cb2f2e1c38a2180c9b3a305417c29b7e9efad3e9a3c0959e455e0`).

The predecessor is superseded, not void. Its bytes, filename, location, and attestation are frozen
and unmodified; this record does not edit it. It remains the accurate account of what the Anthropic
BAA covers and, on its own date, of what its author believed about runtime status. This record
replaces it as the current statement.

**Live evidence time:** the **current-state** Cloud Run observations in this record, meaning the
seven-revision credential sweep in section 2.2, the serving-revision state in section 2.3, and the
environment-variable observation in section 2.4, were gathered on **2026-08-16**. Runtime status is a
property of deployed configuration and can change with the next deploy, so every current-state claim
below is bound to that date rather than stated as a standing condition. The git-history observations
in section 3.1 were made on 2026-08-16 against this repository. Observations carried forward from
earlier work keep their own dates (2026-07-18, 2026-07-19, 2026-07-27, 2026-08-04, 2026-08-10, and
2026-08-12) and are labelled with them where they appear; this record does not restate any of them as
freshly verified.

---

## 1. Acceptance details and coverage (unchanged, carried forward)

Nothing in this record changes the BAA, the coverage scope, or the seam classifications. They are
restated here so this record stands alone, and they are carried forward at their original dates, not
re-verified at this record's evidence time.

**Date:** BAA executed and HIPAA readiness enabled on the org 2026-07-18
**BAA document version:** Anthropic Business Associate Agreement, 2026-05-06 revision
**Anthropic API Organization:** LingoLinq, LLC (the runtime-dedicated API org)
**Accepted / enabled by:** Scot Wahlquist (Anthropic Console)
**Status:** ACTIVE. HIPAA readiness enabled on the organization, verified live 2026-07-18.

### 1.1 What the BAA covers

This is the **model-provider BAA for the direct Anthropic runtime AI egress path**. It is distinct
from, and does not overlap with, the two infrastructure BAAs on file: the AWS account BAA (current
record: `docs/legal/2026-08-12_aws-baa-acceptance-record.md`) and the GCP infrastructure BAA
(`docs/legal/GCP_BAA_ACCEPTED.md`). Each provider's BAA covers only that provider.

Under Anthropic's HIPAA-Ready offering, once a BAA is signed and HIPAA readiness is enabled on the
organization, PHI **may** be transmitted to Anthropic through the HIPAA-eligible API surface. A
signed BAA is **necessary but not sufficient** for HIPAA compliance, mirroring the AWS and GCP
posture.

Coverage scope, verified against Anthropic's live documentation on 2026-07-18 and carried forward at
that date:

- HIPAA readiness covers supported Claude API features with a signed BAA and a HIPAA-enabled
  organization. It does **not** require Zero Data Retention. The `/v1/messages` Messages API endpoint
  is HIPAA-eligible.
- **In-scope models:** Claude Haiku 4.5 and Claude Opus 4.7, the runtime inventory, plus Claude
  Sonnet if added later. Fable 5 and Mythos 5 are ZDR-excluded Covered Models and are never permitted
  on this runtime path.
- **HIPAA readiness is per-organization and irreversible.** Once enabled it cannot be turned off, and
  it blocks non-eligible features org-wide with an HTTP 400.
- **Not covered, and must never carry PHI:** Files API, Batch API, Skills API, Code Execution,
  Computer Use, Web Fetch, and the MCP connector.
- **Claude Code, the Workbench, and the Console are not covered.** They are dev tooling, excluded
  from the runtime PHI path.

Executed agreement PDFs are stored out of repo in the Google Drive "Compliance Audits" folder of the
`500_Customer Success` shared drive, alongside the AWS and GCP BAA records.

### 1.2 Live enablement verification (2026-07-18, carried forward)

Performed against the runtime `ANTHROPIC_API_KEY`, key value never logged: `POST /v1/messages` on
Haiku 4.5 returned **HTTP 200**, and `GET /v1/files` returned **HTTP 400** with the HIPAA-regulated
organization error. The 400 on a non-eligible feature is positive proof that the runtime key sits on
a HIPAA-regulated organization with org-wide enforcement active. That verification is carried forward
at its own date and was not re-performed for this record.

### 1.3 Runtime key and org boundary (unchanged)

The runtime `ANTHROPIC_API_KEY` belongs to the **LingoLinq, LLC** Anthropic API org, dedicated to
in-app runtime inference and provisioned separately from the dev-tooling Claude keys. Because HIPAA
readiness is irreversible, this org must remain runtime-dedicated. This BAA applies to that
organization only; any other Anthropic org that processes PHI requires its own BAA and readiness
enablement.

### 1.4 Runtime seam classification (unchanged, adjudicated 2026-07-19)

All four runtime seams (word prediction, prediction seeding, board generation, eval narration) are
ordinary in-scope uses or carry no PHI.

**Eval narration (`lib/eval_narrator.rb`) is not a HIPAA "Healthcare Activity"**, adjudicated by Scot
Wahlquist on 2026-07-19. The LingoLinq eval is an assistive-technology access and feature-match
assessment: the AAC user completes find-the-target tasks at progressively smaller grid sizes,
producing a hit/miss heat map that shows which areas of a board they can physically and visually
access, which yields a recommended board size and layout. The AI narrative summarizes those access
findings. It does not diagnose, treat, or produce medical charting, billing, coding, or claims, so
Anthropic's Healthcare-Activity condition (iii), restricting use to licensed clinicians, does not
apply, and there is intentionally no licensed-clinician gate on this path.

Controls that do apply to eval narration and are enforced: Messages-API-only transport on the
HIPAA-Ready org key; PII scrub, structural student-name drop, and `etiology` minimization before
egress; the `EVAL_NARRATOR_MODEL` boot and call-time allowlist refusing Covered Models; the COPPA
parental-consent gate; explicit per-request opt-in; and the org-level AI opt-out. Eval narration
defaults to a deterministic no-egress local template unless the caller explicitly opts in.

**Residual item, tracked and not a blocker:** free-typed third-party names in `slp_notes` are not
NER-scrubbed.

**That control list is dated to the direct Anthropic path and is carried forward as adjudicated, not
as a current-state description of transport.** It was written when runtime seams called
`api.anthropic.com` directly, so its "Messages-API-only transport on the HIPAA-Ready org key" element
describes the pre-migration posture. Current runtime transport is Bedrock under the AWS account BAA,
as section 2 states, and runtime seams no longer read `ANTHROPIC_API_KEY` at all. This record does
not restate which transport-layer controls apply on the Bedrock path; for that, section 2 and
`docs/legal/2026-08-12_aws-baa-acceptance-record.md` govern. The non-transport elements of the list
(PII scrub, structural student-name drop, `etiology` minimization, the model allowlist, the COPPA
parental-consent gate, per-request opt-in, the org-level AI opt-out, and the no-egress default) are
properties of the seam rather than of the route.

The classification is recorded at the call site and in `audit-reports/FINDINGS.json`. If eval
narration is ever repositioned as diagnosis, treatment, or auto-finalized clinical documentation, the
classification must be reopened with Scot before PHI flows under that use.

**This classification is unaffected by everything in section 2.** Where the seams route does not
change what they are. That is a separate point from the one above: the routing move does not disturb
the Healthcare-Activity adjudication, while it does date the transport element of the control list.

---

## 2. Runtime routing and credential state as of 2026-08-16

### 2.1 The route (unchanged)

Runtime AI routing moved from the direct `api.anthropic.com` endpoint to **Claude on AWS Bedrock**,
constructed in `lib/ai_client.rb`. The default and only usable plane is classic `bedrock-runtime`;
the account is not entitled to the mantle plane. All four seams are coded to route through Bedrock on
the same in-scope models.

**This executed Anthropic HIPAA-Ready BAA remains valid and on file.** It is not the active runtime
route; it documents a still-available, BAA-covered direct path. Runtime seams no longer read
`ANTHROPIC_API_KEY` or construct a direct Anthropic client, enforced by
`scripts/ai-endpoint-guard.sh` in CI.

**The designated runtime route is covered by the AWS account BAA**, whose current record is
`docs/legal/2026-08-12_aws-baa-acceptance-record.md`. Amazon Bedrock is a HIPAA-eligible AWS service
excluding the Fable and Mythos model families, so Anthropic-model inference on Bedrock stays inside
AWS's HIPAA boundary, and the runtime models sit on the eligible side of that exclusion. Operative
condition: Bedrock calls must run under the BAA'd AWS account (2390-4478-5114).

### 2.2 Credential mount history, swept 2026-08-16

The serving service is Cloud Run `lingolinq-web` in `us-central1`, project `lingolinq-prod`. Every
revision from `00013-76w` forward was queried at this evidence time for the Bedrock-capable
credential variables `BEDROCK_AWS_KEY` and `BEDROCK_AWS_SECRET`.

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, the fallback pair that `AiClient#aws_credentials`
accepts when the dedicated pair is absent, were also checked at this evidence time and are **absent
from every revision in this range**, so the table below is a complete account of Bedrock capability
and not merely of the dedicated pair. Two adjacent variables must not be mistaken for that fallback:
`AWS_KEY` and `AWS_SECRET` are present on every revision, including `00014-5rw`, but they are the
S3 and SES pair and are **not** read by `AiClient#aws_credentials`. That exclusion is deliberate.
The code comment above the method records that those credentials lack Bedrock invoke permissions,
and that falling back to them previously made `configured?` true while every AI request returned
AccessDenied. Their presence on `00014-5rw` therefore does not make that revision Bedrock-capable.

| Revision | Created (UTC) | Bedrock-capable credential |
| --- | --- | --- |
| `00013-76w` | 2026-08-03T08:23:02Z | present |
| `00014-5rw` | 2026-08-04T06:31:46Z | **absent** |
| `00015-9l9` | 2026-08-04T07:25:08Z | present |
| `00016-sl2` | 2026-08-05T18:14:14Z | present |
| `00017-n65` | 2026-08-06T23:38:30Z | present |
| `00018-cup` | 2026-08-09T23:44:53Z | present |
| `00020-per` | 2026-08-12T23:31:08Z | present |

Revisions `00001-2vn` through `00012-x8z` carried no Bedrock-capable credential on any revision; that
finding is carried forward from the 2026-08-12 AWS record's full eighteen-revision sweep and was not
re-swept here. **There is no revision numbered `00019`.** A gap in Cloud Run revision numbering
follows from a failed or aborted deploy attempt and is not evidence of a removed or hidden revision.

**Credentials have been mounted continuously from `00015-9l9` (2026-08-04T07:25:08Z) through the
serving revision at this evidence time.** The sole gap in the entire history since first mount is the
fifty-three minute `00014-5rw` window, from 2026-08-04T06:31:46Z to 2026-08-04T07:25:08Z.

### 2.3 Serving state at evidence time

At the 2026-08-16 evidence time, revision **`00020-per`** (created 2026-08-12T23:31:08Z) serves
**100 percent** of traffic, per `gcloud run services describe` `status.traffic`. It mounts
`BEDROCK_AWS_KEY` and `BEDROCK_AWS_SECRET` as Secret Manager references (`secretKeyRef`), not as
literals, and sets `AWS_REGION`.

**What this establishes:** configuration linkage. The serving revision carries a Bedrock credential,
so `AiClient.configured?` is satisfied on that axis.

**What this does not establish:** that any in-app Bedrock call has succeeded in production. This
record makes no such claim, for the reasons in section 4.

### 2.4 `BEDROCK_EXPECTED_AWS_ACCOUNT` is now present, and what that does not settle

The 2026-08-12 AWS record found `BEDROCK_EXPECTED_AWS_ACCOUNT` **absent from every revision** through
`00018-cup`, and concluded on that basis that the account-assertion control added by PR #768 was
built and merged but not enforcing in production.

**That specific condition has changed.** At the 2026-08-16 evidence time, the serving revision
`00020-per` carries `BEDROCK_EXPECTED_AWS_ACCOUNT=239044785114` alongside the credential pair and
`AWS_REGION`.

**What this record claims:** the environment variable is present on the serving revision, observed
2026-08-16. That is the whole of the new observation.

**What this record does not claim, and why:** that the account assertion is now actively enforcing in
production. Three separate things would have to hold, and none was independently verified in this
evidence pass.

1. **The serving revision's image would have to contain the control.** PR #768 merged to `staging`;
   this pass did not verify which code revision the `00020-per` image was built from, so it does not
   assert that the deployed process contains `AiClient#account_verified?` at all.
2. **The probe is lazy, not automatic on presence.** As the 2026-08-12 AWS record documents in its
   section 5 point 4, setting the variable does not itself perform `sts:GetCallerIdentity`. The probe
   runs when `AiClient.account_verified?` is called, a successful result is memoized for the life of
   the process keyed on a credential, region, and expected-account fingerprint, and a failed result
   is cached for up to sixty seconds. Presence of the variable is therefore a precondition for the
   control to run, not evidence that it ran.
3. **No probe was executed for this record.** `sts:GetCallerIdentity` was not re-run in this evidence
   pass, and no application-side log or metric confirming a successful verification was obtained.

The accurate statement is therefore narrow: **the variable's presence changed, so the
"not yet enforcing in production" condition described in the 2026-08-12 AWS record may no longer
hold; whether the control is actively enforcing was not independently re-verified here.** Confirming
enforcement requires establishing point 1 and observing a successful verification, and until that is
done the operative condition rests on the two dated manual verifications carried forward in section
3.3, not on this variable.

`docs/legal/2026-08-12_aws-baa-acceptance-record.md` remains the current authority on the AWS-side
control, its behaviour, and the standard for verifying the operative condition. This record adds one
dated observation to that picture and does not restate or re-derive it.

---

## 3. What this record corrects

The predecessor is not edited; these corrections take effect through this successor.

### 3.1 Two false claims, with different origins

**Terminology.** "Operational" is used in this section as the predecessor used it, meaning a
Bedrock-capable credential is mounted so that `AiClient.configured?` is true. It does not mean that a
call succeeded; see section 4 point 1.

The predecessor's final section contains two separate false statements, which have different
histories and should not be treated as one defect:

- **Sentence A**, that the Bedrock runtime path "is **not operational as of 2026-08-04**"
  (lines 155-158).
- **Sentence B**, that credentials "were withdrawn on `00014-5rw`, so the condition is again
  unverifiable and must be re-verified on any future mount" (lines 174-175).

Credentials were restored on revision `00015-9l9` at **2026-08-04T07:25:08Z**. The git history of
this repository, examined 2026-08-16, dates each sentence against that restoration. Each
first-appearance row was established by inspecting the file at that commit, not by reading a diff
summary.

| Event | Timestamp (UTC) | Relative to restoration |
| --- | --- | --- |
| Credentials withdrawn, `00014-5rw` created | 2026-08-04T06:31:46Z | 53m 22s before |
| **Sentence A** first entered the file, commit `2624186d` | 2026-08-04T07:09:39Z | 15m 29s before |
| **Credentials restored, `00015-9l9` created** | **2026-08-04T07:25:08Z** | **restoration** |
| Commit `493c42c7`: sentence A present, **sentence B still absent** | 2026-08-04T16:59:01Z | 9h 33m 53s after |
| The attested bytes were committed, `8340e88`, and **sentence B first entered the file in that same commit** | 2026-08-04T17:11:06Z | **9h 45m 58s after** |
| The attested hash was pinned into the register, commit `cfc3195f` | 2026-08-04T21:00:50Z | **13h 35m 42s after** |

The bytes of `8340e88` hash to `bb1ff239ec4cb2f2e1c38a2180c9b3a305417c29b7e9efad3e9a3c0959e455e0`,
which is the hash pinned in the register, so the attested bytes are that commit's exactly.

Three distinct findings follow, and they should not be collapsed:

1. **Sentence A was true for about fifteen minutes when first written.** At 2026-08-04T07:09:39Z
   revision `00014-5rw` served 100 percent of traffic and carried no Bedrock-capable credential, so
   the claim was accurate at that instant. This was not a fabricated statement. The serving state is
   read from the Cloud Run admin audit log rather than inferred from the revision being newest: the
   `ReplaceService` completion entry at **2026-08-04T06:32:37.424552Z** records
   `status.traffic` as a single entry, `lingolinq-web-00014-5rw` at 100 percent. The next
   service-level audit event in that window is the `ReplaceService` request at 07:25:08.408901Z whose
   completion entry at 07:25:40.522209Z moves traffic to `00015-9l9`. Those four entries are the only
   service-level events between 06:31:00Z and 07:30:00Z, so the traffic split was unchanged across
   the whole interval containing 07:09:39Z.
2. **The bytes that were attested restated sentence A while it was false.** The 9h46m and 13h36m gaps
   mean it was untrue both when the attested bytes were committed and when the hash was pinned, and
   the bytes never mention the restoration. That defect is a perishable, instant-scoped observation
   carried forward into a signed record without re-checking.
3. **Sentence B is a more serious defect: it was authored already false.** It does not exist in the
   file at `2624186d` (07:09:39Z) or at `493c42c7` (16:59:01Z); it appears for the first time as new
   text in `8340e88` itself, at 2026-08-04T17:11:06Z, which is 9h45m58s **after** the restoration it
   says had not happened. There is no instant at which sentence B was true. It was false at
   authorship, false when attested, false when pinned, and remained uncorrected until this record.
   This is not staleness. A claim about a condition being "again unverifiable ... on any future
   mount" was written nearly ten hours after that future mount had already occurred, without the
   mount being checked.

The practical lesson is finding 3's, not finding 2's: re-checking a carried-forward claim is
necessary but not sufficient, because a claim newly authored during a correction pass gets no such
scrutiny at all. New assertions added while correcting a document need the same evidence
verification as the ones being corrected.

### 3.2 Corrections by line

Each row cites the predecessor's frozen text by line number as it stands in
`docs/legal/ANTHROPIC_BAA_ACCEPTED.md`.

| Predecessor text | Line | Status at 2026-08-16 |
| --- | --- | --- |
| "the Bedrock path was operational only from 2026-08-03T08:23Z to 2026-08-04T06:31Z (revision `00013-76w`) ... and is **not operational as of 2026-08-04**" (sentence A) | 155-158 | **Superseded as to credentials.** The credential withdrawal it describes was reversed: credentials were restored on `00015-9l9` at 2026-08-04T07:25:08Z, every revision created since carries them, and `00020-per` serves 100 percent of traffic at this record's evidence time. This corrects credential presence only and asserts nothing about whether any call occurred after 2026-08-04T06:31Z. |
| "credentials were withdrawn on `00014-5rw`, so the condition is again unverifiable and must be re-verified on any future mount" (sentence B) | 174-175 | **Superseded, and false when authored** (section 3.1, finding 3). The future mount it anticipated had already occurred fifty-three minutes after the withdrawal, and nine and three quarter hours before this sentence was written. The re-verification it required was performed on **2026-08-10** (carried forward in section 3.3). The 2026-08-04 verification does **not** satisfy it: that check ran during the `00013-76w` window, before `00014-5rw` was created, so it predates the withdrawal and cannot be a re-verification of a mount that followed it. |
| "See the correction bullet below and the 2026-08-04 operational-status correction in `docs/legal/AWS_BAA_ACCEPTED.md`" | 158-159 | **Stale pointer.** That record is superseded twice over. The current authority is `docs/legal/2026-08-12_aws-baa-acceptance-record.md`. |
| "**The designated runtime route is covered by the AWS account BAA** (`docs/legal/AWS_BAA_ACCEPTED.md`)" | 165 | **Correct in substance, stale pointer.** The route is covered by the AWS account BAA; the current record of that BAA is the 2026-08-12 one. |
| "See `docs/legal/AWS_BAA_ACCEPTED.md` for the evidence and the operational window" | 190 | **Stale pointer**, same redirect. The operational window it points to is itself corrected by the 2026-08-12 record. |
| "`AWS_BAA_ACCEPTED.md` - AWS infrastructure (S3, RDS, etc.)" | 17 | **Stale pointer only.** The statement that the AWS BAA covers AWS infrastructure is unchanged and correct; only the path is out of date. |

### 3.3 Carried forward unchanged

- **The operative condition was verified on 2026-08-04 and re-confirmed on 2026-08-10.**
  `sts:GetCallerIdentity` under the production Bedrock credential returned account **239044785114**,
  principal `arn:aws:iam::239044785114:user/lingolinq-bedrock-runtime`. Both are carried forward at
  their own dates from the 2026-08-12 AWS record and were not re-performed here. Their order matters
  for the correction in section 3.2: the 2026-08-04 check ran during the `00013-76w` window, so only
  the 2026-08-10 re-confirmation post-dates the `00015-9l9` mount.
- **The 2026-07-27 verification claim stays retracted.** No `lingolinq-web` revision from
  `00001-2vn` through `00012-x8z` carried a Bedrock-capable credential, so `AiClient.configured?` was
  false and no Bedrock call could be made. The 2026-08-04 and 2026-08-10 verifications are separate,
  later, correctly dated findings and do not revive it. The predecessor's statement of this
  retraction (lines 169-173) is correct and is carried forward.
- **The plane correction is correct.** The usable plane is classic `bedrock-runtime`, not mantle.
- **The seam classifications are unchanged**, including eval narration not being a HIPAA Healthcare
  Activity (Scot, 2026-07-19). A routing change does not disturb them.
- **The direct Anthropic path remains BAA-covered.** Any direct Anthropic egress was and would be
  covered by the executed HIPAA-Ready BAA of 2026-07-18 recorded here.
- **CI enforcement.** `scripts/ai-endpoint-guard.sh` enforces that no runtime seam constructs a
  direct `api.anthropic.com` client at HEAD.

---

## 4. Evidentiary boundaries

Stated explicitly so this record is not over-read.

1. **Configuration linkage is not call success.** Everything in sections 2.2 through 2.4 is read from
   deployed configuration. This record does **not** claim that any in-app Bedrock call has succeeded
   in production, and no such claim should be inferred from a mounted credential.
2. **`AiApiLog` can under-record.** `AiApiLog.log_ai_call` rescues `ActiveRecord::ActiveRecordError`,
   so a database-side logging failure drops rows silently, and a call that raised before reaching its
   log statement is unrecorded. A zero-row or low-row result bounds *completed logged seam calls*,
   which is narrower than "no egress occurred".
3. **Vendor-side confirmation is unavailable.** CloudWatch metric confirmation of Bedrock invocations
   cannot be obtained with the credentials available; `cloudwatch:GetMetricStatistics` is denied for
   `arn:aws:iam::239044785114:user/lingolinq-app`, as recorded in the 2026-08-12 AWS record.
4. **Runtime status is revision-scoped and perishable.** Section 2.3 describes `00020-per` at the
   2026-08-16 evidence time. A deploy can change it without any change to this document, which is
   precisely how the predecessor's sentence A became false within sixteen minutes of being written.
5. **Presence of an environment variable is not proof of an enforced control.** See section 2.4. This
   is stated as its own boundary because it is the most likely way this record could be over-read.
6. **No re-verification of Anthropic-side coverage was performed.** Section 1 is carried forward from
   2026-07-18 and 2026-07-19. This record does not re-assert those as freshly verified.

---

## 5. Standard for any future verification of the operative condition

The governing standard is the one stated in section 5 of
`docs/legal/2026-08-12_aws-baa-acceptance-record.md`, which this record adopts, with one tightening:
prefer the automated assertion once it is confirmed enforcing, not merely present. The standard
otherwise stands as written there and is not restated here: credential presence on the **serving**
revision identified by name and observation time, **plus** `sts:GetCallerIdentity` under that exact
credential returning 2390-4478-5114, with every revision swept rather than only the newest.

This record adds two points from its own cycle:

**1. Date the observation against the claim, not against the calendar day.** The predecessor's
sentence A was not a wrong observation. It was a correct observation, made at 07:09Z, restated in
signed bytes at 17:11Z, by which time it had been false for nearly ten hours. A same-day timestamp is
not a fresh one for a property that changes on deploy. Any current-state claim in a compliance record
must be re-checked at the moment the bytes intended for attestation are written, and must name the
revision and time it was checked.

**2. Verify claims newly authored during a correction pass, not only the ones being corrected.**
Sentence B was written into the very commit that was attested, and was false the moment it was
written (section 3.1, finding 3). A correction pass concentrates scrutiny on the text being changed,
which is exactly where a newly added assertion escapes it. Treat every new factual sentence in a
correction as a new claim requiring its own evidence, held to the same standard as the claim it
replaces. A corollary applies to re-verification specifically: a check offered as satisfying a
"re-verify on any future mount" requirement must **post-date** the mount, so the ordering of
timestamps has to be established and not assumed.

---

## 6. Attestation

**Attested 2026-08-16 by Scot Wahlquist, CEO.** This document was drafted by Claude Code from the
evidence cited above and attested by Scot Wahlquist on 2026-08-16. Per the governance rule in
`audit-reports/DOCUMENT-REGISTER.json`, only Scot Wahlquist attests a compliance document.

**Register obligation, stated prospectively.** These bytes are attested before the register records
the fact, because the attestation is what authorizes the register update and not the reverse. This
document therefore does not assert that the register already carries or pins this attestation. After
Scot's attestation, the authorized register update must record it on this record's row and pin the
sha256 of these exact bytes, and must set the two-way `supersedes` / `supersededBy` pointers against
`DOC-ab3a8c3ed4`.

**The freeze takes effect at attestation.** Per rule 3 of `docs/legal/README.md`, once Scot attests a
document its bytes, filename, and location are immutable. That is true of this file from the moment
he signs these bytes, whatever the register says at that instant: from then on it is corrected by a
further dated successor, never edited in place. The register update records and pins that fact; it
does not create it, and a register that has not yet been updated does not leave the file editable.

**Scope of this attestation:** the acceptance and coverage facts carried forward in section 1; the
credential mount history in section 2.2 and the serving state in section 2.3, both bound to the
2026-08-16 evidence time; the narrow environment-variable observation and its explicit limits in
section 2.4; the git-history findings and corrections in section 3; the evidentiary boundaries in
section 4; and the verification point added in section 5.

Explicitly outside it: any claim that an in-app Bedrock call has succeeded in production; any claim
that the account-assertion control is actively enforcing in production; and any restatement of the
2026-07-18 Anthropic enablement probes, the 2026-07-27 model-invocation-logging check, or the
2026-08-04 and 2026-08-10 caller-identity verifications as currently verified rather than carried
forward at their own dates.

**Not in scope for this cycle:** redirecting inbound references that point at the predecessor path.
`docs/legal/AI_GOVERNANCE_MEMO.md`, `docs/legal/AI_DATA_SHARING_CONSENT.md`, and the
`anthropic-model-provider-baa` row in `audit-reports/CAPABILITY-LEDGER.json` all cite the predecessor
or its corrected claim and are handled in their own later cycles of this follow-through. Attested
inbound documents are redirected only in their own supersession cycles.
