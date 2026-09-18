# Addendum: Counsel Review Memorandum, retracted finding closure

> # ATTESTED 2026-09-18 BY SCOT WAHLQUIST, CEO. NOT LEGAL ADVICE.
>
> This addendum belongs to
> `docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md`
> (`DOC-58b3944cad`, status draft, unattested). The memorandum's substantive content is **not**
> edited: its bytes are not frozen, so an in-place edit would be permitted, but it is a review
> record for counsel and the register's `LL-c0b3d59f58` row directs successor-or-addendum
> handling. The only change to it is a header pointer block, first inserted on 2026-09-18 by
> PR #1013 naming the 2026-09-17 addendum and retargeted to this addendum the same day by
> PR #1015, under decision item 7 of the attested 2026-09-17 status snapshot (`DOC-f6365ba893`);
> before that its last revision was PR #969 on 2026-09-15. The memorandum has not been sent to
> counsel; this addendum accompanies it when it is.
>
> **Supersedes** `docs/legal/2026-09-17_counsel-review-addendum-closure-retraction.md`
> (`DOC-c9c70f5702`, attested 2026-09-18, frozen). That record states that the memorandum is not
> edited, which was accurate when it was attested and became inaccurate the same day when the
> pointer landed. This successor carries the accurate statement; nothing in its correction
> changes. Sequence of the three same-day events, for a reader without the repository: PR #1006
> attested the predecessor, PR #1013 inserted the memorandum's pointer, PR #1015 carries this
> successor.

**Date:** 2026-09-18 (successor); original addendum 2026-09-17
**Owner:** Privacy Office (privacy@lingolinq.com)
**Applies to:** `DOC-58b3944cad`, section 14 ("What the proposed policy would require us to build"), gap row 19, `Register` column
**Status:** attested 2026-09-18 by Scot Wahlquist, CEO. Path A successor to `DOC-c9c70f5702`. The memorandum it belongs to remains a draft.

---

## 1. What this addendum corrects

Gap row 19 of the memorandum's section 14 table reads:

> | 19 | Production GCP audit-log and least-privilege findings | Access accounting for the data
> store | `LL-b7ccc522b9`, `LL-c0b3d59f58`, both verified closed on a live read in the 2026-08-29
> triage |

**The word "both" is no longer accurate.** As of 2026-09-17 the two findings have diverged:

| Finding | Status on 2026-08-30, as the memorandum records it | Status on 2026-09-17 |
|---|---|---|
| `LL-b7ccc522b9` (no Data Access audit log configuration on the production project) | verified-closed on a live read in the 2026-08-29 triage | **Unchanged. Still verified-closed.** |
| `LL-c0b3d59f58` (production project least-privilege regression for human principals) | verified-closed on a live read in the 2026-08-29 triage | **Closure retracted. Open at High, flagged as a regression.** |

Corrected reading of row 19: *`LL-b7ccc522b9` remains verified closed on the 2026-08-29 live
read. `LL-c0b3d59f58` was verified closed on that same read, but the condition recurred and the
closure was retracted on 2026-09-17; it is open at High.*

## 2. Why the closure was retracted

The 2026-08-29 live read was accurate when it was taken. The condition recurred afterwards. The
Q3 2026 quarterly full audit run (audited SHA `a43867de5`, audit date 2026-09-16) re-surfaced the
finding, an independent adversary pass in a fresh context confirmed the regression, and the CEO
reopened it at High on 2026-09-17 with a `regression: true` flag in
`audit-reports/FINDINGS.json`.

The finding's register disposition is `accepted`, decided by the CEO on 2026-09-17. In LingoLinq's
register that state means accepted onto the remediation backlog. It is **not** an accepted risk,
and the register rationale says so explicitly. Nothing about this finding is closed, waived, or
risk-accepted.

Technical detail is withheld from this record and from the public register under the disclosure
policy the CEO confirmed on 2026-09-17: for unresolved security findings, public records carry a
status statement, severity, location and closure criteria only, and the supporting evidence is
held in a restricted private evidence store until remediation is deployed and verified and
disclosure is approved. Counsel can be given the private record on request.

## 3. Remediation state as of this addendum

- A preventive production control was applied on 2026-09-17. It was verified by reading the
  policy back, and it caused no operational disruption: nothing existed that the control would
  have invalidated.
- The least-privilege change was applied on 2026-09-17: the project-wide role on the non-owner
  human principals was replaced by a set enumerated per service. A read-only IAM policy read on
  2026-09-17 confirms that no non-owner human principal holds a project-wide primitive role.
  Further detail stays in the private evidence store under the disclosure policy.
- Closure requires the change applied, verified by a live read, and the CEO's attestation. Only
  the CEO closes a finding.

## 4. Effect on the memorandum's legal questions

None. The `Register` column of gap row 19 is a status cross-reference in the implementation-gap
table, not a premise of any question put to counsel. The three legal-premise questions about retention floors, the documentation-versus-log
distinction, and the Article 50 record-keeping attribution are unaffected, as are the
document-versus-code findings and the customer-facing privacy-page items. No question is
withdrawn, added, or renumbered by this addendum.

## 5. Related records

- `audit-reports/FINDINGS.json`, finding `LL-c0b3d59f58` (source of truth for its status).
- `docs/legal/2026-09-17_counsel-review-addendum-closure-retraction.md` (`DOC-c9c70f5702`), the
  frozen predecessor of this addendum.
- `docs/legal/2026-09-17_compliance-status-snapshot.md`, the Path A successor that corrects the
  same retracted closure in the attested 2026-09-14 status snapshot (`DOC-39e71c72ee`), which is
  left frozen and byte-identical.
- `audit-reports/run-log/runs.jsonl`, the Q3 2026 run record.

| Field | Value |
|---|---|
| Prepared by | Drafted by Claude Code (Opus 5), 2026-09-17; verified against the register at develop `d76081fe9` and a read-only IAM policy read by Claude Code (Fable 5.1) the same day; successor prepared 2026-09-18 by Claude Code (Fable 5.1) to correct the "not edited" statement |
| Attested by | Scot Wahlquist, CEO |
| Attestation date | 2026-09-18 |
