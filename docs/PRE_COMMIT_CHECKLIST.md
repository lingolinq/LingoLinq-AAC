# Pre-Commit Checklist

Run these **before committing** so changes don't fail CI. The GitHub
workflow is `.github/workflows/ci.yml`.

## What CI gates on

Only **two** jobs block a PR (the other two are `continue-on-error: true`
and never fail the build):

| Job | Blocks PR? | What it runs |
|-----|-----------|--------------|
| `build-and-test` | ✅ yes | `npx ember build` then `npx ember test` (Chrome Headless; the test suite also runs ESLint + ember-template-lint as assertions) |
| `rspec` | ✅ yes | `rails db:create db:schema:load` then `bundle exec rspec` (Postgres 15 + Redis 7, `RAILS_ENV=test`) |
| `security-scan` | ❌ no | brakeman, bundle-audit, npm audit (`continue-on-error`) |
| `secret-detection` | ❌ no | gitleaks (`continue-on-error`) |

So: **a green local `ember build`, `ember test`, and `rspec` means CI's
required checks will pass.**

## Local commands

### 1. Frontend — `build-and-test`

```bash
cd app/frontend
npx ember build              # must succeed
npx ember test               # all pass / 0 fail (includes ESLint + hbs lint)
```

`ember test` already enforces `eslint .` and `ember-template-lint .`, so a
green `ember test` covers linting too. To lint in isolation:

```bash
cd app/frontend
npm run lint:js
npm run lint:hbs
```

### 2. Backend — `rspec`

Reproduce CI's database setup + suite locally. Use the documented local
credential prefix (no 1Password needed — `rspec` is a pure-DB operation):

```bash
# one-time / after a schema change — mirrors CI's "Setup database" step:
RAILS_ENV=test DB_USER=tracid PGPASSWORD=password \
  bundle exec rails db:create db:schema:load

# run the suite (or at minimum the specs covering your changed files):
RAILS_ENV=test DB_USER=tracid PGPASSWORD=password \
  bundle exec rspec
```

The full suite is large. At a **minimum**, run the specs that cover every
file you changed, e.g.:

```bash
RAILS_ENV=test DB_USER=tracid PGPASSWORD=password \
  bundle exec rspec spec/models/user_spec.rb \
                     spec/models/board_spec.rb \
                     spec/controllers/api/boards_controller_spec.rb \
                     spec/lib/json_api/board_spec.rb
```

Always re-run the whole `db:schema:load` step after a merge or any
`db/schema.rb` change — a broken schema fails **every** rspec example.

## Rules learned the hard way

- **Changed a default or constant? Update its specs.** Behavior changes
  (e.g. flipping a `preference_defaults` value) leave stale assertions
  that fail CI. Before committing such a change, grep the spec tree:

  ```bash
  grep -rn "<the_pref_or_constant>" spec/
  ```

  and update every assertion that encodes the old value.

- **After a merge**, re-run `db:schema:load` + the specs for every file
  with a conflict resolution, and a full `ember build` + `ember test`.

- Linting is not a separate gating job, but `ember test` will fail on any
  ESLint / ember-template-lint violation — treat lint as required.

- `security-scan` / `secret-detection` are advisory only; do not block on
  them, but do read gitleaks output for accidental secrets.
