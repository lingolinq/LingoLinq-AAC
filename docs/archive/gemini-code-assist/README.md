# Gemini Code Assist configuration (archived 2026-09-12)

`config.yaml` and `styleguide.md` were the GitHub-app configuration for Gemini
Code Assist PR review, which lived at `.gemini/` in the repo root.

Why archived: the app's last PR comment in this repository was on 2026-03-10.
Since then every automated review has come from Copilot code review (enabled
by a repository ruleset on `develop`), and the styleguide had drifted from the
codebase (it named Sidekiq where the app runs Resque, said the app was on
Render, and told the reviewer to flag native DOM manipulation that `CLAUDE.md`
recommends).

To restore: move both files back to `.gemini/`, fix the three drifted rules,
and re-enable the app on the GitHub org. Nothing else references them.
