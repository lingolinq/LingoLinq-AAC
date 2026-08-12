# docs/legal - folder charter

> Every compliance document has exactly one canonical home, one permanent ID, and one row in
> `audit-reports/DOCUMENT-REGISTER.json`. Bundles reference documents by identity, never by copy.
> Attested files are never edited, renamed, or moved. Nothing is deleted without a tombstone.

## What belongs here

This directory is the **canonical source** for compliance and legal content whose value is in its
text: policies, program documents, posture reports, memos, runbooks, and templates. Git is the right
home for these because they are diffable, reviewable, hashable, and CI-verifiable, and because
`scripts/document-register-render.rb --check` computes and verifies a `contentHash` for every file
here on every CI run. A tracked doc edited without updating its register row fails the build.

Also acceptable here: executed instruments that have no better home and are small enough to track
(for example `AWS_BAA_2026-02.pdf`), plus generated renders that are clearly labelled as such
(`CAPABILITY_LEDGER.md`).

## What does not belong here

- **Signed PDFs of executed agreements.** NDPAs and their exhibits, customer BAAs, insurance
  certificates, and incorporation documents are canonical in **Google Drive**. Git can hold the
  bytes but cannot meaningfully review them, and they cannot be re-rendered. Register them with
  `canonicalSystem: drive` and a `driveFileId`.
- **Branded customer-facing renders.** The Markdown source stays canonical here; the branded Google
  Doc that was actually sent is a dated render, canonical in Drive.
- **Workflow state.** Triage boards, task rows, and "who owes what" live in Notion. Notion holds no
  record of last resort.
- **Anything containing student or patient data.** No exceptions. The register and this directory are
  titles, paths, and hashes only, which is what keeps compliance work in the Tier 2 lane.

## Rules that are mechanically enforced

1. **Every tracked file in this directory must have a register row.** `--check` fails otherwise. If
   you add a document here, add its row in the same PR and run `scripts/regenerate-register.sh`.
2. **Content hashes are verified at HEAD.** For an **unattested** doc: edit the file, re-render,
   commit both. For an **attested** doc this is the wrong move and `--check` now says so: re-rendering
   bumps `contentHash` and re-fails as "attested revision no longer exists", leaving a mutated
   register in your diff. Revert the file, or re-attest via `/re-attest-record` (see "Attestation
   freezes the artifact" and the two rules after it).
3. **Attestation freezes the artifact.** Once Scot attests a document, its bytes, filename, and
   location are immutable. Supersede it with a new dated file plus two-way `supersedes` /
   `supersededBy` pointers. Do not edit or rename it, and do not move it to tidy up.
4. **An attestation pins the bytes it covered.** `attestation.attestedContentHash` records the
   sha256 of the file as attested; `contentHash` tracks it as it is now. `--check` fails when the
   two diverge, which is what makes rule 3 enforceable rather than aspirational: before this
   existed, an attested document could be rewritten with a green build, and twice was. The pin is
   never backfilled by the render (that would make every attestation self-certifying) and never
   edited to clear a failure. A mismatch means re-attestation is owed, and only Scot re-attests.
   Records attested before the check landed are grandfathered on
   `meta.attestationBackfillExemptions` with the commits that moved them; that list only shrinks.
5. **Only Scot attests**, and only Scot moves a row to `approved` or `published`, records or changes
   an attestation, flips `legalHold`, or moves a retention rule to `approved`. Note that attestation
   is a separate block on the row, not a value in `statusEnum` (`draft`, `approved`, `published`,
   `superseded`, `archived`): a row can be attested at any of those statuses. Agents propose
   register rows; a human merges.

## Naming

`<YYYY-MM-DD>_<kebab-slug>.<ext>` for new dated records, ISO dates only so lexical sort equals
chronological sort. **The filename carries no status token.** Status is a mutable property of the
register row (`statusEnum`), and rule 3 above freezes an attested file's name permanently, so a
status encoded in the name would either become false at the first status change or force a rename
that rule 3 forbids. The register is the single source of truth for status. No `v2`, no `final`, no
initials, no status: the date plus the register row carries everything a version number was doing
and cannot lie. Existing `SCREAMING_SNAKE.md` filenames are grandfathered and are not being renamed,
because renaming breaks every inbound reference for no compliance benefit.

Four dated records created before this rule are **also grandfathered in place** and are not renamed
here, for the same reason: `2026-08-09_compliance-posture-report_draft.md`,
`2026-08-09_compliance-program_draft.md`, `2026-08-09_compliance-program-overview_draft.md`, and
`2026-08-09_data-retention_draft.md`. None is attested, so rule 3's freeze has not engaged on any of
them.

**Transition rule for those four.** A grandfathered dated `_draft` record may remain at its current
path **while it is unattested**. Before any such record is attested, leave that path via **Path A
supersession** (see `/re-attest-record`), not an in-place rename: create a new statusless dated file
`<YYYY-MM-DD>_<kebab-slug>.<ext>`, add a new register row that `supersedes` the `_draft` row, mark
the `_draft` row `superseded` with reciprocal `supersededBy`, retarget live bundle
`requiredDocs.location` entries, repair prose references, then attest **only the successor**.
**Do not rename the existing registered path in place.** Document IDs are
`DOC-` + `sha256(canonicalLocation)[0,10]` (`meta.idAlgorithm`;
`scripts/document-register-render.rb` `expected_id` / render overwrite), so an in-place rename
changes the DOC-id, breaks the register's permanent-ID promise, and makes the Notion sync treat the
result as a new row while orphaning or pruning the old one. **A record must never be attested at a
`_draft` path**, because rule 3 would then freeze a filename asserting a status the register alone
is entitled to carry, and the name could never be corrected.

## Retention

Retention class is declared per row in the register, not per folder. Documents in this directory are
predominantly `policy-version` (supersession + 7 years, archive), which exceeds the six-year HIPAA
documentation floor at 45 CFR 164.530(j). Executed agreements are `executed-agreement` (term +
7 years, archive).

**All retention rules are currently `status: draft` and legally inert.** No deletion behaviour is
wired anywhere in this repo. Nothing is deleted on a schedule until counsel reviews the schedule and
Scot approves it.

## Owner

Scot Wahlquist (CEO). Questions about what belongs where: read
`audit-reports/DOCUMENT-REGISTER.json` first, then `docs/legal/COMPLIANCE_DOCS_GUIDE.md`.
