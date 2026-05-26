# Branch Naming Doc Generalization

## Goal

Rename the temporary Melissa task branch, move the working tree back onto
`omer/feat/beta-feedback-virtual-meeting`, and update the branch naming
documentation so it uses a developer placeholder instead of hard-coding Scot.

## Diagnosis

- The current task branch was named `fix/scot-beta-feedback-admin-table-width`
  even though the work is for Melissa, so the branch name needed correction.
- `CLAUDE.md` is the only place in the repo that hard-codes `scot-` as the
  branch naming convention.
- `staging` is ahead of `omer/feat/beta-feedback-virtual-meeting`, and its
  version of `CLAUDE.md` already generalizes the branch naming guidance to use
  a developer handle instead of Scot specifically.
- A full `staging` merge is not safe right now because `staging` also changes
  `app/frontend/app/styles/app.scss` and `docs/task-management/LEARNINGS.md`,
  both of which are already dirty in the working tree.

## Evidence

- `CLAUDE.md`
- `git diff omer/feat/beta-feedback-virtual-meeting..staging -- CLAUDE.md`
- `git diff --name-only omer/feat/beta-feedback-virtual-meeting..staging`

## Plan

1. Rename the temporary branch to use Melissa's name.
2. Apply the generalized branch naming guidance from `staging` to `CLAUDE.md`
   without attempting a full dirty-tree merge.
3. Switch the working tree back to `omer/feat/beta-feedback-virtual-meeting`
   since both branches currently point at the same commit.

## Result

- Renamed the temporary branch to `fix/melissa-beta-feedback-admin-table-width`.
- Updated `CLAUDE.md` so the branch naming convention uses a generic
  developer handle instead of hard-coding Scot, matching the current `staging`
  guidance.
- Switched the working tree back onto `omer/feat/beta-feedback-virtual-meeting`
  with all uncommitted changes preserved there.

## Notes

- I did not run a full `staging` merge because `staging` also changes
  `app/frontend/app/styles/app.scss` and `docs/task-management/LEARNINGS.md`,
  which were already dirty. Pulling only the generalized `CLAUDE.md` guidance
  was the safer way to satisfy the request without risking conflicts in active
  work.
