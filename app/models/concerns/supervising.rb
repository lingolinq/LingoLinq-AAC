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
        schedule_board_cache_refresh(supervisor)
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
    # Pull existing rows forward so a prior delayed RA cannot outlive a revoke.
    def schedule_board_cache_refresh(supervisor)
      return unless supervisor
      persist_board_cache_refresh(supervisor)
      ActiveRecord.after_all_transactions_commit do
        supervisor.schedule_once(:update_available_boards)
      rescue StandardError => e
        Rails.logger.warn("supervising: board-cache enqueue failed: #{e.class}")
      end
    end

    def persist_board_cache_refresh(supervisor)
      path = supervisor.global_id
      return unless path
      updated = RemoteAction.where(path: path, action: 'update_available_boards').update_all(act_at: Time.now)
      RemoteAction.create(path: path, action: 'update_available_boards', act_at: Time.now) if updated == 0
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
        supervisor.schedule(:remove_supervisors!)
        supervisor.settings['preferences']['role'] = 'supporter'
      end
      schedule_board_cache_refresh(supervisor)
      user.save_with_sync('supervisee')
      supervisor.save_with_sync('supervisor')
    end
  end
end