class CleverRosterSync
  class Error < StandardError; end

  ROLE_PRIORITY = %w[student teacher staff district_admin].freeze

  def self.sync_all!
    scheduled = 0
    Organization.find_each do |org|
      next unless org.clever_sync_enabled?
      org.schedule_for(:slow, :sync_clever_roster)
      scheduled += 1
    end
    scheduled
  end

  def self.sync_organization!(org)
    new(org).sync!
  end

  def self.sync_user_on_login!(org, clever_id)
    new(org).sync_one!(clever_id)
  end

  def initialize(org)
    @org = org
    @district_id = org && org.settings && org.settings['clever_district_id'].to_s
  end

  def sync!
    raise Error, 'missing_org' unless @org
    raise Error, 'missing_district' if @district_id.blank?

    token = CleverApi.district_app_token(@district_id)
    persist_schools!(token)
    seen_ids = {}
    CleverOAuth::USER_TYPES.each do |role|
      CleverApi.users(token, role: role).each do |raw|
        profile = CleverOAuth.profile_from_user(raw, @district_id)
        next if profile[:id].blank?
        seen_ids[profile[:id]] = true
        upsert_user!(profile)
      end
    end
    archive_missing!(seen_ids.keys)
    { synced: seen_ids.length, district_id: @district_id }
  end

  def sync_one!(clever_id)
    raise Error, 'missing_org' unless @org
    raise Error, 'missing_user' if clever_id.to_s.blank?
    token = CleverApi.district_app_token(@district_id)
    raw = CleverApi.user(clever_id, token)
    profile = CleverOAuth.profile_from_user(raw, @district_id)
    upsert_user!(profile)
  end

  def persist_schools!(token)
    schools = CleverApi.schools(token).map do |school|
      {
        'id' => school['id'].to_s,
        'name' => school['name'].to_s
      }
    end
    @org.settings ||= {}
    @org.settings['clever_schools'] = schools
    @org.save
  end

  def upsert_user!(profile)
    clever_id = profile[:id].to_s
    return nil if clever_id.blank?

    user = User.find_by_clever_id(clever_id)
    user ||= match_existing_by_email(profile[:email])
    user ||= provision_user!(profile)
    return nil unless user

    restore_if_archived!(user)
    user.link_clever!(clever_id, {
      email: profile[:email],
      name: profile[:name],
      org_id: @org.global_id,
      district_id: @district_id,
      roles: profile[:roles],
      schools: profile[:schools]
    })
    apply_roles!(user, profile[:roles])
    update_profile!(user, profile)
    user
  end

  def match_existing_by_email(email)
    User.clever_users_matching_email_in_org(email, @org).first
  end

  def provision_user!(profile)
    password = GoSecure.nonce('clever_pw')
    params = {
      'name' => profile[:name],
      'password' => password,
      'terms_agree' => true,
      'preferences' => {
        'registration_type' => registration_type_for(profile[:roles]),
        'role' => lingolinq_role_for(profile[:roles]),
        'cookies' => false
      }
    }
    params['email'] = profile[:email] if profile[:email].present?
    author = provision_author
    non_user = { pending: true, allow_password_change: true }
    if author
      params['authored_organization_id'] = @org.global_id
      non_user[:author] = author
    end
    user = User.process_new(params, non_user)
    return nil if !user || user.errored?
    stamp_school_authorization!(user, author)
    UserBoardProvisioner.provision_for(user)
    user
  end

  def provision_author
    @org.managers.detect { |manager| @org.allows?(manager, 'edit') }
  end

  def stamp_school_authorization!(user, author)
    return if user.settings['school_authorization'].is_a?(Hash)
    user.settings['authored_organization_id'] ||= @org.global_id
    user.settings['school_authorization'] = {
      'basis' => 'school_official',
      'organization_id' => @org.global_id,
      'authorized_by' => author && author.global_id || 'clever_roster_sync',
      'authorized_at' => Time.now.utc.iso8601,
      'record_id' => SecureRandom.uuid
    }
    user.save
    sa = user.settings['school_authorization']
    begin
      AuditEvent.create!(
        user_key: user.global_id,
        data: {
          'type' => 'school_authorization',
          'basis' => sa['basis'],
          'organization_id' => sa['organization_id'],
          'authorized_by' => sa['authorized_by'],
          'record_id' => sa['record_id']
        },
        event_type: 'school_authorization',
        record_id: sa['record_id']
      )
    rescue StandardError => e
      detail = begin
        PiiScrubber.scrub_log_line(e.message.to_s).truncate(300)
      rescue ScriptError, StandardError
        '[unscrubbable]'
      end
      Rails.logger.error("school_authorization audit failed during clever sync for #{user.global_id}: #{e.class} #{detail}")
    end
  end

  def apply_roles!(user, roles)
    roles = Array(roles).map(&:to_s)
    if roles.include?('student')
      attach_communicator!(user)
    end
    if roles.include?('teacher') || roles.include?('staff')
      attach_supervisor!(user)
    end
    if roles.include?('district_admin')
      attach_manager!(user)
    end
  end

  def attach_communicator!(user)
    return if org_link?(user, 'org_user')
    begin
      @org.add_user(user.user_name, false, true, false)
    rescue RuntimeError, StandardError
      @org.add_user(user.user_name, true, false, false)
    end
  rescue StandardError => e
    Rails.logger.error("clever communicator attach failed for #{user.global_id}: #{e.class}")
  end

  def attach_supervisor!(user)
    return if org_link?(user, 'org_supervisor')
    @org.add_supervisor(user.user_name, false, false)
  rescue StandardError => e
    Rails.logger.error("clever supervisor attach failed for #{user.global_id}: #{e.class}")
  end

  def attach_manager!(user)
    return if org_link?(user, 'org_manager')
    @org.add_manager(user.user_name, true)
  rescue StandardError => e
    Rails.logger.error("clever manager attach failed for #{user.global_id}: #{e.class}")
  end

  def org_link?(user, type)
    UserLink.links_for(user).any? do |link|
      link['type'] == type && link['record_code'] == Webhook.get_record_code(@org)
    end
  end

  def update_profile!(user, profile)
    changed = false
    if profile[:name].present? && user.settings['name'] != profile[:name]
      user.settings['name'] = profile[:name]
      changed = true
    end
    if profile[:email].present? && user.settings['email'] != profile[:email]
      user.settings['email'] = profile[:email]
      changed = true
    end
    user.save if changed
  end

  def restore_if_archived!(user)
    link = clever_auth_link_for(user)
    return unless link && link.data['state'] && link.data['state']['clever_archived']
    link.data['state']['clever_archived'] = false
    link.data['state'].delete('archived_at')
    link.save
  end

  def clever_auth_link_for(user)
    UserLink.where(user_id: user.id).detect { |l| l.data && l.data['type'] == 'clever_auth' }
  end

  def archive_missing!(current_ids)
    current = current_ids.map(&:to_s)
    UserLink.find_each do |link|
      next unless link.data && link.data['type'] == 'clever_auth'
      state = link.data['state'] || {}
      next unless state['org_id'] == @org.global_id
      clever_id = state['clever_id'].to_s
      next if clever_id.blank? || current.include?(clever_id)
      next if state['clever_archived']
      user = User.find_by(id: link.user_id)
      detach_org_membership!(user) if user
      state['clever_archived'] = true
      state['archived_at'] = Time.now.utc.iso8601
      link.data['state'] = state
      link.save
    end
  end

  def detach_org_membership!(user)
    %w[user supervisor manager].each do |type|
      next unless org_link?(user, "org_#{type}")
      @org.detach_user(user, type)
    rescue StandardError => e
      Rails.logger.error("clever detach #{type} failed for #{user.global_id}: #{e.class}")
    end
  end

  def registration_type_for(roles)
    roles = Array(roles)
    return 'communicator' if roles.include?('student')
    return 'teacher' if roles.include?('teacher') || roles.include?('staff')
    'other'
  end

  def lingolinq_role_for(roles)
    roles = Array(roles)
    return 'communicator' if roles.include?('student')
    'supporter'
  end
end
