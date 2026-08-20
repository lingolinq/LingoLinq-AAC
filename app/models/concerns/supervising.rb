module Supervising
  extend ActiveSupport::Concern
  
  def generate_link_code
    return nil unless self.any_premium_or_grace_period?
    code = GoSecure.nonce('link_code')[0, 5]
    self.settings['link_codes'] ||= []
    self.settings['link_codes'].select!{|c| id, nonce, ts = c.split(/-/, 3); Time.at(ts.to_i) > 6.hours.ago }
    code = "#{self.global_id}-#{code}-#{Time.now.to_i}"
    self.settings['link_codes'] << code
    self.save
    code
  end
  
  def link_to_supervisee_by_code(code)
    return false unless code
    id, nonce, ts = code.split(/-/, 3)
    user = User.find_by_global_id(id)
    user = nil unless user && user.any_premium_or_grace_period? &&
        (user.settings['link_codes'] || []).include?(code) && 
        Time.at(ts.to_i) > 6.hours.ago
    return false unless user && user != self
    supervisors = User.find_all_by_global_id(user.supervisor_user_ids)
    non_premium_supervisors = supervisors.select{|u| !u.any_premium_or_grace_period? }
    return false if non_premium_supervisors.length >= 5
    self.save unless self.id
    self.class.link_supervisor_to_user(self, user, code)
    true
  end
  
  def supervisor_user_ids
    sups = UserLink.links_for(self).select{|l| l['type'] == 'supervisor' && l['user_id'] == self.global_id}
    sups.map{|l| l['record_code'].split(/:/)[1] }.uniq
  end
  
  def supervisor_links
    return [] unless self.id
    UserLink.links_for(self).select{|l| l['type'] == 'supervisor' && l['user_id'] == self.global_id }
  end
  
  def supervisor_for?(user)
    user.supervisor_user_ids.include?(self.global_id) ||
      Organization.manager_for?(self, user) ||
      supervisor_relationship_active_as_supervisor?(user)
  end

  # Approved consent-flow relationship (may exist alongside or without a fully-synced UserLink).
  def supervisor_relationship_active_as_supervisor?(communicator)
    return false unless self.id && communicator&.id

    SupervisorRelationship.active.exists?(
      supervisor_user_id: self.id,
      communicator_user_id: communicator.id
    )
  end

  def approved_supervisor_relationship_to(communicator)
    return nil unless self.id && communicator&.id

    SupervisorRelationship.active.find_by(
      supervisor_user_id: self.id,
      communicator_user_id: communicator.id
    )
  end
  
  def supervisors
    if !self.supervisor_user_ids.blank?
      User.find_all_by_global_id(self.supervisor_user_ids)
    else
      []
    end
  end
  
  def managing_organization(pending=false)
    orgs = Organization.attached_orgs(self)
    org = orgs.detect{|o| o['type'] == 'user' && (pending ? o['pending'] : !o['pending']) && o['sponsored'] }
    org ||= orgs.detect{|o| o['type'] == 'user' && (pending ? o['pending'] : !o['pending']) }
    org ||= orgs.detect{|o| o['type'] == 'user' }
    if org
      Organization.find_by_global_id(org['id'])
    else
      nil
    end
  end
  
  def organization_hash
    res = []
    res += Organization.attached_orgs(self)
    res.reverse.uniq{|e| [e['id'], e['type']] }.sort_by{|e| e['id'] }
  end

  def supervisee_links
    return [] unless self.id
    code = Webhook.get_record_code(self)
    UserLink.links_for(self).select{|l| l['type'] == 'supervisor' && l['record_code'] == code }
  end
  
  def supervised_user_ids
    supervisee_links.map{|l| l['user_id'] }.compact.uniq
  end
  
  def supervisees
    if !self.supervised_user_ids.blank?
      User.find_all_by_global_id(self.supervised_user_ids).sort_by(&:user_name)
    else
      []
    end
  end
  
  def edit_permission_for?(supervisee, include_admin_managers=true)
    return false if self.valet_mode?
    sup = !self.modeling_only? && supervisee.supervisor_links.any?{|l| l['record_code'] == Webhook.get_record_code(self) && l['user_id'] == supervisee.global_id && l['state']['edit_permission'] }
    return true if sup
    rel = approved_supervisor_relationship_to(supervisee)
    if rel && %w[edit_boards manage_devices full].include?(rel.permission_level)
      return true unless self.modeling_only?
    end
    Organization.manager_for?(self, supervisee, include_admin_managers)
  end

  def modeling_only_for?(supervisee, include_admin_managers=true)
    return true if self.modeling_only?
    rel = approved_supervisor_relationship_to(supervisee)
    return true if rel&.permission_level == 'modeling_only'
    supervisee.supervisor_links.any?{|l| l['record_code'] == Webhook.get_record_code(self) && l['user_id'] == supervisee.global_id && l['state']['modeling_only'] }
  end

  # Affirmative authorization for a communicator reached through someone
  # else's supervisee list. "No relationship" must mean DENIED.
  #
  # Exclusion filters (`!modeling_only_for?`, `!private_logging?`) admit
  # strangers: supervising.rb finds no link, returns false, and the
  # negation lets them through. That was the badges / logs /
  # users#supervisees leak class.
  #
  # `permission` is per-disclosure: 'set_goals' for progress, 'supervise'
  # for usage data and roster identity. Both resolve through self,
  # non-modeling supervisor, and org manager (user.rb:71,87).
  #
  # ApplicationController#supervisee_readable? wraps this for HTTP
  # fan-out; JsonApi::User calls it directly for nested supervisees.
  # No modeling_only conjunct here. Each permission rule already encodes its own
  # modeling-only policy, at the granularity that rule needs:
  #
  #   'supervise'  (user.rb:72) excludes modeling-only outright -- usage data.
  #   'set_goals'  (user.rb:77) excludes a PER-LINK modeling-only supporter but
  #                deliberately KEEPS a globally billing-lapsed one, because
  #                lapsing is about money and says nothing about the caller's
  #                standing with that child.
  #
  # Adding `&& !caller.modeling_only_for?(self)` on top applied the coarse test to
  # both, and modeling_only_for? opens `return true if self.modeling_only?`
  # (:122) -- the GLOBAL billing flag. That silently defeated the set_goals
  # carve-out and dropped a lapsed supporter's whole caseload from badges#index.
  # Two granularities of "modeling only" exist; only the rules know which one
  # applies, so let them decide.
  def readable_as_supervisee_by?(caller, permission, scopes=['full'])
    return false unless caller
    return true if id == caller.id
    allows?(caller, permission, scopes)
  end

  # ROSTER IDENTITY, as distinct from the DATA check above.
  #
  # readable_as_supervisee_by? is right for a disclosure ABOUT a communicator
  # (progress, usage logs). It is wrong for the question "is this communicator
  # on the caller's own roster at all", because both of its conjuncts fail for
  # a supporter whose billing has lapsed:
  #
  #   modeling_only_for? opens with `return true if self.modeling_only?`
  #   (:122) -- a property of the CALLER, not of the relationship -- and
  #   billing_state returns :modeling_only as the final fall-through for any
  #   supporter who is not premium, trialing, org-sponsored, an org supporter,
  #   or a manager (subscription.rb:832). The 'supervise' rule at user.rb:71
  #   carries the same conjunct, so `allows?` fails too.
  #
  # The result was that a lapsed free supporter got an EMPTY supervisee list on
  # their own /users/self -- which also closes their websocket, because
  # sync.js:196 only connects when `!supporter_role || supervisees.length`.
  # Remote modeling is the one thing that tier exists to do.
  #
  # 'model' is the permission that survives a lapse: user.rb:69 grants it to any
  # supervisor_for? without the modeling_only conjunct, user.rb:87 grants it to
  # an org manager, and the self rules grant it to the caller themselves. No
  # rule grants 'model' to a stranger -- the public-account rule
  # (:58) deliberately stops at view_existence/view_detailed -- so the fan-out leak
  # this whole class of fix exists to close stays closed.
  #
  # Going through allows? rather than a bare supervisor_for? keeps restricted
  # OAuth tokens held to their scopes, and picks up the permissable Redis cache
  # (permissions.rb:29) that supervisor_for? does not have.
  def listable_as_supervisee_by?(caller, scopes=['full'])
    return false unless caller
    return true if id == caller.id
    allows?(caller, 'model', scopes)
  end

  def org_units_for_supervising(supervisee)
    unit_ids = supervisee_links.map{|l| l['state']['organization_unit_ids'] }.compact.flatten.uniq
    OrganizationUnit.find_all_by_global_id(unit_ids)
  end
  
  def process_supervisor_key(key)
    SupervisorKeyProcessor.new(self, key).call
  end
  
  def remove_supervisors!
    user = self
    self.supervisors.each do |sup|
      User.unlink_supervisor_from_user(sup, user)
    end
  end
  
  module ClassMethods  
    def unlink_supervisor_from_user(supervisor, user, organization_unit_id=nil)
      supervisor = user if supervisor.global_id == user.global_id
      sup = (user.settings['supervisors'] || []).detect{|s| s['user_id'] == supervisor.global_id }
      org_unit_ids = (sup || {})['organization_unit_ids'] || []
      org_unit_ids += UserLink.links_for(user).select{|l| l['type'] == 'supervisor' && l['user_id'] == user.global_id && l['record_code'] == Webhook.get_record_code(supervisor) }.map{|l| l['state'] && l['state']['organization_unit_ids'] }.compact.flatten
      org_unit_ids.uniq!
      
      user.settings['supervisors'] = (user.settings['supervisors'] || []).select{|s| s['user_id'] != supervisor.global_id }
      do_unlink = true
      if organization_unit_id && (org_unit_ids - [organization_unit_id]).length > 0
        org_unit_ids -= [organization_unit_id]
        link = UserLink.generate(user, supervisor, 'supervisor')
        link.data['state']['organization_unit_ids'] = org_unit_ids
        link.save!
        do_unlink = false
      else
        UserLink.remove(user, supervisor, 'supervisor')
      end
      user.update_setting({
        'supervisors' => user.settings['supervisors']
      })
      ApplicationRecord.using(:master) do
        user.reload
      end
      if do_unlink
        ApplicationRecord.using(:master) do
          supervisor.reload
        end
        supervisor.settings['supervisees'] = (supervisor.settings['supervisees'] || []).select{|s| s['user_id'] != user.global_id }
        # If a user was auto-subscribed for being added as a supervisor, un-subscribe them when removed
        if supervisor.settings['supervisees'].empty? && supervisor.settings['supporter_role_auto_set']
          supervisor.settings.delete('supporter_role_auto_set')
          supervisor.settings['preferences']['role'] = 'communicator'
          supervisor.save_with_sync('un-supervisor')
        end
        schedule_board_cache_refresh(supervisor, true)
        supervisor.update_setting({
          'supervisees' => supervisor.settings['supervisees']
        })
      end
    end
    

    # update_available_boards recomputes settings['available_private_board_ids'],
    # which board.rb:76 reads to grant view/edit/delete/share -- it writes
    # AUTHORIZATION state, not display state, and its result sits behind a
    # 30-minute permission cache. The persisted list has no TTL of its own, so a
    # missed refresh stays stale until some other event retriggers it.
    #
    # Ordering: schedule_once pushes to Redis the moment it is called, and Redis
    # is not enrolled in the Postgres transaction. SupervisorConsentService runs
    # both link_supervisor_to_user and unlink_supervisor_from_user inside
    # `with_lock`, so a worker could dequeue and recompute from the PRE-COMMIT
    # snapshot: a revoke undone by its own job, re-granting a removed supervisor
    # real access to a child's private boards. The consent service's post-commit
    # re-enqueue only made that race CONVERGE -- it cannot order the two workers'
    # writes, and schedule_once dedupes against a job still sitting in the queue,
    # so the corrective enqueue could itself be a silent no-op. Deferring at the
    # source is the ordering fix.
    #
    # after_all_transactions_commit, not a bare call: with no open transaction it
    # runs the block IMMEDIATELY, so the many non-transactional callers of these
    # two methods are unchanged. Only callers already inside a transaction see
    # the deferral -- which is exactly the set that was broken.
    #
    # Durability: the post-commit callback cannot roll the relationship change
    # back. If the process exits or Redis is down between commit and enqueue, the
    # supervisor link is gone and no refresh job exists. RemoteAction is this
    # app's outbox for the same job (board_caching.rb, organization.rb);
    # writing it in the same transaction as the link change means
    # Uploader.remote_remove_batch (hourly) will still schedule the refresh.
    # The outbox row is a FALLBACK for the post-commit enqueue, and it is released
    # by the WORKER on completion (board_caching.rb#update_available_boards), not
    # here on enqueue. Resque.enqueue returning means Redis accepted an LPUSH, not
    # that the refresh happened; available_private_board_ids is authorization state
    # (board.rb:76) with no TTL, so clearing on acceptance would let a job lost to
    # eviction, failover, or a SIGKILL past the shutdown grace leave a REVOKED
    # supervisor holding real access to a child's private boards indefinitely.
    # Releasing on completion still collapses the doubled recompute -- the row is
    # gone before hourly remote_remove_batch ever sees it -- without trading a
    # durability guarantee for it, and it needs no ownership tracking, so a
    # concurrent operation cannot adopt or destroy another's row.
    #
    # `revoked` distinguishes the two callers. On a revoke a delayed row must be
    # pulled forward: board_caching.rb:22-25 parks a deliberate 30-minutes-out row
    # for accounts with >500 view ids, and a revoked supervisor must not keep real
    # access for that long. On a LINK there is no such urgency, and dragging that
    # row forward defeated the debounce it exists to provide -- the batch would
    # fire it immediately, update_available_boards would see a <60-minute generated
    # stamp, and park a fresh row 30 minutes out again.
    def schedule_board_cache_refresh(supervisor, revoked=false)
      return unless supervisor
      persist_board_cache_refresh(supervisor, revoked)
      ActiveRecord.after_all_transactions_commit do
        supervisor.schedule_once(:update_available_boards)
      rescue StandardError => e
        Rails.logger.warn("supervising: board-cache enqueue failed for #{supervisor.global_id}: #{e.class}: #{e.message}")
      end
    end

    def persist_board_cache_refresh(supervisor, revoked=false)
      path = supervisor.global_id
      return unless path
      scope = RemoteAction.where(path: path, action: 'update_available_boards')
      if revoked
        return if scope.update_all(act_at: Time.now) > 0
      elsif scope.exists?
        return
      end
      RemoteAction.create(path: path, action: 'update_available_boards', act_at: Time.now)
    end

    def link_supervisor_to_user(supervisor, user, code=nil, type=true, organization_unit_id=nil)
      type = 'edit' if type == true
      type ||= 'read_only'
      supervisor = user if supervisor.global_id == user.global_id
      
      grant_premium = false
      if organization_unit_id == 'granted'
        grant_premium = true
        organization_unit_id = nil
      end
      org_unit_ids = ((user.settings['supervisors'] || []).detect{|s| s['user_id'] == supervisor.global_id } || {})['organization_unit_ids'] || []
      org_unit_ids += UserLink.links_for(user).select{|l| l['type'] == 'supervisor' && l['record_code'] == Webhook.get_record_code(supervisor) }.map{|l| l['state'] && l['state']['organization_unit_ids'] }.compact.flatten

      link = UserLink.generate(user, supervisor, 'supervisor')
      link.data['state']['edit_permission'] = true if type == 'edit'
      link.data['state']['modeling_only'] = true if type == 'modeling_only'
      link.data['state']['supervisee_user_name'] = user.user_name
      link.data['state']['supervisor_user_name'] = supervisor.user_name
      link.data['state']['organization_unit_ids'] = ((org_unit_ids || []) + ([organization_unit_id].compact)).uniq
      link.secondary_user_id = supervisor.id
      link.save!

      ApplicationRecord.using(:master) do
        supervisor.reload
      end
      # first-time supervisors should automatically be set to the supporter role
      if !supervisor.settings['supporter_role_auto_set'] && supervisor.settings['preferences']['role'] != 'supporter'
        supervisor.settings['supporter_role_auto_set'] = true
        supervisor.settings['preferences']['role'] = 'supporter'
      end
      if grant_premium && user.premium_supporter_grants > 0 && supervisor.supporter_role? && supervisor.billing_state != :premium_supporter
        user.grant_premium_supporter(supervisor)
      end
      # If a user is on a free trial and they're added as a supervisor, set them to a free supporter subscription
      if supervisor.grace_period?
        # Deferred for the same reason as the board-cache refresh above: Resque is
        # not enrolled in the Postgres transaction. This job is the destructive one
        # -- remove_supervisors! (:157) unlinks EVERY one of this user's
        # supervisors. Enqueued bare inside the transaction, a rollback meant the
        # link that triggered it never happened while the unlink-everything job
        # still ran. No outbox row here on purpose: losing this job is the safe
        # failure, re-running it is not.
        ActiveRecord.after_all_transactions_commit do
          supervisor.schedule(:remove_supervisors!)
        rescue StandardError => e
          # Identified, because this one has no outbox: the role change is already
          # committed and nothing retries, so this line is the only trace that a
          # grace-period account was left marked supporter while still holding
          # supervisors. Silent is not an acceptable form of the safe failure.
          Rails.logger.warn("supervising: remove_supervisors! enqueue failed for #{supervisor.global_id}: #{e.class}: #{e.message}")
        end
        supervisor.settings['preferences']['role'] = 'supporter'
      end
      schedule_board_cache_refresh(supervisor)
      user.save_with_sync('supervisee')
      supervisor.save_with_sync('supervisor')
    end
  end
end