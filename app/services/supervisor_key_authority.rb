# Phase 1 of the supervisor-key authority model (option B, decided 2026-09-14).
#
# Two rules, and the split between them is the whole design:
#
#   ATTACHMENT by a third party is ALLOWED, but lands PENDING.
#   RATIFICATION is SELF-ONLY, because consent is given BY a party, not FOR one.
#
# Why pending rather than refusing. Authority flows only from NON-pending links:
# Organization.manager_for? selects the target's links with `!l['state']['pending']`,
# app/models/user.rb grants 'support_actions' on that basis, and
# Api::UsersController#update turns 'support_actions' into a password write. So a
# pending attachment grants the receiving org's managers nothing, and the defect
# is closed at the source instead of being gated after the fact.
#
# This also defeats laundering, which is what sank the previous submitter-keyed
# design: an attacker who manages the org could mint a throwaway supervisor via
# the ungated process_add and submit through it, because the gate only asked
# whether the SUBMITTER managed the org. Landing every third-party attachment
# pending makes the submitter's identity irrelevant.
#
# And it keeps school and clinic onboarding working. Refusing instead broke the
# ordinary "therapist enrols a student with the school's start code" flow, and
# broke it silently, since User#process_params only warns on a false return.
#
# NOT enforced yet, for lack of data rather than intent, each tracked in
# docs/task-management/2026-09-14_supervisor-key-org-attach-escalation.md:
#   - guardian authority. There is no guardian concept in the backend and no
#     persisted account creator to derive one from. Phase 2 is where a guardian
#     regains the ability to ratify FOR a communicator who cannot self-advocate;
#     until then ratification is strictly self-only.
#   - org-admin authority scoped to an active seat. License rows are the seat
#     record and production has zero, so seat-scoping would grant org admins no
#     authority at all.
#   - removal of org-added supervisors on exit. Supervisor links carry no
#     added_by, so org-added and family-added cannot be told apart.
class SupervisorKeyAuthority
  def initialize(actor, target)
    @actor = actor
    @target = target
  end

  # NOTE, and this is a known soft spot rather than a guarantee: this predicate
  # never actually observes a nil actor, because SupervisorKeyProcessor#initialize
  # does `@actor = actor || user`. That default is deliberate (the two-argument
  # process_supervisor_key form means "the user is acting on themselves", and
  # several internal callers rely on it), but it means a caller of User#process
  # that omits `non_user_params['updater']` is treated as a SELF action rather
  # than as a third party. The one production caller,
  # Api::UsersController#update, always sets it. Tightening that default is
  # Phase 2 work and needs its own sweep of internal callers; it is recorded in
  # docs/task-management/2026-09-14_supervisor-key-org-attach-escalation.md.
  def self_action?
    return false unless @actor && @target
    return false unless @actor.global_id && @target.global_id
    @actor.global_id == @target.global_id
  end

  # Third-party attachment is permitted, but should land pending.
  #
  # "Should", not "will": this expresses the CALLER's intent, and
  # User#update_subscription_organization (app/models/concerns/subscription.rb)
  # overrides it to false in two cases, both verified:
  #
  #   1. `if new_org && self.settings['authored_organization_id'] == new_org.global_id
  #       && self.created_at > 2.weeks.ago` -- an org that AUTHORED the account
  #      attaches it immediately for the first two weeks. Defensible (the org
  #      created the account) and not an escalation against a pre-existing user,
  #      since the attacker would be attaching an account they made themselves.
  #      But it is a real exception, so do not read this method as a guarantee.
  #   2. `if link.id && !link.data['state']['pending']` -- an already-consented
  #      link is never re-pended. Benign: consent was already given.
  #
  # Neither is changed here. They are recorded so nobody reads the pending rule
  # as unconditional, and so case 1 gets its own decision rather than being
  # inherited silently.
  def attachment_must_be_pending?
    !self_action?
  end

  # Ratifying a pending attachment is the consent step, so only the party
  # themselves may do it.
  def allows_ratification?
    self_action?
  end

  # Payload for the refusal AuditEvent. Organization and user global_ids only:
  # no names, no emails, nothing student-identifying, matching the payload shape
  # the existing license_claim event uses.
  def denial_event(org, action)
    {
      'type' => 'supervisor_key_denied',
      'reason' => 'ratification of an organization attachment is self-only',
      'action' => action,
      'actor_id' => @actor && @actor.global_id,
      'user_id' => @target && @target.global_id,
      'organization_id' => org.is_a?(Organization) ? org.global_id : nil
    }
  end
end
