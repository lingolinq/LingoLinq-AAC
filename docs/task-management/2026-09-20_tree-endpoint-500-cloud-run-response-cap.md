# `Api::BoardsController#tree` returns 500: Cloud Run response cap + the un-gated image N+1

**Started:** 2026-09-20
**Status:** done (diagnosis only). Handed to the dev team for the fix. No code change in this PR.
**Scope:** `GET /api/v1/boards/:board_id/tree` 500s on every board-detail entry for a
large board set. Two distinct failure modes, one shared root cause. Present on
`develop`, `staging` AND `main`.

**Handoff:** Melissa or Traci (either, per the 2026-09-14 ownership boundary). Assign
one name. Scot retains the compliance finding in "Side finding" below and the Cloud Run
scaling change.

**Related:** issue #286 (OPEN), remediations #2 and #3. See
`docs/ops/MVP_PUNCHLIST_2026-05-22.md:61`.

---

## TL;DR for whoever picks this up

`lib/json_api/board.rb:244` calls `board.images_and_sounds_for(args[:permissions])`
**without the `:as_lite` gate** that every enrichment around it has. Its cache is
read-live but write-disabled (`app/models/board.rb:2546`, `set_cached` commented out).
So `#tree` runs that lookup once per board with no caching: 120 lookups and 266 AR
queries for one Vocal Flair 84 tree, producing a response over Cloud Run's 32 MiB
HTTP/1 cap.

That is issue #286 remediation #3, scoped in May and never done. What is new is that
**Cloud Run added a hard response ceiling that Render never had**, so a payload problem
that used to be merely slow is now a guaranteed 500.

**It affects production.** Verified against the deployed commits, not inferred.

---

## Goal

Explain why a fresh account reaching its first board sees a 500, with evidence, and
hand a scoped fix to the dev team. Explicitly out of scope: writing the fix.

---

## The originally reported symptom, and why it was a red herring

Reported as: brand-new account (`claudetest1`) on dev reaches its first board, sees the
speak-mode guided tour ("Your board is ready. This is Speak Mode..."), clicks
"Skip tour", gets a full-page 500 "Something Broke".

**"Skip tour" issues no server request.** `_scheduleBoardDetailSpeakAutoOpen` calls
`_startTour()` with no options (`app/frontend/app/components/guided-tour.js:966`), so no
`afterComplete` handoff is bound (`:1174`), and `_markTourCompleted` is bound to
`complete` only, never `cancel` (`:1161`). There is no endpoint behind that button.

What the tour does contribute is **load**. `guided-tour.js:883` (`_startSpeakingHandoff`)
polls the same full `/tree` up to 15 times. Its `MAX_ATTEMPTS = 15` is documented as
"~15s at 1s intervals" but the interval is measured from each *settled* response, so with
10-15s responses it ran for 93 seconds (`21:23:38` through `21:25:11`). That is what
saturated the single dev instance.

---

## Investigation

### Failure mode 1 (primary): Cloud Run 32 MiB HTTP/1 response cap

Load-independent. Fires on an idle instance. This is the one that reproduces on every
page load.

Cloud Run caps HTTP/1 responses at **32 MiB** when `Transfer-Encoding: chunked` or
streaming is not used (https://docs.cloud.google.com/run/quotas). `lingolinq-web-dev`
and `lingolinq-web` both serve plain HTTP/1 to the container (no `h2c` on the port;
request logs record `protocol: HTTP/1.1`). `app/controllers/api/boards_controller.rb:459`
does a single buffered `render json:`.

Evidence, from `run.googleapis.com/varlog/system` on `lingolinq-web-dev`:

```
2026-09-20T21:23:48.870459Z  WARNING  Response size was too large. Please consider reducing response size.
2026-09-20T21:23:53.221820Z  WARNING  Response size was too large. Please consider reducing response size.
2026-09-20T21:24:49.710535Z  WARNING  Truncated response body. Usually implies that the request timed out or the application exited before the response was finished.
2026-09-20T21:29:11.146224Z  WARNING  Response size was too large. Please consider reducing response size.
2026-09-20T22:11:59.095408Z  WARNING  Response size was too large. Please consider reducing response size.
2026-09-20T22:12:05.422122Z  WARNING  Response size was too large. Please consider reducing response size.
```

Each lands on the millisecond a `/tree` request ended:

| `/tree` start | latency | computed end | warning |
|---|---|---|---|
| 21:23:38.625 | 10.235s | 21:23:48.860 | **21:23:48.870** |
| 21:23:47.137 | 6.083s | 21:23:53.220 | **21:23:53.222** |
| 21:29:02.312 | 8.832s | 21:29:11.144 | **21:29:11.146** |
| 21:11:59.360 (Rails start) | ~6.06s | 22:12:05.42 | **22:12:05.422** |

The cleanest case is request `815de102-bb22-4727-b18e-d1f968f8efaf`, on an otherwise
idle instance (`/api/v1/users/self` 149ms and the SPA shell 84ms in the same second):

```
22:11:47.434 INFO -- : [815de102-...] Started GET "/api/v1/boards/claudetest1/vocal-flair-84/tree" for [REDACTED_IP] at 2026-09-20T22:11:47+00:00
22:11:47.436 INFO -- : [815de102-...] Processing by Api::BoardsController#tree as */*
22:11:47.436 INFO -- : [815de102-...]   Parameters: {"board_id" => "[FILTERED]"}
22:11:47.436 INFO -- : [815de102-...] Request ID 815de102-bb22-4727-b18e-d1f968f8efaf
```

That is the **entire** log for it. No `Completed`, no exception, no rack-timeout verdict.
Cloud Run reported `status 500`, `latency 11.663s`, empty body. The Ruby process was
still writing when Cloud Run severed the response. **There is no Ruby exception to find
for this mode**, which is why it is easy to miss.

### Failure mode 2 (secondary): `Rack::Timeout` under saturation

This is the one that produced the full-page "Something Broke".

Request `6d422c21-0f8c-41bd-bbe4-bbe9cfe9cb39`:

```
I, [2026-09-20T21:25:13.197211 #21] INFO -- : [6d422c21-...] Started GET "/api/v1/boards/claudetest1/vocal-flair-84/tree" for [REDACTED_IP] at 2026-09-20T21:25:13+00:00
I, [2026-09-20T21:25:13.203864 #21] INFO -- : [6d422c21-...] Processing by Api::BoardsController#tree as */*
E, [2026-09-20T21:26:21.312049 #21] ERROR -- : [6d422c21-...]
[6d422c21-...] Rack::Timeout::RequestTimeoutException (Request ran for longer than 15000ms ):
[6d422c21-...]
[6d422c21-...] config/initializers/write_freeze.rb:119:in 'WriteFreeze::Middleware#call'
I, [2026-09-20T21:26:56.831540 #21] INFO -- : [6d422c21-...] source=rack-timeout id=70286bd0-... timeout=15000ms service=103306ms state=completed
```

The one-frame backtrace is all Rails logged; rack-timeout raises asynchronously at an
arbitrary point and the backtrace cleaner keeps only the outermost app frame.

A completed sibling, request `6859120f`, shows the cost:

```
I, [2026-09-20T21:29:28.574478 #127] INFO -- : [6859120f-...] Completed 500 Internal Server Error in 15344ms (ActiveRecord: 2819.4ms (266 queries, 70 cached) | GC: 952.9ms)
```

Between `Started` and that line it logged **120 `start images_and_sounds lookup` /
`end ...` pairs**.

**The page the user actually saw** is a different request, `37647eb1`:

```
I, [2026-09-20T21:25:35.516600 #16] INFO -- : [37647eb1-...] Started GET "/claudetest1" for [REDACTED_IP] at 2026-09-20T21:25:35+00:00
I, [2026-09-20T21:27:39.020946 #16] INFO -- : [37647eb1-...] source=rack-timeout id=abc6dcee-... timeout=15000ms service=129194ms state=completed
```

Cloud Run: `status 500`, `latency 139.197s`, `responseSize 4234`. `public/500.html` is
4043 bytes and contains `<h1>Something Broke</h1>` at `:134`; the balance is response
headers.

Starvation is directly visible. A trivial endpoint took **13.7 seconds to get from
`Started` to `Processing by`** (request `7ac80c46`):

```
I, [2026-09-20T21:25:25.000115 #16] INFO -- : [7ac80c46-...] Started GET "/api/v1/progress/1_128_..." at 2026-09-20T21:25:24+00:00
I, [2026-09-20T21:25:38.729675 #16] INFO -- : [7ac80c46-...] Processing by Api::ProgressController#progress as JSON
E, [2026-09-20T21:27:39.017928 #16] ERROR -- : [7ac80c46-...]
[7ac80c46-...] Rack::Timeout::RequestTimeoutException (Request ran for longer than 15000ms ):
```

### Root cause, shared by both modes

`lib/json_api/board.rb:243-244`:

```ruby
self.trace_execution_scoped(['json/board/images_and_sounds']) do
  hash = board.images_and_sounds_for(args[:permissions])
```

This call is **not** gated on `args[:as_lite]`. Everything around it is: `:169`
(parent_board), `:195`, `:213`, `:271` (the per-image `ButtonImage.find_by_global_id`
skin lookup, whose own comment calls it "the dominant N+1 ... RCA 2026-05-24, issue
#286"), `:322`, `:339`. Remediation #1 (PR #294) removed the leaves and left the
enclosing call.

And the cache is write-disabled. `app/models/board.rb:2508-2546`:

```ruby
key = "images_and_sounds_for/#{user ? user.cache_key : 'nobody'}"
res = get_cached(key)
return res if res
Rails.logger.warn('start images_and_sounds lookup')
...
bis = self.known_button_images          # ButtonImage.find_all_by_global_id, per board
protected_sources = (user && user.enabled_protected_sources(true)) || []
ButtonImage.cached_copy_urls(bis, user, nil, protected_sources)
...
Rails.logger.warn('end images_and_sounds lookup')
# This fills up half the cache, so no.
# set_cached(key, res)
```

`get_cached` is live, `set_cached` is commented out, so the read **always** misses. That
is literally issue #286 remediation #3 ("request-scoped image cache"), still open.

`MAX_TREE = 500` (`boards_controller.rb:418`) caps the fan-out. 120 was already enough.

### Why it repeats rather than failing once

`app/frontend/app/routes/user/board-detail.js:197-200` does a two-phase load:
`/tree?root_only=1` to paint, then **the full `/tree` in the background on every
board-detail entry**. Confirmed 500ing at `21:25:13`, `21:25:35`, `21:29:02`, `21:29:12`,
`22:11:47`, `22:11:59`.

The failure is swallowed by design: `app/frontend/app/utils/board_detail_cache.js:496-498`
(`warm_full_tree_if_root_only`) has an explicit rejection handler returning
`{ warmed: false }`. That is why **the board still renders and nothing surfaces to the
user** except cold folder taps. It is silent, not absent.

---

## Hypotheses considered and REFUTED. Please do not re-run these.

**1. "The `/tree` 500 is an ownership problem, because the home board is not owned by
the account."** No, on both counts.

The board *is* owned. `GET /api/v1/boards/claudetest1/vocal-flair-84` returned 200 at
`21:24:51`, and at `21:25:06` all twelve children returned 200 under the account's own
namespace (`claudetest1/vocal-flair-84-{questions,people,actions,social,places2,time,`
`categories,feelings,describe,colors,small-words,keyboard}`). The copy ran.

And the controlled comparison, same board, same user, same token, half a second apart:

```
22:11:46.906  200  0.156s  GET /api/v1/boards/claudetest1/vocal-flair-84/tree?root_only=1
22:11:47.430  500 11.663s  GET /api/v1/boards/claudetest1/vocal-flair-84/tree
```

`boards_controller.rb:424-430` (resolve, `exists?`, `allowed?(root, 'view')`) runs
identically on both paths; `root_only` only skips the descendant block at `:434-448`. An
ownership failure on the root would fail both. There is also no user-scoped root lookup
to fail: `find_by_possibly_old_path` (`app/models/concerns/renaming.rb:255-263`) is a
global `find_by_path` with an `OldKey` fallback. The only `@api_user`-scoped call in the
action is the descendant filter at `:446`, and it is a `select`, which drops rather than
raises.

**2. "The SPA's error boundary rendered the 500 screen."** No. `grep` for
`Something Broke`, `500.html` and `status/error` across `app/frontend/app`,
`app/frontend/public`, `config/routes.rb` and `app/controllers` returns zero hits. The
only two copies are `public/500.html:134` and `public/status/error.html:134`, both
server-rendered.

**3. "The missing unowned-board confirmation modal is a symptom of the same failure."**
No, and it is not a failure at all. Two different components share the CTA text
"Set as Home Board":

| Component | Shows `copy_or_keep`? | Behaviour |
|---|---|---|
| `app/frontend/app/components/set-as-home.hbs:26` | yes | legacy flow, offers use-existing vs copy |
| `app/frontend/app/components/board-preview.hbs:105-106` -> `board-preview-overlay.js:320` | **no, by design** | always produces an owned copy |

`pick_for_home` (`board-preview-overlay.js:315-395`) dedups via `findExistingUserCopy`
and otherwise calls `editManager.copy_board(board, 'links_copy_as_home', ...)`
unconditionally. There is no use-existing branch; even the dedup-failure path falls
through to copying. Which branch renders is decided by `board-preview.js:162-164`
(`tour_board_picker_active || recommend`), and reads nothing from `/tree`.

**This is still worth its own issue** as a UX defect: identical CTA text for a flow that
asks and a flow that does not. It is not this bug.

---

## Environment comparison

| | image tag | branch tip | maxScale | concurrency |
|---|---|---|---|---|
| `lingolinq-web-dev` rev 00128 | `5c728f2e79fd...` | develop | **1** | 80 |
| `lingolinq-web-staging` rev 00026 | `a2d1a8a04573...` | staging | **1** | 80 |
| `lingolinq-web` (prod) rev 00034 | `57872695e43a...` | main | 20 | 80 |

Dev is 2 commits ahead of staging. The entire `app/`, `lib/`, `config/` difference
between the two deployed commits is `app/models/word_data.rb` (+12/-1), the age-18 locale
fix. `git diff --stat` across `board-preview*`, `set-as-home*`, `tour-board-picker.js`,
`guided-tour.js`, `feature_flags.rb`, `json_api/board.rb`, `boards_controller.rb` and
`board.rb` is **empty**. Env var NAMES differ only by three staging-only entries
(`MEDIACONVERT_ROLE_ARN`, `SNS_ARNS`, `SNS_REGION`).

**Production carries the identical defect.** Verified with `git show <sha>:lib/json_api/board.rb`:

```
=== a2d1a8a04 (staging) ===       === 57872695e (main / PROD) ===
243-  self.trace_execution_scoped(['json/board/images_and_sounds']) do
244:    hash = board.images_and_sounds_for(args[:permissions])
```

Ungated on all three. Same Cloud Run, same HTTP/1, same buffered render. `maxScale=20`
mitigates the *saturation* mode only, not the response cap. Any production board with a
large enough tree will 500 the same way.

This is most likely a **Cloud Run migration regression**, not a code regression: Render
imposed no response ceiling.

---

## Reproduction

Dev account `claudetest1` on `dev.lingolinq.com`, home board Vocal Flair 84. Load
`https://dev.lingolinq.com/claudetest1/board-detail/vocal-flair-84`. The board renders;
`GET /api/v1/boards/claudetest1/vocal-flair-84/tree` returns 500 with an empty body in
DevTools every time. Confirmed reproducible across three separate sessions on 2026-09-20.

The full-page "Something Broke" needs the saturation mode as well, so it reproduces less
reliably than the `/tree` 500 itself.

---

## Suggested fix targets (not prescriptive; CLAUDE.md Rule #0 item 12 applies)

The 32 MiB cap is a hard infrastructure ceiling, so the decision that shapes everything
else is: shrink the payload, or stream/paginate `/tree`. Shrinking is the smaller change
and fixes both modes at once.

1. **`lib/json_api/board.rb:244`.** Gate the `images_and_sounds_for` call on
   `args[:as_lite]` like its neighbours. Settle what `json['images']` / `json['sounds']`
   should be on the lite path so `board_detail_cache.js:139`'s merge and
   `Board#reload_if_lite` still behave. Largest effect for the smallest diff.
2. **`app/models/board.rb:2508-2546`.** Issue #286 remediation #3: restore a bounded
   cache, keyed more narrowly than `user.cache_key`. The model's own TODO at `:2515`
   proposes caching on the board with both protected and fallback URLs.
3. **`app/controllers/api/boards_controller.rb:432-446`.** Remediation #2: batch-preload
   `ButtonImage` across the descendant set once instead of per board.
4. **Measure the payload** before and after. Prove it is under 32 MiB rather than assume.
5. **`app/frontend/app/components/guided-tour.js:816-898`.** Bound `_startSpeakingHandoff`
   on elapsed time, not attempt count. Separate, small, independent of the above.

Infra, Scot's lane, tracked separately: raise `maxScale` off 1 on
`lingolinq-web-dev` / `lingolinq-web-staging`, or drop `containerConcurrency` well below
80, so one slow request cannot starve every other request on the single instance.
**Masking, not a fix.** It should not substitute for 1-3.

## Test gap

**No existing check would have caught this.**
`spec/controllers/api/boards_controller_spec.rb:3562` (`describe "#tree"`) asserts payload
shape only; `:3623` lists what `as_lite` skips without covering `images_and_sounds`. There
is no query-budget, response-size or N+1 assertion anywhere in `spec/`. A regression guard
is part of the work, not an extra. Per Rule #0 item 13 the red test comes first.

Note for whoever writes it: a test that asserts on response BYTES is the one that would
have caught mode 1, and it is the one that does not exist today.

---

## Open questions (cheap for a dev with the app running; expensive from logs)

1. **The actual `/tree` response size.** Over 32 MiB by the warning, never measured.
   One `curl` with `-w '%{size_download}'` against a local server answers it.
2. **What issued the `GET /claudetest1` that returned the 500 page.** It carries no
   `Referer`, which is not what an in-SPA click produces, so it may have been a manual
   reload rather than a click. If it WAS triggered by the app, there is a second defect
   here that this investigation did not find. Reproduce the full-page 500 with the
   Network tab open and check the document request's Initiator.
3. **Whether `Setting.get_cached('tree_lite_serialization')` is `'false'` on any
   environment** (`boards_controller.rb:470`). Needs a DB read. Does not change the
   diagnosis either way, since `images_and_sounds_for` runs on both paths.
4. **Three unexplained responses** during the saturation window: `503` with
   `responseSize 67` at `21:23:54` and `21:23:59`, and a `502` at `21:24:08`. 67 bytes is
   about the size of the `WriteFreeze::Middleware` JSON body
   (`config/initializers/write_freeze.rb:128`), which would imply a write freeze was
   briefly active, but that is unverified and they may be Cloud Run overload responses.

---

## Side finding: bearer tokens in Cloud Logging (Scot's lane, separate issue)

Cloud Run request logs record the raw request URL, including
`GET /api/v1/token_check?access_token=<128-char token>`. Rails' param filter correctly
redacts it in stdout (`access_token=[FILTERED]`); the Cloud Run request log captures the
URL before that filter runs. These are live session bearer credentials sitting in a log
sink readable by anyone with `logging.viewer`.

Harmless today (dev has no real users), a real finding once there are. Fix direction:
move the token to a header or POST body on `token_check`, and/or add a Cloud Logging
exclusion on that query parameter. Belongs in the findings register, not in this ticket.

---

## Method note

This investigation was read-only throughout: no code changes, and GCP limited to
`gcloud logging read` and `gcloud run services describe`. Every claim above is anchored to
a log reference or a `file:line`. Anything not verified is listed under Open questions
rather than asserted.

## Lessons for LEARNINGS.md

- **A Cloud Run 500 with an empty body and no `Completed` line in Rails is not an
  application exception.** Check `run.googleapis.com/varlog/system` for
  `Response size was too large` before hunting for a stack trace. The 32 MiB HTTP/1
  response cap has no Ruby-side signal at all: the process is mid-write when the
  connection is severed, so `Started` and `Processing by` are the last things logged.
  This is a Cloud Run behaviour Render did not have, so it can surface a pre-existing
  payload problem as a new hard failure with no code change.
- **When a request logs `Started` long before `Processing by`, that gap is queueing, not
  slow work.** 13.7s between the two on a trivial endpoint is the clearest available
  signal of worker starvation, and it distinguishes "this endpoint is slow" from
  "this instance is saturated by something else".
- **`--limit` on `gcloud logging read` applies before ordering.** A window query with
  `--limit 500` returns the 500 newest entries in that window, not the first 500, which
  silently hides the start of an incident. Filter on `textPayload` or narrow the window
  instead of raising the limit.
- **A partial remediation can leave the enclosing call site un-gated while removing every
  leaf.** `as_lite` skips the per-image lookups inside `images_and_sounds_for` but not the
  call to it. When a fix is described as "drops the per-board N+1 enrichment", verify the
  gate is on the outermost call, not only on what it contains.
