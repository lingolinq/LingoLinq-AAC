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
- The four docs above now say no bot reviews every PR, that an author's own Copilot or Codex
  settings may still produce an automatic review, and that a core team member can request one.
- Scot switched the repository's Codex automatic review setting to "Team PRs" on 2026-10-09.
  Whether it covers every core team author is not yet confirmed; check the next ready PR from
  an author other than Scot for a `chatgpt-codex-connector` review or comment.
- `CONTRIBUTING.md` "Branch Protection Rules" said `staging` requires approval from Scot.
  Its ruleset and branch protection require no approvals (checked 2026-10-09), so that line
  now lists only what is enforced, and the approval summary is stated as team policy that
  everyone is expected to follow (Scot's choice: reword rather than change the settings).
- Dated task logs and archive docs that mention Copilot review were left as history.
