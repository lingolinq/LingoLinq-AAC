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

**Most of this section is mechanically enforced, and one part is not.** `scripts/legal-naming-check.rb`
runs in CI's `audit-artifacts-integrity` job and in `scripts/regenerate-register.sh`. It is
register-aware rather than a filename regex, because the rule that matters is a relationship between
a row's attestation state and its path, not a pattern: an unattested draft may sit at a `_draft`
path and the same record may not once it is signed. It refuses (1a) an attested row whose slug
carries a **status word** as a component, (1b) an attested row whose slug is **not kebab-case**,
(1c) an attested row whose slug carries a **finality or version marker** (`final`, `v2`, `v10`),
(2) an `attestedDate` earlier than the record's own filename date, since a signature cannot predate
what it signs, (3) a successor dated before the record it supersedes, (4) any new non-dated
`docs/legal/` record, with pre-rule names grandfathered through the closed, shrink-only
`meta.legalNamingGrandfathered` list, (5) a filename whose date component is not a real date,
(6) a wrong-cased path such as `docs/Legal/`, and (7) any allowlist entry that was not already a
non-dated `docs/legal/` row at the **base revision**.

**Initials are NOT mechanically enforced.** The rule above bars them, and that remains the
convention, but no check implements it, because there is no testable rule that separates author
initials from legitimate abbreviations: `eu-ai-act-plan`, `us-state-privacy`, and `ai-governance`
all lead with short components that a naive initials rule would refuse. A check that fires on
legitimate names is worse than none, because it trains people to work around the checker. Stated
here rather than left implied, since a reader would otherwise reasonably assume the whole section is
enforced. The harness asserts the current behaviour, so if a defined rule for initials is ever
added, that expectation has to be flipped deliberately rather than drifting.

Check (7) is what actually keeps the allowlist closed, and it exists because independent review
found that check (4) and its stale-entry companion (4b) alone did not. Adding a new non-dated
record **and** adding its path to `meta.legalNamingGrandfathered` in the same change passed both:
check (4) saw a listed path, and check (4b) saw nothing stale. The list that was supposed to be closed could be grown by the very change it was
meant to reject. The allowlist is therefore not self-certifying: legitimacy comes from git history,
since a record created in this change cannot have existed at the base revision, whatever the diff
says about the list. It is deliberately **not** an in-repo baseline file, which would be as editable
as the list it polices. If the base revision cannot be read the check refuses rather than skipping,
because "I could not verify the allowlist" and "the allowlist is fine" are different claims.

Check (1) is really two independent tests, and keeping them independent is a correction rather than
a preference:

- **(1a) no status word may appear as a slug component**, split on **either** `-` or `_`, in any
  position, case-insensitively. So `thing-draft`, `thing_draft`, `draft-thing`, and `THING-DRAFT`
  are all refused.
- **(1b) the slug must be kebab-case**: lowercase alphanumerics separated by single hyphens, with
  `_` reserved as the date boundary. This catches off-convention names carrying no status word at
  all, such as `Thing-Name`, which are equally frozen once attested.

They were briefly folded into one test on the assumption that kebab-case subsumed the status rule.
**It does not**, and independent review found the hole: `2026-08-13_thing-draft.md` is perfectly
valid kebab-case, so the combined check passed it and never consulted the status rule. A rule keyed
to one separator is a rule with a documented workaround. Before that, an earlier suffix-blacklist
version was probed past three more ways (`_DRAFT` case-sensitivity, a non-final `_draft_thing`, and
`Thing-Name`). The lesson is recorded because the pattern repeats: each version looked complete
until someone tried to break it.

"Attested" is the union of the attestation fields rather than `attestedDate` alone, so a half-filled
attestation block is judged rather than excused.

**Known conservatism.** (1a) refuses a legitimate slug that happens to contain a status word as a
component, such as `superseded-records-index`, and (1c) does the same for `final`, which is a real
term of art in `hipaa-omnibus-final-rule`. That is deliberate: the author can rename freely before
attesting and never after, so refusing costs a rename while permitting costs a permanently frozen
misleading name. If such a record is genuinely needed, rename it (`records-index-for-retired-docs`,
`hipaa-omnibus-rule`) rather than weakening the check. Note (1c) does **not** refuse a bare part
number: `annex-2` is a part, not a version, and only the `v`-prefixed form is treated as a marker.

Note what is deliberately absent: **there is no exemption list for the four dated `_draft` records
above.** Check (1) fires only on rows that carry an attestation, so their exemption expires by
construction the moment one is attested, with nothing to remember to delete. A hand-maintained
exemption list is what let earlier drift persist, so the enforcement does not add another one.
`scripts/tests/legal-naming-check-test.sh` asserts every one of those checks actually fires,
because a guard only ever observed passing on clean data proves the data is clean, not that the
guard works, and this particular rule is unfixable once violated.

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
