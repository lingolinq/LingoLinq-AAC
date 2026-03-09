# LingoLinq Contributing Guide

## Branch Structure

| Branch | Deploys To | Purpose |
|---|---|---|
| `main` | lingolinq-prod | Production. Only receives merges from `staging`. |
| `staging` | lingolinq-staging | Pre-production validation. Merges from `develop`. |
| `develop` | lingolinq-dev | Integration branch. All feature PRs target this. |
| `name/type/description` | PR Preview (auto) | Individual work. Branched from `develop`. |

> **Note:** The staging branch is currently named `clean-release` and will be renamed to `staging`.

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

Open a PR targeting `develop` on GitHub.

Render automatically creates a **preview deployment** with its own URL for every PR
against `develop`. Use that URL to test your changes in isolation -- no shared
environments, no stepping on each other.

### 3. Get Review and Merge to `develop`

- Any team member can review and approve PRs to `develop`.
- Use **squash merge** to keep the commit history clean.
- Delete the feature branch after merge.
- `develop` auto-deploys to lingolinq-dev for integration testing.

### 4. Promote to Staging

When a set of changes on `develop` is ready for pre-production validation:

- A team member opens a PR from `develop` to `staging`.
- **Scot must approve** the PR to staging.
- Use a **merge commit** (not squash) so the history stays in sync.
- `staging` auto-deploys to lingolinq-staging.

### 5. Promote to Production

After staging has been validated:

- A team member opens a PR from `staging` to `main`.
- **Scot must approve** the PR to production.
- Use a **merge commit** (not squash).
- `main` auto-deploys to lingolinq-prod.

### 6. Hotfixes

For urgent production issues:

1. Branch from `main`: `yourname/hotfix/description`
2. Open a PR directly against `main`. **Scot must approve.**
3. After merging to `main`, immediately cherry-pick or merge back to `develop`
   so the fix is not lost.

## Approval Summary

| Target Branch | Who Can Approve | Merge Strategy |
|---|---|---|
| `develop` | Any team member | Squash merge |
| `staging` | Scot | Merge commit |
| `main` | Scot | Merge commit |
| `main` (hotfix) | Scot | Merge commit |

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
