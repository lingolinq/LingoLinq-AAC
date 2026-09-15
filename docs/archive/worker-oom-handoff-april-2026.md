# Worker / print / copy failure investigation — handoff

**Created:** 2026-04-17 (end of long thread)
**Starting thread:** new rails-ember-dev thread
**Suggested first prompt:** Read this file at `docs/handoff-worker-oom.md`, then investigate the symptoms below. Begin with section "Suspected root cause" since the prior thread already ruled out memory.

---

## Symptom as reported by user

Board copy and PDF print operations on dev/staging appear to hang or fail, despite only a couple of users playing with the app. Scot's initial hypothesis: the background worker is "reaching its limit." He asked whether recent perf work (PR #174 memory optimizations) fully fixed the problem.

## What the prior thread actually verified

### Worker is NOT hitting memory limit
- **Service:** `lingolinq-dev-staging-worker` (`srv-d66jbilum26s73aa7mn0`), standard 2GB plan
- **Memory usage last 34h:** min 248 MB, **peak 508 MB**, limit 2047 MB
- **Instance restarts:** 1 instance in 34h (zero restarts)
- Conclusion: worker has ~1.5 GB of headroom. Not memory-bound.

### Staging web is NOT hitting memory limit, but IS restarting
- **Service:** `lingolinq-staging` (`srv-d510c13e5dus73c8lg10`), standard 2GB plan
- **Memory usage last 34h:** typically 450-680 MB, peak 782 MB, limit 2047 MB
- **Instance restarts:** 7 different instance IDs in 34h. Likely caused by deploys (multiple PRs merged in this window: #186, #187, #188, #189, #190, #191). Possibly some crash restarts too — worth confirming.
- Conclusion: not OOM. May be deploys, may be signal-kill or healthcheck flaps. Check deploy history and logs around each instance change.

### The actual symptom in the logs — S3 BadRequest

Repeating errors on staging web, same path, same `code=BadRequest`:

```
Uploader.check_existing_upload Aws::S3::Errors::ServiceError
  path=extras-cache_2079/button_set_cache/1_2079/chksme2629/
       fcc88e7aef9088e6dd36efd3a8bacc3fcce082dc0a1272bace662e954a8b8ee901bf63b8d950b36ea38c8e5dd9b1318f5c5dfd837aea166e3623fb17cc85fd3e.json
  code=BadRequest
  message=Aws::S3::Errors::BadRequest
```

Fires on every request that looks up this cached button set (multiple per board load, many per copy). The request then falls back to proxying the same URL, which returns successfully. That fallback path works BUT:
- Every cache miss round-trips S3 twice
- The error-then-proxy pattern would make copy/print feel slow and unreliable
- Repeated S3 errors may hit rate limits or accumulate costs

This is very likely what Scot is perceiving as "worker reached its limit" — it's not a limit, it's a broken S3 code path on the hot copy/print flow.

## Suspected root cause

PR #191 ("refactor: migrate from s3 gem to aws-sdk-s3") merged to staging recently. The `Uploader.check_existing_upload` method is the first suspect. A signed HEAD request shape that worked under the old `s3` gem may be malformed under `aws-sdk-s3`, producing BadRequest responses from S3 instead of a 200/404.

Also worth checking: PR #186 ("Enhance S3 upload error handling") — it may have changed the error handling around this path in a way that masks a regression.

## Recent PRs relevant to this surface

| PR | Title | Author | Merged |
|---|---|---|---|
| #191 | refactor: migrate from s3 gem to aws-sdk-s3 | MelissaOneil | 2026-04-17 |
| #186 | Enhance S3 upload error handling and button suggestion logic | MelissaOneil | 2026-04-15 |
| #179 | Replace rubyzip ZIP writing with zip_kit for streaming exports | swahlquist | 2026-04-13 |
| #174 | perf: reduce memory usage and speed up board exports (incl. Clowne) | swahlquist | 2026-04-13 |

PR #191 landed 2026-04-17. The user's report came after that. Correlation is strong.

## Files to read first

In the LingoLinq-AAC repo at the repository root:

- `lib/uploader.rb` — look at `check_existing_upload` and its S3 client setup
- `lib/button_set.rb` and `app/models/button_set.rb` — button_set_cache path consumers
- `Gemfile` and `Gemfile.lock` — confirm `aws-sdk-s3` version pinned by PR #191
- `config/initializers/s3.rb` or equivalent — client config (region, signature version, virtual-hosted style)
- `lib/converters/lingo_linq.rb` — board export path; it calls Uploader during print

## Useful queries to run

Render log query for the S3 BadRequest burst across a wider window:

```
list_logs(
  resource: ["srv-d510c13e5dus73c8lg10"],
  startTime: "2026-04-16T00:00:00Z",
  endTime: "2026-04-18T04:00:00Z",
  text: ["BadRequest", "Aws::S3::Errors"],
  limit: 100
)
```

Diff of `lib/uploader.rb` before/after PR #191:

```
git log --oneline origin/staging -- lib/uploader.rb | head -10
git show <PR_191_SHA> -- lib/uploader.rb
```

Bundle diff for the S3 SDK change:

```
git show <PR_191_SHA> -- Gemfile Gemfile.lock | grep -E "aws-sdk|s3"
```

## Investigation steps

1. **Reproduce in dev.** Start the app locally, open a board with a button set, watch logs. If the BadRequest fires consistently, you have a repro.
2. **Diff `lib/uploader.rb` before and after #191.** Focus on the client initialization and any HEAD request shape change.
3. **Check signature version and path style.** `aws-sdk-s3` defaults to `force_path_style: false` and signature v4. If the old gem used v2 signatures or virtual-hosted buckets, there can be subtle region/host mismatches.
4. **Check region configuration.** `aws-sdk-s3` is strict about region mismatches and returns BadRequest when a client is pointed at a wrong region.
5. **Check `STOP_CACHING` / `QUEUE_PRESSURE` env vars on staging.** In `config/initializers/resque.rb` the `any_queue_pressure?` method returns true if `STOP_CACHING` is set, which would disable all the caching on the board/copy path and make everything feel broken for the wrong reason.
6. **Check Bugsnag.** The `S3 ServiceError` probably has a stack trace captured. Look for the full error including `Net::HTTP` request details.

## Render service inventory (current as of 2026-04-17)

| Service | ID | Role | Plan |
|---|---|---|---|
| `lingolinq-staging` | `srv-d510c13e5dus73c8lg10` | web (staging) | standard 2GB |
| `lingolinq-dev` | `srv-d510c5emcj7s73966pug` | web (dev) | starter 512MB |
| `lingolinq-prod` | `srv-d510bsemcj7s73966i60` | web (prod) | standard 2GB |
| `lingolinq-dev-staging-worker` | `srv-d66jbilum26s73aa7mn0` | worker (dev + staging) | standard 2GB |
| `lingolinq-prod-worker` | `srv-d66jbgogjchc73erhnfg` | worker (prod) | starter 512MB |
| `lingolinq-prod-scheduler` | `crn-d68nfmbnv86c73eho6vg` | cron | starter |

**Architectural note:** ONE worker service handles BOTH dev and staging queues. That's a correctness concern even without the S3 issue. If a job enqueued by the dev web lands on the same worker as a staging job, they share state and Redis namespace. Out of scope for this investigation but worth flagging.

## What Scot should hear after diagnosis

- Confirmation that the worker memory theory was wrong
- Plain-English explanation of the actual failure (S3 BadRequest on cached lookups)
- Whether PR #191 needs a hotfix or a revert
- Whether the issue also affects prod (check `lingolinq-prod` logs for the same error pattern)
- Estimated blast radius: is every user hitting this, or only users with cached button sets matching the failing pattern?

## Prior thread artifacts (for reference, don't re-read unless needed)

- `gh pr view 177 --repo lingolinq/LingoLinq-AAC` — rebased security/licensing PR
- `gh pr view 184 --repo lingolinq/LingoLinq-AAC` — Tarheel kill-switch
- `gh pr view 193 --repo lingolinq/LingoLinq-AAC` — BoardSetCopier integration spec
- Memory file: `~/.claude/projects/-home-<dev-user>/memory/render-puma-config.md`
