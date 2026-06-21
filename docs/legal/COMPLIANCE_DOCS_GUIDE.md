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
  `drive`/`notion`, even via a self-referential GitHub blob URL.
- **If a git hash-drift check fails:** it means a doc's content and its register
  row disagree. Re-render to reconcile, then sanity-check the review date and
  status while you are there.

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

---

## Who attests

Only Scot attests a document or moves it to `approved` / `published`. The
compliance-officer agent and the main session keep the index current (add/retire
rows, refresh review dates, maintain bundles and hashes) but never attest. Drafts
stay `status: draft` with an empty `attestation` until Scot signs.

No student or patient data ever goes in the register. Entries are titles, paths,
URLs, and hashes only.
