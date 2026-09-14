# Phase 1 of the supervisor-key authority model.
#
# The default is SELF-ONLY: an actor acts on their own account. Exceptions are
# enumerated here rather than scattered through SupervisorKeyProcessor, so that
# Phase 2 can add predicates in this one class without touching any call site.
#
# Phase 1 enforces exactly one rule, the one with a demonstrated escalation
# behind it: an actor may not attach ANOTHER user to an organization that actor
# manages or assists. Acting FOR a communicator into an org the actor does not
# manage -- a parent or guardian redeeming a school activation code -- stays
# allowed, because in AAC acting on behalf of the communicator is the normal
# case, not an exception.
#
# Why this rule and not "self-only": a blanket self-only rule would block that
# parent/guardian path, which is core onboarding.
#
# Deliberately NOT enforced yet, because the data to express it does not exist.
# Each is tracked in
# docs/task-management/2026-09-14_supervisor-key-org-attach-escalation.md:
#   - guardian-vs-supervisor authority: there is no guardian concept in the
#     backend at all, and no persisted account creator to derive one from.
#   - org-admin authority scoped to an active seat: License rows are the seat
#     record and production has zero of them, so seat-scoping would grant org
#     admins no authority and break org onboarding.
#   - removal of org-added supervisors on exit: supervisor links carry no
#     added_by, so org-added and family-added cannot be told apart.
class SupervisorKeyAuthority
  def initialize(actor, target)
    @actor = actor
    @target = target
  end

  # An actor operating on their own account is always permitted here; this class
  # governs THIRD-PARTY use of a supervisor key only.
  def self_action?
    !!(@actor && @target && @actor.global_id && @actor.global_id == @target.global_id)
  end

  # May @actor attach or ratify @target into `org`?
  #
  # Returns true for anything that is not an organization attachment (a personal
  # activation code resolves to a User, and an unresolvable code resolves to
  # nil); those paths are unchanged by Phase 1.
  def allows_org_attachment?(org)
    return true if self_action?
    return true unless org.is_a?(Organization)
    return true unless @actor
    # assistant? matches any org_manager link and so already covers manager?;
    # both are named for legibility. upstream_manager? closes the parent/child
    # hierarchy variant, matching the same decision taken for
    # Organization#claim_user (LL-1baffd92d5).
    !(org.manager?(@actor) || org.assistant?(@actor) || org.upstream_manager?(@actor))
  end

  # Payload for the refusal AuditEvent. Organization and user global_ids only:
  # no names, no emails, nothing student-identifying, matching the payload shape
  # the existing license_claim event uses.
  def denial_event(org, action)
    {
      'type' => 'supervisor_key_denied',
      'reason' => 'actor manages the organization they would attach another user to',
      'action' => action,
      'actor_id' => @actor && @actor.global_id,
      'user_id' => @target && @target.global_id,
      'organization_id' => org.is_a?(Organization) ? org.global_id : nil
    }
  end
end
