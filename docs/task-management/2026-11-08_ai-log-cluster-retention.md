# 2026-11-08: one 12-month window for AI logs, a time limit for location clusters (PR #1282)

Brief: Scot's decisions, relayed by Traci. Branch `traci/fix/privacy-retention-promises`.
Learnings consulted: `learnings-archive/2026-11.md` "retracted legal citations hide in operator
comments" and "a superseded record's supersession block can make a later edit false".

## Decisions

1. `AiApiLog`: delete rows older than 12 months, every account. Basis: business need (debugging,
   safety review, usage and billing). No HIPAA 164.316(b)(2) or EU AI Act Article 50 basis.
2. Keep `AiApiLog.redact_old_ip_addresses!(days: 90)`.
3. `ClusterLocation`: delete rows older than 12 months on the field that reflects last use.
4. PaperTrail and analytics: no new purge; describe what happens today.
- Traci 2026-11-08: no disclosure version bump (not requested); remove the jurisdiction stamp
  (its only reader is the EU purge); add a `cluster_locations.updated_at` index; drop the
  translated tier strings (Ember tier keys in 13 locales, the replaced `es.yml` keys); fold in
  the stale account lines on the server privacy page.

## Fact sheet

(a) Where values are read
- `ai_api_logs.jurisdiction` is read only by `AiApiLog.purge_old_eu_logs!`
  (`app/models/ai_api_log.rb:252`). CONFIRMED by grep over app/ and lib/. It is written by
  `log_ai_call` (`ai_api_log.rb:96`) from `Article50CallContext.for` (`lib/lingo_linq/article50_call_context.rb:35`),
  which calls `EuJurisdiction.retention_stamp` (`lib/eu_jurisdiction.rb:90`). The Article 50
  disclosure gate reads `EuJurisdiction.disclosure_required?` (`app/controllers/application_controller.rb:449`,
  `lib/json_api/user.rb:569`), never the stamp. CONFIRMED.
- `ClusterLocation.updated_at` moves on every use: a session joining a cluster calls
  `cluster.reload.save` (`app/models/cluster_location.rb:199,215,316,354`); `after_save :generate_stats`
  (`:13`) schedules `generate_stats(true)`, which adds the new session to `data['total_sessions']`
  (`:126`) and saves (`:163`), a real attribute change, so the timestamp updates. CONFIRMED.
  `created_at` never moves after creation, so it would delete clusters in active use.
- The scheduler task block runs daily at 06:00 UTC inside `scheduler:dispatch`
  (`lib/tasks/scheduler.rake:160`), each task wrapped by `run_task` (rescues StandardError, ScriptError). CONFIRMED.

(b) Shapes
- `ai_api_logs.created_at`: NOT NULL, indexed (`index_ai_api_logs_on_created_at`). CONFIRMED db/schema.rb.
- `cluster_locations.updated_at`: NOT NULL, no index. CONFIRMED db/schema.rb.
- After a cluster is deleted, `log_sessions.geo_cluster_id` / `ip_cluster_id` keep the old id (no FK,
  db/schema.rb:441-442). Readers: `logs_controller.rb:147` and `stats.rb:812` look the cluster up and
  return no logs / raise StatsError (caught as a stats error) when it is missing; `stats.rb:833`
  skips missing ids; `exporter.rb:394` guards `if log_session.geo_cluster`;
  `log_session.rb:354` only re-clusters when the id is nil (old sessions are not re-clustered,
  which is also true today because clusterize only looks at the last month). CONFIRMED.
- `LogSession.data['geo']` / `data['ip_address']` hold the raw location on the session itself; deleting a
  cluster does not remove it. CONFIRMED (`cluster_location.rb:191-215`). The public text must not imply it does.

(c) Cross-file claims
- Two disclosure registries (`ai_consent_disclosures.rb`, `article50_disclosures.rb`) hash their
  registry entries; changing retention facts changes `content_hash`. The only consumers of
  `content_hash` are the rendered page and specs that compare it to itself. CONFIRMED by grep.
  Both are still `CURRENT_VERSION = 1` after the #888 retraction rewrote their notes. CONFIRMED.
- All deployed environments run `RAILS_ENV=production` (Dockerfile:52, deploy-cloudrun.yml:740), where
  `config.i18n.fallbacks = true` (`config/environments/production.rb:96`). Removing an `es.yml` key
  falls back to English when deployed; local dev and test have no fallback. CONFIRMED.
- The Ember privacy key `privacy_security_retention_ai_logs` is already English-pinned in all 13
  locales (`WordData::ENGLISH_PINNED_LOCALE_KEYS`); the three tier keys are translated in 12. CONFIRMED.

## Proposal

AiApiLog purge. Candidate 1 (chosen): `AiApiLog.purge_older_than!(months: 12, batch_size: 1000)`;
loop plucking up to `batch_size` ids with `created_at < cutoff` and `where(id: ids).delete_all`, cutoff
computed once. Matches `Flusher.delete_by_id_in_slices`. Candidate 2: `in_batches(of:).delete_all`;
rejected only because no code here uses it yet and its range scan is harder to reason about against
a concurrent insert. Simplest alternative (single `delete_all`) rejected: Scot asked for batches, and
a first run against a large backlog would hold one long lock.

ClusterLocation purge: same shape on `updated_at`, plus a concurrent index migration (pattern from
`20261013120000_add_inactivity_sweep_index_to_users.rb`). No paper_trail on ClusterLocation, so no
version cleanup. Not nulling `log_sessions` pointers: rewriting log rows is heavy and the ids carry
no location; readers tolerate the missing row (fact b).

Stamp removal: `Article50CallContext.for` returns only `article_50_disclosure_shown`; the three call
sites stop passing `jurisdiction:`; `log_ai_call` stops assigning it; `EuJurisdiction.retention_stamp`
removed. Column and its two indexes stay (destructive migrations ship later, if at all).

Text: one AI-log statement everywhere: request summaries kept 12 months, IP addresses removed after
90 days, everything deleted with the account. Registries: `lingolinq_general/children/eu/hipaa_floor`
collapse into one `lingolinq_window` entry `{window_months: 12, enforced: true, basis, note}`.

Risks
- Irreversible delete. Mitigation: production counts before merge, Scot's OK.
- The purge also deletes rows that formerly sat under the "up to 6 years healthcare" window; Scot's
  decision 1 says every account.
- The `content_hash` changes without a version bump: families who consented to v1 consented to a
  text that promised a longer window, now shorter. More protective; recorded in the PR.
- The `daily_summary` / `compliance_report` readers lose nothing current (they read recent days).

Unresolved
- Production counts (no prod access from this machine).
- Whether the `user_id = 0` trend rows holding user global ids need their own decision (reported only).

Tests (red first): purge deletes a row 12 months + 1 day old and keeps one 12 months - 1 day old;
batches (batch_size 1 deletes 3 rows); same for ClusterLocation on `updated_at` with a stale
`created_at` but fresh `updated_at` kept; generate_stats on a cluster with a new session moves
`updated_at`; scheduler source wires both purges and no longer wires the EU purge. Mutations that
must fail them: cutoff `>` instead of `<`; `created_at` instead of `updated_at` for clusters; drop
either `run_task` call.

## Adversary review (2026-11-08), checked finding by finding

- Public text broader than the code: CONFIRMED. `AiFocusWordSet` keeps the scrubbed prompt and
  `seed_user_global_id` with no purge and no Flusher sweep (`app/models/ai_focus_word_set.rb:75`).
  Every clause will say "AI request records"; AiFocusWordSet raised with Traci, not folded in.
- updated_at mechanism: CONFIRMED wrong in part. `cluster.reload.save` changes nothing; only the
  queued `generate_stats(true)` moves updated_at. Probe found a real defect: an assessment session
  in a cluster made `generate_stats` raise TypeError (`stats` without counters,
  `log_session.rb:621`), freezing updated_at for good. Fixed in `cluster_location.rb` with a red test.
  The updated_at spec now runs the real join path (`add_to_ip_cluster`, then `Worker.process_queues`).
- Spec pins outside app/ and lib/: CONFIRMED; all go under "Test changes needing approval".
- Delete race and batch_size: CONFIRMED; DELETE repeats `updated_at < cutoff`, batch_size must be a
  positive Integer. Falsification then found the loop could spin when the pluck finds rows the DELETE
  will not remove; both purges now stop on a zero-row batch.
- No pause flag / legal hold, and `AWS_BAA_ACCEPTED.md:81` cites a 2026-08-04 AiApiLog row as
  evidence that the purge removes around 2027-08: raised for Scot, not in his brief.
- Version bump: not requested; record the changed content_hash in the PR.

## Falsification (each mutant reverted from a scratch copy)

- AiApiLog cutoff `<` to `>`: 3 of 4 red.
- ClusterLocation both sites `updated_at` to `created_at`: "keeps an old cluster that is still in use" red.
  (Either site alone stays green: the pluck and the DELETE each filter on updated_at.)
- Assessment guard removed: red. Session not joined in the updated_at spec: red.
- Scheduler AI purge dropped: red. Scheduler cluster purge dropped: red.

## Errors (Rule #0.13)

Three self-inflicted spec-setup errors (missing TimeHelpers include, reload keeping a skip flag, IPv6
form of the cluster IP) plus a mutation harness that hung and a summary grep that missed "1 example".
Checkpoint committed here and stopped for Traci.

## Remaining

1. Remove the jurisdiction stamp (own commit): `EuJurisdiction.retention_stamp`,
   `Article50CallContext` jurisdiction key, three call sites, `log_ai_call` assignment, comments.
2. Text: both registries collapse to one `lingolinq_window` entry; both disclosure views; en.yml
   (new `retention_window`, drop tier keys), es.yml (drop replaced keys); Ember `privacy.hbs` (drop
   the three tier keys from template and 13 locale files, rewrite the pinned `retention_ai_logs`);
   `_privacy.html.erb` AI line plus the stale account lines.
3. Legal drafts: both tables collapse to one row, ClusterLocation row, PaperTrail and analytics rows
   describe today's behaviour exactly (including the user_id = 0 trend rows holding user global ids),
   dated disclosure beside each changed row; cross-doc sweep.
4. Spec rewrites, each listed for Scot: old EU purge block (6 examples, red now), stamp specs, registry
   specs, controller `/24 months/`, retracted_hipaa_floor table cells, privacy pin spec.
5. PR description sections; production counts from Scot.

## Completed after the checkpoint (2026-11-08)

- Stamp removal committed alone (`0669a92dc`); text (`d82600008`); legal drafts and register (`62bb70d28`, `605362dd8`).
- 20 affected spec files: 538 examples, 50 failures, 3 pending; the 50 are the approval table in the PR body.
- Register, naming, disclosure-guard and whitespace checks pass.
- Cross-doc sweep: governance memo and counsel-review record listed as follow-ups; three dated records left as history.
- Scot's brief did not ask for AiFocusWordSet deletion or a pause switch; both are raised in the PR, not built.
- Lessons appended to `learnings-archive/2026-11.md` "Retention purges and ClusterLocation".
