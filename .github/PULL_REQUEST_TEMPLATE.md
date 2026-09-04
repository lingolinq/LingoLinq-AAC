<!--
Delete any section that does not apply.

The migration checklist is NOT optional on a PR targeting `main`. Once the
automatic pipeline is live on `main`, merging there creates a production
deployment request. It proceeds when a reviewer approves it in the `production`
environment. Note that an unapproved run counts as in progress and BLOCKS every
later merge from deploying until it is approved or rejected; it is not
superseded by them.

The approval is a pause, not a review step: nobody re-reads the migration at
that point, and no later gate looks at it either. The automated gates that do
run after approval (secret presence, the candidate health probe, the traffic
read-back) check that the app boots and serves. None of them can tell whether
your migration was safe. Review the migration BEFORE you merge.
See .github/workflows/deploy-cloudrun.yml.
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
- [ ] Rollback is understood. Find the revision to go back to, then pin it:

      gcloud run revisions list --service lingolinq-web --region us-central1 \
        --sort-by=~metadata.creationTimestamp

      gcloud run services update-traffic lingolinq-web \
        --region us-central1 --to-revisions REVISION_NAME=100

      (Substitute the real revision name. Do not paste a `<placeholder>`: the
      angle brackets are shell redirection and bash will fail with a confusing
      "No such file or directory" instead of running gcloud.)

      Three things to know. It is only safe when the migration in this release
      is backward compatible, since rolling code back does not roll the schema
      back. After any successful run of the deploy workflow the service is
      pinned by revision name (it pins to the revision it verified and never
      uses `--to-latest`), so this command usually replaces one pin with
      another; check first with `gcloud run services describe lingolinq-web
      --region us-central1 --format='value(spec.traffic)'`, because if the
      service is still on `latestRevision` this command CREATES a pin, and the
      next manual deploy will then serve 0%.
      And the NEXT successful deploy will move traffic to its own newly verified
      revision, which undoes this rollback -- so if you rolled back because a
      commit is bad, revert or fix the commit, do not just re-run the deploy.
      Nothing here touches the worker pool; roll that back separately.
