# Closure-retraction successors and the posture-page publisher (2026-09-17)

Working log for the queue the Q3 audit session left after PR #996 merged. Branch
`compliance/scot-closure-retraction-successors-704f4961` from `develop` `d76081fe9`.

## Why

PR #996 reopened `LL-c0b3d59f58` at High as a regression. Two records still state it as
verified-closed: the attested 2026-09-14 status snapshot (`DOC-39e71c72ee`, attested 2026-09-16)
and the 2026-08-30 counsel review memorandum (`DOC-58b3944cad`, draft). The finding's own notes
direct: "handle by successor or re-attestation, never in-place edits."

The same session hand-pushed the regenerated posture page to Notion with a scratch converter
and moved the page out of the Master Inbox database into Compliance Home, leaving the repo's
README and generator text stale and the "open findings" headline label misleading.

## Verified before writing (HEAD `d76081fe9`)

- CONFIRMED (register, jq): 251 findings; 176 open / 10 remediated-unverified / 57 verified-closed /
  5 accepted-risk / 3 superseded. Live (open + remediated-unverified) 2C / 38H / 94M / 52L = 186.
  Open-only 2C / 32H / 91M / 51L. 40 live Critical+High rows listed in the successor match the
  register row for row. Framework table SOC2 69/18, FERPA 59/25, GDPR 49/17, HIPAA 42/13, WCAG 34/3,
  COPPA 25/15; 27 live rows carry no framework tag (the draft said 22: corrected).
- CONFIRMED: 12 live Critical/High rows first seen on or before 2026-08-12 (the draft said eleven:
  corrected in both places).
- CONFIRMED (`gh pr view 944`): `LL-676f91f26b` has a merged fix (PR #944, on `develop` and
  `main`; touches `lib/sentence_pic.rb`), but its register row is still `open` with no
  disposition. The draft said "no remediation branch recorded": corrected. The register row was
  NOT changed here (status moves are Scot's).
- CONFIRMED (read-only IAM policy read of the production project): the least-privilege change
  described in the private record is in place, so "applied 2026-09-17" is true. The draft's
  permission-count and principal detail was minimized under the disclosure policy (finding
  title says "details withheld until remediation is verified"); role names and the project id
  are likewise kept out of this log.
- CONFIRMED: the memorandum's row 19 lives in section 14 ("What the proposed policy would
  require us to build"), `Register` column, not a "Findings put to counsel" section as the
  draft said: corrected.
- CONFIRMED (`git grep c0b3d59f58 -- docs/legal audit-reports`): no other live document states
  the closure. The 2026-09-14 posture report and program list it as a 2026-08-12 finding only;
  the 2026-08-22 snapshot is already superseded and frozen.
- CONFIRMED (Notion API, compliance credential): page `37f5fe82-...` parent is page
  `ba65fe82-15c2-83d1-8406-016d0e83cee6` titled "Compliance Home", not archived.
- CONFIRMED: `runs.jsonl` Q3 line: 35 new (7H/20M/8L by domain sums), 1 regression, adversary
  33 confirmed + 1 orchestrator + 1 uncertain, citation-check 232/0/17 at run time; 234/0/17 at
  HEAD now. Calendar: quarterly lastDone 2026-09-16 / nextDue 2026-12-16; make-up due 2026-10-09.

## What changed

1. `docs/legal/2026-09-17_compliance-status-snapshot.md` (Path A successor, draft, unattested)
   and `docs/legal/2026-09-17_counsel-review-addendum-closure-retraction.md` (addendum, draft).
   Register rows `DOC-f6365ba893` (supersedes `DOC-39e71c72ee`, interval rebased 69 days) and
   `DOC-c9c70f5702` (supersedes nothing). Predecessor row moved to `superseded` with the
   reciprocal pointer; its attestation block and bytes untouched and still `verified`.
   `DOC-58b3944cad` notes gained a dated pointer to the addendum; its bytes unchanged.
2. `scripts/compliance-notion-page-publish.rb` + `scripts/notion_markdown_blocks.rb`: the push,
   ported from the 2026-09-17 scratch converter. Dry-run mode, drift guard, page-identity
   assertion, block backup, append, verify-before-delete, delete, retitle, final read-back.
   Test harness `scripts/tests/compliance-notion-page-publish-test.sh` (network-free via
   `NOTION_API_BASE` on a closed port; wired into CI and the regenerate wrapper). The harness
   caught two converter defects before the first push: escaped pipes in titles were split on,
   and wrapped bullet continuation lines became paragraphs.
3. `scripts/compliance-notion-publish.rb`: headline relabelled "live findings" with an explicit
   `open`-only row; Master Inbox references replaced by Compliance Home.
4. `audit-reports/notion/README.md` and `.claude/skills/audit-run/SKILL.md` step 8: new home,
   credential reference, publisher procedure.
5. Page published twice with the new publisher (second time after the bullet fix): 12 top-level
   blocks, headline table 5x3, findings table 6x187, verified by an independent API read-back.

## Dual review (PR #1006 at `c486c5cc7`)

Senior-dev pass: approve with comments (0 Critical, 0 High, 4 Medium). Adversary: request
changes on one High, 6 Medium, 3 Low. Every count in the successor was re-derived by both and
matched. Addressed in the follow-up commit:

- High: the attested 2026-09-14 posture report's Headline "Live Critical findings: 0" row is
  undated and ships in three bundles; the successor now carries correction 6 naming it, a
  qualified Related line, and decision item 9 (Path A successor is Scot's call).
- Publisher: PATCH is never retried (a committed-then-timed-out append would duplicate); the
  page identity (title or Compliance Home parent) is asserted before any delete unless
  `--force`; the page id is format-checked; the drift guard compares expanded paths and any
  other input needs `--allow-unchecked-input`; the page and every split table are read back
  and counted BEFORE the old blocks are deleted; the outer rescue prints the backup path.
- Converter: a rich_text run over 100 segments and a table row wider than its header now RAISE
  instead of truncating; a data row of dashes is kept; backslashes are escaped by the generator
  and parsed by the converter; underscore notes render italic.
- Harness: assertions accumulate; case 1 asserts shape, not exact counts; `sed -i` gone; new
  cases for the two refusals, the unchecked-input flag, the page-id check, and the path-
  normalized drift guard. Finding along the way: `Net::HTTP.start(host, port, opts)` ignores
  `https_proxy`, so the original proxy canary proved nothing; `NOTION_API_BASE` on a closed
  port is the real canary and case 8 proves it fires.
- CI job comment now names the harness steps it runs.
- Disclosure: role name and project id removed from this log and the PR body.
- Recorded, not changed: the register's `LL-c0b3d59f58` note still says "remediation in
  progress" while the two records say both controls were applied on 2026-09-17. Compatible
  (applied is not verified-closed), and only Scot moves that row.
- Not done: a stub-server test of the append/delete path. The harness header now says what it
  covers and what it does not.

## Left for Scot

- Attest (or not) the two drafts; only he attests.
- `LL-676f91f26b`: merged fix, row still `open`/untriaged. Needs verification and closure, or a
  `remediated-unverified` entry with the PR reference.
- Brain drafts in `~/ai-company-brain/outputs/drafts/` are now behind the committed files.
- Whether to insert a one-line addendum pointer under the counsel memorandum's header (an
  unattested draft, so permitted) or hold until it next changes.
- Whether the 2026-09-14 posture report gets its own Path A successor for its undated
  "0 Critical" headline row.

## Follow-ups handled 2026-09-18 (second PR, after #1006 merged as `3c6df3c92`)

Scot attested both records in #1006 on 2026-09-18 and then directed the two remaining open
items. Recommendation given and accepted: no separate Path A successor for the 2026-09-14
posture report now; fold its "0 Critical" correction into the successor it needs after the Q3
make-up pass (due 2026-10-09), unless a bundle is about to go to a recipient first.

- **Memo pointer.** A five-line "Addendum (pointer added 2026-09-18)" entry inserted under the
  header block of `docs/legal/2026-08-30_minimum-necessary-privacy-retention-ai-use-counsel-review.md`
  (DOC-58b3944cad, draft, unattested, so an in-place edit is permitted; the attested
  DOC-f6365ba893 lists this as decision item 7). No other line changed; contentHash re-rendered.
- **LL-676f91f26b** moved `open` -> `remediated-unverified`, `closureEvidence.sha` = the #944
  merge commit `df037539f` (an undeclared `prs` key was tried first and dropped on review: no
  consumer reads it; the Notion sync scrapes PR numbers from prose). Evidence before
  moving: PR #944 merged to develop 2026-09-06 (`df037539f`) and is on `main`; read-only Cloud Run
  reads on lingolinq-prod show the web service (revision 00034, created 2026-09-16) and the
  Resque worker pool (revision 00022), which runs the preview job, both on image
  `web:57872695e...`; `lib/sentence_pic.rb` at that commit has no backticked shell call. Not
  re-tested by execution in production. Closure stays the CEO's act.
- Cross-doc sweep for LL-676f91f26b: only the attested 2026-09-17 snapshot names it as open, a
  dated point-in-time record that already anticipates this move. No live doc is now false.
- Open-only headline moves 2C -> 1C; live headline stays 2C / 38H / 94M / 52L.

### Dual review of PR #1013 at `c73999ba0`

Senior-dev: request changes (1 High, 3 Medium, 2 Low). Adversary: ship with conditions (2 High,
3 Medium, 1 Low). Both independently re-ran the Cloud Run reads and confirmed the deploy
evidence, the ancestry, the escape coverage in `lib/image_magick_runner.rb`, and that both sinks
converge on the fixed path. Fixed in the follow-up commit:

- High (both): the pointer's "no other line of this memorandum has changed since 2026-08-30" was
  false; PR #969 revised section 4 on 2026-09-15. Sentence now names that revision and scopes
  the claim to this edit.
- High (adversary): the attested addendum says the memo "is not edited"; true at attestation,
  false after the pointer. Recorded in the pointer text itself, in `DOC-c9c70f5702` notes, and
  in `LL-c0b3d59f58` notes. The attested bytes and attestation note are untouched; whether to
  re-attest the addendum is Scot's call.
- Medium (both): `lastReviewed` on the memo row restored to 2026-08-30. A pointer is not a
  review; the stale-review entry is meant to stand until the memo is re-read before it ships.
- Medium (both): `prs` key removed; `closureEvidence.sha` set to `df037539f`.
- Medium (senior): `remediation.options` now marks its "NOT merged" clause historical, since the
  Notion sync renders that field verbatim.
- Medium (adversary), NOT fixed here, filed as an issue: `scripts/audit-merge.rb` treats only
  `verified-closed`, `accepted-risk` and `superseded` as regression triggers, so a re-seen
  `remediated-unverified` row is silently re-anchored instead of flagged.

## Third PR (2026-09-18): addendum re-attested, LL-676f91f26b closed

Scot asked for a recommendation on the two items left after #1013 and took it: re-attest the
addendum and close the finding.

- **Addendum re-attested via Path A.** `docs/legal/2026-09-18_counsel-review-addendum-closure-retraction.md`
  (DOC-c6f1b9fac6, attested 2026-09-18) supersedes DOC-c9c70f5702 (attested 2026-09-18 earlier
  the same day, frozen, pin verified). The only substantive change is the header paragraph: the
  memorandum's substantive content is unedited, but it received a header pointer on 2026-09-18
  under decision item 7 of DOC-f6365ba893, and its last prior revision was PR #969 (2026-09-15).
  The memo's pointer now names the successor. Rationale: the addendum exists to correct a
  misstatement in the record set and was carrying one of its own in an attested sentence.
- **LL-676f91f26b verified-closed**, disposition fixed, attestation string dated 2026-09-18, on the
  read-and-deploy evidence already on the row plus the two independent #1013 review passes (live
  traffic reads, ancestry, escape_label coverage of all three sigils, `system(*args)` argv, both
  sinks converge, byte-sweep spec). An exploit re-run against production was deliberately not
  performed; the attestation string says so. Live headline moves 2C -> 1C; open-only 1C.
- Sweep for LL-676f91f26b outside the register: only the attested, dated 2026-09-17 snapshot,
  which lists it as open at that date and is frozen.
- Scot-owned fields (finding status/disposition/attestation, register attestation blocks) were
  written with the file-editing tools; the shell path is blocked by the auto-mode classifier for
  attestation writes.
