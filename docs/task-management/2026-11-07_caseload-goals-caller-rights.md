# #1277: caseload rows use the list owner's permissions for goal summaries

Requested by Traci 2026-11-07. Branch `traci/fix/caseload-goals-caller-rights` from develop `eea21d4e1`.

Learnings consulted: "authorizing the supervisee-list owner does not authorize the children inside it",
"Goal `view` is wider than log access", "org managers bypass the modeling-only split",
"set per-supervisee fields in the shared limited_identity + supervisor branch".

## Fact sheet

(a) Where the values are read
- `lib/json_api/user.rb` supervisor branch (`if args[:supervisor]`): `edit_permission`, `modeling_only`,
  `can_set_goals` (with `args[:supervisor].permission_scopes`), `locale` (gated on `edit_permission`), and,
  gated on `can_set_goals`: `goals_count`, `active_goals` (summaries), `target_words`, `home_board_key`.
  CONFIRMED. `org_status`, `premium`, `skin`, `symbols`, `goal` do not depend on who asks.

(b) Every caller that builds these rows, and who `supervisor` is
- `Api::UsersController#supervisees`: `supervisor: user`, the list owner. Caller is `@api_user`. Rows are
  filtered by `supervisee_listable?` (caller needs `model`). CONFIRMED `users_controller.rb:638-639`.
- Nested `json['supervisees']` in `JsonApi::User.build_json`: `supervisor: user`, the user being serialized.
  Caller is `args[:permissions]`. Rows filtered by `listable_as_supervisee_by?(caller)`. CONFIRMED
  `lib/json_api/user.rb:224-243`.
- `Api::OrganizationsController` users roster: `supervisor: @api_user`, already the caller. CONFIRMED
  `organizations_controller.rb:37`.
- No other caller passes `supervisor:` to `JsonApi::User`. CONFIRMED by grep.

(c) Claims checked
- A modeling-only caller who supervises the list owner received goal summaries, `can_set_goals: true` and
  `edit_permission: true` on both routes. CONFIRMED by a probe spec on 2026-11-06 (#1277).
- WRONG, corrected after review: any user record the caller holds `model` on carries the nested list, and
  `known_supervisees` is computed on every user model (`models/user.js:871`). `supervision-settings.hbs`
  shows another user's rows with `edit_permission` and `modeling_only` as that user's link labels.

## Proposal

A (first choice, replaced after review: see below): pass the caller as `supervisor:` at the two owner sites: `supervisor: @api_user` in
`users#supervisees`, `supervisor: caller` in the nested list. When the caller is the owner (the normal
case) nothing changes. Every field in the branch then describes what the caller can do, as the org roster
already does.

B: add a separate `viewer:` argument. First rejected because a caller that forgets `viewer:` keeps the
bug; adopted after review in a narrower form (goal access only), with that risk accepted below.

C: gate goals on both owner and caller. Rejected: `edit_permission`, `modeling_only` and `locale` would
still describe the owner, and the client acts as the caller.

Risks
- A viewer who is not the owner now sees their own rights on another person's caseload, so a manager
  could see more (correct: managers hold `set_goals` on in-org users) and a modeling-only viewer less.
- Restricted OAuth tokens: scopes now come from the caller, which is stricter and correct.
- Nested list when the caller is nil: rows are already filtered to none.

Tests: superseded by the plan in "After adversarial review" below.

Unresolved: answered in (c) above: `supervision-settings.hbs` relies on the owner's link labels.

## After adversarial review (2026-11-07)

Fix A would have turned the Supervision page's "(editing allowed)" and "(modeling only)" labels into the
viewer's rights, so a manager reviewing a therapist would see wrong access. Chosen instead: a `viewer:`
argument that drives only `can_set_goals` and the goal fields; `edit_permission` and `modeling_only` keep
labelling the listed supervisor's link. `viewer:` defaults to the supervisor when left out, because
`spec/lib/json_api/user_spec.rb` "supervisee limited_identity can_set_goals" passes only `supervisor:` and
tests are not edited to fit a fix; an explicit nil viewer gets no goals. All three real call sites pass it.

Not changed: `goal` (the primary goal summary) is still on every row. A modeling-only caller already reads
it, and `target_words` and `home_board_key`, from `GET /users/:id` (the `model` block), so gating the row
alone would not reduce what they can see. Recorded for the data-minimization owner.

Verification
- Red first: both routes, the reverse case (modeling-only owner, editing caller) and the nil viewer.
- Nested positive specs, added after the second review: a supporter's own caseload and an editing viewer
  through a modeling-only supporter. Caseloads under 10 only use the nested list.
- Mutants that turn a spec red: drop `viewer:` in users#supervisees; `viewer: nil` or `viewer:` dropped at
  the nested site; `args[:viewer] || args[:supervisor]` for the fallback. The `!!goal_viewer &&` guard is
  redundant (`allows?` already denies nil) and survives its mutant.
- The four spec files under `--seed 4242`: without the fix, 8 failures: the 4 new specs plus
  `users_controller_spec.rb:1317` (create with start code), `:2572` (subscribe redemption), `:3448` and
  `:3824` (board_revisions). With the fix, 1: `user_spec.rb:456` (last profile run, a self view). Different
  examples failed on identical code with the same seed, and `:456` failed then passed alone, so these depend
  on shared state in the local test database and Redis, not on this change. CI is the clean baseline.

Accepted risk: `viewer:` defaults to the supervisor when left out, so a new endpoint that omits it would
bring #1277 back. All three current callers pass it.

Found in review, older than this change: a billing-lapsed supporter with a per-link modeling-only link still
holds `set_goals` (`app/models/user.rb` set_goals rule tests `modeling_only_for?`, which returns true for
any billing-lapsed supporter before the per-link check). Goal `view` is also granted to any `model` holder
(`user_goal.rb`), so this PR is data minimization on the caseload rows, not the end of goal access for
modeling-only links.
