# Migrate Job ran on the static cache token (GitHub #423)

**Found** while reviewing #1168. `RedisInit.resolved_cache_token` (`config/initializers/resque.rb`) returns `CACHE_TOKEN`, else `K_REVISION`, else `'abc'`, and `RedisInit.init` reads it at every Rails boot. In `.github/workflows/deploy-cloudrun.yml` the migrate Job was deployed with `--set-secrets "$BOOT_SECRETS"` only, `CACHE_TOKEN` sat in `NON_BOOT_SECRETS`, and Cloud Run Jobs get no `K_REVISION`. So every deploy's migration and every one-off `rails runner` or console through the Job used `'abc'`.

**Change.** `CACHE_TOKEN` moved from `NON_BOOT_SECRETS` to `BOOT_SECRETS`. Every other consumer (the existence check, web, the worker pool, the scheduler and its readback, `assert-runtime-secrets`) takes the union of both sets, so only the migrate Job gains a secret. Both run as `$RUNTIME_SA`, which already reads `CACHE_TOKEN`. Hand recipes that copy `$BOOT_SECRETS` (for example `scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md`) now pick it up too.

**Red/green.** `spec/config/deploy_cloudrun_secrets_spec.rb` failed on `develop` ("puts CACHE_TOKEN in the boot set": expected 1, got 0) and passes after the move; with `spec/initializers/resque_redis_options_spec.rb`, 27 examples, 0 failures. `scripts/ai-endpoint-guard.sh` still passes.

**Not done here: failing closed (#423's second option).** Raising at boot on Cloud Run when `CACHE_TOKEN` is blank would also catch a web revision that loses it and silently uses `K_REVISION`. It must key on Cloud Run's own env (`K_SERVICE`, `CLOUD_RUN_JOB`, `CLOUD_RUN_WORKER_POOL`), not `Rails.env.production?`, because the Docker build runs `assets:precompile` in production mode with no `CACHE_TOKEN`. Two operator checks are needed first, and they need GCP access:
- list the hand-made Cloud Run Jobs in both projects that boot Rails without `CACHE_TOKEN` (at least `lingolinq-admin-audit` in prod), since they would fail at boot on their next image bump;
- confirm the latest `CACHE_TOKEN` version is non-blank in both projects (byte length only), since a blank value would crash every new instance on scale-out.

Separate and unverified: the migrate Job gets no `APP_ENV_VARS`, so it has no `REDIS_NAMESPACE_SUFFIX`. If nonprod web and the worker use `-dev` (`docs/INFRASTRUCTURE.md`), the nonprod migrate Job's cache and Resque keys use the unsuffixed namespaces instead. That predates this change; the live variable value was not checked.
