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
