# Contributing to LingoLinq-AAC

Thank you for helping improve an open-source AAC application. Before opening a pull request, make sure you understand the user impact of your change and have tested the affected code.

## Branch workflow

The shared integration branch is `staging`. Create work from `staging` and target pull requests back to `staging`.

```bash
git checkout staging
git pull origin staging
git checkout -b feat/scot-short-description
```

Use the naming pattern `<type>/<name>-<description>`, for example:

- `feat/scot-new-board-picker`
- `fix/scot-sync-timeout`
- `chore/scot-documentation-cleanup`

Use `feat`, `fix`, `chore`, `docs`, `perf`, `refactor`, `test`, `compliance`, or `security` as appropriate. Keep the branch focused and delete it after merge when practical.

## Pull requests

Each pull request should include:

- A concise description of the user or operational problem.
- The files and behavior changed.
- Tests run and their results.
- Known limitations or follow-up work.
- A note identifying AI assistance when it materially contributed to the change.

Do not paste private prompts, session URLs, credentials, user data, or generated transcripts into commits, pull requests, or repository files. AI-generated code is held to the same review and testing standard as human-written code; the person opening the pull request remains responsible for understanding it.

Target `staging` unless a release or hotfix process explicitly requires another branch. Do not push directly to protected branches.

## Before requesting review

Run the checks relevant to your change:

```bash
git diff --check
bundle exec rspec
cd app/frontend
npx ember test
npm run lint:js
npm run lint:hbs
```

It is fine to run a smaller targeted suite during development, but include the exact commands and results in the pull request. Do not claim a test passed if it did not run.

## Code conventions

- Add backend tests for backend behavior and frontend QUnit tests for frontend behavior.
- Put user-facing strings through the existing i18n helpers.
- Use double quotes for user-facing strings and single quotes for internal strings.
- Put user-facing changes behind feature flags when appropriate.
- Preserve accessibility, localization, offline behavior, and packaged-app compatibility.
- Validate inputs and keep secrets in environment variables.
- Prefer focused edits over broad generated rewrites.

## Documentation

Update the most relevant documentation when behavior, setup, deployment, or operational procedures change. Keep temporary investigation notes and generated reports out of general contributor documentation; place durable material under `docs/` and label historical reports clearly.

For architecture and operations, start with `docs/`. For agent-specific instructions, use `CLAUDE.md` or `GEMINI.md`; those files should describe repository constraints, not store session transcripts or one-off plans.

## License and contributions

LingoLinq-AAC is licensed under AGPLv3 or later. Review [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), and any contributor agreement requirements before submitting code.
