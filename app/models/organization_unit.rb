class OrganizationUnit < ApplicationRecord
  include Permissions
  include Processable
  include GlobalId
  include Async
  include SecureSerialize
  secure_serialize :settings
  before_save :generate_defaults
  after_destroy :schedule_destroyed_unit_cleanup
  include Replicate

  belongs_to :organization
  belongs_to :user_goal, optional: true  # units can exist without a goal
  
  add_permissions('view', 'view_stats') {|user| self.organization && self.supervisor?(user) }
  add_permissions('view', 'edit', 'view_stats') {|user| self.organization && self.supervisor?(user, true) }
  add_permissions('view', 'edit', 'delete') {|user| self.organization && self.organization.allows?(user, 'edit') }
  add_permissions('view', 'view_stats', 'edit', 'delete') {|user| self.organization && self.organization.allows?(user, 'manage') }
  
  def generate_defaults
    self.settings ||= {}
    if self.settings['topics']
      self.settings['topics'].each do |topic|
        topic.delete('url') if topic['url'] && !topic['url'].match(/^https?:\/\//)
      end
    end
    true
  end
  
  def process_params(params, non_user_params)
    self.organization ||= non_user_params[:organization]
    raise "organization required" unless self.organization
    self.settings ||= {}
    self.settings['name'] = process_string(params['name']) if params['name']
    self.settings['topics'] = params['topics'] if params['topics']
    if params['goal'] && self.id
      self.settings['goal_assertions'] ||= {}
      if params['goal']['remove']
        if self.user_goal
          self.settings['goal_assertions']['prior'] ||= []
          self.settings['goal_assertions']['prior'] << {
            'removed' => Time.now.iso8601,
            'id' => self.user_goal.global_id,
            'name' => self.user_goal.settings['name']
          }
          self.settings['goal_assertions']["conclude_#{self.user_goal.global_id}"] = true if params['goal']['auto_conclude']
          self.settings['goal_assertions']['removed_goal_id'] = self.user_goal.global_id
          self.user_goal = nil
        end
      elsif params['goal']['id']
        goal = UserGoal.find_by_path(params['goal']['id'])
        if goal && goal.settings['organization_unit_id'] == self.global_id 
          if self.user_goal && self.user_goal != goal
            self.settings['goal_assertions']["conclude_#{self.user_goal.global_id}"] = true if params['goal']['auto_conclude']
            self.settings['goal_assertions']['removed_goal_id'] = self.user_goal.global_id if self.user_goal
          end
          self.user_goal = goal
        end
      end
      self.schedule(:assert_goal)
    end
    if params['management_action'] && params['management_action'] != ''
      process_result = process_action(params['management_action']) 
      if !process_result
        add_processing_error("management_action was unsuccessful, #{params['management_action']}")
        return false
      end
    end
    true
  end
  
  def process_action(key)
    action, user_name = key.split(/-/, 2)
    if action == 'add_supervisor'
      add_supervisor(user_name, false)
    elsif action == 'add_edit_supervisor'
      add_supervisor(user_name, true)
    elsif action == 'remove_supervisor'
      remove_supervisor(user_name)
    elsif action == 'add_communicator'
      add_communicator(user_name)
    elsif action == 'remove_communicator'
      remove_communicator(user_name)
    else
      false
    end
  end
  
  def add_supervisor(user_name, edit_permission=false)
    user = User.find_by_path(user_name)
    org = self.organization
    return false unless user && org && org.supervisor?(user)
    link = UserLink.generate(user, self, 'org_unit_supervisor')
    link.data['state']['user_name'] = user.user_name
    link.data['state']['edit_permission'] = true if edit_permission
    # back in the room: a removal still pending for them is dropped (room_member_removal)
    member_removal_done(user, 'supervisor') if link.save
#     assert_list('supervisors', user.global_id)
#     self.settings['supervisors'] << {
#       'user_id' => user.global_id,
#       'user_name' => user.user_name,
#       'edit_permission' => !!edit_permission
#     }
    self.schedule(:assert_supervision, {user_id: user.global_id, add_supervisor: user_name})
    true
#     self.save
  end
  
  def all_user_ids
    links = UserLink.links_for(self).select{|l| l['type'] == 'org_unit_supervisor' || l['type'] == 'org_unit_communicator' }
    links.map{|l| l['user_id'] }.uniq
  end
  
  def supervisor?(user, edit_check=false)
    return false unless user
    links = UserLink.links_for(self).select{|l| l['type'] == 'org_unit_supervisor' }
    link = links.detect{|l| l['user_id'] == user.global_id }
    edit_check ? !!(link && link['state']['edit_permission']) : !!link
  end
  
  def communicator?(user)
    return false unless user
    links = UserLink.links_for(self).select{|l| l['type'] == 'org_unit_communicator' }
    !!links.detect{|l| l['user_id'] == user.global_id }
  end
  
  def remove_supervisor(user_name)
    user = User.find_by_path(user_name)
    org = self.organization
    return false unless user && org
    UserLink.remove(user, self, 'org_unit_supervisor')
    assert_list('supervisors', user.global_id)
    record_member_removal(user, 'supervisor')
    schedule(:assert_supervision, {user_id: user.global_id, remove_supervisor: user_name})
    true
    self.save
  end
  
  def add_communicator(user_name)
    user = User.find_by_path(user_name)
    org = self.organization
    return false unless user && org && org.managed_user?(user) && !org.pending_user?(user)
    link = UserLink.generate(user, self, 'org_unit_communicator')
    link.data['state']['user_name'] = user.user_name
    # back in the room: a removal still pending for them is dropped (room_member_removal)
    member_removal_done(user, 'communicator') if link.save
#     assert_list('communicators', user.global_id)
#     self.settings['communicators'] << {
#       'user_id' => user.global_id,
#       'user_name' => user.user_name
#     }
    schedule(:assert_supervision, {user_id: user.global_id, add_communicator: user_name})
    true
#     self.save
  end
  
  def remove_communicator(user_name)
    user = User.find_by_path(user_name)
    org = self.organization
    return false unless user && org
    UserLink.remove(user, self, 'org_unit_communicator')
    assert_list('communicators', user.global_id)
    record_member_removal(user, 'communicator')
    schedule(:assert_supervision, {user_id: user.global_id, remove_communicator: user_name})
    true
    self.save
  end
  
  def self.remove_as_member(user_name, member_type, organization_id)
    org = Organization.find_by_global_id(organization_id)
    # TODO: sharding
    OrganizationUnit.where(:organization_id => org.id).each do |unit|
      if member_type == 'supervisor'
        unit.remove_supervisor(user_name)
      elsif member_type == 'communicator'
        unit.remove_communicator(user_name)
      end
    end
  end
  
  # A room's links (org_unit_supervisor, org_unit_communicator) and the supervision links it made
  # outlive the room (no dependent: option), and Organization.clean_up_destroyed reads only the
  # rooms that still exist. The destroy records the cleanup in its transaction (the durable row,
  # with the deleting actor captured from the request) and enqueues it after commit; the row is
  # released by OrganizationUnit.clean_up_destroyed when it completes, and
  # RemoteAction#process_action re-queues it if the job is lost.
  def schedule_destroyed_unit_cleanup
    unit_id = self.global_id
    RemoteAction.create(path: unit_id, action: 'clean_up_destroyed_unit', act_at: Time.now,
      extra: {'organization_id' => self.organization_id, 'actor' => Organization.deleting_actor}.to_json)
    ActiveRecord.after_all_transactions_commit do
      OrganizationUnit.schedule(:clean_up_destroyed, unit_id)
    end
    true
  end

  # Takes a deleted room off its members' supervision links (User.strip_rooms_from_supervision,
  # each pair under the supervisee's lock: only a link the room alone made is removed, and each
  # removal is recorded), then removes the room's own links. Fail-closed: an error leaves the row
  # and the room's links in place, so the retry still finds every pair. Idempotent.
  def self.clean_up_destroyed(unit_id)
    rows = RemoteAction.where(path: unit_id, action: 'clean_up_destroyed_unit')
    data = rows.map{|r| JSON.parse(r.extra) rescue nil }.compact.first
    return true unless data
    org_id = data['organization_id']
    links = UserLink.where(record_code: "OrganizationUnit:#{unit_id}").select{|l| ['org_unit_supervisor', 'org_unit_communicator'].include?(l.data['type']) }
    supervisors = User.where(id: links.select{|l| l.data['type'] == 'org_unit_supervisor' }.map(&:user_id).uniq).to_a
    communicators = User.where(id: links.select{|l| l.data['type'] == 'org_unit_communicator' }.map(&:user_id).uniq).to_a
    if supervisors.length > 0 && communicators.length > 0
      org_code = "Organization:#{Organization.new(id: org_id).global_id}"
      staff_since = Organization.staff_since_for(org_code, supervisors.map(&:id)).transform_values{|at| Time.iso8601(at) }
      User.strip_rooms_from_pairs(supervisors.product(communicators), [unit_id], staff_since, org_id, data['actor'] || {}, reason: 'organization_unit_deleted')
    end
    # members taken out of the room whose removal had not run yet: the room no longer lists them
    member_rows = RemoteAction.where(action: 'room_member_removal').where('path LIKE ?', "#{ActiveRecord::Base.sanitize_sql_like(unit_id)}::%")
    error = nil
    member_rows.each do |row|
      _, user_id, kind = row.path.split(/::/)
      user = User.find_by_global_id(user_id)
      begin
        strip_deleted_room_member(unit_id, user, kind, org_id, data['actor'] || {}) if user
      rescue StandardError => e
        error ||= e
      end
    end
    raise error if error
    links.each(&:destroy)
    member_rows.delete_all
    rows.delete_all
    true
  end

  def self.supervised_units(user)
    return [] unless user
    links = UserLink.links_for(user).select{|l| l['type'] == 'org_unit_supervisor' }
    ids = links.select{|l| l['user_id'] == user.global_id }.map{|l| l['record_code'].split(/:/)[1] }
    units = OrganizationUnit.find_all_by_global_id(ids).uniq
    # a destroyed organization's rooms keep their links until Organization.clean_up_destroyed runs
    live_org_ids = Organization.where(id: units.map(&:organization_id).uniq).pluck(:id)
    units.select{|u| live_org_ids.include?(u.organization_id) }
  end

  def retire_goal_for(user, goal, force_conclude=false)
    # 1 - Find the goal copy for the user
    # 2 - If it was added less than a day ago, delete it
    # 3 - If it was added less than a week ago, retire it
    # 4 - If it has no expiration or expires more than 3 months away, retire it
    # 5 - Remove user_id from goal_assertions
    return false if !user || !goal
    goals = goal.children_goals
    # TODO: sharding
    user_goal = goals.detect{|g| g.user_id == user.id }
    return false if !user_goal || !user_goal.active
    if user_goal.created_at > 24.hours.ago
      # delete it
      user_goal.destroy
    elsif user_goal.created_at > 1.week.ago || !user_goal.advance_at || user_goal.advance_at > 3.months.from_now || force_conclude
      # conclude it
      user_goal.instance_variable_set('@clear_primary', true)
      user_goal.active = false
      user_goal.save
    end
    self.settings ||= {}
    if (self.settings['goal_assertions'] || {})[goal.global_id]
      self.settings['goal_assertions'][goal.global_id]['user_ids'] -= [user.global_id]
    end
    true
  end

  def assert_goal
    changed = false
    self.settings['goal_assertions'] ||= {}
    old_goal_id = self.settings['goal_assertions']['removed_goal_id']
    if old_goal_id && self.settings['goal_assertions'][old_goal_id]
      # If there is a prior goal, go through and detach it from any users
      old_goal = UserGoal.find_by_path(old_goal_id)
      User.find_all_by_global_id(self.settings['goal_assertions'][old_goal_id]['user_ids']).each do |user|
        retire_goal_for(user, old_goal, self.settings['goal_assertions']["conclude_#{old_goal_id}"])
      end
      old_goal.active = false
      old_goal.save
      self.settings['goal_assertions'].delete("conclude_#{old_goal_id}")
      self.settings['goal_assertions'].delete('removed_goal_id')
      changed = true
    end

    if self.user_goal
      # If there is a goal, add it for any users that have never 
      # added it, and remove it for any users that are no longer in the unit
      current_goal_id = self.user_goal.global_id
      self.settings['goal_assertions'][current_goal_id] ||= {'user_ids' => [], 'added' => Time.now.iso8601}

      links = UserLink.links_for(self)
      active_communicator_ids = links.select{|l| l['type'] == 'org_unit_communicator' }.map{|l| l['user_id'] }.uniq
      removed_user_ids = self.settings['goal_assertions'][current_goal_id]['user_ids'] - active_communicator_ids
      users_hash = {}
      User.find_all_by_global_id(active_communicator_ids + removed_user_ids).each{|u| users_hash[u.global_id] = u }
      root_goal = self.user_goal
      root_goal_changed = false
      active_communicator_ids.each do |id|
        if !self.settings['goal_assertions'][current_goal_id]['user_ids'].include?(id)
          self.settings['goal_assertions'][current_goal_id]['user_ids'] << id
          if users_hash[id]
            # create goal copy for this user
            # If the prior goal was just removed for this user, then
            # this goal should become the new primary goal
            user_goal = UserGoal.new
            user_goal.build_from_template(root_goal, users_hash[id], !users_hash[id].settings['primary_goal'], true)
            user_goal.settings['uneditable'] = true
            user_goal.settings['organization_unit_id'] = self.global_id
            # set as primary iff the user has no primary goal
            user_goal.save
            root_goal.settings['children_ids'] ||= []
            root_goal.settings['children_ids'] << user_goal.global_id
            root_goal_changed = true
            changed = true
          end
        end
      end
      root_goal.save if root_goal_changed
      removed_user_ids.each do |id|
        if users_hash[id]
          self.retire_goal_for(users_hash[id], self.user_goal)
        end
      end
    end
    self.save if changed
  end
  
  def assert_list(list, exclude_user_id)
    self.settings[list] = (self.settings[list] || []).select{|s| s['user_id'] != exclude_user_id }
  end
  
  def assert_supervision!
    links = UserLink.links_for(self)
    communicator_ids = links.select{|l| l['type'] == 'org_unit_communicator' }.map{|l| l['user_id'] }.uniq
    supervisor_links = links.select{|l| l['type'] == 'org_unit_supervisor' }
    supervisor_ids = supervisor_links.map{|l| l['user_id'] }.uniq
    communicators = User.find_all_by_global_id(communicator_ids)
    supervisors = User.find_all_by_global_id(supervisor_ids)
    supervisors.each do |sup|
      edit_permission = !!supervisor_links.detect{|l| l['user_id'] == sup.global_id && l['state'] && l['state']['edit_permission'] }
      communicators.each do |comm|
        link_room_pair(sup, comm, !!edit_permission)
      end
    end
  end
  
  def assert_supervision(opts={})
    ref_user = User.find_by_path(opts['user_id'])
    return false unless ref_user
    # A job queued before the organization was destroyed must not link its rooms' members
    # afterwards; a removal still applies (strip_destroyed_org_supervision).
    return strip_destroyed_org_supervision(ref_user, opts) unless self.organization

    # read fresh: who is in the room now decides a queued removal and who a queued add links
    links = UserLink.links_for(self, true)
    communicator_ids = links.select{|l| l['type'] == 'org_unit_communicator' }.map{|l| l['user_id'] }.uniq
    supervisor_links = links.select{|l| l['type'] == 'org_unit_supervisor' }
    supervisor_ids = supervisor_links.map{|l| l['user_id'] }.uniq
    communicators = User.find_all_by_global_id(communicator_ids)
    supervisors = User.find_all_by_global_id(supervisor_ids)

    # a member put back in the room since the removal was queued keeps the room's supervision:
    # the removal only completes its row (membership read fresh above)
    if opts['remove_supervisor']
      unless supervisor_ids.include?(ref_user.global_id)
        communicators.each do |user|
          User.unlink_supervisor_from_user(ref_user, user, self.global_id)
        end
      end
      member_removal_done(ref_user, 'supervisor')
    elsif opts['remove_communicator']
      self.schedule(:assert_goal)
      unless communicator_ids.include?(ref_user.global_id)
        supervisors.each do |user|
          User.unlink_supervisor_from_user(user, ref_user, self.global_id)
        end
      end
      member_removal_done(ref_user, 'communicator')
    elsif opts['add_supervisor']
      edit_permission = !!supervisor_links.detect{|l| l['user_id'] == ref_user.global_id && l['state'] && l['state']['edit_permission'] }
      communicators.each do |user|
        link_room_pair(ref_user, user, edit_permission)
      end
    elsif opts['add_communicator']
      self.schedule(:assert_goal)
      supervisors.each do |user|
        edit_permission = !!supervisor_links.detect{|l| l['user_id'] == user.global_id && l['state'] && l['state']['edit_permission'] }
        link_room_pair(user, ref_user, edit_permission)
      end
    end
  end

  # Links a supervisor to a communicator for this room, under the supervisee's lock and only while
  # the room and its organization still exist, read under that lock: a job that loaded the room
  # before it (or its district) was deleted must not put it back on a link after the cleanup took
  # it off. The cleanup takes the same lock per pair, so either it runs after this link (and
  # strips it) or this reads the committed deletion.
  def link_room_pair(supervisor, communicator, edit_permission)
    User.with_supervision_lock(communicator) do
      next false unless OrganizationUnit.where(id: self.id).exists? && Organization.where(id: self.organization_id).exists?
      User.link_supervisor_to_user(supervisor, communicator, nil, edit_permission, self.global_id)
    end
  end

  # A member taken out of a room leaves the room's links at once (remove_supervisor,
  # remove_communicator) and is unlinked by a queued job. When the organization was destroyed in
  # between, Organization.clean_up_destroyed reads the rooms' current members and cannot see that
  # member, so the job takes the destroyed organization's rooms off the member's supervision links
  # itself, the same way the cleanup does (User.strip_rooms_from_supervision: only a link known to
  # be room-made is removed; a direct one is kept without the rooms). Pairs come from the member's
  # own supervision links, not from the room's members.
  def strip_destroyed_org_supervision(ref_user, opts)
    return false unless opts['remove_supervisor'] || opts['remove_communicator']
    kind = opts['remove_supervisor'] ? 'supervisor' : 'communicator'
    org_id = self.organization_id
    unit_ids = OrganizationUnit.where(organization_id: org_id).map(&:global_id)
    pairs = OrganizationUnit.removed_member_pairs(ref_user, kind, unit_ids)
    if pairs.length > 0
      staff_since, actor = Organization.destroyed_org_cleanup_context(org_id)
      User.strip_rooms_from_pairs(pairs, unit_ids, staff_since, org_id, actor)
    end
    member_removal_done(ref_user, kind)
    true
  end

  # The supervision pairs of a member taken out of a room, from the member's own supervision links
  # that list any of unit_ids (the room no longer lists the member).
  def self.removed_member_pairs(ref_user, kind, unit_ids)
    if kind == 'supervisor'
      links = ref_user.supervisee_links.select{|l| ((l['state'] || {})['organization_unit_ids'] || []).intersect?(unit_ids) }
      User.find_all_by_global_id(links.map{|l| l['user_id'] }.uniq).map{|comm| [ref_user, comm] }
    else
      links = ref_user.supervisor_links.select{|l| ((l['state'] || {})['organization_unit_ids'] || []).intersect?(unit_ids) }
      User.find_all_by_global_id(links.map{|l| l['record_code'].split(/:/)[1] }.uniq).map{|sup| [sup, ref_user] }
    end
  end

  # A member's removal (remove_supervisor, remove_communicator) is completed by a queued
  # assert_supervision; this row backs that job, is released when it completes
  # (member_removal_done), and RemoteAction#process_action runs complete_member_removal from it
  # if the job is lost. Ids and the kind only.
  def member_removal_path(user, kind)
    "#{self.global_id}::#{user.global_id}::#{kind}"
  end

  def record_member_removal(user, kind)
    path = member_removal_path(user, kind)
    RemoteAction.where(path: path, action: 'room_member_removal').delete_all
    RemoteAction.create(path: path, action: 'room_member_removal', act_at: 1.hour.from_now,
      extra: {'organization_id' => self.organization_id}.to_json)
  end

  def member_removal_done(user, kind)
    RemoteAction.where(path: member_removal_path(user, kind), action: 'room_member_removal').delete_all
  end

  def self.complete_member_removal(path)
    rows = RemoteAction.where(path: path, action: 'room_member_removal')
    return true unless rows.exists?
    unit_id, user_id, kind = path.split(/::/)
    user = User.find_by_global_id(user_id)
    unit = OrganizationUnit.find_by_global_id(unit_id)
    if user && unit
      # releases the row when it completes
      unit.assert_supervision({'user_id' => user.global_id, "remove_#{kind}" => true})
    elsif user && RemoteAction.where(path: unit_id, action: 'clean_up_destroyed_unit').exists?
      # the deleted room's cleanup completes it (clean_up_destroyed) and releases the row
    else
      if user
        data = rows.map{|r| JSON.parse(r.extra) rescue nil }.compact.first || {}
        strip_deleted_room_member(unit_id, user, kind, data['organization_id'], {})
      end
      rows.delete_all
    end
    true
  end

  # Completes the removal of a member taken out of a room that was deleted before the removal ran:
  # the room's id (and, when the organization is gone too, its other rooms' ids) comes off the
  # member's supervision links, the same origin-aware way the cleanups strip.
  def self.strip_deleted_room_member(unit_id, user, kind, org_id, actor)
    unit_ids = [unit_id]
    if org_id && Organization.where(id: org_id).exists?
      reason = 'organization_unit_deleted'
      pairs = removed_member_pairs(user, kind, unit_ids)
      org_code = "Organization:#{Organization.new(id: org_id).global_id}"
      staff_since = Organization.staff_since_for(org_code, pairs.map{|sup, comm| sup.id }.uniq).transform_values{|at| Time.iso8601(at) }
    else
      reason = 'organization_deleted'
      unit_ids += OrganizationUnit.where(organization_id: org_id).map(&:global_id) if org_id
      pairs = removed_member_pairs(user, kind, unit_ids)
      staff_since, org_actor = org_id ? Organization.destroyed_org_cleanup_context(org_id) : [{}, {}]
      actor = org_actor if actor.blank?
    end
    return true if pairs.empty?
    User.strip_rooms_from_pairs(pairs, unit_ids, staff_since, org_id, actor || {}, reason: reason)
  end
end
