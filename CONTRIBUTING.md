# LingoLinq Contributing Guide

> **External contributors:** All pull requests should target the `develop` branch,
> not `main`. The `develop` branch is the default branch for this repository.
> PRs targeting `main` directly will be closed unless they are approved hotfixes.

## Branch Structure

| Branch | Deploys To | Purpose |
|---|---|---|
| `main` | lingolinq-prod | Production. Only receives merges from `staging`. |
| `staging` | lingolinq-staging | Pre-production validation. Merges from `develop`. |
| `develop` | lingolinq-dev | Integration branch. **All PRs target this branch.** |
| `name/type/description` | PR Preview (auto) | Individual work. Branched from `develop`. |

## Contributor Access

| Role | Who | Preview Deploys | PR Review By |
|---|---|---|---|
| **Core team** | Added as org collaborators | Yes -- Render auto-deploys a preview URL for every PR to `develop` | Gemini Code Assist (auto) + human reviewer |
| **External contributors** | Anyone via fork | No preview deploy | Gemini Code Assist (auto) + core team reviewer |

External contributors: fork the repo, branch from `develop`, and open a PR back
to `develop`. A core team member will review your PR and may request changes.

## Branch Naming

Format: `name/type/short-description`

- `name` -- your first name or GitHub username (lowercase)
- `type` -- one of: `feature`, `fix`, `chore`, `hotfix`, `upgrade`, `release`
- `short-description` -- 2-4 words, kebab-case

Examples:
- `melissa/feature/add-sso-login`
- `scot/fix/memory-leak-puma`
- `dom/chore/update-ember-deps`

For hotfixes that go directly to prod: `name/hotfix/description`

## Workflow

### 1. Start Work

```bash
git checkout develop
git pull origin develop
git checkout -b yourname/feature/what-you-are-building
```

### 2. Push and Open a PR Against `develop`

```bash
git push -u origin yourname/feature/what-you-are-building
```

Open a PR targeting `develop` on GitHub. Since `develop` is the default branch,
GitHub will automatically set the correct target.

For core team members, Render automatically creates a **preview deployment** with
its own URL for every PR against `develop`. Use that URL to test your changes in
isolation -- no shared environments, no stepping on each other.

### 3. Automated AI Review

Every PR automatically receives a code review from **Gemini Code Assist**. It will:
- Post a summary of your changes
- Leave inline code suggestions
- Flag potential issues

Please read and address Gemini's feedback before requesting human review. You do
not need to accept every suggestion, but each one should be acknowledged.

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

When a set of changes on `develop` is ready for pre-production validation:

- A team member opens a PR from `develop` to `staging`.
- **Scot must approve** the PR to staging.
- Use a **merge commit** (not squash) so the history stays in sync.
- `staging` auto-deploys to lingolinq-staging.

### 6. Promote to Production

After staging has been validated:

- A team member opens a PR from `staging` to `main`.
- **Scot must approve** the PR to production.
- Use a **merge commit** (not squash).
- `main` auto-deploys to lingolinq-prod.

### 7. Hotfixes

For urgent production issues:

1. Branch from `main`: `yourname/hotfix/description`
2. Open a PR directly against `main`. **Scot must approve.**
3. After merging to `main`, immediately cherry-pick or merge back to `develop`
   so the fix is not lost.

## Approval Summary

| Target Branch | Who Can Approve | Merge Strategy |
|---|---|---|
| `develop` | Any team member | Squash merge |
| `staging` | Melissa (Scot backup) | Merge commit |
| `main` | Melissa + Scot agree | Merge commit |
| `main` (hotfix) | Scot or Melissa | Merge commit |

## Branch Protection Rules

The following protections are enforced at the repository level:

- **`main`**: Requires PR, requires 1 approval, no direct pushes, no force push
- **`staging`**: Requires PR, requires approval from Scot
- **`develop`**: Requires PR, no direct pushes

These rules apply to all contributors, including admins.

## Commit Messages

Format: `type: short description`

Types: `feat`, `fix`, `chore`, `upgrade`, `refactor`, `test`, `hotfix`

Examples:
- `feat: add district admin dashboard`
- `fix: resolve memory leak in Puma workers`
- `upgrade: bump Ember from 3.20 to 3.28`
- `chore: update Render build script for Node 20`

Keep the subject line under 72 characters. Add a blank line and longer description
if the change needs context.

## Running Scripts on Render

Do NOT commit one-off scripts to the repo. Use the Render shell instead:

```bash
# Interactive console (best for ad-hoc work)
bundle exec rails console

# One-liner
bundle exec rails runner "User.find_by(user_name: 'test').update!(settings: {})"

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
- Ember frontend: Node 18 only. AI tools: Node 20. Use nvm to switch.
