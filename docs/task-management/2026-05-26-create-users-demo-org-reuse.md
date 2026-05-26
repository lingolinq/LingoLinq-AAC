# Task Log: create_users demo org reuse

## Goal

Make `scripts/create_users.rb` idempotent for local/dev use so it can create or update the demo admin users without crashing when a non-admin `Organization` row already exists.

## Context

- User needs an admin-capable test user to validate branch changes.
- Running `bundle exec rails runner scripts/create_users.rb` failed during demo org setup.

## Evidence

- `scripts/create_users.rb` attempted `Organization.create(admin: false, ...)`.
- `db/schema.rb` defines `t.index ["admin"], name: "index_organizations_on_admin", unique: true`.
- Postgres raised `PG::UniqueViolation` with `Key (admin)=(f) already exists`.
- `db/seeds.rb` already handles this singleton pattern with `Organization.find_by(admin: false) || Organization.new`.

## Root Cause

`scripts/create_users.rb` looks up the demo organization by decrypted `settings['name']`, but the schema only allows one `organizations.admin = false` row. If that singleton row already exists with different settings, the script misses it and tries to insert a duplicate `admin: false` organization.

## Plan

1. Reuse the existing non-admin organization via `Organization.find_by(admin: false) || Organization.new`.
2. Preserve the intended demo org settings by assigning them before `save!`.
3. Re-run the script and confirm it completes.

## Attempts

- Updated `scripts/create_users.rb` to reuse the singleton non-admin organization and `save!` it with demo settings.
- Re-ran the script. The unique-index failure was gone, but execution then failed in `Organization#add_supervisor` with `no premium supporter licenses available`.
- Traced `Organization#add_supervisor` and confirmed premium supervisor assignment requires `settings['total_supervisor_licenses']` to exceed the current premium supervisor count.
- Aligned the script's demo org settings with the existing seed pattern by adding `total_supervisor_licenses` and related demo-org settings.
- Added a `demo_org.supervisor?(nyc)` guard before calling `add_supervisor` so reruns stay safe.

## Result

`DB_USER=melissa CREATE_USERS_DEFAULT_PASSWORD=... bundle exec rails runner scripts/create_users.rb` now completes successfully. The script updates or creates `larry`, creates `NYC_test`, reuses the singleton non-admin organization, links `NYC_test` as manager, and adds `NYC_test` as supervisor.
