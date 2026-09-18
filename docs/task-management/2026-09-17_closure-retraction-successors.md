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
- CONFIRMED (read-only `gcloud projects get-iam-policy lingolinq-prod`): no non-owner human
  principal holds `roles/editor`; the per-service set is in place. So "applied 2026-09-17" is
  true. The draft's permission-count and principal detail was minimized under the disclosure
  policy (finding title says "details withheld until remediation is verified").
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
   ported from the 2026-09-17 scratch converter. Dry-run mode, drift guard, block backup,
   append-then-delete, retitle, read-back verification. Test harness
   `scripts/tests/compliance-notion-page-publish-test.sh` (network-free; wired into CI and the
   regenerate wrapper). The harness caught two converter defects before the first push: escaped
   pipes in titles were split on, and wrapped bullet continuation lines became paragraphs.
3. `scripts/compliance-notion-publish.rb`: headline relabelled "live findings" with an explicit
   `open`-only row; Master Inbox references replaced by Compliance Home.
4. `audit-reports/notion/README.md` and `.claude/skills/audit-run/SKILL.md` step 8: new home,
   credential reference, publisher procedure.
5. Page published twice with the new publisher (second time after the bullet fix): 12 top-level
   blocks, headline table 5x3, findings table 6x187, verified by an independent API read-back.

## Left for Scot

- Attest (or not) the two drafts; only he attests.
- `LL-676f91f26b`: merged fix, row still `open`/untriaged. Needs verification and closure, or a
  `remediated-unverified` entry with the PR reference.
- Brain drafts in `~/ai-company-brain/outputs/drafts/` are now behind the committed files.
