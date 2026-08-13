---
name: re-attest-record
description: Governed re-attestation after compliance-record bytes change. For attested docs/legal/** artifacts, supersede with a new dated file + two-way register pointers (never overwrite the old pin). Same-row attestedContentHash re-pin is only for non-legal git rows or explicit Scot-directed recovery. Verifies the doc is true NOW before attesting; never rubber-stamps. Only Scot attests. User-invoked only (/re-attest-record).
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# /re-attest-record: re-attest after compliance-record bytes change

## First: is this even a re-attest case?

CI `document-register-render.rb --check` can fail two different ways with similar wording:

| FAIL text | Attested? | Your move |
|---|---|---|
| `contentHash drift for "…"` … `(run render)` | **No** (`attestation: {}` or empty) | Do **not** use this skill. Run `scripts/regenerate-register.sh` and commit. |
| `contentHash drift on the ATTESTED row` … `/re-attest-record` | **Yes** | This skill (Scot only). **Do not run render** — it bumps `contentHash`, dirties the register, then fails again as "attested revision no longer exists" (the #721 footgun; fixed messaging in #766). |
| `attested revision no longer exists` | **Yes** (already re-rendered or hash already bumped) | This skill. Revert the mistaken register edit if you already rendered; then Path A/B below. |

Rule of thumb: if the message says **ATTESTED**, stop and ping Scot. If it says **run render**, regenerate.

Every git row in `audit-reports/DOCUMENT-REGISTER.json` with an `attestation` block pins
`attestedContentHash` = the sha256 of the exact bytes Scot attested. `contentHash` tracks the file
as it is NOW. `scripts/document-register-render.rb --check` (CI job `audit-artifacts-integrity`,
plus `scripts/tests/attestation-hash-guard-test.sh`) FAILS the moment the two diverge on a git row:
the attested revision no longer exists, and re-attestation is owed.

**That failure is not a license to overwrite the pin on an attested legal artifact.** Per
`docs/legal/README.md` rules 3–4, once Scot attests a `docs/legal/**` document its bytes, filename,
and location are immutable. Content changes go through **supersession** (new dated file + two-way
`supersedes` / `supersededBy` pointers). Overwriting `attestation.attestedContentHash` on the old
row deletes the register's only association between the prior attestation and those exact bytes —
`priorAttestations` keeps dates only, not hashes — and greens the integrity guard without preserving
the attested record.

This skill is the governed counterpart to that work: pick the correct path, verify the successor (or
same-path recovery) is TRUE now, record Scot's attestation, and re-run every gate.

## Hard rules (always)

- **Only Scot attests.** This flow records an attestation Scot is making; run it when Scot has
  asked for the re-attestation (a `/lingo` compliance task, an explicit "re-attest X"). Do not
  invent an attestation.
- **Attested `docs/legal/**` = immutable.** Do not edit, rename, or move an attested legal file to
  "fix" a mismatch. Do not overwrite its `attestedContentHash` to silence `--check`. Supersede it
  (Path A). Same-row re-pin on a legal path is Path B recovery only, and only when Scot explicitly
  directs it after an already-landed in-place amend.
- **Never edit the pinned hash just to make `--check` pass.** The render's FAIL message says this
  explicitly. Re-pinning is legitimate ONLY as part of a real re-attestation on a path that allows
  same-row pins (Path B), or as the first attestation of a **new** successor row (Path A).
- **Do not rubber-stamp.** An attestation asserts the document is true *now*. Before pinning,
  verify the doc's claims against live code and infrastructure (grep runtime code, `gcloud ...
  describe`, read the real config). Where verification finds a false or stale claim, FIX IT FIRST
  (on the successor file for Path A; never by rewriting the frozen predecessor) and record the fix;
  never attest around it. (2026-07-23: a runbook still named Render as the DB restore source
  post-cutover; verified against the live Cloud SQL instance and corrected before attesting.)
- **The render NEVER backfills `attestedContentHash`.** By design (`document-register-render.rb`
  header): backfilling from current bytes would make every attestation self-certifying. You set it
  manually, once, to the verified new bytes of the row being attested.
- **Only Scot closes/downgrades a finding.** This skill touches attestation + review-date fields on
  a document row; it never closes findings or changes a finding's disposition.

## Choose the path first

| Situation | Path |
|---|---|
| Attested `docs/legal/**` needs a content change (planned work) | **A — Supersede** |
| Attested `docs/legal/**` already edited in place and Scot explicitly directs same-path re-attestation rather than revert+supersede | **B — Same-row re-pin (recovery)** |
| Attested git row **outside** `docs/legal/**` (e.g. `COMPLIANCE.md`) where Scot directs same-path re-attestation | **B — Same-row re-pin** |
| New unattested row / first attestation of a successor | Pin on that row after verify (no prior pin to protect) |

If unsure, choose **A**. Prefer supersession over burning a pin.

## The mechanism (why each field)

- `contentHash` = `sha256(file bytes)`. The render (`document-register-render.rb`, write mode)
  recomputes and writes it. `sha256sum <file>` gives the identical value.
- `attestedContentHash` = the bytes Scot attested on **that row**. Set it = that row's `contentHash`
  only when Scot is attesting that row.
- `--check` passes when `attestedContentHash == contentHash` for the row (render shows `verified`;
  otherwise `MISMATCH - re-attestation owed`).
- `supersedes` / `supersededBy` = reciprocal DOC-id pointers. A row with `supersededBy` must have
  `status: superseded`. The render enforces reciprocity.
- `priorAttestations` = date list only. It does **not** preserve prior hashes. Same-row re-pin
  therefore burns the register's byte-level link to the previous attestation; git history may still
  hold the old bytes, but the register no longer points at them.

---

## Path A — Supersede an attested legal record

Use this for any planned change to an attested file under `docs/legal/**`.

1. **Leave the attested file untouched.** Do not edit its bytes, rename it, or move it. The old
   row keeps its existing `attestedContentHash` forever.

2. **Create the successor file** under `docs/legal/` with the dated naming convention from
   `docs/legal/README.md`:
   `<YYYY-MM-DD>_<kebab-slug>.<ext>`
   (ISO date, no status token, no `v2` / `final` / initials). Copy forward only what should
   remain true; fix stale claims in the **new** file.

   **The filename carries NO status token** (rule changed 2026-08-10; this step previously said
   `<YYYY-MM-DD>_<kebab-slug>_<status>.<ext>`). Status is a mutable property of the register row,
   and rule 3 freezes an attested file's name permanently, so a status in the name would either go
   false at the first status change or force a rename that rule 3 forbids. A record must **never**
   be attested at a `_draft` path. If the live record is one of the four grandfathered dated
   `_draft` files, do **not** rename that path in place (DOC-ids hash `canonicalLocation`; an
   in-place rename changes identity and breaks Notion sync). Create this statusless successor as a
   **new** file + new register row that `supersedes` the `_draft` row, mark the `_draft` row
   superseded, retarget live bundles, then attest only the successor
   (`docs/legal/README.md` Naming → Transition rule).

3. **Add a new register row** in `audit-reports/DOCUMENT-REGISTER.json` for the successor:
   - Leave `id` and `contentHash` empty for git rows (render fills them).
   - `status` = `draft` (or whatever Scot directs); do not mark it attested yet.
   - `supersedes` = the predecessor's `id`.
   - Carry forward `type` / `frameworks` / retention class as appropriate; point **live** bundles at
     the successor. Frozen attested binders keep the predecessor (see Drive branded Posture Report
     notes on `DOC-9f6a2412ad` → `DOC-ae3f9d06ef`).

4. **Retire the predecessor row** (do not delete it):
   - `status` = `superseded`
   - `supersededBy` = the successor's `id` (after render assigns it, or set both sides once ids are
     known — reciprocity is required)
   - Leave `attestation` / `attestedContentHash` on the predecessor **unchanged**.

5. **Render and fix pointer/bundle issues:**
   ```bash
   ruby scripts/document-register-render.rb
   ruby scripts/document-register-render.rb --check
   ```
   Resolve any supersession or bundle-identity failures before attesting.

6. **Verify the successor is true now** (same non-rubber-stamp bar as always). Fix the successor
   file if needed, re-render, then read its new `contentHash`.

7. **Attest the successor row only** (Scot):
   - `attestation.attestedContentHash` = successor `contentHash`
   - `attestation.attestedBy` = `"Scot Wahlquist, CEO"`, `attestedDate` = today (YYYY-MM-DD)
   - `lastReviewed` / `nextReviewDue` on the successor: set review dates; rebase interval from the
     predecessor's cadence when continuing the same policy line:
     `newNextReviewDue = today + (oldNextReviewDue - oldLastReviewed)`
   - `attestation.note` = what was verified and which DOC-id this supersedes
   - Do **not** append to or alter the predecessor's attestation block

8. **Regenerate and verify everything** (same commands as Path B step 4 below). Confirm:
   - predecessor still `verified` against its frozen bytes (or remains correctly attested if it has
     no git hash drift)
   - successor `verified` with `contentHash == attestedContentHash`
   - supersession table lists the chain

---

## Path B — Same-row re-pin (non-legal, or Scot-directed recovery)

Use only when Path A does not apply. Overwriting `attestedContentHash` on this row **burns** the
register's link to the previously attested bytes; `priorAttestations` will keep the old date only.

1. **Verify the doc is true now, and make any corrections.** Do the substantive review the
   attestation asserts. Edit the doc to reality first (this is already a Path B situation). If
   nothing is false, note that; if something is, fix it and record what changed (doc changelog +
   register `note`).

2. **Recompute the hash.** From the repo/worktree root:
   ```bash
   ruby scripts/document-register-render.rb        # write mode: recomputes + writes contentHash
   ```
   Then read the new `contentHash` for your row(s):
   ```bash
   ruby -rjson -e 'JSON.parse(File.read("audit-reports/DOCUMENT-REGISTER.json"))["documents"].each{|d|
     next unless d["canonicalLocation"]=="PATH/TO/YOUR_DOC.md"
     puts "contentHash=#{d["contentHash"]} pinned=#{d.dig("attestation","attestedContentHash")}"}'
   ```
   (The render will print `[FAIL] attested revision no longer exists ...` for the row — that is the
   expected "re-attestation owed" state, not an error to fix by editing the pin blindly.)

3. **Record the attestation** in `audit-reports/DOCUMENT-REGISTER.json` for the row:
   - `attestation.attestedContentHash` = the new `contentHash` from step 2.
   - `attestation.attestedBy` = `"Scot Wahlquist, CEO"`, `attestedDate` = today (YYYY-MM-DD).
   - `attestation.priorAttestations` = append the superseded `attestedDate` (keep the list; do not
     drop history). For a same-day amendment of an attestation that was never merged/published as a
     distinct revision, you may keep `priorAttestations` unchanged and explain in the `note` instead
     of appending a duplicate same-day date.
   - `lastReviewed` = today; **rebase** `nextReviewDue` on the row's EXISTING interval:
     `newNextReviewDue = today + (oldNextReviewDue - oldLastReviewed)`. Do NOT reset the cadence to a
     default. (e.g. a 12-month row reviewed today -> today + 12 months.)
   - `attestation.note` = one line stating what was verified/corrected, that the prior revision's
     pin is superseded, and (for `docs/legal/**` recovery) that Scot directed same-path re-attest
     instead of supersession. NOTE: the boilerplate note text is shared across several rows, so when
     editing with `Edit`, anchor on the row's UNIQUE `attestedContentHash`, not the note string.

4. **Regenerate and verify everything:**
   ```bash
   scripts/regenerate-register.sh                    # render all artifacts + run every --check
   bash scripts/tests/attestation-hash-guard-test.sh # all guards fire; live register untouched
   git diff --check                                  # no whitespace/conflict markers
   ```
   Confirm the row reads `verified` (not `MISMATCH`) and `contentHash == attestedContentHash`.

## Gotchas (learned the hard way)

- **Supersession, not re-pin, for legal.** Teaching agents to overwrite `attestedContentHash` on
  `docs/legal/**` legitimizes in-place rewrites and contradicts the folder charter. Path A first.
- **`DOCUMENT-REGISTER.json` is high-contention.** Many parallel compliance PRs touch it. If you
  hit a merge, the conflict is usually only in the GENERATED `DOCUMENT-REGISTER.md`; resolve it by
  regenerating from the auto-merged JSON (`scripts/regenerate-register.sh`), NOT by hand-editing the
  `.md`. Then re-verify your row's `attestedContentHash == contentHash` survived the JSON
  auto-merge before trusting it. See `docs/task-management/LEARNINGS.md`.
- **The render can fail-and-still-write.** Write mode updates `contentHash` in the JSON even while
  printing the attestation `[FAIL]`. That is why Path B step 2 works: read the freshly-written
  `contentHash`, then pin it in step 3.
- **`sha256sum <file>` == `contentHash`.** You can cross-check the render's value directly.
- **Interval rebase, not reset.** The most common slip is setting `nextReviewDue` to a fresh
  default (e.g. +12 months) when the row's real cadence was quarterly, or vice versa. Compute the
  old interval from the row before you edit it.
- **Grandfathered `SCREAMING_SNAKE.md` names** are not renamed (inbound references). That does not
  waive immutability: supersede by adding a new dated file and leaving the attested snake_case file
  frozen, or accept Path B only under Scot's explicit direction.

## Related

- `docs/legal/README.md` (attestation freezes the artifact; supersede, do not edit in place).
- `scripts/document-register-render.rb` (the `attestationHashNote` / `attestationBackfillNote` in
  the register `meta` explain the pin contract; supersession reciprocity checks).
- Working supersession example: `DOC-9f6a2412ad` → `DOC-ae3f9d06ef` in
  `audit-reports/DOCUMENT-REGISTER.json`.
- `.claude/skills/promote-finding/SKILL.md` (sibling governed register skill; adds findings).
- CLAUDE.md "PR Preflight" P3 (the artifact-integrity `--check` bundle this must pass).
