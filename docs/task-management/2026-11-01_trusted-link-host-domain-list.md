# Retired org custom domains stay trusted for links (Codex P2 on #1258)

Branch `traci/fix/trusted-link-host`, PR lingolinq/LingoLinq-AAC#1258. Requested by Traci on 2026-11-01: fix the
Codex finding in this PR with an adversarially reviewed fix, then run the canonical review passes on the whole branch.

## The finding

#1258 makes `JsonApi::Json.set_host` keep only a known origin, and an org custom domain counts as known when it is a key
of `Organization.load_domains` (`lib/json_api/json.rb` `known_link_host?`). That list outlived the org's use of the
domain:

- `touch_parent` queued a rebuild only while `custom_domain` was still true, so switching it off left the host in the list.
- Destroying an org never touched the list.
- `load_domains` passed `72.hours.from_now.to_i` to SETEX as a TTL (`Permissions.setex` hands it straight to Redis), so
  the cached list lived about 56 years. The red test read a TTL of 1793856430 seconds.

Whoever later controlled a retired domain could send a forgot-password or consent request with it as Host and receive
token-bearing links on it.

## Facts (CONFIRMED unless marked)

- **Readers.** `known_link_host?` (the trust check) and `load_domain` (per-host branding and email settings) both read
  `load_domains`. `domain_org_ids` is the only cached copy of the list.
- **Writers.** `load_domains` writes the list. Rebuilds were forced by `touch_parent` (async, through the queue) and by
  `system_email_templates.rb` (67, 91).
- **Job hosts.** `Worker.set_domain_id` calls `set_host` again when a job runs, so a job queued with a retired domain is
  re-checked against the list.
- **Specs.** Every example starts with empty test Redis namespaces, and after_commit fires in this suite
  (`use_transactional_fixtures`, Rails 7.2).

## Design, and how it got there

1. **Proposal.** Delete the list in after_commit, keep the queued rebuild as a backstop, and make the TTL a real 72 hours.
2. **Independent review (adversary-local).**
   - A third existing spec breaks. CONFIRMED.
   - In after_commit, `saved_change_to_custom_domain?` only sees the last save, so two saves in one transaction can hide a
     switch-off.
   - No test separated after_commit from after_save.
   - A rebuild that read the rows before the commit can re-cache the old list after the delete, leaving only the queue to
     correct it.
   - A Redis error in after_commit surfaces after the commit.
3. **Traci: "follow best practices. if these are real issues that need to be fixed, fix them."** So the race is closed
   by construction rather than documented.
4. **Final design.**
   - `after_save` and `after_destroy` note a change when the org is or was a custom-domain org
     (`custom_domain || custom_domain_before_last_save`). `after_commit` then bumps `domain_org_ids_generation` and
     deletes the list.
   - A rebuild WATCHes the generation key before it reads the rows and writes the list in MULTI, so a commit after the
     WATCH drops the write.
   - The queued rebuild in `touch_parent` is removed; the next read rebuilds.
   - The TTL is `72.hours.to_i`, which is also the backstop for console edits that skip callbacks.
   - A Redis error in after_commit raises: silently swallowing it would leave the domain trusted.
5. **Two dead ends on the way, both caught by tests.**
   - Reading the generation with an extra GET broke the `session_controller_spec` `token_wait` examples, which count
     Redis GETs exactly. They pass at the PR head, so the extra read was the cause.
   - WATCHing the list key itself failed the race test: on a cache miss the key is absent, and DEL of an absent key does
     not touch a WATCH. WATCHing a counter that INCR always changes works.
6. **redis-namespace detail, verified with a probe.** Inside `Redis::Namespace#watch` the block gets the raw client, so
   keys lose the namespace. A write there landed un-namespaced. The code passes full namespaced keys to the raw client.

## Tests

- **New, red at 8f125b375 for the stated reason.** In `organization_spec` "load_domains": drop the domain when
  `custom_domain` is turned off, when the org is destroyed, and when a host is removed; the cached list lives 72 hours.
  In `json_spec` "trusted hosts": stop trusting the domain once the org turns it off.
- **Added after the review.**
  - The list is cleared at commit, not before.
  - Two saves in one transaction.
  - Another org's domains stay.
  - No caching of a list built from rows read before the change committed.
  - A background job carrying a retired domain gets the default host.
- **Existing specs changed, approved by Traci ("fix them").** Each encoded the old behaviour:
  - "should cache the latest results" asserted the epoch-time TTL. It now reads the cached list and its 72-hour TTL.
  - "should invalidate the cache when a custom org is updated" asserted the stale list until the job ran. It now asserts
    the new list right after the save.
  - "should not use the cached valud if force=true" planted the stale list before creating the orgs, whose commits now
    clear it. It now plants it after them.

## Mutations

Each was restored with `cmp` against a copy.

| Mutation | Red |
|---|---|
| No invalidation | 10 |
| Epoch-time TTL | 1 |
| Flag only on the current `custom_domain` | 7 |
| No generation bump | 1 (the race test) |
| Clear at save time instead of commit | 1 |

## Runs

- **Wider set.** Organization, JSON API, worker, system email specs, application, session, users and organizations
  controllers, and mailers: 1388 examples, 1 failure.
- **The one failure.** `application_controller_spec.rb:249`, an AuditEvent dedupe example. It also fails at the
  unchanged PR head on this machine (local AuditEvent rows, as the PR body notes).

## v2: trust confirmed against the database (after the canonical passes on the whole branch)

The canonical passes on `15f6d224a` approved with comments (senior-dev) and said ship (adversary), with no Critical or
High findings. Their findings were all ways the cached list could still be stale or unavailable while it decided trust:

- **Two in-memory copies (senior, Medium).** Rails 7.2 runs after_commit on one instance per record per transaction
  (`load_defaults 7.2`, `config/application.rb:63`), and the change flag lived on the instance.
- **Lock held during the rebuild (both).** The rebuild held redis-rb's client lock, shared by `RedisInit.default` and
  `.permissions`, across a Postgres scan and settings decryption.
- **Redis failures (senior Medium, adversary Low).** A Redis failure at commit left the host cached for up to 72 hours.
  A Redis outage raised out of `set_host` on any unknown host.

Best practice: a cache must not be the authority for a security decision. Proposal v2 (session scratchpad) went
through an independent read-only review before editing.

- **Trust.** `JsonApi::Json.custom_domain_host?` uses the cached list only to find candidate orgs: every key equal to the
  host ignoring case. It then confirms each one against the database: the org exists, `custom_domain` is true, and
  `settings['hosts']` lists the host. An error reading either side (StandardError) logs the host only and is not trusted.
  A stale, wrong or unreadable list can now only fall back to DEFAULT_HOST.
- **Cache.** The WATCH and generation machinery is removed, so no lock is held during the scan. The commit-time clear
  stays, for branding freshness, and `load_domains` writes with `Permissions.setex` and the real 72-hour TTL.
- **Tests.**
  - Trust-level, red on `15f6d224a`: stale list after a switch-off; a host removed from the org; an entry pointing at
    another org (or no org); a switch-off made through a second copy in one transaction; Redis unreachable
    (`Redis::CannotConnectError`).
  - New guard, green before and after: a current domain whose case differs from a stale entry is still trusted.
  - Changed: the stubbed "exact match" example now uses a real org (the trust source changed). All three assertions
    and the mixed-case stored host are kept.
  - Removed: the v1 org-level race test. The property it encoded (the cache stays fresh enough to be trusted) is no longer
    relied on, and the trust-level stale-list tests replace it.
- **Mutations.** Each was restored with `cmp`.

  | Mutation | Red |
  |---|---|
  | Trust a cache entry alone | 4 |
  | Skip the `custom_domain` check | 2 |
  | Skip host membership | 2 |
  | No rescue | 1 |
  | Check only the first matching entry | 1 (the case test) |
  | Epoch-time TTL | 1 |
  | No commit-time clear | 7 cache tests; no trust test, by design |
- **Runs.**
  - Organization, all `spec/lib/json_api`, worker, system email, forwarded-host filter, all controllers and mailers:
    2934 examples, 4 failures.
  - All four also fail on the unchanged PR head on this machine: three page renders need the built `vendor.js`
    (`rails extras:assert_js`), and one is the local AuditEvent example.
- **Known limits, not fixed here (pre-existing).**
  - `load_domain` (branding and the per-host `coppa_parental_consent` override) still reads the cache, keyed on the
    request host. Its staleness is bounded by the commit-time clear and the 72-hour TTL. It is not a link-trust decision,
    but it is a compliance setting chosen from the cache.
  - During a Redis outage `set_host` now falls back safely, but `load_domain` in the next before_action still raises
    through `Permissions.setex`, as it does on develop.
  - Deployed Redis may keep a leftover `domain_org_ids_generation` key only if v1 ran there; v1 was never deployed.
- **Adversary Low, for Traci to decide.** On dev's `*.run.app` address, links fall back to the shared nonprod
  DEFAULT_HOST (staging), while `docs/INFRASTRUCTURE.md` calls that address valid for normal use. Options: allow the
  service's own run.app host through configuration, or document run.app as non-interactive only.

## v3: the branding and COPPA cache follows the change (second canonical round on 7ff9bef1a)

Senior-dev: approve with comments. Adversary: ship with conditions. No Critical or High. Both found the same Medium,
verified here: `load_domain` serves branding, email templates and the per-host `coppa_parental_consent` override
from the cached list, and two paths could leave that list stale for up to 72 hours. That corrects v2's known-limits line,
which said the staleness was bounded by the commit-time clear.

- **Two in-memory copies.** Rails 7.2 runs a record's after_commit on one copy per transaction, and the second copy's
  flag was false.
- **A racing rebuild.** A rebuild that read the rows before the commit can write them back after the clear. v2 had
  removed the queued rebuild that used to correct this.

Fix:

- `note_domain_list_change` registers `ActiveRecord.after_all_transactions_commit { Organization.forget_domains }`
  (Rails 7.2: runs once the outermost transaction commits, at once when none is open, never on rollback). The instance
  flag and `after_commit :forget_domain_list` are removed.
- `forget_domains` deletes the list and schedules `load_domains(true)` as the backstop for a stale write.
- A Redis error there is logged, not raised: the change has committed, and the cache no longer decides trust.

Tests, red on 7ff9bef1a: the list is cleared when a second copy saves in the same transaction; the scheduled rebuild
replaces a stale write; a committed save does not fail when the list cannot be cleared.

Mutations:

| Mutation | Red |
|---|---|
| Clear at save time | 1 (commit timing) |
| No backstop rebuild | 1 |
| No rescue | 1 |

Wider set: 2937 examples, 4 failures, the same four as at the unchanged PR head (three `vendor.js` page renders, the
local AuditEvent example).

Remaining limits:

- **Rebuild race.** A stale write from a racing rebuild lasts until the backstop job runs, which is seconds while the
  queue is healthy.
- **Redis outage.** During an outage `load_domain` still raises in the next before_action, as on develop.

Left for Traci to decide (adversary Lows):

- `app.lingolinq.com` is trusted in every deployment, including forks and self-hosted installs.
- With `DEFAULT_HOST` unset in production, unknown hosts get no link host.
- On dev's `*.run.app` address, links fall back to the staging `DEFAULT_HOST`.
- Not taken: per-request memoising of the parsed list (performance, small today).

## Third canonical round on 2abceb6e4 (2026-11-02)

PII preflight exit 0. Both passes reviewed
`REVIEWED=range origin/develop (226e476c2d7bdc03109cef83e054065c1e291811) ... traci/fix/trusted-link-host (2abceb6e497b0ae7e77fba6e6384623aa786f184) in /Users/traciday/Documents/GitHub/lingolinq/LingoLinq-AAC-trusted-host`.

- **Senior-dev (`commands/review-pr.md`): approve with comments.** No Critical or High.
  - Medium, REFUTED: "Rack 3 lets `Forwarded: host=` set the host". actionpack 7.2.3.2 `ActionDispatch::Http::URL#raw_host_with_port`
    (`http/url.rb:216-221`) reads only `X-Forwarded-Host` or `Host`, so `ForwardedHostFilter` covers `request.host`. The
    adversary pass reached the same result independently.
  - Medium, not changed (performance): every save of a custom-domain org clears the list, so the next request rebuilds it
    inline. Before this PR every such save already queued a forced rebuild. No custom domains are in use today, so the
    cost is nil now. Narrowing the clear to changes of the flag, `hosts` or `host_settings` is a follow-up if
    custom-domain orgs become common.
  - Lows not taken:
    - the broad rescue in `custom_domain_host?` logs the error class only, on purpose, so that settings or SQL never
      reach the log;
    - repeated saves in one transaction register repeated clears (harmless);
    - a known host keeps the request's scheme;
    - the `token_wait` hook could carry a comment.
- **Adversary (`agents/adversary.md`): ship.** One Low: each request on a custom-domain host loads the org and decrypts
  its settings (one primary-key read). Recorded; cache the confirmed result per request if custom-domain traffic becomes
  real.
