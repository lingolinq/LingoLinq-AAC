# Codex Review Smoke

- 2026-07-22: docs-only smoke change to verify the W1/W2 Codex review approval path before making `codex-review/deep-pass` a required branch-protection status.
- 2026-07-23: chunked evidence mode added behind `CODEX_REVIEW_EVIDENCE_MODE=chunked`. The new path builds a CI-owned coverage manifest, reviews deterministic diff chunks, heartbeats pending status after progress, then runs a final synthesis before the envelope can approve. Incomplete coverage remains fail-closed as `NEEDS_HUMAN`; bounded mode remains available during rollout.
