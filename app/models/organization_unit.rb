class OrganizationUnit < ActiveRecord::Base
  include Permissions
  include Processable
  include GlobalId
  include Async
  include SecureSerialize
  secure_serialize :settings
  before_save :generate_defaults
  include Replicate

  belongs_to :organization
  belongs_to :user_goal, optional: true  # units can exist without a goal
  
  add_permissions('view', 'view_stats') {|user| self.supervisor?(user) }
  add_permissions('view', 'edit', 'view_stats') {|user| self.supervisor?(user, true) }
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
    link.save
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
    link.save
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
  
  def self.supervised_units(user)
    return [] unless user
    links = UserLink.links_for(user).select{|l| l['type'] == 'org_unit_supervisor' }
    ids = links.select{|l| l['user_id'] == user.global_id }.map{|l| l['record_code'].split(/:/)[1] }
    OrganizationUnit.find_all_by_global_id(ids).uniq
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
        User.link_supervisor_to_user(sup, comm, nil, !!edit_permission, self.global_id)
      end
    end
  end
  
  def assert_supervision(opts={})
    ref_user = User.find_by_path(opts['user_id'])
    return false unless ref_user

    links = UserLink.links_for(self)
    communicator_ids = links.select{|l| l['type'] == 'org_unit_communicator' }.map{|l| l['user_id'] }.uniq
    supervisor_links = links.select{|l| l['type'] == 'org_unit_supervisor' }
    supervisor_ids = supervisor_links.map{|l| l['user_id'] }.uniq
    communicators = User.find_all_by_global_id(communicator_ids)
    supervisors = User.find_all_by_global_id(supervisor_ids)

    if opts['remove_supervisor']
      communicators.each do |user|
        User.unlink_supervisor_from_user(ref_user, user, self.global_id)
      end
    elsif opts['remove_communicator']
      self.schedule(:assert_goal)
      supervisors.each do |user|
        User.unlink_supervisor_from_user(user, ref_user, self.global_id)
      end
    elsif opts['add_supervisor']
      edit_permission = !!supervisor_links.detect{|l| l['user_id'] == ref_user.global_id && l['state'] && l['state']['edit_permission'] }
      communicators.each do |user|
        User.link_supervisor_to_user(ref_user, user, nil, edit_permission, self.global_id)
      end
    elsif opts['add_communicator']
      self.schedule(:assert_goal)
      supervisors.each do |user|
        edit_permission = !!supervisor_links.detect{|l| l['user_id'] == user.global_id && l['state'] && l['state']['edit_permission'] }
        User.link_supervisor_to_user(user, ref_user, nil, edit_permission, self.global_id)
      end
    end
  end
end
