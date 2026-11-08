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

A (chosen): pass the caller as `supervisor:` at the two owner sites: `supervisor: @api_user` in
`users#supervisees`, `supervisor: caller` in the nested list. When the caller is the owner (the normal
case) nothing changes. Every field in the branch then describes what the caller can do, as the org roster
already does.

B: add a separate `viewer:` argument and read `args[:viewer] || args[:supervisor]` in the branch. Rejected:
more surface for the same result, and a caller that forgets `viewer:` silently keeps the bug.

C: gate goals on both owner and caller. Rejected: `edit_permission`, `modeling_only` and `locale` would
still describe the owner, and the client acts as the caller.

Risks
- A viewer who is not the owner now sees their own rights on another person's caseload, so a manager
  could see more (correct: managers hold `set_goals` on in-org users) and a modeling-only viewer less.
- Restricted OAuth tokens: scopes now come from the caller, which is stricter and correct.
- Nested list when the caller is nil: rows are already filtered to none.

Tests (red first)
- `spec/controllers/api/users_controller_spec.rb` GET supervisees: modeling-only caller who supervises the
  owner gets `can_set_goals` false, `edit_permission` false and no goal fields; an editing caller gets them.
- `spec/lib/json_api/user_spec.rb`: the nested list built with `permissions: caller` follows the caller.
- Mutation: restore `supervisor: user` at each site; its spec goes red.

Unresolved
- Does any client screen rely on the owner's rights in those rows? Only `models/user.js:850` loads
  another user's list; server actions already enforce the caller's rights.

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

Verification: four red specs (both routes, the reverse case of a modeling-only owner with an editing caller,
and the nil viewer). The four spec files under one seed: 8 failures without the fix (the 4 new plus 4
order-dependent ones), 1 with it; that one (`user_spec.rb:456`, last profile run, a self view) fails and
passes alone on identical code.
