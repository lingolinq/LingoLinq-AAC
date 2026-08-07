<!--
Delete any section that does not apply. The migration checklist is NOT optional
on a PR targeting `main`: since 2026-08-06 a merge into `main` automatically
builds, migrates the production database, and deploys, with no human between the
merge button and prod. See .github/workflows/deploy-cloudrun.yml.
-->

## What

<!-- One or two sentences. What changes for a user or an operator? -->

## Why

<!-- The problem this solves. Link the issue, incident, or finding. -->

## Testing

<!-- What you ran, and what you saw. "CI is green" is not testing. -->

---

## Database migrations

- [ ] **This PR contains no migration.** (Skip the rest of this section.)

If it does contain a migration, confirm each of these before requesting review:

- [ ] The migration is **expand-contract**: it only adds. No dropped or renamed
      column or table, no `NOT NULL` without a default, no in-place type change,
      and no removal of a job class that already-queued jobs may reference.
- [ ] The **old** application code still works against the **new** schema. A
      merge into `main` runs the migration BEFORE the new web revision exists,
      and the worker pool is replaced LAST, so both old-code-new-schema and
      new-web-old-worker states occur on every release.
- [ ] Anything destructive is deferred to a later release, after the code that
      used the old shape is gone from production.
- [ ] If the migration is long-running or uses `disable_ddl_transaction!`,
      you have checked it completes inside the 3600s task timeout. The migrate
      Job does not retry, by design.

If you cannot satisfy these, **do not merge to `main`**. Deploy it by hand with
someone watching, or schedule a maintenance window.

## Production impact

- [ ] No new environment variable or secret is required. (Otherwise: seed it in
      GCP Secret Manager and add it to the relevant set in
      `deploy-cloudrun.yml` FIRST, or the deploy fails at boot.)
- [ ] Rollback is understood. Traffic rollback is
      `gcloud run services update-traffic lingolinq-web --to-revisions <prev>=100`,
      which is only safe when the migration in this release is backward compatible.
