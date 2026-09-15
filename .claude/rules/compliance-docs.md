---
paths:
  - "docs/legal/**"
  - "audit-reports/**"
---

# Compliance documents and registers

- `audit-reports/FINDINGS.json` and `audit-reports/DOCUMENT-REGISTER.json` are the
  single source of truth. Rendered `.md` files and Notion pages are generated from them;
  never hand-edit a rendered artifact.
- Before every push that touches these paths run `scripts/regenerate-register.sh --check`
  (it mirrors the `audit-artifacts-integrity` CI job). If a FAIL names an **attested**
  row, stop: attested bytes are frozen. Supersede with a new dated file through
  `/re-attest-record`; never edit the attested file in place.
- Only Scot closes a finding, downgrades severity, accepts risk, or attests a document.
  `audit-merge.rb` only ever adds findings or marks them open.
- Restamping `meta.auditedSha` is a governance act. Only a whole-tree `/audit-run` passes
  `--sha` bare; any other addition uses `audit-merge.rb --sha <trueCommit> --no-restamp`.
- No student or patient data ever appears in a finding, a snippet, or a legal doc.
  Evidence is code and config only.
- When you change a claim in one compliance doc, sweep the others:
  `git grep -n -i "<subject>" -- docs/legal/ audit-reports/` and reconcile every hit in the
  same PR or list them as explicit follow-ups in the PR body.
- Filenames under `docs/legal/` follow `YYYY-MM-DD_<kebab-slug>.md` and are checked by
  `scripts/legal-naming-check.rb` in CI. Operating guide:
  `docs/legal/COMPLIANCE_DOCS_GUIDE.md`.
