# Copilot review docs correction (2026-10-09)

## Problem

`CLAUDE.md`, `README.md`, `CONTRIBUTING.md` and `.github/copilot-instructions.md` said Copilot
code review runs automatically on every PR to `develop`. Recent PRs had no Copilot review.

## What was checked (GitHub REST API, 2026-10-09)

- A repository ruleset, "Copilot PR Review", requested a Copilot review on every PR to the
  default branch.
- Copilot reviews appeared on PRs from only some authors, and on none of the recent ones.
  By default GitHub attributes an automatic review's AI credits to the PR author; organization
  members without a Copilot license get no review unless the organization enables a separate
  policy (https://docs.github.com/en/copilot/concepts/agents/code-review). The last Copilot
  review object, on 2026-09-18, was a quota failure, not a review. An individual can also turn
  on automatic Copilot review for their own PRs, separately from any ruleset.
- The Codex GitHub connector reviewed every recent non-draft PR from one author and none from
  another. Codex automatic review is set per repository, and the documented options are "All
  PRs" and "Follow personal preferences", where the personal preference is each user's own
  setting (https://learn.chatgpt.com/docs/third-party/github). The observed pattern matched
  "Follow personal preferences". A `@codex review` comment requests one.
- The settings page also offers "Team PRs", which OpenAI's docs do not describe; the only public
  mention found is a user report (https://github.com/openai/codex/issues/38110). Whether "team"
  means the ChatGPT workspace or the GitHub organization is not stated.

## Decision and change

- The "Copilot PR Review" ruleset was removed at Scot's direction on 2026-10-09. The
  `develop` ruleset is separate and was checked afterwards: its deletion, non-fast-forward
  and pull request rules still apply.
- Scot switched the repository's Codex automatic review setting to "Team PRs" on 2026-10-09.
  It did not cover Traci: her PR #1117, opened ready for review after the switch, had no
  `chatgpt-codex-connector` comment, review or reaction two hours later. "Team" most likely
  means the ChatGPT workspace.
- Scot then switched it to "All PRs" (2026-10-10 UTC). The docs now say the Codex connector is
  set to review every PR automatically, that its review skips the PII pre-flight and is not
  either dual-review pass, and that a `@codex review` comment posts under the commenter's
  account. Copilot: no repository rule requests it, though an author's own Copilot settings
  may. Not yet confirmed: the next ready PR from an author other than Scot should show a
  `chatgpt-codex-connector` review or comment.
- `AGENTS.md` now carries the same rule, per the keep-in-step rule in `CLAUDE.md` (the Codex
  connector pointed this out on this PR).
- `CONTRIBUTING.md` "Branch Protection Rules" said `staging` requires approval from Scot.
  Its ruleset and branch protection require no approvals (checked 2026-10-09), so that line
  now lists only what is enforced, and the approval summary is stated as team policy that
  everyone is expected to follow (Scot's choice: reword rather than change the settings).
- Dated task logs and archive docs that mention Copilot review were left as history.
