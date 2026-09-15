# Dual review, merged findings — scot/security/claim-user-target-authorization (option B)

Reviewed SHA: 72b4d6be5. Baseline (merge-base): 4104b657b.
Passes: Codex senior-dev (gpt-5.6 via ~/bin/codex-review, exit 0) + Claude adversary, run in parallel.
PII pre-flight: scripts/codex-review-guard.sh PASS (exit 0); no data-bearing paths, no emails in diff.

## VERDICT: REQUEST-CHANGES. Do not merge. Not recorded via record-pr-review.sh.

| Severity | file | Finding | Source | Counter-measure |
|---|---|---|---|---|
| **Critical** | `app/models/organization.rb` `parse_activation_code`, supporter branch | `force_pending` reaches only the `if type == 'communicator'` branch (`add_user(..., force_pending, ...)`). The `elsif type == 'supporter'` branch still calls `add_supervisor(activate_for.user_name, false, ...)` with a hardcoded false, minting a NON-pending `org_supervisor` link. `manager_for?` counts org_supervisor links, so option B is bypassed entirely by minting the start code with `user_type: 'supporter'`. | adversary | Thread `force_pending` into the supporter branch, or refuse third-party supporter codes until it is. Needs a spec that mints a supporter-type code. |
| **High** | `app/models/concerns/supervising.rb` `managing_organization` | Third fallback `org ||= orgs.detect{|o| o['type'] == 'user' }` applies NO pending filter, so a user whose only org link is pending still resolves to that org. Every compliance reader uses this method (`feature_flags.rb`, `compliance/jurisdiction_resolver.rb`, `compliance/segment_resolver.rb`, `eu_jurisdiction.rb`, `ai_focus_word_set.rb`, `system_feature_settings.rb`). A pending attachment therefore DOES relocate data-policy, AI gating and EU jurisdiction. | adversary | Falsifies the core claim that a pending attachment confers nothing. Either make the fallback pending-aware or stop asserting authority-free pending. Compliance-relevant, so it needs its own decision. |
| **High (P1)** | `app/models/organization.rb` `add_user` / ratification path | A pending enrolment never allocates a `License` seat on ratification: `approve-org` flips the link via `update_subscription_organization` but never calls `claim_user`, so the user stays unlicensed and the seat stays free. | codex + adversary (cross-confirmed) | Claim/allocate the seat atomically when the user ratifies. Latent today (zero seats). |
| **High (P1)** | `app/models/organization.rb` `claim_user` guard | No row lock: two orgs can both read a nil `managing_organization_id` before either writes. Both assign seats; the later user update wins but both orgs keep an active licence, and `licenses.user_id` has no unique constraint. | codex (and a prior adversary pass, PLAUSIBLE) | Lock the target inside the transaction and add a partial unique index on `licenses(user_id) WHERE status='active'`. |
| Medium | `parse_activation_code` `supervisors` override + personal-code branch | Both call `link_supervisor_to_user(..., 'edit')` regardless of `force_pending`, creating immediate edit supervision. | adversary | Decide whether third-party supervision should also be pending. |
| Medium | `process_approve_org` | `approve-org` carries no org id; it ratifies whichever pending link `managing_organization(true)` returns first, so with two pending links the user may ratify the wrong one. | adversary | Make the key carry the org id, as `approve_supervision-` already does. |
| Medium | `update_subscription_organization` | A "pending" attach still runs `clear_existing_subscription` and rewrites `preferences['role']`, locale and symbol library. | adversary | Pending should not mutate the target's subscription or preferences. |
| Medium | `add_user` `!pending` gate | The change the docs call load-bearing has no spec; the mutation survives. | adversary | Add a spec with a seat present asserting a pending add does not bind it. |
| Low | `self_action?` | Does not exclude valet mode, unlike sibling permission checks. | adversary | Mirror `!user.valet_mode?`. |
| Low | refusal audit | Unbounded AuditEvent writes on repeated refused ratification. | adversary | Rate-limit or dedupe. |
| Low | docs | Remaining overclaims: "grants the receiving org's managers nothing" is falsified by the High above. | adversary | Correct in the same change. |

## Where both passes agree the change is sound
- The self/third-party split and the policy object are the right structure.
- The `!pending` gate on the licence fast-path is correct in principle (claim_user has no pending concept).
- The test suite is meaningful: earlier mutation testing showed neither allow-everything nor refuse-everything passes.

## Status after 2026-09-15 (commit `4318d53e0` and the jurisdiction specs)

The table above is the review baseline and is left intact so `/apply-check` has something to diff.
This section records what has actually moved since, verified here rather than asserted.

| Row | Status | Evidence |
|---|---|---|
| **Critical** supporter branch | **FIXED** | `force_pending` threaded at `app/models/organization.rb`, supporter branch. Three specs added; before the change the red run saw `Organization.manager_for?` return `true` through a supporter code. Mutating the argument back to the literal `false` kills two of the three; the third is the self-redemption regression guard and correctly survives. |
| **High** `managing_organization` fallback | **REFRAMED, still open, still Scot's** | The finding is true but the verb was wrong. "Relocates" implies option B moved jurisdiction. It did not: before option B the same attachment landed NON-pending and resolved one line earlier to the same org. The pending-blind fallback is what makes option B jurisdiction-neutral, and it is only reached when the user has no non-pending `org_user` attachment at all. Pinned by two new specs; mutation-verified (removing the fallback makes `managing_organization` return `nil`, so the user resolves to no governing org). |
| Medium `supervisors` override + personal-code branch | **CONFIRMED, and confirmed not threadable** | The re-sweep found four link-creating sites in `parse_activation_code`, not three. These two call `User.link_supervisor_to_user`, and a `type == 'supervisor'` link carries no `pending` key; no reader anywhere filters one on `pending`. Making these pending needs a new state dimension on user-to-user links, which is a design change, not a thread-through. |
| Everything else | **Unchanged** | Both codex P1s, the three remaining Mediums and the three Lows are untouched. |

The `Low | docs` row is closed: the "grants nothing" overclaim was corrected in all three durable places on
`d4eabca34`, and the residual "relocates" imprecision in the same three places is corrected here.

Verdict is unchanged: **REQUEST-CHANGES**, and this pass is still not recorded via `record-pr-review.sh`.
One Critical is closed; the second blocker is now a decision rather than a defect, and the two codex P1s
remain.
