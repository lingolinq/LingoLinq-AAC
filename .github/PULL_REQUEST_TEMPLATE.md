<!--
Delete any section that does not apply.

The migration checklist is NOT optional on a PR targeting `main`. Once the
automatic pipeline is live on `main`, merging there creates a production
deployment that builds, migrates the production database, and rolls out, gated
only by an environment approval click. There is no other human step, and no
opportunity to review the migration after the merge. See
.github/workflows/deploy-cloudrun.yml.
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
      merge into `main` runs the migration BEFORE the new web revision takes
      traffic, and the worker pool is replaced LAST, so both old-code-new-schema
      and new-web-old-worker states occur on every release. If the health gate
      rejects the new revision, the migration stays applied while the OLD
      revision keeps serving, so old-code-new-schema can persist indefinitely.
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
- [ ] Rollback is understood. Traffic rollback is:

      gcloud run services update-traffic lingolinq-web \
        --region us-central1 --to-revisions <prev>=100

      Two caveats. It is only safe when the migration in this release is
      backward compatible, since rolling code back does not roll the schema
      back. And it PINS the service to that revision, clearing
      `latestRevision`, so every later deploy will create a revision that takes
      no traffic until someone runs `--to-latest`. The deploy workflow does that
      un-pinning for you on its next successful run.
      Neither command touches the worker pool; roll that back separately.
