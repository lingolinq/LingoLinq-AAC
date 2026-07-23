# Codex Review Smoke

- 2026-07-22: docs-only smoke change to verify the W1/W2 Codex review approval path before making `codex-review/deep-pass` a required branch-protection status.
- 2026-07-23: automatic n8n/W1 smoke of the MERGED codex-review pipeline (fail-closed inconclusive, shell-optional evidence injection). Verifies the auto-dispatched staging-ref review produces a real verdict, not the old fail-open inconclusive.
