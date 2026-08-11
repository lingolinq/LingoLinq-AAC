# Compliance Docs Guide

**How to find any compliance document, and how to keep the index honest.**

LingoLinq's compliance material lives in three places: the codebase (git), Google
Drive, and Notion. To stop the "same doc in three places, some only in one"
problem, there is one index that lists every document, where its canonical copy
lives, where its mirrors are, who owns it, when it was last reviewed, and which
compliance bundles it belongs to.

> **The index is the answer to "where is X."** Start there, every time.

---

## The one rule

**Pick one canonical home, mirror one way, link instead of copy.**

- **git is canonical** for the index itself and for every living source document.
- **Notion is a one-way mirror** for board-style viewing (auto-synced from git).
- **Drive holds frozen, branded, externally-released records** plus binary
  artifacts (the signed BAA PDF). Drive docs are referenced by URL, never copied
  into git.

When the same logical document exists in more than one system, the register row
names the canonical copy and lists the others as `mirrors`. Edit the canonical
copy; never hand-edit a mirror to "fix" a difference.

---

## Where things are

| What | File / location |
|---|---|
| The index (canonical) | `audit-reports/DOCUMENT-REGISTER.json` |
| The index (readable render) | `audit-reports/DOCUMENT-REGISTER.md` |
| Render / validate tool | `scripts/document-register-render.rb` |
| Notion mirror tool | `scripts/document-register-notion-sync.rb` |
| Publication status / stale-doc queue | `audit-reports/COMPLIANCE-PUBLICATION-STATUS.md` |
| Publication status tool | `scripts/compliance-publication-status.rb` |
| Living legal/policy docs | `docs/legal/*.md` (+ the signed BAA PDF) |
| Findings register (status SSOT) | `audit-reports/FINDINGS.json` |
| Branded external records set | Google Drive "Branded Records Set" folder |
| Notion findings board | "LingoLinq Compliance Findings (LL)" |

The `.md` render opens directly on GitHub and is the fastest human view. For a
machine/agent answer, read the `.json`.

---

## How to add a document

1. Add an entry to `audit-reports/DOCUMENT-REGISTER.json` with: `title`,
   `description`, `type`, `owner`, `canonicalSystem`, `canonicalLocation`,
   `status`, `frameworks`, `lastReviewed`, `nextReviewDue`, `bundles`, and
   `mirrors`. Leave `id` and `contentHash` empty for git rows (the render fills
   them); set `contentHash: null` for Drive/Notion rows.
2. Run `ruby scripts/document-register-render.rb`. This computes the `id`, fills
   the git `contentHash`, and regenerates `DOCUMENT-REGISTER.md`.
3. Commit both the `.json` and the `.md` together.

## How to retire a document

Set its `status` to `superseded` or `archived` (do not delete the row), re-render,
and commit. History stays in the index.

---

## contentHash (drift detection)

`contentHash` is a sha256 fingerprint of the canonical content. It is how the
index notices a document changed but its row did not.

- **git docs:** the render computes the hash from the file bytes, and CI
  (`audit-artifacts-integrity`) **fails** if a tracked doc was edited without
  re-rendering. Fix: run `ruby scripts/document-register-render.rb` and commit.
- **Notion docs:** the hash is auto-refreshed by the network-capable sync run,
  `ruby scripts/document-register-notion-sync.rb --refresh-notion-hashes`. CI
  itself runs with no network, so a missing/stale Notion hash is an **advisory**,
  never a build failure.
- **Drive docs:** there is **no automated Drive refresh** (the sync script
  carries no Google credentials). A Drive-row hash is supplied by the operator
  when the doc is added or reviewed, so Drive freshness is a dated review
  obligation, not a machine guarantee. A missing Drive hash is an advisory only.
- **The mislabel guard:** because hash verification only applies to `git` rows,
  the gate also fails if a `git` row's location is a URL; if a `drive`/`notion`
  row's location resolves to a tracked repo file; or if a `drive`/`notion` row's
  URL host is not a real Drive host (`docs.google.com`, `drive.google.com`) or
  Notion host (`notion.so`, `www.notion.so`, `app.notion.com`, `*.notion.site`).
  A real git doc therefore cannot dodge hash verification by being relabeled
  `drive`/`notion`, even via a self-referential GitHub blob URL. Conversely a
  `git` row must resolve to a real file **inside** the repo (no `..` traversal,
  no symlink), so the `git` label always means "tracked content in this repo."
- **If a git hash-drift check fails on an UNATTESTED row:** the doc's content and
  its register row disagree. Re-render to reconcile, then sanity-check the review
  date and status while you are there.
- **If it fails on an ATTESTED row:** do **not** re-render. The render recomputes
  `contentHash` from current bytes, so it clears this message only to re-fail as
  "attested revision no longer exists", and it dirties `DOCUMENT-REGISTER.json` in
  your diff on the way. Either revert your change to the file, or re-attest via
  `/re-attest-record` (Scot only; supersession is the default for `docs/legal/**`
  per the "Attestation freezes the artifact" rule in `README.md`). The `--check` message tells
  you which case you are in, and says so explicitly when the row is attested.

## When CI is red: which failure is this?

`audit-artifacts-integrity` is six steps and not all of them are about documents.
Read the **failing step name**, which GitHub shows in the job, rather than reacting
to the job name. A wrong route costs more here than no route at all.

| Failing step | Owner | Action |
|---|---|---|
| `secret-detection`, with `Failed to resolve action download info` | nobody | `gh run rerun --failed`. A GitHub infra 503 while fetching an action; the scan never ran. |
| `rspec` / `build-and-test`, or gitleaks actually matching a secret | author | Read the log and fix. Never weaken the secret scan to pass. |
| `document-register-render.rb --check`, drift on an **unattested** doc | author | `scripts/regenerate-register.sh`, commit the JSON and the `.md` together. |
| `document-register-render.rb --check`, drift on an **attested** doc | Scot | Stop. Do not run render. Revert the file, or `/re-attest-record`. |
| `document-register-render.rb --check`, bundle completeness | author | Add the missing required member, or fix `meta.bundleDefinitions`. Re-rendering will not fix it. |
| `capability-check.rb --check` | author | A cited line moved. Update the anchor in `CAPABILITY-LEDGER.json`. Re-rendering will not fix it. |
| `attestation-hash-guard-test.sh` | author | A guard regressed. Fix the guard; do not weaken the assertion to go green. |

Note that this job **aborts at the first failing step**, so later steps may be
untested on your branch. After fixing the first failure, re-run the whole job
locally (`scripts/regenerate-register.sh --check` covers all of it) rather than
assuming the rest was already passing.

## Publication status

The findings and document registers do not automatically rewrite every downstream
Google Doc or Notion page. They do automatically keep the two team-facing Notion
boards current:

- `FINDINGS.json` -> "LingoLinq Compliance Findings (LL)" via
  `.github/workflows/sync-findings-to-notion.yml`.
- `DOCUMENT-REGISTER.json` -> "LingoLinq Compliance Documents (LL)" via
  `.github/workflows/sync-document-register-to-notion.yml` when the
  `NOTION_DOCS_DB_ID` repo variable is configured.

Everything else is tracked through the publication status report:

```bash
ruby scripts/compliance-publication-status.rb
ruby scripts/compliance-publication-status.rb --check
```

That report is the compliance-agent work queue. It lists which surfaces update
automatically, which Drive docs need an operator refresh, which Notion rows need
hash refresh, and which active documents have a `lastReviewed` date older than
the latest register source date. CI blocks if the committed report drifts from
the registers.

Until a Google Docs publisher exists, Drive-canonical docs are either:

- **Frozen point-in-time records:** keep the body as-is, and say so in `notes`.
- **Living docs:** refresh the Google Doc body manually or through a future
  Google Docs workflow, then update `lastReviewed` and `contentHash` when
  available.

## bundles (completeness reporting)

A **bundle** is a named package of documents, e.g. `soc2-evidence` or
`school-dpa-package`. Each document lists the bundles it belongs to; each bundle
is defined once in `meta.bundleDefinitions` with the documents it requires.

- The render groups documents by bundle and shows, per bundle, the members and
  any **missing required member**.
- CI **fails** if a bundle is missing a required member, or if a document
  references a bundle that is not defined (typo guard).
- `requiredDocs` binds each requirement to a specific document by
  `canonicalLocation` (identity), **not** by free-text title, so a document
  cannot satisfy a requirement just by being retitled to the right string. Each
  `requiredDocs` entry carries a `location` (the binding) and a human-readable
  `title` that `--check` verifies still matches the member at that location (a
  register-drift guard).
- To define a new bundle: add it to `meta.bundleDefinitions` with a
  `description` and `requiredDocs` (each `{title, location}` pointing at the
  exact member that fulfills it), tag the member docs' `bundles`, then re-render.

> **Why this matters:** when a school district asks for "your DPA package," you
> read the `school-dpa-package` bundle and know instantly whether anything is
> missing.

### Current external-release hold (as of 2026-08-10)

**Do not send these bundles to a district, auditor, or grant reviewer right now:**
`school-dpa-package`, `security-review`, `soc2-evidence`, `dsar`, `grant`.

PR #721 took the correct Path A route for two attested documents: it froze the
attested originals and created dated successors under `docs/legal/2026-08-09_*`.
Those successors are `status: draft` and carry no attestation, and their own first
line says "Internal use only until the CEO attests this file." The five bundles
above require at least one of them, so each currently resolves to a document that
is not authorized for external release.

**This is a human hold, not a technical control. Nothing stops you.** Be clear
about why:

- Bundle assembly happens in Drive and email. There is no repository command that
  assembles or sends a package, so there is no chokepoint for a check to sit on.
- `--check` will not catch this. Every required member exists, so bundle
  completeness passes.
- `gaps` is deliberately NOT used to record it. Per `meta.bundleGapNote`, `gaps`
  means "artifacts that do not exist yet" and never fails `--check`. These
  documents exist; recording them as gaps would misstate the register's model and
  would not hold anything back either.

The hold lifts when Scot attests the successors, which cannot happen until the
successor bytes are true. Note what that does and does not require:

- **An open finding does not by itself bar attestation.** A successor can be
  attested while a gap is open, provided its bytes disclose that gap accurately.
  `LL-1e2ab28aab` (LogSnapshot) is exactly that case: the retention successor is
  correct *because* it now states the gap plainly, so leaving it open is no
  obstacle to signing.
- **A finding whose remediation the document claims is complete is different.**
  The successors assert that the `ButtonSound` / `UserVideo` erasure gap is fixed,
  so `LL-854b1d3853` must be closed before they are attested. Attesting first
  would pin bytes that contradict the findings register, which is the status
  source of truth.

Do **not** work around the hold by pointing the bundles back at the
frozen predecessors: those carry the pre-fix erasure claims, and the attested
`DATA_RETENTION.md` additionally references `UserSound`, which is not a real model
in this codebase.

Separately, `DOC-ae3f9d06ef` (branded Compliance Posture Report) has been an
unattested successor to attested `DOC-9f6a2412ad` since 2026-07-16, independent of
PR #721. It is a row-level member of `school-dpa-package` and `security-review`
but is not named in any `requiredDocs`.

---

## Who attests

Only Scot attests a document or moves it to `approved` / `published`. The
compliance-officer agent and the main session keep the index current (add/retire
rows, refresh review dates, maintain bundles and hashes) but never attest. Drafts
stay `status: draft` with an empty `attestation` until Scot signs.

No student or patient data ever goes in the register. Entries are titles, paths,
URLs, and hashes only.
