# LingoLinq Contributing Guide

> **External contributors:** All pull requests should target the `develop` branch,
> not `main`. The `develop` branch is the default branch for this repository.
> PRs targeting `main` directly will be closed unless they are approved hotfixes.

## Branch Structure

| Branch | Deploys To | Purpose |
|---|---|---|
| `main` | lingolinq-prod | Production. Only receives merges from `staging`. |
| `staging` | lingolinq-staging | Pre-production validation. Merges from a freeze of `develop`. |
| `develop` | lingolinq-dev | Integration branch. **All PRs target this branch.** |
| `type/name-description` or `name/type/description` | PR Preview (auto) | Individual work. Branched from `develop`. |

## Contributor Access

| Role | Who | Preview Deploys | PR Review By |
|---|---|---|---|
| **Core team** | Added as org collaborators | No per-PR previews; `develop` deploys to the dev environment on Cloud Run | Core team reviewer, plus the dual-reviewer pass where required |
| **External contributors** | Anyone via fork | No preview deploy | Core team reviewer, plus the dual-reviewer pass (run by the core team) where required |

External contributors: fork the repo, branch from `develop`, and open a PR back
to `develop`. A core team member will review your PR and may request changes.

## Branch Naming

Every branch carries a developer name and a type. Two shapes are accepted:

- `type/name-short-description` (Scot's branches always use this one; it is the form
  his isolated launcher generates, with an 8-hex token appended, as in
  `docs/scot-branch-naming-convention-f3117a76`; the token is part of the name)
- `name/type/short-description`

Parts:

- `type` -- one of: `fix`, `feat`, `chore`, `docs`, `perf`, `refactor`, `test`,
  `compliance`, `security`; plus `hotfix` for the production hotfix flow in section 7
  and `release` for a promotion or release PR (`release/develop-into-staging-<YYYY-MM-DD>`,
  `release/staging-into-main-<YYYY-MM-DD>`; no name, date suffix; the one branch type
  that does not carry a developer name)
- `name` -- your first name or GitHub username (lowercase)
- `short-description` -- 2-4 words, kebab-case

The launcher only offers the nine types above; `hotfix` and `release` branches are
created by hand. Never rename an existing branch to fit either shape.

Examples:
- `fix/scot-memory-leak-puma`
- `feat/melissa-add-sso-login`
- `melissa/feat/add-sso-login`
- `dom/chore/update-ember-deps`
- `release/develop-into-staging-2026-09-18` (promotion freeze; see section 5)

The same spec is stated in `CLAUDE.md` (Branching), `AGENTS.md`,
`.github/copilot-instructions.md` and `docs/pre-merge-audit-checklist.md` section 4.1;
change all five together.

For hotfixes that go directly to prod: `hotfix/name-description` or
`name/hotfix/description`

## Workflow

### 1. Start Work

```bash
git checkout develop
git pull origin develop
git checkout -b feat/yourname-what-you-are-building
```

### 2. Push and Open a PR Against `develop`

```bash
git push -u origin feat/yourname-what-you-are-building
```

Open a PR targeting `develop` on GitHub. Since `develop` is the default branch,
GitHub will automatically set the correct target.

There are no per-PR preview deployments. Merging to `develop` deploys the shared
dev environment on Cloud Run (`dev.lingolinq.com`); test there after merge, or
run the app locally before opening the PR.

### 3. AI Review

The Codex GitHub connector is set to review every PR automatically, and a core team
member may request another review by commenting `@codex review`. No repository rule
requests a Copilot code review, though an author whose own Copilot plan has automatic
review turned on may still get one.

If your PR receives AI review comments, read and address them before requesting
human review. You do not need to accept every suggestion, but each one should be
acknowledged.

AI-generated code (from Copilot, Claude, or other tools) is held to the same
standard as human-written code. The person who opens the PR is responsible for
reviewing and understanding all code in it, regardless of who or what wrote it.

### 4. Get Human Review and Merge to `develop`

- Any team member can review and approve PRs to `develop`.
- Use **squash merge** to keep the commit history clean.
- Delete the feature branch after merge.
- `develop` auto-deploys to lingolinq-dev for integration testing.
- Do NOT push commits directly to `develop` -- always use a PR.

### 5. Promote to Staging

When a set of changes on `develop` is ready for pre-production validation, freeze that SHA so a later merge into `develop` cannot join the promotion or re-run its CI:

```bash
git fetch origin
git push origin origin/develop:refs/heads/release/develop-into-staging-YYYY-MM-DD
```

- Open a PR from that `release/develop-into-staging-*` branch to `staging`. Do **not** open the PR from live `develop`.
- **Approval from any one senior dev** is required: Traci is primary, Scot is
  secondary, and Melissa is backup when Traci is unavailable. Normally the
  senior dev who opened the PR talks it over with another one first, but when
  it is necessary they may merge it themselves without another review.
- Use a **merge commit** (not squash) so the history stays in sync.
- Delete the freeze branch after merge.
- `staging` auto-deploys to lingolinq-staging.

### 6. Promote to Production

After staging has been validated:

- A team member opens a PR from `staging` to `main`.
- **Two people must agree:** Scot and a senior dev (Melissa or Traci). One
  person never counts as both, and self-approval never counts.
- When Melissa or Traci opens the release PR, Scot approves it. When it is
  opened under Scot's account, Traci approves it, and Scot records his
  agreement by merging it himself after her approval, on the head she approved.
  For a release opened under Scot's account, if Traci is unavailable, the
  release waits for her. If Traci is unavailable and the release is an
  emergency, Scot may override (see "Emergency override" below).
- Agreement needs explicit human intent on the PR itself: opening it by hand,
  an approving GitHub review on the head being merged, or, for Scot, merging
  it. A release PR that an agent opens does not count as the opener's
  agreement. An agent approving or merging under a dev's account counts only
  when that dev explicitly asked for that specific action. Anything an agent
  does on its own initiative does not count, auto-merge never counts, and a
  chat message on its own is not agreement. Do not turn on auto-merge for a
  release PR; if it is on, turn it off before anyone approves.
- Opening covers the commits the PR held when it was opened. If the head
  changes after anyone has agreed, each earlier agreement is given again on the
  new head. GitHub does not let a PR's author approve it, so when an agent
  opened the PR, or the head changed after the opener agreed, the opener either
  closes it and opens a new release PR by hand, or the other of Melissa and
  Traci approves instead. When Scot opened it, his merge on the new head is his
  agreement.
- Use a **merge commit** (not squash).
- `main` auto-deploys to lingolinq-prod.

**Emergency override.** `main` needs an approving review from someone other
than the PR's author, and that applies to admins too. When Scot needs to merge
his own PR in an emergency and Traci is unavailable:

1. If Melissa is available, she approves it, and the merge goes ahead normally.
2. Otherwise Scot temporarily lowers the review requirement in `main`'s branch
   protection (required approvals and code-owner review). He leaves admin
   enforcement and every required status check on, so CI still has to pass.
3. He merges, then restores the review requirement straight away.
4. He records the emergency, the reason, and both protection changes in the PR.

### 7. Hotfixes

For urgent production issues:

1. Branch from `main`: `hotfix/yourname-description` or `yourname/hotfix/description`
2. Open a PR directly against `main`. **Approval from any one senior dev**
   (Traci, Scot or Melissa) is required. For a hotfix Scot opens, the
   emergency override in section 6 applies when no one else can approve it.
3. After merging to `main`, immediately cherry-pick or merge back to `develop`
   so the fix is not lost. Note: The `staging` branch will receive this fix during the next promotion from `develop`.

## Approval Summary

| Target Branch | Who Can Approve | Merge Strategy |
|---|---|---|
| `develop` | Any team member | Squash merge |
| `staging` | Any one senior dev: Traci (primary), Scot (secondary), Melissa (backup); the opener may merge alone when necessary | Merge commit |
| `main` | Scot + Melissa or Traci (Traci when Scot opens); no self-approval except the emergency override (section 6) | Merge commit |
| `main` (hotfix) | Any one senior dev: Traci, Scot or Melissa | Merge commit |

## Branch Protection Rules

The following protections are enforced at the repository level and apply to
everyone, including admins:

- **`main`**: Requires PR, requires 1 approval, no direct pushes, no force push
- **`staging`**: Requires PR, no direct pushes, no force push
- **`develop`**: Requires PR, no direct pushes

The approval summary above is team policy, and everyone is expected to follow it
even where GitHub would allow the merge without it.

## Dual-Reviewer Policy (Phase 1)

In addition to core team review, certain PRs require a
**dual-reviewer pass** before merge: one senior-dev review and one adversary
(red-team) review.

### When it is mandatory (Phase 1 scope)

A PR MUST receive the dual-reviewer pass before merge if it touches any of:

- Security (authn/authz, access control, secrets, encryption, `secure_serialize`)
- AI generation (any call to an external LLM; confirm it goes through `PiiScrubber`)
- User-data flows (anything reading or writing student / patient / guardian data)
- Feature flags (`lib/feature_flags.rb`)
- Mailers
- The performance-sensitive paths: `#tree`, `#bulk`, `global_id`, `board`,
  `board_content`, or `SlowWorker`

Backend-only changes with a genuinely internal surface area may skip the
feature-flag requirement but still need the dual-reviewer pass if they fall in
any category above.

### The two passes

1. **Senior-dev pass** (`/review-pr`): correctness, edge cases, security, privacy,
   performance, tests, and LingoLinq conventions. Prefer running this on a fresh
   model (e.g. Codex CLI) for independence from the author.
2. **Adversary pass** (`/adversary-review`): red-team scrub for security flaws,
   PII leakage, FERPA/HIPAA/GDPR exposure, and broken assumptions. Read-only; it
   flags, it does not fix.

### Gating

- **Critical** or **High** finding from either pass: blocks merge. Fix it in the
  PR, or get explicit sign-off to defer with a tracked follow-up issue.
- **Medium**: surface to the approver for triage.
- **Low**: log and continue.

### Phase 2

After the team has run Phase 1 on roughly five PRs without friction, the
dual-reviewer pass expands to all PRs. Until then, it applies only to the scope
above.

## Commit Messages

Format: `type: short description`

Types: `feat`, `fix`, `chore`, `upgrade`, `refactor`, `test`, `hotfix`

Examples:
- `feat: add district admin dashboard`
- `fix: resolve memory leak in Puma workers`
- `upgrade: bump Ember from 3.20 to 3.28`
- `chore: bump the Dockerfile base image to Node 22`

Keep the subject line under 72 characters. Add a blank line and longer description
if the change needs context.

## Running One-off Scripts in Production

Do NOT commit one-off scripts to the repo. Use a Cloud Run exec shell (or the
`lingolinq-migrate` job with overridden args; see `docs/INFRASTRUCTURE.md`) and
open the console through `bin/audit_console`, which sets `USER_KEY` so the
session is audited and your writes are attributed:

```bash
# Interactive console (best for ad-hoc work)
bin/audit_console

# One-liner
USER_KEY=you@example.com bin/rails runner "User.find_by(user_name: 'test').update!(settings: {})"

# Reusable rake tasks (these ARE committed to the repo)
bundle exec rake seed:organization
```

Rake tasks in `lib/tasks/` are the right place for repeatable operations like
seeding data. One-off user creation belongs in the Rails console.

## Code Standards

- User-facing strings: double quotes; all other strings: single quotes
- All user-facing text must use i18n helpers
- New features MUST have feature flags (AAC users are sensitive to UI changes)
- AI APIs NEVER see user-identifiable data (use PiiScrubber)
- Node 22 is the standard across the entire project. Use nvm to switch: `nvm use 22`
