class User < ApplicationRecord
  include Processable
  include Permissions
  include Passwords
  include Async
  include GlobalId
  include MetaRecord
  include Supervising
  include SecureSerialize
  include Notifiable
  include Notifier
  include Subscription
  include BoardCaching
  include Renaming
  include GoogleAuthentication
  has_many :log_sessions
  has_many :boards
  has_many :devices
  has_many :user_integrations
  has_many :supervisor_relationships_as_supervisor, class_name: 'SupervisorRelationship', foreign_key: :supervisor_user_id
  has_many :supervisor_relationships_as_communicator, class_name: 'SupervisorRelationship', foreign_key: :communicator_user_id
  has_many :licenses
  has_one :user_extra

  # Version stamp recorded with a user's captured privacy-consent at signup.
  # Keep in sync with the "Last Updated" date in the Privacy Policy
  # (app/frontend/app/templates/privacy.hbs). Bump when a material change
  # requires users to re-consent.
  PRIVACY_POLICY_VERSION = '2026-07-09'

  def current_sponsor
    Organization.find_by(id: self.managing_organization_id)
  end

  def in_trial?
    managing_organization_id.nil? && expires_at && expires_at > Time.now
  end

  before_save :generate_defaults
  after_save :track_boards
  after_save :notify_of_changes
#  replicated_model

  has_paper_trail :only => [:settings, :user_name],
                  :if => Proc.new{|u| PaperTrail.request.whodunnit && !PaperTrail.request.whodunnit.match(/^job/) }
              
  secure_serialize :settings
  attr_accessor :permission_scopes

  # cache should be invalidated if:
  # - a supervisor is added or removed
  # super-fast lookups, already have the data
  add_permissions('view_existence', ['*']) { true } # anyone can get basic information
  add_permissions('view_existence', ['none']) { true } # anyone can get basic information
  add_permissions('view_existence', 'view_detailed', 'view_deleted_boards', 'view_word_map', ['*']) {|user| user.id == self.id && !user.valet_mode? }
  add_permissions('view_existence', 'view_detailed', 'model', 'supervise', 'edit', 'edit_boards', 'manage_supervision', 'delete', 'view_deleted_boards', 'link_auth') {|user| user.id == self.id && !user.valet_mode? }
  add_permissions('view_existence', 'view_detailed', 'view_word_map', 'model', ['modeling']) {|user| user.id == self.id && user.valet_mode? }
  add_permissions('view_existence', 'view_detailed', ['*']) { self.settings && self.settings['public'] == true }
  add_permissions('set_goals', ['basic_supervision', 'read_profile']) {|user| user.id == self.id && !user.valet_mode? }

  add_permissions('edit', 'manage_supervision', 'view_deleted_boards') {|user| user.edit_permission_for?(self, true) && !user.valet_mode? }
  add_permissions('edit', 'edit_boards', 'manage_supervision', 'view_deleted_boards') {|user| user.edit_permission_for?(self, false) && !user.valet_mode? }
  # Modeling-only supporters get EXISTENCE + MODEL only. `view_detailed` is split
  # out below so a modeling-only link cannot read profile detail (email, name,
  # location, description, membership, board-set stats — see json_api/user.rb:459)
  # or list the communicator's boards (boards_controller:77). Board `view` for
  # modeling comes from `model` (board.rb:87), NOT from `view_detailed`, so Model
  # and Speak are unaffected by the split.
  add_permissions('view_existence', 'model') {|user| user.supervisor_for?(self) && !user.valet_mode?}
  add_permissions('view_detailed') {|user| user.supervisor_for?(self) && !user.modeling_only_for?(self) && !user.valet_mode? }
  add_permissions('view_existence', 'view_detailed', 'model', 'supervise', 'view_deleted_boards', 'set_goals') {|user| user.supervisor_for?(self) && !user.modeling_only_for?(self) && !user.valet_mode? }
  add_permissions('model', ['basic_supervision']) {|user| user.supervisor_for?(self) && !user.valet_mode? }
  add_permissions('view_detailed', ['basic_supervision']) {|user| user.supervisor_for?(self) && !user.modeling_only_for?(self) && !user.valet_mode? }
  add_permissions('view_detailed', 'view_deleted_boards', 'model', 'set_goals', ['basic_supervision']) {|user| user.supervisor_for?(self) && !user.modeling_only_for?(self) && !user.valet_mode? }
  # Billing-only modeling supporters (subscription lapsed) could lose set_goals even though they
  # still supervise and model; per-link "modeling only" supervision still must not set goals.
  add_permissions('set_goals', ['full', 'basic_supervision']) {|user|
    next false unless user.supervisor_for?(self) && !user.valet_mode?
    next false if user.modeling_only_for?(self) && !user.modeling_only?

    true
  }
  # Word map is USAGE DATA (users_controller:1137) — not available to a
  # modeling-only link.
  add_permissions('view_word_map', ['*']) {|user| user.supervisor_for?(self) && !user.modeling_only_for?(self) && !user.valet_mode? }
  add_permissions('manage_supervision', 'support_actions', 'link_auth') {|user| Organization.manager_for?(user, self) && !user.valet_mode? }
  add_permissions('view_existence', 'view_detailed', 'model', 'supervise', 'view_deleted_boards', 'set_goals', 'link_auth') {|user| Organization.manager_for?(user, self, true) && !user.valet_mode? }
  add_permissions('admin_support_actions', 'support_actions', 'view_deleted_boards') {|user| Organization.admin_manager?(user) && !user.valet_mode? }
  cache_permissions
  
  def self.find_for_login(user_name, org_id=nil, password=nil, allow_modeling=false)
    user_name = user_name.strip
    res = nil
    if user_name.match(/^model@/) && allow_modeling
      user_id = user_name.sub(/^model@/, '').sub(/\./, '_')
      res = self.find_by_global_id(user_id)
      res.assert_valet_mode! if res
    end
    if !user_name.match(/@/)
      res ||= self.find_by(:user_name => user_name)
      res ||= self.find_by(:user_name => user_name.downcase)
      res ||= self.find_by(:user_name => User.clean_path(user_name.downcase))
    end
    if !res
      emails = self.find_by_email(user_name)
      emails = self.find_by_email(user_name.downcase) if emails.length == 0
      if emails.length > 1 && password
        emails = emails.select{|u| u.valid_password?(password)}
        emails = [] if emails.length > 1
      end
      res = emails[0] if emails.length > 0
    end
    if org_id
      if res.settings['authored_organization_id'] == org_id
      else
        # try looking up org and see if the user has been added there
        # NOTE: someday if you want to scope logins to domain, this is how
        # res = nil
      end
    end
    res
  end
  
  def named_email
    "#{self.settings['name']} <#{self.settings['email']}>"
  end

  def external_email_allowed?
    self.settings ||= {}
    # Org-managed users have protected email addresses
    return !self.settings['authored_organization_id'] && !Organization.managed?(self)
  end
  
  def prior_named_email
    email = self.settings['old_emails'][-1]
    "#{self.settings['name']} <#{email}>"
  end
  
  def registration_type
    res = (self.settings['preferences'] || {})['registration_type']
    res = 'unspecified' if !res || res.length == 0
    res
  end
  
  def supporter_registration?
    !['unspecified', 'communicator'].include?(self.registration_type)
  end

  # Analytics / third-party tracking preference (GDPR). After +process_params+, stored as boolean via +process_boolean+;
  # legacy rows may still have the string 'false'.
  def cookies_opted_out?
    c = settings&.dig('preferences', 'cookies')
    c == false || c == 'false'
  end

  def log_session_duration
    (self.settings['preferences'] && self.settings['preferences']['log_session_duration']) || User.default_log_session_duration
  end
    
  def self.default_log_session_duration
    30.minutes.to_i
  end
  
  def enable_feature(feature)
    self.settings ||= {}
    self.settings['feature_flags'] ||= {}
    self.settings['feature_flags'][feature.to_s] = true
    self.save
  end
  
  def can_access_library?(library)
    false
  end
  
  def disable_feature(feature)
    self.settings['feature_flags'].delete(feature.to_s) if self.settings && self.settings['feature_flags']
    self.save
  end
  
  def default_premium_voices
    User.default_premium_voices(self.full_premium?(true), [:trialing_communicator].include?(self.billing_state), self.eval_account?)
  end
  
  def self.default_premium_voices(full_premium=true, trial_period=false, eval_account=false)
    if full_premium
      if eval_account
        {
          'claimed' => [],
          'allowed' => 1
        }
      else
        {
          'claimed' => [],
          'allowed' => 2
        }
      end
    elsif trial_period
      {
        'claimed' => [],
        'allowed' => 1
      }
    else
      {
        'claimed' => [],
        'allowed' => 0
      }
    end
  end
  
  def allow_additional_premium_voice!
    self.settings ||= {}
    self.settings['premium_voices'] ||= {}
    self.settings['premium_voices']['claimed'] ||= []
    self.settings['premium_voices']['allowed'] ||= 0
    self.settings['premium_voices']['allowed'] += 1
    self.settings['premium_voices']['extra'] ||= 0
    self.settings['premium_voices']['extra'] += 1
    self.save
  end

  def audit_protected_sources
    found_sources = []
    # Check home board
    # Check any user-authored boards
    if self.settings['preferences']['home_board']
      board_ids = []
      b = Board.find_by_path(self.settings['preferences']['home_board']['id'])
      if b
        board_ids << b.global_id
        board_ids += b.settings['downstream_board_ids'] || []
        Board.find_batches_by_global_id(board_ids) do |brd|
          brd.known_button_images.each do |bi|
            if bi.settings && bi.settings['protected_source']
              if !(self.settings['activated_sources'] || []).include?(bi.settings['protected_source'])
                found_sources << bi.settings['protected_source']
                found_sources.uniq!
              end
            end
          end
        end
      end
    end
    self.boards.find_in_batches(batch_size: 25) do |batch|
      batch.each do |brd|
        brd.known_button_images.each do |bi|
          if bi.settings && bi.settings['protected_source']
            if !(self.settings['activated_sources'] || []).include?(bi.settings['protected_source'])
              found_sources << bi.settings['protected_source']
              found_sources.uniq!
            end
          end
        end
      end
    end
    found_sources.uniq.each do |source|
      self.track_protected_source(source)
    end
  end

  def track_protected_source(source_id)
    ApplicationRecord.using(:master) do
      self.reload
    end
    self.settings['activated_sources'] ||= []
    # The first time a user leverages a third-party symbol library by 
    # saving a board with an image, log it as activated (unless it happens)
    # during the free trial, in which case it needs to be tracked at
    # purchase.
    if !self.settings['activated_sources'].include?(source_id) && !self.subscription_hash['grace_trial_period'] && !self.subscription_hash['grace_period']
      log_activation = true
      if source_id == 'lessonpix'
        template = UserIntegration.find_by(template: true, integration_key: 'lessonpix')
        ui = template && UserIntegration.find_by(user: self, template_integration: template)
        if ui && ui.settings && ui.settings['user_settings'] && ui.settings['user_settings']['username']
          log_activation = false
        end
      elsif source_id == 'giphy_asl'
        log_activation = false
      end
      self.settings['activated_sources'] << source_id
      self.save
      if log_activation
        ae = AuditEvent.find_by(user_key: self.global_id, record_id: source_id)
        ae ||= AuditEvent.create!(:user_key => self.global_id, :record_id => source_id, :event_type => 'source_activated', :summary => "#{self.user_name} activated #{source_id}", :data => {source: source_id})
      end
    end
  end

  def access_methods(device=nil)
    if self.settings['external_device']
      return [self.settings['external_device']['access_method'] || 'touch']
    end
    devices = ((self.settings || {})['preferences'] || {})['devices']
    types = {}
    (devices || {}).each do |key, device_prefs|
      if !device || device.device_key == key
        method = 'touch'
        if device_prefs['scanning']
          if device_prefs['scan_mode'] == 'axes'
            method = 'axis_scanning'
          else
            method = 'scanning'
          end
        elsif device_prefs['dwell']
          if device_prefs['dwell_type'] == 'arrow_dwell'
            method = 'arrow_dwell'
          elsif device_prefs['dwell_type'] == 'mouse_dwell'
            method = 'arrow_dwell'
          elsif device_prefs['dwell_type'] == 'eyegaze'
            method = 'gaze'
          elsif device_prefs['dwell_type'] == 'head'
            method = 'head'
          else
            method = 'dwell'
          end
        end
        types[method] = (types[method] || 0) + 1
      end
    end
    types.delete('touch') if types.keys.length > 1
    types.to_a.sort_by{|a, b| b }.reverse.map(&:first)
  end
  
  def add_premium_voice(voice_id, system_name)
    # Limit the number of premium_voices users can download
    voices = {}.merge(self.settings['premium_voices'] || {})
    voices['claimed'] ||= self.default_premium_voices['claimed']
    voices['allowed'] = [voices['allowed'] || 0, self.default_premium_voices['allowed']].max
    
    claimed_by_supervisee = self.supervisees.detect do |sup|
      ((sup.settings['premium_voices'] || {})['claimed'] || []).include?(voice_id)
    end
    is_admin = Organization.admin_manager?(self)
    pre_claimed = voices['claimed']
    if is_admin
      voices['allowed'] = [voices['allowed'] || 0, voices['claimed'].length + 1].max
      voices['claimed'] = voices['claimed'] | [voice_id]
      voices['allowed'] = [voices['allowed'] || 0, voices['claimed'].length + 1].max
    elsif claimed_by_supervisee
      voices['sup_claimed'] ||= []
      voices['sup_claimed'] = voices['sup_claimed'] | [voice_id]
    else
      voices['claimed'] = voices['claimed'] | [voice_id]
    end

    new_voice = !is_admin && voices['claimed'].include?(voice_id) && !pre_claimed.include?(voice_id)
    if voices['claimed'].length > voices['allowed']
      return false
    else
      if new_voice
        if [:trialing_communicator, :trialing_supervisor].include?(self.billing_state)
          voices['trial_voices'] = (voices['trial_voices'] || []).select{|t| t['i'] != voice_id }
          voices['trial_voices'] << {s: system_name, i: voice_id}
        else
          # Log voice claims for payment, unless an admin user or supervisor
          self.track_voice_added(voice_id, system_name)
        end
      end
      self.settings['premium_voices'] = voices
      self.save
      return true
    end
  end

  def refresh_premium_voices
    if !self.any_premium_or_grace_period?(true)
      if !(self.settings['premium_voices'] || {})['expired_state']
        self.settings['premium_voices'] ||= {}
        self.settings['premium_voices']['allowed'] = self.settings['premium_voices']['extra'] || 0
        self.settings['premium_voices']['claimed'] = (self.settings['premium_voices']['claimed'] || [])[0, self.settings['premium_voices']['allowed']]
        self.settings['premium_voices']['expired_state'] = true
        self.save
      end
    end
    self.settings['premium_voices']
  end
  
  def registration_code
    self.settings ||= {}
    if !self.settings['registration_code']
      self.settings['registration_code'] = GoSecure.nonce('reg_code')
      self.save
    end
    self.settings['registration_code']
  end

  def coppa_parental_consent_pending?
    c = self.settings && self.settings['coppa']
    return false unless c.is_a?(Hash)
    return false if c['parent_consent_granted_at'].present?
    !!c['pending_parent_consent']
  end

  def coppa_parental_consent_revoked?
    c = self.settings && self.settings['coppa']
    return false unless c.is_a?(Hash)
    c['parent_consent_revoked_at'].present?
  end

  def coppa_parental_consent_active?
    c = self.settings && self.settings['coppa']
    return false unless c.is_a?(Hash)
    c['parent_consent_granted_at'].present? && c['parent_consent_revoked_at'].blank?
  end

  def coppa_parental_consent_blocks_access?
    coppa_parental_consent_pending? || coppa_parental_consent_revoked?
  end

  # Compliance Kernel profile for this user (nil when flag OFF).
  def compliance_profile(request: nil)
    return nil unless FeatureFlags.compliance_workflow_kernel_enabled?

    Compliance::Profile.for(self, request: request)
  end

  # Persist settings['compliance'] from registration params (create only).
  # Accepts birth_month / birth_year / jurisdiction_declaration (and camelCase /
  # dasherized variants). Declared jurisdiction wins over registration country.
  # authored_organization_id must be the *validated* org id (org exists + author
  # has edit). Passing the raw request param would let SegmentResolver classify
  # the account as school / FERPA before authorization rejects the value.
  def stamp_compliance_profile_from_params!(params, country: nil, authored_organization_id: nil)
    declaration = (
      params['jurisdiction_declaration'] ||
      params['jurisdiction-declaration'] ||
      params['jurisdictionDeclaration'] ||
      params['jurisdiction'] ||
      country
    )
    birth_month = params['birth_month'] || params['birth-month'] || params['birthMonth']
    birth_year = params['birth_year'] || params['birth-year'] || params['birthYear']

    profile = Compliance::Profile.for(
      self,
      declaration: declaration,
      birth_month: birth_month,
      birth_year: birth_year,
      segment_opts: {
        authored_organization_id: authored_organization_id
      }
    )

    blob = {
      'segment' => profile.segment,
      'jurisdiction' => profile.jurisdiction,
      'digital_consent_age' => profile.digital_consent_age,
      'frameworks' => profile.effective_rules['frameworks'],
      'stamped_at' => Time.now.utc.iso8601
    }
    month_i = birth_month.to_i
    year_i = birth_year.to_i
    blob['birth_month'] = month_i if month_i >= 1 && month_i <= 12
    blob['birth_year'] = year_i if year_i >= 1900 && year_i <= Time.now.utc.year
    blob['age_band'] = profile.age_band if profile.age_band

    self.settings['compliance'] = blob
    # Keep preferences.jurisdiction in sync for EuJurisdiction / LingoLinq::Jurisdiction.
    code = profile.jurisdiction && profile.jurisdiction['code']
    if code.present?
      self.settings['preferences'] ||= {}
      # Store country portion for consumers that expect ISO alpha-2 only.
      country_code = code.to_s.split('-', 2).first
      self.settings['preferences']['jurisdiction'] = country_code if country_code.match?(/\A[A-Z]{2}\z/)
      if self.settings['country'].blank? && country_code.match?(/\A[A-Z]{2}\z/)
        self.settings['country'] = country_code
      end
    end
    true
  end

  # True when login must collect a parent email before (re)sending the COPPA
  # consent request: offboarding without email yet, pending with blank parent
  # email, or revoked (re-request).
  def coppa_needs_parent_email?
    return true if coppa_parental_consent_revoked?
    return false unless coppa_parental_consent_pending?
    c = self.settings && self.settings['coppa']
    return false unless c.is_a?(Hash)
    return true if c['needs_parent_email']
    c['parent_email'].blank?
  end

  # Manager-attested birth month/year (same ambiguity rule as register.js):
  # cutoff month counts as still under the threshold.
  # Returns true / false / nil (nil when month/year incomplete).
  def self.age_under_threshold?(birth_month:, birth_year:, age:)
    month = birth_month.to_i
    year = birth_year.to_i
    return nil if month < 1 || month > 12 || year < 1900 || year > Time.now.utc.year
    today = Time.now.utc
    cutoff_year = today.year - age.to_i
    cutoff_month = today.month
    year > cutoff_year || (year == cutoff_year && month >= cutoff_month)
  end

  # Under-13 needs family COPPA when leaving an org. Prefer manager-attested
  # birth month/year from the remove dialog; also repair pending/revoked COPPA.
  # School-authorization alone is NOT enough (org New User has no age).
  def requires_coppa_offboarding?(attested_under_13: nil)
    return false unless JsonApi::Json.coppa_parental_consent_enabled?
    return false if coppa_parental_consent_active?
    return true if attested_under_13
    coppa_parental_consent_pending? || coppa_parental_consent_revoked?
  end

  def self.validate_parent_consent_email!(parent_email, child_email: nil)
    parent = parent_email.to_s.strip
    raise ArgumentError, 'parent consent email required' if parent.blank?
    raise ArgumentError, 'invalid parent consent email format' if parent !~ URI::MailTo::EMAIL_REGEXP
    child = child_email.to_s.strip.downcase
    if child.present? && parent.downcase == child
      raise ArgumentError, 'parent consent email must be different from the account email'
    end
    parent
  end

  # Org seat reclaim → family account. Uses manager-attested birth month/year
  # from the remove dialog + releasing org jurisdiction (US/EU):
  # under-13 → COPPA pending (optional parent email);
  # under-16 → AI prefs off; EU org also sets eu_under_16 for parental re-consent
  # when they re-enable AI in preferences.
  def begin_family_offboarding_consents!(org: nil, parent_email: nil, actor: nil, birth_month: nil, birth_year: nil)
    attested_under_13 = self.class.age_under_threshold?(
      birth_month: birth_month, birth_year: birth_year, age: 13
    )
    attested_under_16 = self.class.age_under_threshold?(
      birth_month: birth_month, birth_year: birth_year, age: 16
    )
    org_jurisdiction = org.respond_to?(:jurisdiction) ? org.jurisdiction : nil
    did_coppa = false
    did_ai = false
    send_coppa_email = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      if birth_month.present? && birth_year.present?
        self.settings['registration'] ||= {}
        self.settings['registration']['offboarding_birth_month'] = birth_month.to_i
        self.settings['registration']['offboarding_birth_year'] = birth_year.to_i
        self.settings['registration']['offboarding_attested_at'] = Time.now.utc.iso8601
        self.settings['registration']['offboarding_org_jurisdiction'] = org_jurisdiction if org_jurisdiction
        if !attested_under_16.nil?
          self.settings['registration']['under_16'] = !!attested_under_16
          # Prefer releasing org jurisdiction so school-created users (no country)
          # still get the correct EU Art. 8 AI gate. Legacy orgs without
          # jurisdiction fall back to the user's registration country.
          if org && org.respond_to?(:eu_jurisdiction?) && org.eu_jurisdiction?
            self.settings['registration']['eu_under_16'] = !!attested_under_16
          elsif org && org.respond_to?(:us_jurisdiction?) && org.us_jurisdiction?
            self.settings['registration']['eu_under_16'] = false
          else
            country = registration_country
            self.settings['registration']['eu_under_16'] = !!(
              attested_under_16 && country && LingoLinq::Jurisdiction.eu?(country)
            )
          end
        end
      end

      if requires_coppa_offboarding?(attested_under_13: attested_under_13)
        school = self.settings['school_authorization']
        if school.is_a?(Hash) && school.present?
          ended = school.dup
          ended['ended_at'] = Time.now.utc.iso8601
          ended['ended_org_id'] = org && org.global_id
          self.settings['school_authorization_ended'] = ended
          self.settings.delete('school_authorization')
        end
        parent = parent_email.to_s.strip
        blob = {
          'pending_parent_consent' => true,
          'offboarding' => true
        }
        if parent.present?
          parent = self.class.validate_parent_consent_email!(
            parent,
            child_email: (self.settings['email'] || '')
          )
          blob['parent_email'] = process_string(parent)
          blob['parent_consent_token'] = GoSecure.nonce('parent_consent')
          blob['parent_consent_expires_at'] = 14.days.from_now.utc.iso8601
          blob['needs_parent_email'] = false
          send_coppa_email = true
        else
          blob['needs_parent_email'] = true
        end
        self.settings['coppa'] = blob
        did_coppa = true
      end

      # Under-16: turn AI prefs off now. No parent email at remove — for EU
      # orgs, parental consent runs when they try to turn AI back on.
      if attested_under_16 || eu_under_16?
        apply_eu_ai_offboarding_reset!
        did_ai = true
      end

      if did_coppa || did_ai || (birth_month.present? && birth_year.present?)
        self.save!
        if did_coppa
          record_id = SecureRandom.uuid
          AuditEvent.create!(
            user_key: self.global_id,
            data: {
              'type' => 'parental_consent_offboarding_started',
              'organization_id' => org && org.global_id,
              'actor_id' => actor && (actor.respond_to?(:global_id) ? actor.global_id : actor),
              'parent_email_provided' => send_coppa_email,
              'attested_under_13' => !!attested_under_13,
              'org_jurisdiction' => org_jurisdiction,
              'record_id' => record_id
            },
            event_type: 'parental_consent_offboarding_started',
            record_id: record_id
          )
        end
        if did_ai
          record_id = SecureRandom.uuid
          AuditEvent.create!(
            user_key: self.global_id,
            data: {
              'type' => 'eu_ai_parental_consent_offboarding_reset',
              'organization_id' => org && org.global_id,
              'actor_id' => actor && (actor.respond_to?(:global_id) ? actor.global_id : actor),
              'attested_under_16' => !!attested_under_16,
              'org_jurisdiction' => org_jurisdiction,
              'record_id' => record_id
            },
            event_type: 'eu_ai_parental_consent_offboarding_reset',
            record_id: record_id
          )
        end
      end
    end
    if did_coppa
      devices.each(&:invalidate_cached_keys)
      if send_coppa_email
        UserMailer.schedule_parent_consent_delivery(:parental_consent_request, self.global_id)
      end
    end
    did_coppa || did_ai
  end

  # Login-time (or revoked re-request): stamp parent email + token and send
  # the COPPA consent request. Does not grant a session.
  def submit_parental_consent_email!(parent_email)
    parent = self.class.validate_parent_consent_email!(
      parent_email,
      child_email: (self.settings && self.settings['email'] || '')
    )
    unless coppa_needs_parent_email? || (coppa_parental_consent_pending? && (self.settings['coppa'].is_a?(Hash) && self.settings['coppa']['parent_email'].blank?))
      return false
    end
    offboarding = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      prior = self.settings['coppa']
      offboarding = prior.is_a?(Hash) && !!prior['offboarding']
      self.settings['coppa'] = {
        'pending_parent_consent' => true,
        'offboarding' => offboarding,
        'parent_email' => process_string(parent),
        'parent_consent_token' => GoSecure.nonce('parent_consent'),
        'parent_consent_expires_at' => 14.days.from_now.utc.iso8601,
        'needs_parent_email' => false
      }
      self.save!
      record_id = SecureRandom.uuid
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'parental_consent_email_submitted',
          'method' => 'login_dialog',
          'offboarding' => offboarding,
          'record_id' => record_id
        },
        event_type: 'parental_consent_email_submitted',
        record_id: record_id
      )
    end
    devices.each(&:invalidate_cached_keys)
    UserMailer.schedule_parent_consent_delivery(:parental_consent_request, self.global_id)
    true
  end

  # Validates the grant link token from the parental consent request email.
  # Retained after grant so idempotent revisits require the same secret as the first click.
  def valid_parent_consent_grant_link_token?(token)
    parent_consent_link_token_valid?(token, 'parent_consent_token')
  end

  # Validates the revoke link token from the parental consent confirmation email.
  def valid_parent_consent_revoke_link_token?(token)
    parent_consent_link_token_valid?(token, 'parent_consent_revoke_token')
  end

  def parent_consent_link_token_valid?(token, settings_key)
    return false if token.blank?
    c = self.settings && self.settings['coppa']
    return false unless c.is_a?(Hash)
    stored = c[settings_key].to_s
    return false if stored.blank?
    tok = token.to_s
    return false if stored.bytesize != tok.bytesize
    ActiveSupport::SecurityUtils.secure_compare(stored, tok)
  end

  # Parent completes email link with token. Returns true when consent is newly
  # recorded. Mirrors grant_ai_consent! (COPPA 16 CFR 312.5 record-keeping): the
  # settings write, the Privacy Policy acknowledgment, User#save! and an immutable
  # AuditEvent all run inside one `with_lock(requires_new: true)` (SELECT FOR
  # UPDATE + SAVEPOINT). Two consequences that a fail-open, post-save audit could
  # not give: an audit-insert failure rolls back the consent grant, so the parent
  # can simply retry the same link rather than being left consented-without-a-record; and concurrent token requests against
  # the same user are serialized, so the second reloads, sees the committed grant
  # and no-ops instead of double-granting/double-logging. `ip:`/`user_agent:` come
  # from the request so the immutable record identifies where and with what the
  # parent completed consent.
  def grant_parental_consent!(token, ip: nil, user_agent: nil)
    return false if token.blank?
    res = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['coppa']
      next unless c.is_a?(Hash)
      next if c['parent_consent_granted_at'].present?
      next unless c['pending_parent_consent']
      stored = c['parent_consent_token'].to_s
      tok = token.to_s
      next if stored.blank?
      next if stored.bytesize != tok.bytesize
      next unless ActiveSupport::SecurityUtils.secure_compare(stored, tok)
      exp = c['parent_consent_expires_at']
      if exp.present?
        begin
          next if Time.iso8601(exp) < Time.now.utc
        rescue ArgumentError
          next
        end
      end
      granted_at = Time.now.utc.iso8601
      record_id = SecureRandom.uuid
      c['parent_consent_granted_at'] = granted_at
      c['parent_consent_revoke_token'] = GoSecure.nonce('parent_consent_revoke')
      c.delete('parent_consent_expires_at')
      c.delete('pending_parent_consent')
      self.settings['coppa'] = c
      # Record the parent's Privacy Policy acknowledgment (on the child's behalf)
      # at the moment they complete the token flow; deferred from the child's
      # signup (see process_params).
      self.settings['privacy_policy_acknowledged'] = {
        'acknowledged_at' => granted_at,
        'policy_version' => PRIVACY_POLICY_VERSION,
        'acknowledged_by' => 'parent'
      }
      self.save!
      # Immutable, tamper-evident grant record independent of the mutable
      # settings['coppa'] blob. Captures the exact persisted grant timestamp,
      # the acknowledged policy version, and request provenance.
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'parental_consent_grant',
          'method' => 'email_token_link',
          'ip' => ip,
          'user_agent' => user_agent,
          'privacy_policy_version' => PRIVACY_POLICY_VERSION,
          'granted_at' => granted_at,
          'record_id' => record_id
        },
        event_type: 'parental_consent_grant',
        record_id: record_id
      )
      res = true
    end
    devices.each(&:invalidate_cached_keys) if res
    res
  end

  # Parent completes the revoke link from the confirmation email. Returns true when
  # consent is newly revoked. Mirrors grant_parental_consent!: settings write and
  # immutable AuditEvent run atomically inside with_lock(requires_new: true).
  def revoke_parental_consent!(token, ip: nil, user_agent: nil)
    return false if token.blank?
    res = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['coppa']
      next unless c.is_a?(Hash)
      next if c['parent_consent_revoked_at'].present?
      next unless c['parent_consent_granted_at'].present?
      stored = c['parent_consent_revoke_token'].to_s
      tok = token.to_s
      next if stored.blank?
      next if stored.bytesize != tok.bytesize
      next unless ActiveSupport::SecurityUtils.secure_compare(stored, tok)
      revoked_at = Time.now.utc.iso8601
      granted_at = c['parent_consent_granted_at']
      record_id = SecureRandom.uuid
      c['parent_consent_revoked_at'] = revoked_at
      self.settings['coppa'] = c
      self.save!
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'parental_consent_revoke',
          'method' => 'email_token_link',
          'ip' => ip,
          'user_agent' => user_agent,
          'granted_at' => granted_at,
          'revoked_at' => revoked_at,
          'record_id' => record_id
        },
        event_type: 'parental_consent_revoke',
        record_id: record_id
      )
      res = true
    end
    devices.each(&:invalidate_cached_keys) if res
    res
  end

  # --- EU AI parental consent (GDPR Art. 8 digital consent age / AI enablement) ---
  # Separate from COPPA signup (`settings['coppa']`) and AI VPC (`settings['ai_consent']`).
  # Blob: settings['eu_ai_parental_consent']. Blocks AI until a parent grants via email token.

  EU_AI_PREF_KEYS = %w[
    ai_features_enabled ai_board_generation ai_word_prediction
    ai_board_suggestions ai_symbol_search
  ].freeze

  # Coerce a submitted AI preference to a real boolean, or nil when the value
  # carries no decision.
  #
  # Delegates to FeatureFlags.ai_pref_value so the WRITE vocabulary can never be
  # broader than the READ vocabulary. They were briefly separate lists, and the
  # gap was a real consent bug: 0 / "0" were accepted here as an explicit false
  # while the gate did not recognize them as an opt-out, so a legacy numeric
  # opt-out read as "allowed".
  #
  # The AI preference keys are consent-bearing, so unlike the other preferences
  # they are not stored verbatim. A value outside the recognized boolean forms
  # (most importantly "") returns nil and the caller DROPS the write. Dropping is
  # chosen over coercing:
  #   - coercing to false would silently opt a user OUT of a feature they may
  #     have had on, and
  #   - coercing to true would manufacture an opt-in from malformed input.
  # Dropping preserves whatever decision the user previously recorded.
  #
  # Historically "" was persisted here verbatim, producing a master preference
  # that records no readable decision. FeatureFlags.user_pref_allows_ai? denies
  # on it (unrecognized fails closed), and this normalization stops any NEW row
  # from reaching that state. Existing "" rows recover through the preferences
  # UI: the master checkbox renders unchecked for "" and its click handler
  # writes !!event.target.checked, so the first click stores a real boolean.
  # That affirmative click is deliberately the only way out — see the comment on
  # FeatureFlags.user_pref_allows_ai? for why neither a read-side
  # reinterpretation nor a ""=>nil backfill is an acceptable substitute.
  def self.normalize_ai_preference_value(val)
    FeatureFlags.ai_pref_value(val)
  end

  def registration_country
    c = self.settings && self.settings['country']
    return c if c.present?
    reg = self.settings && self.settings['registration']
    return nil unless reg.is_a?(Hash)
    reg['country'].presence
  end

  def under_16?
    reg = self.settings && self.settings['registration']
    return false unless reg.is_a?(Hash)
    !!reg['under_16']
  end

  def eu_under_16?
    reg = self.settings && self.settings['registration']
    return false unless reg.is_a?(Hash)
    !!reg['eu_under_16']
  end

  def eu_ai_parental_consent_pending?
    c = self.settings && self.settings['eu_ai_parental_consent']
    return false unless c.is_a?(Hash)
    return false if c['parent_consent_granted_at'].present?
    !!c['pending_parent_consent']
  end

  def eu_ai_parental_consent_revoked?
    c = self.settings && self.settings['eu_ai_parental_consent']
    return false unless c.is_a?(Hash)
    c['parent_consent_revoked_at'].present?
  end

  def eu_ai_parental_consent_active?
    c = self.settings && self.settings['eu_ai_parental_consent']
    return false unless c.is_a?(Hash)
    c['parent_consent_granted_at'].present? && c['parent_consent_revoked_at'].blank?
  end

  # True when this EU under-16 account must not use AI: pending, revoked, or never granted.
  def eu_ai_parental_consent_blocks_ai?
    return false unless eu_under_16?
    !eu_ai_parental_consent_active?
  end

  def valid_eu_ai_parent_consent_grant_link_token?(token)
    eu_ai_parent_consent_link_token_valid?(token, 'parent_consent_token')
  end

  def valid_eu_ai_parent_consent_revoke_link_token?(token)
    eu_ai_parent_consent_link_token_valid?(token, 'parent_consent_revoke_token')
  end

  def eu_ai_parent_consent_link_token_valid?(token, settings_key)
    return false if token.blank?
    c = self.settings && self.settings['eu_ai_parental_consent']
    return false unless c.is_a?(Hash)
    stored = c[settings_key].to_s
    return false if stored.blank?
    tok = token.to_s
    return false if stored.bytesize != tok.bytesize
    ActiveSupport::SecurityUtils.secure_compare(stored, tok)
  end

  # Allowlisted AI preference keys from a consent request payload. Unknown keys
  # are dropped. Returns a Hash with string keys; always sets ai_features_enabled
  # when any feature is requested. Empty Hash if nothing valid was requested.
  def self.sanitize_eu_ai_requested_features(raw)
    return {} if raw.blank?
    if raw.respond_to?(:to_unsafe_h)
      raw = raw.to_unsafe_h
    elsif raw.respond_to?(:permit!)
      raw = raw.to_h
    elsif raw.respond_to?(:to_h) && !raw.is_a?(Hash)
      raw = raw.to_h
    end
    return {} unless raw.is_a?(Hash)
    raw = raw.stringify_keys
    out = {}
    # Route through the shared vocabulary rather than repeating the TRUE list.
    # This sanitizer records affirmative requests only, so a third hard-coded
    # copy was not a live bug — but it was a third copy, and the drift between
    # the first two (numeric 0/"0" accepted on write, unreadable on read) is the
    # exact defect this changeset exists to remove.
    feature_keys = EU_AI_PREF_KEYS - ['ai_features_enabled']
    feature_keys.each do |k|
      out[k] = true if normalize_ai_preference_value(raw[k]) == true
    end
    if out.any? || normalize_ai_preference_value(raw['ai_features_enabled']) == true
      out['ai_features_enabled'] = true
    end
    out
  end

  # Validate parent email and set pending consent tokens (14-day expiry). save!
  # requested_features: optional Hash of AI prefs to activate when the parent grants.
  def request_eu_ai_parental_consent!(parent_email, requested_features: nil)
    parent = parent_email.to_s.strip
    raise ArgumentError, 'parent consent email required' if parent.blank?
    raise ArgumentError, 'invalid parent consent email format' if parent !~ URI::MailTo::EMAIL_REGEXP
    child_email = (self.settings && self.settings['email'] || '').to_s.strip.downcase
    if child_email.present? && parent.downcase == child_email
      raise ArgumentError, 'parent consent email must be different from the account email'
    end
    features = self.class.sanitize_eu_ai_requested_features(requested_features)
    raise ArgumentError, 'requested_features required' if features.blank?
    self.settings ||= {}
    blob = {
      'pending_parent_consent' => true,
      'parent_email' => process_string(parent),
      'parent_consent_token' => GoSecure.nonce('eu_ai_parent_consent'),
      'parent_consent_expires_at' => 14.days.from_now.utc.iso8601,
      'requested_features' => features
    }
    self.settings['eu_ai_parental_consent'] = blob
    self.save!
    true
  end

  def grant_eu_ai_parental_consent!(token, ip: nil, user_agent: nil)
    return false if token.blank?
    res = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['eu_ai_parental_consent']
      next unless c.is_a?(Hash)
      next if c['parent_consent_granted_at'].present? && c['parent_consent_revoked_at'].blank?
      next unless c['pending_parent_consent']
      stored = c['parent_consent_token'].to_s
      tok = token.to_s
      next if stored.blank?
      next if stored.bytesize != tok.bytesize
      next unless ActiveSupport::SecurityUtils.secure_compare(stored, tok)
      exp = c['parent_consent_expires_at']
      if exp.present?
        begin
          next if Time.iso8601(exp) < Time.now.utc
        rescue ArgumentError
          next
        end
      end
      granted_at = Time.now.utc.iso8601
      record_id = SecureRandom.uuid
      requested = c['requested_features']
      c['parent_consent_granted_at'] = granted_at
      c['parent_consent_revoke_token'] = GoSecure.nonce('eu_ai_parent_consent_revoke')
      c.delete('parent_consent_expires_at')
      c.delete('pending_parent_consent')
      c.delete('parent_consent_revoked_at')
      c.delete('requested_features')
      self.settings['eu_ai_parental_consent'] = c
      # Activate the features the user requested when they sent the consent email.
      self.settings['preferences'] ||= {}
      if requested.is_a?(Hash)
        EU_AI_PREF_KEYS.each do |k|
          # Explicit vocabulary check, not bare truthiness. sanitize_eu_ai_
          # requested_features only ever stores literal true today, so this is
          # equivalent — but this is a consent WRITE, and it should not depend on
          # the storage shape of a different method staying what it is now.
          self.settings['preferences'][k] = true if self.class.normalize_ai_preference_value(requested[k]) == true
        end
      end
      self.save!
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'eu_ai_parental_consent_grant',
          'method' => 'email_token_link',
          'ip' => ip,
          'user_agent' => user_agent,
          'granted_at' => granted_at,
          'record_id' => record_id,
          'requested_features' => (requested.is_a?(Hash) ? requested : {})
        },
        event_type: 'eu_ai_parental_consent_grant',
        record_id: record_id
      )
      res = true
    end
    res
  end

  def revoke_eu_ai_parental_consent!(token, ip: nil, user_agent: nil)
    return false if token.blank?
    res = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['eu_ai_parental_consent']
      next unless c.is_a?(Hash)
      next if c['parent_consent_revoked_at'].present?
      next unless c['parent_consent_granted_at'].present?
      stored = c['parent_consent_revoke_token'].to_s
      tok = token.to_s
      next if stored.blank?
      next if stored.bytesize != tok.bytesize
      next unless ActiveSupport::SecurityUtils.secure_compare(stored, tok)
      revoked_at = Time.now.utc.iso8601
      granted_at = c['parent_consent_granted_at']
      record_id = SecureRandom.uuid
      c['parent_consent_revoked_at'] = revoked_at
      self.settings['eu_ai_parental_consent'] = c
      # Force AI prefs off when consent is withdrawn (defense in depth vs prefs UI).
      self.settings['preferences'] ||= {}
      EU_AI_PREF_KEYS.each { |k| self.settings['preferences'][k] = false }
      self.save!
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'eu_ai_parental_consent_revoke',
          'method' => 'email_token_link',
          'ip' => ip,
          'user_agent' => user_agent,
          'granted_at' => granted_at,
          'revoked_at' => revoked_at,
          'record_id' => record_id
        },
        event_type: 'eu_ai_parental_consent_revoke',
        record_id: record_id
      )
      res = true
    end
    res
  end

  # Org offboarding: force AI prefs off and invalidate any EU AI parental
  # consent so family re-enable requires a new parent grant. Caller is
  # responsible for save! / audit when used inside begin_family_offboarding.
  def apply_eu_ai_offboarding_reset!
    self.settings ||= {}
    self.settings['preferences'] ||= {}
    EU_AI_PREF_KEYS.each { |k| self.settings['preferences'][k] = false }
    c = self.settings['eu_ai_parental_consent']
    if c.is_a?(Hash) && c['parent_consent_granted_at'].present? && c['parent_consent_revoked_at'].blank?
      c = c.dup
      c['parent_consent_revoked_at'] = Time.now.utc.iso8601
      c['offboarding_reset'] = true
      self.settings['eu_ai_parental_consent'] = c
    else
      self.settings['eu_ai_parental_consent'] = {
        'offboarding_reset' => true,
        'reset_at' => Time.now.utc.iso8601
      }
    end
    true
  end

  def reset_eu_ai_parental_consent_for_offboarding!
    return false unless eu_under_16?
    apply_eu_ai_offboarding_reset!
    self.save!
    true
  end

  # AI data-sharing consent (COPPA Item 1b). Returns true only when an unrevoked
  # consent record exists at the queried disclosures_version. Per D-03: missing
  # settings['ai_consent'] is treated as "not granted", no migration needed.
  #
  # `disclosures_version:` DEFAULTS to LingoLinq::AiConsentDisclosures::CURRENT_VERSION
  # (VPC Phase 2). D-03 originally made this kwarg required with NO default,
  # specifically because no canonical version source existed yet: an omitted
  # kwarg with some accidental implicit value (e.g. nil) would silently return
  # false, and Phase 4 would misread that as "the gate correctly fired" rather
  # than "the caller forgot to pass a version" (see the original rationale
  # preserved below). Phase 2 supplies that canonical source, which removes
  # the failure mode D-03 was guarding against: the implicit value is no
  # longer arbitrary, it is the exact version every caller SHOULD be checking
  # against in the common case. A caller that needs to check a specific
  # (e.g. stale) version still passes disclosures_version: explicitly; no
  # caller should ever hardcode a literal version number.
  #
  # Original D-03 rationale, still true for why *some* explicit default was
  # required rather than silently defaulting to nil/0: "callers that forget
  # the kwarg get ArgumentError at boot/test time rather than a silent false
  # (which Phase 4 would interpret as 'guard fired, AI suppressed for an
  # actually-consented user')." Defaulting to CURRENT_VERSION resolves this
  # the same way ArgumentError did (no silent wrong answer), while also being
  # useful.
  def ai_consent_granted?(disclosures_version: LingoLinq::AiConsentDisclosures::CURRENT_VERSION)
    c = self.settings && self.settings['ai_consent']
    return false unless c.is_a?(Hash)
    return false if c['granted_at'].blank?
    return false if c['revoked_at'].present?
    return false if c['disclosures_version'].blank?
    return false unless c['disclosures_version'] == disclosures_version
    true
  end

  # Sources accepted by grant_ai_consent!. Anything else raises ArgumentError so
  # Phase 3 controllers cannot silently widen the surface by passing an arbitrary
  # value pulled from params. New sources must be added here explicitly.
  AI_CONSENT_SOURCES = %w[email_link in_app admin_backfill].freeze

  # Sources accepted by revoke_ai_consent!. Kept separate from grant sources
  # because the valid actors for revocation (parent, admin, automated system)
  # differ from the valid acquisition channels for a grant. Same anti-poisoning
  # rationale: a controller passing an arbitrary `source` param cannot dirty the
  # audit taxonomy.
  AI_CONSENT_REVOKE_SOURCES = %w[parent admin system].freeze

  # Records a parent-granted AI data-sharing consent at the given disclosures_version.
  # Idempotent on same-version re-call (returns false). Does NOT silently grant on
  # stale-version re-call (returns false; Phase 3 controller surfaces re-prompt UX) -
  # this holds even after a revoke, so an outdated grant link cannot reactivate
  # consent at a superseded version.
  #
  # Precondition: the user must be persisted. `with_lock` calls `reload(lock: true)`
  # internally and will raise ActiveRecord::RecordNotFound on a User.new.
  #
  # The body runs inside `with_lock(requires_new: true)` (SELECT FOR UPDATE on the
  # user row, wrapping a SAVEPOINT-backed nested transaction). User#save! and
  # AuditEvent.create! both run under that transaction, so a failure in the audit
  # insert rolls back the consent write - even when the caller wraps this in its
  # own outer transaction and rescues the AR error. The `requires_new: true` is
  # load-bearing for that guarantee: without it, Rails would join the outer
  # transaction and a rescued audit failure would leave the consent write
  # committed. The pessimistic lock also serializes concurrent grant/revoke
  # against the same user. D-04 / D-05.
  #
  # Raises ArgumentError on `invalid_source` (source not in AI_CONSENT_SOURCES),
  # `invalid_granted_by` (blank granted_by), `invalid_disclosures_version` (nil,
  # non-numeric, or < 1), `invalid_granted_by_user_id` (malformed granted_by_user_id),
  # and `self_grant_forbidden` (granted_by_user_id resolves to self.global_id). These
  # are stable machine tokens, not English prose - Phase 3 owns user-facing copy.
  #
  # `granted_by_user_id:` must be a global_id ("1_42") or bare numeric db id;
  # bare ids are normalized to global_id form before the self-grant check.
  def grant_ai_consent!(disclosures_version:, granted_by:, source:, ip: nil, user_agent: nil, granted_by_user_id: nil)
    raise ArgumentError, 'invalid_source' unless AI_CONSENT_SOURCES.include?(source)
    # A parent-consent record without a grantor identity is not auditable. Reject
    # blank granted_by before granted_at is written. Machine token; Phase 3 owns copy.
    raise ArgumentError, 'invalid_granted_by' if granted_by.blank?
    # Coerce to a positive Integer up front: a nil/garbage disclosures_version would
    # otherwise write a granted_at row that ai_consent_granted? can never honor (and
    # that a later valid grant can't repair), and a string version would make the
    # stale-version check lexicographic. Raises 'invalid_disclosures_version'.
    disclosures_version = ai_consent_normalize_version!(disclosures_version)
    if granted_by_user_id.present?
      granted_by_user_id = normalize_ai_consent_granted_by_user_id!(granted_by_user_id)
      raise ArgumentError, 'self_grant_forbidden' if granted_by_user_id == self.global_id
    end

    res = false
    prior_disclosures_version = nil
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['ai_consent']
      c = {} unless c.is_a?(Hash)
      # Idempotency / version contract against any prior consent record (D-04):
      #   - stale (older) version:  no-op, return false. Applies whether or not the
      #                             prior consent is currently revoked: following an
      #                             outdated grant link must never reactivate consent
      #                             against superseded disclosures. (Issue #1)
      #   - same version, active:   no-op, return false (already granted). A same-version
      #                             grant AFTER a revoke legitimately reactivates, so this
      #                             no-op is gated on the consent still being active.
      #   - newer version, active:  fall through; record the upgrade, preserve record_id,
      #                             capture the prior version in the audit payload so audit
      #                             queries can distinguish first-grant from upgrade events.
      #   - any version after a revoke (>= prior): fall through and reactivate.
      # Coerce a stored string version so the comparison stays numeric, not lexicographic.
      # disclosures_version is already a positive Integer (coerced above).
      prior_version = c['disclosures_version']
      prior_version = Integer(prior_version) if prior_version.is_a?(String) && prior_version.strip.match?(/\A\d+\z/)
      has_prior = c['granted_at'].present? && prior_version.is_a?(Integer)
      active    = has_prior && c['revoked_at'].blank?
      if has_prior
        next if disclosures_version < prior_version
        next if active && disclosures_version == prior_version
        prior_disclosures_version = prior_version if active && disclosures_version > prior_version
      end
      # RFC-4122 UUID (122 bits); not GoSecure.nonce, which had low entropy under bulk backfill.
      c['record_id'] = SecureRandom.uuid if c['record_id'].blank?
      c['granted_at'] = Time.now.utc.iso8601
      c['granted_by'] = granted_by
      c['granted_by_user_id'] = granted_by_user_id
      c['disclosures_version'] = disclosures_version
      c['source'] = source
      c['ip'] = ip
      c['user_agent'] = user_agent
      c.delete('pending_token')
      c.delete('pending_token_expires_at')
      c.delete('revoked_at')
      c.delete('revoked_by')
      c.delete('revoked_reason')
      self.settings['ai_consent'] = c
      self.save!
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'ai_consent_grant',
          'disclosures_version' => disclosures_version,
          'prior_disclosures_version' => prior_disclosures_version,
          'granted_by' => granted_by,
          'source' => source,
          'record_id' => c['record_id']
        },
        event_type: 'ai_consent_grant',
        record_id: c['record_id']
      )
      res = true
    end
    res
  end

  # Revokes the current AI data-sharing consent. Idempotent on already-revoked
  # (returns false). Mirrors grant_ai_consent!: runs inside `with_lock(requires_new:
  # true)` so the User update and AuditEvent insert are atomic - including under
  # an outer transaction that rescues the AR error - and concurrent grant/revoke
  # against the same user are serialized. D-05.
  #
  # Raises ArgumentError 'invalid_source' if source is not in
  # AI_CONSENT_REVOKE_SOURCES (parent / admin / system). Phase 3 controllers
  # cannot poison the revocation audit taxonomy by passing arbitrary params.
  def revoke_ai_consent!(revoked_by: nil, reason: nil, source: 'parent')
    raise ArgumentError, 'invalid_source' unless AI_CONSENT_REVOKE_SOURCES.include?(source)
    res = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['ai_consent']
      next unless c.is_a?(Hash)
      next if c['granted_at'].blank?
      next if c['revoked_at'].present?
      c['revoked_at'] = Time.now.utc.iso8601
      c['revoked_by'] = revoked_by
      c['revoked_reason'] = reason
      self.settings['ai_consent'] = c
      self.save!
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'ai_consent_revoke',
          'disclosures_version' => c['disclosures_version'],
          'source' => source,
          # Who revoked and why must live in the immutable audit trail, not only in
          # settings: the settings copy is DELETED on the next re-grant, so without
          # these the trail permanently loses the revocation actor and reason.
          'revoked_by' => revoked_by,
          'revoked_reason' => reason,
          'record_id' => c['record_id']
        },
        event_type: 'ai_consent_revoke',
        record_id: c['record_id']
      )
      res = true
    end
    res
  end

  # EU AI Act Article 50(1) TRANSPARENCY disclosure-shown state (B3, VPC Phase 4).
  # Mirrors ai_consent_granted? exactly, swapping settings['ai_consent'] for
  # settings['ai_transparency'] and "granted" semantics for "shown". The kwarg is
  # named `disclosures_version:` to MATCH ai_consent_granted?'s clone target so a
  # caller reusing the ai_consent call shape cannot hit an ArgumentError footgun.
  #
  # Semantically DISTINCT from ai_consent: this records that the Article 50
  # transparency NOTICE was displayed, NOT that AI data-sharing consent was granted.
  # It is versioned against Article50Disclosures::CURRENT_VERSION (its OWN version
  # source, not the ai_consent one, PN-02) so an Art.50 copy change re-prompts
  # without forcing an ai_consent re-consent. Defaults to false for a nil/missing
  # key: nothing flips shown=true until the Phase 3/5 modal acknowledge ships, so in
  # production every AiApiLog row carries article_50_disclosure_shown=false until then.
  def article_50_disclosure_shown?(disclosures_version: LingoLinq::Article50Disclosures::CURRENT_VERSION)
    c = self.settings && self.settings['ai_transparency']
    return false unless c.is_a?(Hash)
    return false if c['shown_at'].blank?
    return false if c['disclosures_version'].blank?
    return false unless c['disclosures_version'] == disclosures_version
    true
  end

  # Sources accepted by mark_article_50_disclosure_shown!. Anything else raises
  # ArgumentError, mirroring AI_CONSENT_SOURCES: a Phase 3/5 controller cannot widen
  # the audit source surface by passing an arbitrary value pulled from params.
  ARTICLE_50_DISCLOSURE_SOURCES = %w[modal_ack admin_backfill].freeze

  # Records that the Article 50(1) transparency disclosure was SHOWN at the given
  # version. Clones grant_ai_consent!'s structure: runs inside
  # with_lock(requires_new: true) so the settings write and the single AuditEvent
  # insert are atomic (a failed audit rolls back the settings write) and concurrent
  # writes to the same user are serialized. Idempotent on a same-version re-call
  # (returns false, fires NO second AuditEvent). A version BUMP (newer version) falls
  # through and re-records, giving re-prompt semantics.
  #
  # record_id uses SecureRandom.uuid (RFC-4122, 122 bits), matching the SHIPPED
  # grant_ai_consent! code -- NOT GoSecure.nonce, which had low entropy under bulk
  # backfill. Raises ArgumentError 'invalid_source' for a non-allowlisted source.
  #
  # WRITE TRIGGER: the Phase 3/5 modal acknowledge is the writer. Phase 4 ships this
  # API only; nothing calls it in production yet, so article_50_disclosure_shown?
  # stays false on every row until the modal ships (that is expected -- the plumbing
  # is the deliverable).
  def mark_article_50_disclosure_shown!(disclosures_version:, source:, ip: nil, user_agent: nil)
    raise ArgumentError, 'invalid_source' unless ARTICLE_50_DISCLOSURE_SOURCES.include?(source)
    disclosures_version = ai_consent_normalize_version!(disclosures_version)
    res = false
    self.with_lock(requires_new: true) do
      self.settings ||= {}
      c = self.settings['ai_transparency']
      c = {} unless c.is_a?(Hash)
      prior_version = c['disclosures_version']
      prior_version = Integer(prior_version) if prior_version.is_a?(String) && prior_version.strip.match?(/\A\d+\z/)
      # Same-version re-call is a no-op (already shown at this version). A newer
      # version falls through and re-records (re-prompt). An older version cannot
      # regress an already-shown newer disclosure.
      if c['shown_at'].present? && prior_version.is_a?(Integer)
        next if disclosures_version <= prior_version
      end
      c['record_id'] = SecureRandom.uuid if c['record_id'].blank?
      c['shown_at'] = Time.now.utc.iso8601
      c['disclosures_version'] = disclosures_version
      c['source'] = source
      c['ip'] = ip
      c['user_agent'] = user_agent
      self.settings['ai_transparency'] = c
      self.save!
      AuditEvent.create!(
        user_key: self.global_id,
        data: {
          'type' => 'article_50_disclosure_shown',
          'disclosures_version' => disclosures_version,
          'source' => source,
          'record_id' => c['record_id']
        },
        event_type: 'article_50_disclosure_shown',
        record_id: c['record_id']
      )
      res = true
    end
    res
  end

  # Coerces disclosures_version to a positive Integer so version comparisons are
  # numeric (not lexicographic) and a nil/garbage value can never write a consent
  # row that ai_consent_granted? can't honor. Accepts an Integer or an all-digit
  # String; rejects nil, blank, non-numeric, and < 1 with 'invalid_disclosures_version'.
  def ai_consent_normalize_version!(raw)
    ok = raw.is_a?(Integer) || (raw.is_a?(String) && raw.strip.match?(/\A\d+\z/))
    raise ArgumentError, 'invalid_disclosures_version' unless ok
    v = Integer(raw.is_a?(String) ? raw.strip : raw)
    raise ArgumentError, 'invalid_disclosures_version' if v < 1
    v
  end

  # Coerces granted_by_user_id to shard-prefixed global_id ("1_42") so the
  # self-grant guard cannot be bypassed with a bare ActiveRecord id.
  def normalize_ai_consent_granted_by_user_id!(raw)
    str = raw.to_s.strip
    if str.match?(/\A\d+_\d+/)
      str
    elsif str.match?(/\A\d+\z/)
      related_global_id(str.to_i)
    else
      raise ArgumentError, 'invalid_granted_by_user_id'
    end
  end

  def anonymized_identifier(str=nil)
    str ||= ""
    self.settings ||= {}
    if !self.settings['anonymized_identifier']
      self.settings['anonymized_identifier'] = GoSecure.nonce('user_pseudonymization')
      self.save
    end
    GoSecure.lite_hmac("#{self.global_id}:#{self.created_at.iso8601}:#{str}", self.settings['anonymized_identifier'], 1)
  end

  def possible_admin?
    !!(self.settings && self.settings['possible_admin'])
  end
  
  def self.preference_defaults
    {
      'device' => {
        'voice' => {'pitch' => 1.0, 'volume' => 1.0},
        'button_spacing' => 'small',
        'button_border' => 'small',
        'button_text' => 'medium',
        'button_text_position' => 'top',
        'utterance_text_only' => false,
        'vocalization_height' => 'small',
        # Suppresses the on-screen "Larger screen recommended" / "Landscape mode
        # recommended" helper overlays for this device. DEFAULT false = keep showing
        # them, which is the behaviour every existing user has today: generate_defaults
        # backfills this onto EVERY device hash of EVERY user on save (no new_record?
        # guard), so a `true` default would silently disable the helpers account-wide
        # for everyone — the same trap board_category_grouping hit.
        'hide_screen_helpers' => false,
        # Physical-keyboard typing adds to the vocalization box while in speak mode
        # (raw_events.js, the `keyboard_listen` path). Gated on this preference since the
        # feature was written in 2018, with no default on either side — so it has only ever
        # worked for someone who found the checkbox in Preferences, or who enabled the
        # native on-screen keyboard, which silently switches this on too
        # (controllers/user/preferences.js#enable_external_keyboard).
        #
        # DELIBERATELY true, and note what that means: generate_defaults backfills every
        # entry of this hash onto EVERY device of EVERY user on save (no new_record? guard —
        # see the `hide_screen_helpers` note above), so this turns the behaviour ON for
        # existing users, not just new ones. That is the intent — typing on a keyboard and
        # having nothing appear is the surprising behaviour, not the reverse — but it is a
        # behaviour change for every account and belongs in release notes.
        #
        # Safe to default only because the typing path is narrow: speak mode only
        # (buttonTracker.check returns null otherwise), never while scanning or dwelling, not
        # while a modal is open, and — as of the same change as this default — not while the
        # user is typing into a text field (raw_events.js#typing_into_a_field). Without that
        # last guard this default would have made every search box on a speak-mode page
        # inject into the utterance.
        'external_keyboard' => true,
        'wakelock' => true
      },
      'any_user' => {
        'activation_location' => 'end',
        # Default to staying in-place after a button activation so the user
        # can compose a multi-chip sentence inside a sub-folder without the
        # board navigating back to home after every tap. Communicators
        # using the classic auto-home flow can opt in via their preferences.
        'auto_home_return' => false,
        'vocalize_buttons' => true,
        'external_links' => 'confirm_custom',
        'clear_on_vocalize' => true,
        'sharing' => true,
        'board_jump_delay' => 500,
        'battery_sounds' => true,
        'default_sidebar_boards' => default_sidebar_boards,
        'default_active_sidebar_boards' => default_active_sidebar_boards,
        'blank_status' => false,
        'preferred_symbols' => 'opensymbols',
        'word_suggestion_images' => true,
        # NOTE: word_suggestions / word_suggestion_position are intentionally NOT
        # in this unconditional bucket — they default ON only for NEW users (set
        # in generate_defaults under `new_record?`), so existing users who never
        # set word prediction are never silently enabled.
        'hidden_buttons' => 'grid',
        # Folder display style for sub-folder buttons: 'default' (plain folder
        # face), 'tab_labels', or 'colored_corner'. Assigned at registration so
        # the value is authoritative server-side; the client no longer supplies
        # a fallback default for it.
        'folder_display_style' => 'default',
        # Fitzgerald category grouping on board-detail. Empty order = the frontend
        # registry supplies the default sequence.
        #
        # OFF by default, deliberately. Turning grouping on MOVES vocabulary out of the
        # cells a user has built positional motor memory on — a clinical change, so it
        # must be opt-in.
        #
        # This default is NOT only for new signups: `generate_defaults` is a before_save
        # with no new_record? guard covering this loop, so every preference_defaults
        # entry is backfilled onto EVERY existing user on their next routine save
        # (login, sync, home-board change). With 'enabled' => true that silently
        # regrouped every existing communicator's board, and — because the value was
        # then PERSISTED as an explicit true — removing the feature flag before
        # production would NOT have undone it.
        # `show_category_names` and `vertical_scroll` default TRUE because both describe
        # what the grouped board already does today: the category header always renders
        # (board-detail-grid.hbs `{{#if group.label}}`) and the grouped grid is always
        # `overflow-y: auto` (app.scss `.md-board-detail-grid--grouped`). Defaulting
        # either to false would change the rendering for every user who already turned
        # grouping on — a silent behaviour change, which is exactly what the `enabled`
        # note above exists to warn about. They only take effect while `enabled` is true.
        'board_category_grouping' => {'enabled' => false, 'order' => [], 'show_category_names' => true, 'vertical_scroll' => true},
        'symbol_background' => 'clear',
        'utterance_interruptions' => true,
        'click_buttons' => true,
        'auto_capitalize' => true,
        'prefer_native_keyboard' => false,
        # Which board UI the user sees when opening a board: the
        # 'modern' panelled experience (board-detail) or the 'classic'
        # full-device grid (board-alt). Both render the same board
        # content — this is purely a visual/UX shell preference.
        # Default 'modern' to surface the newer, feature-richer UI.
        'board_view_style' => 'modern',
        # Home-page dashboard arrangement: 'gentle' (default) or 'focused'.
        # Chosen during the Dashboard Design flow; drives the md-grid--layout-*
        # modifier on the dashboard grid.
        # NOTE (adversarial-review false positive — "client/server default mismatch"):
        # this server default is 'gentle', matching the frontend default
        # (dashboard/authenticated-view.js#effectiveLayout). They are aligned; new users
        # get 'gentle' from both sides. (sanitize_dashboard_preferences! below also coerces
        # any out-of-range stored value back to a known variant.)
        'dashboard_layout' => 'gentle',
        # Per-section visibility for the home dashboard cards, e.g.
        # {'boards' => true, 'extras' => false}. Chosen during the Getting
        # Started flow. A missing key (or true) means visible, so sections
        # default to shown; only keys explicitly set to false are hidden.
        'dashboard_sections' => {},
        # Per-section grid POSITION for the home dashboard cards, e.g.
        # {'speak' => 'org', 'org' => 'speak'} — each card maps to the home-slot
        # it occupies (default identity). Chosen by dragging-to-swap in the
        # Getting Started preview. A missing key means the card sits in its own
        # slot, so arrangements default to the canonical layout.
        'dashboard_positions' => {},
        # Boards hero placement (drag-to-move it), e.g. {'side' => 'right'} or
        # {'raised' => true}. Empty/absent => Boards in its default left, lower
        # position. Drives a structural mirror / vertical-shift of the home grid.
        'dashboard_boards' => {}
      },
      'authenticated_user' => {
        'long_press_edit' => false,
        'require_speak_mode_pin' => false,
        'require_sidebar_edit_pin' => false,
        'logging' => false,
        'geo_logging' => false,
        'role' => 'communicator',
        'auto_open_speak_mode' => true,
        'share_notifications' => 'email',
        'cookies' => true,
        'beta_program_access' => true
      }
    }
  end

  def generate_defaults
    self.settings ||= {}
    self.settings['name'] ||= "No name"
    self.settings['preferences'] ||= {}
    self.settings['preferences']['progress'] ||= {}
    if self.settings['preferences']['home_board']
      self.settings['preferences']['progress']['home_board_set'] = true
      self.settings['all_home_boards'] ||= []
      ref = self.settings['preferences']['home_board'].slice('key', 'id', 'locale')
      if self.settings['all_home_boards'][-1] != ref
        self.settings['all_home_boards'] << ref
        self.settings['home_board_changed'] = true
        self.settings['all_home_boards'] = self.settings['all_home_boards'].uniq
      end
    end
    self.settings['edit_key'] = Time.now.to_f.to_s + "-" + rand(9999).to_s
    self.settings['preferences']['devices'] ||= {}
    self.settings['preferences']['devices']['default'] ||= {}
    self.settings['preferences']['devices']['default']['name'] ||= "Web browser for Desktop"
    self.settings['preferences']['devices'].each do |key, hash|
      self.settings['preferences']['devices'][key]['voice']['voice_uris'].uniq! if self.settings['preferences']['devices'][key]['voice'] && self.settings['preferences']['devices'][key]['voice']['voice_uris']
      self.settings['preferences']['devices'][key]['alternate_voice']['voice_uris'].uniq! if self.settings['preferences']['devices'][key]['alternate_voice'] && self.settings['preferences']['devices'][key]['alternate_voice']['voice_uris']
      User.preference_defaults['device'].each do |attr, val|
        self.settings['preferences']['devices'][key][attr] = val if self.settings['preferences']['devices'][key][attr] == nil
      end
    end
    if cookies_opted_out?
      self.settings['preferences']['protected_user'] = true
    end
    self.settings['preferences']['disable_quick_sidebar'] = false if self.settings['preferences']['quick_sidebar']
    if !FeatureFlags.user_created_after?(self, 'word_suggestion_images')
      self.settings['preferences']['word_suggestion_images'] = false if self.settings['preferences']['word_suggestion_images'] == nil
    end
    if !FeatureFlags.user_created_after?(self, 'hidden_buttons')
      self.settings['preferences']['hidden_buttons'] = 'hide' if self.settings['preferences']['hidden_buttons'] == nil
    end
    if FeatureFlags.user_created_after?(self, 'skin_tones')
      self.settings['preferences']['skin'] = "mix#{rand(999)}" if self.settings['preferences']['skin'] == nil
    end
    if !FeatureFlags.user_created_after?(self, 'symbol_background')
      self.settings['preferences']['symbol_background'] = 'white' if self.settings['preferences']['symbol_background'] == nil
    end
    # Word prediction defaults ON for NEW users only (set once at registration,
    # never backfilled) so existing users who never set it stay OFF. The client
    # gates display on `word_suggestions === true`, so a nil value reads as off.
    if self.new_record?
      self.settings['preferences']['word_suggestions'] = true if self.settings['preferences']['word_suggestions'] == nil
      self.settings['preferences']['word_suggestion_position'] = 'side_rail' if self.settings['preferences']['word_suggestion_position'] == nil
    end
    if !FeatureFlags.user_created_after?(self, 'battery_sounds')
      self.settings['preferences']['battery_sounds'] = true if self.settings['preferences']['battery_sounds'] == nil
    end
    if FeatureFlags.user_created_after?(self, 'utterance_core_access')
      self.settings['preferences']['utterance_core_access'] = true if self.settings['preferences']['utterance_core_access'] == nil
    end
    self.settings['preferences']['utterance_core_access'] = true if self.settings['preferences']['utterance_core_access'] == nil && self.settings['preferences']['logging']
    self.settings['preferences']['utterance_core_access'] ||= false
    if !FeatureFlags.user_created_after?(self, 'auto_capitalize')
      self.settings['preferences']['auto_capitalize'] = true if self.settings['preferences']['auto_capitalize'] == nil
      self.settings['preferences']['devices'].each do |key, hash|
        self.settings['preferences']['devices'][key]['utterance_text_only'] = true if self.settings['preferences']['devices'][key]['utterance_text_only'] == nil
      end
    end
    self.settings['preferences']['auto_capitalize'] ||= false
    if FeatureFlags.user_created_after?(self, 'new_index')
      self.settings['preferences']['new_index'] = true if self.settings['preferences']['new_index'] == nil
    end
    if FeatureFlags.user_created_after?(self, 'click_buttons')
      self.settings['preferences']['click_buttons'] = true if self.settings['preferences']['click_buttons'] == nil
    end
    if FeatureFlags.user_created_after?(self, 'recent_cleared_phrases')
      self.settings['preferences']['recent_cleared_phrases'] = true if self.settings['preferences']['recent_cleared_phrases'] == nil
    end
    self.settings['preferences']['click_buttons'] ||= false
    if FeatureFlags.user_created_after?(self, 'utterance_interruptions')
      self.settings['preferences']['utterance_interruptions'] = true if self.settings['preferences']['utterance_interruptions'] == nil
    end
    self.settings['preferences']['utterance_interruptions'] ||= false
    if self.settings['preferences']['confirm_external_links']
      self.settings['preferences']['external_links'] = 'confirm_custom'
      self.settings['preferences'].delete('confirm_external_links')
    end
    User.preference_defaults['any_user'].each do |attr, val|
      self.settings['preferences'][attr] = val if self.settings['preferences'][attr] == nil
    end
    User.preference_defaults['authenticated_user'].each do |attr, val|
      self.settings['preferences'][attr] = val if self.settings['preferences'][attr] == nil
    end
    if self.settings['preferences']['role'] != 'communicator'
      self.settings['preferences'].delete('auto_open_speak_mode')
    end
    if self.settings['preferences']['notification_frequency']
      self.next_notification_at ||= next_notification_schedule
    end
    # Extend all trials until July 31, 2020
    if (!self.expires_at && !self.id) || (self.grace_period? && self.id)
      extension = Rails.env.test? ? Date.today : Date.parse('2020-07-31')
      old_exp = self.expires_at
      self.expires_at = [self.expires_at || Date.today + 60, extension].max
      self.settings['subscription'] ||= {}
      self.settings['subscription']['expiration_source'] = (self.id ? 'grace_period' : 'free_trial') if self.expires_at != old_exp
    end
    return false if self.user_name == ""
    self.user_name = nil if self.user_name.blank?
    self.user_name ||= self.generate_user_name(self.settings['name'])
    self.email_hash = User.generate_email_hash(self.settings['email'])
    
    self.assert_eval_settings
    if self.full_premium? || self.possibly_full_premium == nil
      self.possibly_full_premium = true if self.full_premium?
      self.possibly_full_premium ||= rand(20) == 1
    end
    if !self.id
      self.settings['home_board_changed'] = true
      @do_track_boards = true 
    end
    UserLink.invalidate_cache_for(self)
    true
  end

  def edit_key
    self.settings['edit_key']
  end

  def save_with_sync(reason)
    self.sync_stamp = Time.now
    self.settings ||= {}
    self.settings['sync_stamp_reason'] = reason
    self.save_sync_supervisors
    self.save
  end

  def save_sync_supervisors(do_update=false)
    if do_update
      self.supervisors.each do |sup|
        sup.save_with_sync('supervisee update')
      end
    else
      ra_cnt = RemoteAction.where(path: "#{self.global_id}", action: 'save_sync_supervisors').count
      RemoteAction.create(path: "#{self.global_id}", act_at: 15.minutes.from_now, action: 'save_sync_supervisors') if ra_cnt == 0
    end
  end
  
  def self.find_by_email(email, lookup=User)
    hash = User.generate_email_hash(email)
    lookup.where(:email_hash => hash).order('user_name')
  end
  
  def self.generate_email_hash(email)
    Digest::MD5.hexdigest((email || "none").to_s.strip.downcase)
  end
  
  def generated_avatar_url(override_url=nil)
    id = self.id || 0
    # In development, use local paths; in production, use S3
    if Rails.env.development?
      fallback = "/avatars/avatar-#{id % 10}.png"
    else
      bucket = ENV['STATIC_S3_BUCKET'] || "lingolinq"
      fallback = "https://#{bucket}.s3.amazonaws.com/avatars/avatar-#{id % 10}.png"
    end

    # In development, use local /avatars/ paths for the default image, but still expose a
    # custom settings['avatar_url'] (https or same-origin path) so profile edits persist in JSON.
    if Rails.env.development? && !override_url
      url = self.settings && self.settings['avatar_url']
      if url.present? && url != 'default'
        return url if url.match(/^https?:\/\//o) || url.match(/^\//o)
      end
      return fallback
    end

    url = self.settings && self.settings['avatar_url']
    url = override_url if override_url
    if url == 'fallback'
      fallback
    elsif url && url != 'default'
      # NOTE: somewhere we should enforce that it's coming from a reliable location, or provide a fallback
      url
    elsif self.settings['email'] && false
      # TODO: gravatar seems to be breaking on iOS-only all of the sudden
      email_md5 = Digest::MD5.hexdigest(self.settings['email'])
      "https://www.gravatar.com/avatar/#{email_md5}?s=100&d=#{CGI.escape(fallback)}"
    else
      fallback
    end
  end
  
  def prior_avatar_urls
    res = self.settings && self.settings['prior_avatar_urls']
    current = generated_avatar_url
    default = generated_avatar_url('default')
    if (res && res.length > 0) || current != default
      res = res || []
      res.push(default)
      res.uniq!
    end
    res
  end
  
  # frd == "For Reals, Dude" obviously. It's a thing, I guess you just didn't know about it.
  # TODO: add "frd" to urban dictionary
  def track_boards(frd=false, ts=nil)
    if !@do_track_boards && !frd
      return true
    end
    @do_track_boards = false
    if frd != true
      if self.settings && (self.settings['home_board_changed'] || self.settings['sidebar_changed'])
        self.schedule_once_for(RedisInit.any_queue_pressure? ? :whenever : :slow, :track_boards, true, ts || Time.now.to_i)
      end
      return true
    end
    if ts && self.settings['tracked_boards_at'] && ts < self.settings['tracked_boards_at']
      # Prevent multiple tracks for the same user
      return false
    end
    if ts && frd
      self.settings['tracked_boards_at'] = Time.now.to_i
      self.save
    end

    
    previous_connections = UserBoardConnection.where(:user_id => self.id)
    orphan_board_ids = previous_connections.map(&:board_id)
    linked_boards = []
    board_ids_to_recalculate = []
    if self.settings['preferences'] && self.settings['preferences']['home_board'] && self.settings['preferences']['home_board']['id']
      brd = Board.find_by_path(self.settings['preferences']['home_board']['id'])
      linked_boards << {
        board: brd,
        locale: self.settings['preferences']['home_board']['locale'] || brd.settings['locale'] || 'en',
        changed: self.settings['home_board_changed'],
        home: true
      } if brd
    end
    if self.settings['preferences'] && self.settings['preferences']['sidebar_boards']
      self.settings['preferences']['sidebar_boards'].each do |brd|
        board_record = Board.find_by_path(brd['key']) if brd['key']
        next unless board_record
        linked_boards << {
          board: board_record,
          locale: brd['locale'] || board_record.settings['locale'] || 'en',
          changed: self.settings['sidebar_changed'],
          home: false
        }
      end
    end
    Board.lump_triggers
    board_added = false
    linked_boards.each do |hash|
      board = hash[:board]
      if board
        orphan_board_ids -= [board.id]
        # TODO: sharding
        ubc = UserBoardConnection.find_or_create_by(:board_id => board.id, :user_id => self.id, :home => hash[:home]) do |rec|
          # Remember: only called on create, not find
          rec.locale = hash[:locale] || rec.locale
          board_added = true
          UserBoardConnection.where(board_id: rec.id).update_all(parent_board_id: rec.parent_board_id)
        end
        if ubc.locale != hash[:locale] && hash[:locale]
          UserBoardConnection.where(id: ubc.id).update_all(locale: hash[:locale])
        end
        board.instance_variable_set('@skip_update_available_boards', true)
        # NOTE: I *think* this is here because board permissions may change for
        # supervisors/supervisees when a user's home board changes
        board.track_downstream_boards!(nil, nil, Board.last_scheduled_stamp || Time.now.to_i)
        Rails.logger.info("checking downstream boards for #{self.global_id}, #{board.global_id}")
        
        Board.select('id, parent_board_id').find_batches_by_global_id(board.settings['downstream_board_ids'] || [], batch_size: 50) do |downstream_board|
          if downstream_board
            orphan_board_ids -= [downstream_board.id]
            downstream_board_added = false
            ubc = UserBoardConnection.find_or_create_by(:board_id => downstream_board.id, :user_id => self.id) do |rec|
              # Remember: only called on create, not find
              rec.locale = hash[:locale] || rec.locale
              board_added = true
              downstream_board_added = true
              UserBoardConnection.where(board_id: rec.id).update_all(parent_board_id: rec.parent_board_id)
            end
            if ubc.locale != hash[:locale] && hash[:locale]
              UserBoardConnection.where(id: ubc.id).update_all(locale: hash[:locale])
            end
            # When a user updated their home board/sidebar, all linked boards will have updated
            # tallies for popularity, home_popularity, etc.
            board_ids_to_recalculate << downstream_board.global_id if hash[:changed]
          end
        end
        Rails.logger.info("done checking downstream boards for #{self.global_id}, #{board.global_id}")
      end
    end
    Rails.logger.info("processing lumped triggers")
    Board.process_lumped_triggers
    Rails.logger.info("done processing lumped triggers")
    
    if board_added || orphan_board_ids.length > 0
      # TODO: sharding
      User.where(:id => self.id).update_all(:updated_at => Time.now, :sync_stamp => Time.now, :boards_updated_at => Time.now)
      Board.schedule(:regenerate_shared_board_ids, [self.global_id])
    end
    
    UserBoardConnection.where(:user_id => self.id, :board_id => orphan_board_ids).delete_all
    # TODO: sharding
    board_ids_to_recalculate += Board.where(:id => orphan_board_ids).select('id').map(&:global_id)
    if self.settings['home_board_changed'] || self.settings['sidebar_changed']
      self.settings.delete('home_board_changed')
      self.settings.delete('sidebar_changed')
      @do_track_boards = false
      self.save
    end
    # to regenerates stats?
    if !RedisInit.any_queue_pressure?
      board_ids_to_recalculate.uniq.each_slice(100) do |ids|
        if ids.length > 0
          stash = JobStash.create(data: ids)
          Board.schedule_for(:slow, :refresh_stats, {'stash' => stash.global_id}, Time.now.to_i) 
        end
      end
    end
    true
  end

  def remember_starred_board!(board_id)
    board = Board.find_by_path(board_id)
    if board
      star = board.starred_by?(self)
      self.settings['starred_board_ids'] ||= []
      if star
        self.settings['starred_board_ids'] << board.shallow_id if board
        self.settings['starred_board_ids'].uniq!
      else
        self.settings['starred_board_ids'] = self.settings['starred_board_ids'] - [board.shallow_id]
      end
      self.settings['starred_boards'] = self.settings['starred_board_ids'].length
      self.save_with_sync('star_list_changed')
    end
  end

  def starred_board_refs
    refs = []
    user = self
    brds = {}
    Board.find_all_by_global_id((user.settings['starred_board_ids'] || [])[0, 25]).each do |b|
      brds[b.global_id] = b
      brds[b.global_id(true)] = b
    end
    (user.settings['starred_board_ids'] || []).each do |id|
      brd = brds[id]
      if brd
        id = brd.global_id
        key = brd.key
        if FeatureFlags.feature_enabled_for?('shallow_clones', user)
          id = "#{brd.global_id(true)}-#{user.global_id}"
          key = "#{user.user_name}/my:#{brd.key.sub(/\//, ':')}"
        end
        refs << {'id' => id, 'key' => key, 'image_url' => brd.settings['image_url'], 'name' => brd.settings['name']}
      end
    end
    if refs.length < 8
      home_board_id = (user.settings['preferences']['home_board'] || {})['id']
      ::Board.find_suggested(user.settings['preferences']['locale'] || 'en', 5).each do |board|
        if home_board_id == board.global_id
        elsif !brds[board.global_id] && refs.length < 12
          id = board.global_id
          key = board.key
          if FeatureFlags.feature_enabled_for?('shallow_clones', user)
            id = "#{board.global_id(true)}-#{user.global_id}"
            key = "#{user.user_name}/my:#{board.key.sub(/\//, ':')}"
          end
          if board.settings['board_style']
            refs << {
              'id' => id,
              'key' => key,
              'name' => board.settings['name'],
              'suggested' => true,
              'style' => board.settings['board_style'],
              'image_url' => board.settings['image_url']
            }
          else
            refs << {
              'id' => id,
              'key' => key,
              'name' => board.settings['name'],
              'suggested' => true,
              'image_url' => board.settings['image_url']
            }
          end
        end
      end
    end
    refs
  end
  
  def board_set_ids(opts=nil)
    opts ||= {}
    include_supervisees = opts['include_supervisees'] || opts[:include_supervisees] || false
    include_starred = opts['include_starred'] || opts[:include_starred] || false
    root_board_ids = []
    board_ids = []
    if self.settings && include_starred
      board_ids += self.settings['starred_board_ids'] || []
      root_board_ids += self.settings['starred_board_ids'] || []
    end
    if self.settings && self.settings['preferences'] && self.settings['preferences']['home_board']
      root_board_ids += [self.settings['preferences']['home_board']['id']] 
    end
    if include_supervisees
      # Callers that have already authorized the caseload against a requester
      # (JsonApi::User) pass the filtered list in; a board id here is directly
      # fetchable, so re-deriving from self.supervisees would leak the boards of
      # a child whose identity that caller was just denied. Callers with no
      # requester in hand (internal/self use) get the full list as before.
      #
      # The <5 bound stays on the UNfiltered count: it is a cost guard on this
      # method, not an authorization decision, and keying it to the filtered
      # count would let a large caseload back in whenever most rows are hidden.
      # key? rather than `||`: an authorization-carrying parameter must not treat a
      # nil or missing value as "no filter". Falling back to the full walk on a
      # typo or a nil would silently reopen the leak this option exists to close,
      # with green CI.
      visible_supervisees =
        if opts.key?('supervisees') || opts.key?(:supervisees)
          opts['supervisees'] || opts[:supervisees] || []
        else
          self.supervisees
        end
      if self.supervised_user_ids.length < 5
        visible_supervisees.each do |u|
          if u.settings && u.settings['preferences'] && u.settings['preferences']['home_board']
            root_board_ids  += [u.settings['preferences']['home_board']['id']]
          end
        end
      end
    end

    board_ids += root_board_ids
    root_boards = Board.find_all_by_global_id(root_board_ids)
    root_boards.each do |board|
      board_ids += board.downstream_board_ids || []
    end
    
    board_ids.uniq
  end
  
  PREFERENCE_PARAMS = ['sidebar', 'auto_home_return', 'vocalize_buttons', 
      'sharing', 'button_spacing', 'quick_sidebar', 'disable_quick_sidebar', 
      'lock_quick_sidebar', 'clear_on_vocalize', 'logging', 'geo_logging', 
      'require_speak_mode_pin', 'speak_mode_pin', 'require_sidebar_edit_pin', 'activation_minimum',
      'activation_location', 'activation_cutoff', 'activation_on_start', 
      'confirm_external_links', 'external_links', 'long_press_edit', 'scanning', 'scanning_interval',
      'scanning_mode', 'scanning_select_keycode', 'scanning_next_keycode', 
      'scanning_prev_keycode', 'scanning_cancel_keycode',
      'scanning_select_on_any_event', 'vocalize_linked_buttons', 'sidebar_boards',
      'silence_spelling_buttons', 'stretch_buttons', 'registration_type',
      'board_background', 'vocalization_height', 'role', 'auto_open_speak_mode',
      'canvas_render', 'blank_status', 'share_notifications', 'notification_frequency',
      'skip_supervisee_sync', 'sync_refresh_interval', 'multi_touch_modeling',
      'goal_notifications', 'word_suggestion_images', 'word_suggestions', 'word_suggestion_position', 'hidden_buttons',
      'speak_on_speak_mode', 'ever_synced', 'folder_icons', 'folder_display_style', 'allow_log_reports', 'allow_log_publishing',
      # Hash: {'enabled' => bool, 'order' => [category keys]}. process_params stores a
      # whitelisted key's value verbatim, so the nested hash round-trips like
      # 'device'/'substitutions' already do. Keys are validated frontend-side against
      # utils/board_categories.js so an unknown/removed category can never break render.
      'board_category_grouping',
      'symbol_background', 'disable_button_help', 'click_buttons', 'prevent_hide_buttons',
      'new_index', 'debounce', 'cookies', 'telemetry_opt_in', 'comms_log_opt_in', 'preferred_symbols', 'tag_ids', 'vibrate_buttons',
      'highlighted_buttons', 'never_delete', 'dim_header', 'inflections_overlay',
      'highlight_popup_text', 'phrase_categories', 'high_contrast', 'swipe_pages',
      'hide_pin_hint', 'battery_sounds', 'auto_inflections', 'private_logging',
      'remote_modeling', 'remote_modeling_auto_follow', 'remote_modeling_auto_accept',
      'locale', 'logging_cutoff', 'logging_permissions', 'logging_code',
      'substitutions', 'substitute_contractions', 'auto_capitalize', 'dim_level',
      'prevent_button_interruptions', 'utterance_interruptions', 'prevent_utterance_repeat',
      'recent_cleared_phrases', 'clear_vocalization_history', 'clear_vocalization_history_count', 
      'clear_vocalization_history_minutes', 'speak_mode_edit', 'skin', 'hide_gif',
      'extra_colors', 'sync_starred_boards', 'board_view_style', 'beta_program_access',
      'dashboard_layout', 'dashboard_sections', 'dashboard_order', 'dashboard_positions', 'dashboard_boards',
      # Board light/dark viewing preference (boolean; true => dark). Persisted so
      # the board-detail dark toggle and the create-board-new preview share one
      # remembered choice across sessions. Unset => each surface applies its own
      # default (board-detail dark, create-board-new light).
      'board_dark_mode',
      # Boards-page arrangement: 'side-by-side' (Folders 1/4 left, Boards 3/4 right)
      # or 'top-down' (the original stacked order). Persisted per USER, not per
      # device, so the choice follows the user to a new login/browser — localStorage
      # is only a same-device mirror for first paint (components/boards-layout-toggle.js).
      # DELIBERATELY NO SERVER DEFAULT: absent means "never chosen" and the frontend
      # constant (SIDE_BY_SIDE) is the single source of truth for the default. A server
      # default here would be a second copy that can drift out of sync — the exact
      # failure mode called out on 'dashboard_layout' above.
      # Values are constrained on write by sanitize_boards_layout_preference!.
      'boards_layout',
      # AI feature prefs (master + per-feature). Master nil = grandfather (allowed);
      # for EU under-16 without parental consent these are forced false on write.
      'ai_features_enabled', 'ai_board_generation', 'ai_word_prediction',
      'ai_board_suggestions', 'ai_symbol_search'
    ]
  # Known home-dashboard section keys — the SINGLE source of truth lives in the
  # frontend (app/frontend/app/utils/dashboard_sections.js: HOME_SECTIONS keys +
  # the 'hero' non-grid toggle). Duplicated here so the server can validate the
  # user-supplied dashboard_* preferences on write (Ruby can't import the JS).
  # Keep in sync if a section key is added/removed there.
  DASHBOARD_SECTION_KEYS = ['boards', 'speak', 'extras', 'caseload', 'rooms', 'attention', 'org',
      'account', 'createboard', 'reports', 'editdashboard', 'hero']
  CONFIRMATION_PREFERENCE_PARAMS = ['logging', 'private_logging', 'geo_logging', 'allow_log_reports',
      'allow_log_publishing', 'cookies', 'never_delete', 'logging_cutoff', 'logging_permissions', 'logging_code']
  RESEARCH_PREFERENCE_PARAMS = ['research_primary_use', 'research_age', 'research_experience_level']
  PROGRESS_PARAMS = ['setup_done', 'intro_watched', 'profile_edited', 'preferences_edited', 
      'home_board_set', 'app_added', 'skipped_subscribe_modal', 'speak_mode_intro_done',
      'modeling_intro_done', 'modeling_ideas_viewed', 'modeling_ideas_target_words_reviewed',
      'board_intros']
  def process_params(params, non_user_params)
    # Defensive guard: `settings['admin']` may only be set via
    # non_user_params['admin'] (see ~line 1485 below). Strip any
    # client-supplied `admin` flag before any other processing so it
    # can NEVER be smuggled through if a future controller path
    # passes user params unfiltered. Belt-and-suspenders against
    # privilege-escalation regressions — admin assignment must stay
    # an out-of-band action (console or Admin-org manager membership).
    params.delete('admin') if params.respond_to?(:delete)
    params.delete(:admin)  if params.respond_to?(:delete)
    self.settings ||= {}
    ['name', 'description', 'details_url', 'location', 'cell_phone'].each do |arg|
      self.settings[arg] = process_string(params[arg]) if params[arg]
    end
    # Use process_boolean (true / '1' / 'true' only) rather than a bare
    # truthiness check: in Ruby the string 'false' is truthy, so `if
    # params['terms_agree']` would record consent for an API request that
    # explicitly declined. Consent must be recorded only on an affirmative.
    if process_boolean(params['terms_agree'])
      self.settings['terms_agreed'] = Time.now.to_i
      # The signup consent checkbox covers BOTH the Terms of Use and the
      # Privacy Policy (see register.hbs), so capture an explicit, versioned
      # record that the user acknowledged the Privacy Policy, alongside the
      # terms timestamp. For under-13 signups this record is removed in the
      # COPPA block below and re-stamped by the *parent* in
      # grant_parental_consent!, since a child cannot acknowledge on its own.
      self.settings['privacy_policy_acknowledged'] = {
        'acknowledged_at' => Time.now.utc.iso8601,
        'policy_version' => PRIVACY_POLICY_VERSION
      }
    end
    if params['avatar_url'] && (params['avatar_url'].match(/^http/) || params['avatar_url'] == 'fallback')
      if self.settings['avatar_url'] && self.settings['avatar_url'] != 'fallback'
        self.settings['prior_avatar_urls'] ||= []
        self.settings['prior_avatar_urls'] << self.settings['avatar_url']
        self.settings['prior_avatar_urls'].uniq!
      end
      self.settings['avatar_url'] = params['avatar_url']
    end
    if params['external_device']
      self.settings['external_device'] = params['external_device']
    elsif params.has_key?('external_device')
      self.settings.delete('external_device')
    end
    new_email = params['email'] && params['email'].gsub(/\s/, '')
    if new_email && new_email != self.settings['email']
      if self.settings['email']
        self.settings['old_emails'] ||= []
        self.settings['old_emails'] << self.settings['email']
        @email_changed = true
      end
      if (!self.id || @email_changed) && Setting.blocked_email?(new_email)
        add_processing_error("blocked email address")
        return false
      end
      self.settings['email'] = process_string(new_email)
    end
    # Determine up front whether this is a VALID organization-authored creation (a
    # school/district manager creating a managed user under the FERPA school-official
    # exception). The COPPA parental-consent gate is skipped ONLY for a validated org
    # authorization. Previously the skip keyed on the raw authored_organization_id
    # param being non-blank while the org/author validation ran later (see below), so
    # a present-but-invalid or unauthorized org id bypassed the COPPA gate AND recorded
    # nothing. Compute the validated result once and reuse it for both decisions.
    org_authorized = false
    authoring_org = nil
    if !self.id && params['authored_organization_id'].present?
      authoring_org = Organization.find_by_global_id(params['authored_organization_id'])
      # NOTE: 'edit' is satisfied by assistant-level managers, not only full managers
      # (Organization adds 'edit' for assistant? at organization.rb:43; 'manage' is the
      # full-manager-only level at :44). This preserves the pre-existing authoring scope.
      # Whether the school-official exception should be restricted to full managers, and
      # gated on a signed-contract/DPA flag, is the Phase 1 decision (see
      # outputs/plans/2026-06-19-org-coppa-bypass-fix-scope.md); do not silently change
      # the scope here. Any code path that sets settings['school_authorization'] below
      # must also emit the school_authorization AuditEvent (today the only creator path
      # is api/users#create, which does).
      if authoring_org && non_user_params[:author] && authoring_org.allows?(non_user_params[:author], 'edit')
        org_authorized = true
      end
    end
    # Use !org_authorized (not authored_organization_id.blank?) so an empty string OR a
    # present-but-invalid/unauthorized org id both fall through to the COPPA gate.
    if !self.id && JsonApi::Json.coppa_parental_consent_enabled? && !org_authorized
      # Ember may send snake_case, dasherized, or camelCase JSON keys depending on serializer/version.
      minor_flag = params['coppa_under_13'] || params['coppa-under-13'] || params['coppaUnder13']
      wants_minor = [true, 'true', '1', 1].include?(minor_flag)
      if wants_minor
        parent = (
          params['parent_consent_email'] ||
          params['parent-consent-email'] ||
          params['parentConsentEmail'] ||
          ''
        ).to_s.strip
        child_email = (self.settings['email'] || '').to_s.strip.downcase
        if parent.blank?
          add_processing_error('parent consent email required for under-13 registration')
          return false
        end
        if parent !~ URI::MailTo::EMAIL_REGEXP
          add_processing_error('invalid parent consent email format')
          return false
        end
        if parent.downcase == child_email
          add_processing_error('parent consent email must be different from the account email')
          return false
        end
        self.settings['coppa'] = {
          'pending_parent_consent' => true,
          'parent_email' => process_string(parent),
          'parent_consent_token' => GoSecure.nonce('parent_consent'),
          'parent_consent_expires_at' => 14.days.from_now.utc.iso8601
        }
        # COPPA: a child cannot acknowledge the Privacy Policy on its own. Drop
        # any signup-time acknowledgment stamped above; it is recorded by the
        # parent in grant_parental_consent! once they complete the token flow.
        self.settings.delete('privacy_policy_acknowledged')
      end
    end
    # Registration country + under-16 flags (EU AI / GDPR Art. 8). Persisted only
    # on create. Server recomputes eu_under_16 from trusted country + under_16;
    # ignore any client-supplied eu_under_16. COPPA account-activation gate stays
    # keyed on client coppa_under_13 (literal under-13 only — not EU age-16).
    # EU under-16 may create accounts without signup parent email; AI enablement
    # uses settings['eu_ai_parental_consent'] after login.
    if !self.id
      country = LingoLinq::Jurisdiction.trusted_country(params['country'])
      self.settings['country'] = country if country
      under16_flag = params['under_16'] || params['under-16'] || params['under16']
      under_16 = [true, 'true', '1', 1].include?(under16_flag)
      eu_under_16 = !!(country && LingoLinq::Jurisdiction.eu?(country) && under_16)
      self.settings['registration'] = {
        'under_16' => under_16,
        'eu_under_16' => eu_under_16,
        'registered_at' => Time.now.utc.iso8601
      }
      # Compliance Kernel: persist birth month/year + jurisdiction declaration when
      # the flag is ON. Flag OFF ⇒ this block is skipped (byte-identical to prior).
      # Pass only a validated authored org id so segment classification cannot
      # stamp school/FERPA from an untrusted or unauthorized request param.
      if FeatureFlags.compliance_workflow_kernel_enabled?
        stamp_compliance_profile_from_params!(
          params,
          country: country,
          authored_organization_id: (org_authorized ? authoring_org.global_id : nil)
        )
      end
    end
    self.settings['referrer'] ||= params['referrer'] if params['referrer']
    self.settings['ad_referrer'] ||= params['ad_referrer'] if params['ad_referrer']
    if org_authorized
      self.settings['authored_organization_id'] = authoring_org.global_id
      self.settings['pending'] = false
      # Record the school-authorization basis explicitly so the school-official
      # exception is auditable (who authorized it, when, and on what basis) instead
      # of silently skipping COPPA with no record. The matching immutable AuditEvent
      # is emitted post-save in api/users#create (no global_id exists yet here).
      self.settings['school_authorization'] = {
        'basis' => 'school_official',
        'organization_id' => authoring_org.global_id,
        'authorized_by' => (non_user_params[:author] && non_user_params[:author].global_id),
        'authorized_at' => Time.now.utc.iso8601,
        'record_id' => SecureRandom.uuid
      }
    end
    if params['last_message_read']
      last_message_read = params['last_message_read'].to_i
      if last_message_read >= (self.settings['last_message_read'] || 0)
        self.settings['unread_messages'] = 0
        self.settings['last_message_read'] = last_message_read
      end
    end
    if params['last_alert_access']
      last_alert_access = params['last_alert_access'].to_i
      if last_alert_access >= (self.settings['last_alert_access'] || 0)
        self.settings['unread_alerts'] = 0
        self.settings['last_alert_access'] = last_alert_access
      end
    end
    if params['focus_words'] && self.id
      extra = UserExtra.find_or_create_by(user: self)
      extra.process_focus_words(params['focus_words'])
    end
    if params['read_notifications']
      self.settings['user_notifications_cutoff'] = Time.now.utc.iso8601
    end
    self.settings['preferences'] ||= {}
    if !non_user_params['updater'] || non_user_params['updater'].global_id != self.global_id
      if params['preferences']
        params['preferences'].delete('private_logging') 
        params['preferences'].delete('logging_cutoff') 
        params['preferences'].delete('logging_preferences') 
        params['preferences'].delete('logging_code') 
      end
      params.delete('valet_login')
    end
    # Coerce valet_login through process_boolean. The client serializes this
    # boolean attribute as a STRING ('true'/'false'), and a bare `if
    # params['valet_login']` treats the non-empty string 'false' as truthy --
    # which wrongly ENABLED valet mode (assert_valet_mode! + a random valet
    # password) on every profile save. With valet mode on, the subsequent
    # valid_password? check compares the user's real password against the valet
    # secret, so self-service password changes always failed with "incorrect
    # current password". Only an explicitly-absent (nil) value is a no-op.
    unless params['valet_login'].nil?
      if process_boolean(params['valet_login'])
        self.set_valet_password(params['valet_password'])
        self.settings['valet_long_term'] = process_boolean(params['valet_long_term']) if params['valet_long_term'] != nil
        self.settings['valet_prevent_disable'] = process_boolean(params['valet_prevent_disable']) if params['valet_prevent_disable'] != nil
      else
        self.set_valet_password(false)
      end
    end
    if params['preferences']
      CONFIRMATION_PREFERENCE_PARAMS.each do |key|
        if params['preferences'][key] != self.settings['preferences'][key]
          self.settings['confirmation_log'] ||= []
          self.settings['confirmation_log'] << {
            'updater' => (non_user_params['updater'] ? non_user_params['updater'].global_id : PaperTrail.request.whodunnit),
            'setting' => key,
            'timestamp' => Time.now.utc.iso8601
          }
          if self.id && key == 'cookies' && params['preferences'] && !params['preferences']['cookies'].nil?
            old_enabled = self.settings['preferences']['cookies'].nil? || process_boolean(self.settings['preferences']['cookies'])
            @opt_out = 'disabled' if !process_boolean(params['preferences']['cookies']) && old_enabled
          end
        end
      end
      if params['preferences']['extend_eval']
        self.extend_eval(params['preferences']['extend_eval'], non_user_params[:author])
      end
      if params['preferences']['eval']
        self.settings['eval_reset'] ||= {}
        self.settings['eval_reset']['email'] = params['preferences']['eval']['email']
        self.settings['eval_reset']['home_board']  = params['preferences']['eval']['home_board']
        self.settings['eval_reset']['password'] = GoSecure.generate_password(params['preferences']['eval']['password']) if params['preferences']['eval']['password']
        self.settings['eval_reset']['duration'] = params['preferences']['eval']['duration'].to_i
        self.settings['eval_reset']['duration'] = nil if self.settings['eval_reset']['duration'] == 0
      end
    end
    inflections_were_set = self.settings['preferences']['activation_location'] == 'swipe' || self.settings['preferences']['inflections_overlay']
    params['preferences'].delete('logging_code') if params['preferences'] && params['preferences'] == ''
    # Beta program access is staff-controlled only (console or admin API); never self-service via prefs API.
    if params['preferences'] && !(non_user_params['updater'] && non_user_params['updater'].admin?)
      params['preferences'].delete('beta_program_access')
    end
    PREFERENCE_PARAMS.each do |attr|
      if params['preferences'] && params['preferences'][attr] != nil
        val = params['preferences'][attr]
        # Form-encoded requests send booleans as strings ("true"/"false").
        # Convert them back to actual booleans.
        val = true if val == 'true'
        val = false if val == 'false'
        # AI preference keys are consent-bearing and accept ONLY recognizable
        # booleans. Anything else (notably "") is dropped rather than stored, so
        # a malformed write can neither create the un-clearable blank state that
        # blocked board generation in production nor be read as an opt-in.
        if EU_AI_PREF_KEYS.include?(attr)
          normalized = User.normalize_ai_preference_value(val)
          next if normalized.nil?
          val = normalized
        end
        self.settings['preferences'][attr] = val
      end
    end
    # EU under-16 without active AI parental consent: default AI prefs off on
    # create, and silently force false if the client tries to enable any.
    # Also never allow product-improvement / telemetry opt-in for EU under-16.
    product_improvement_keys = %w[cookies telemetry_opt_in comms_log_opt_in]
    if self.new_record? && eu_under_16?
      EU_AI_PREF_KEYS.each { |k| self.settings['preferences'][k] = false }
      product_improvement_keys.each { |k| self.settings['preferences'][k] = false }
    end
    if eu_under_16? && !eu_ai_parental_consent_active?
      EU_AI_PREF_KEYS.each { |k| self.settings['preferences'][k] = false }
    end
    if eu_under_16?
      product_improvement_keys.each { |k| self.settings['preferences'][k] = false }
    end
    # The dashboard_* preferences are stored verbatim above but drive the home
    # grid's computed inline styles and CSS class names, so coerce each to a safe
    # shape against the known section-key whitelist. Invalid values are dropped so
    # they fall back to client defaults (matching the frontend's own fallback),
    # rather than persisting arbitrary client-supplied JSON.
    sanitize_dashboard_preferences! if params['preferences']
    # Boards-page arrangement is a separate concern from the dashboard grid, so it
    # gets its own sanitizer rather than widening the dashboard one.
    sanitize_boards_layout_preference! if params['preferences']
    sanitize_board_category_grouping! if params['preferences']
    # On INITIAL registration only, derive preferences.role from the
    # picked registration_type so the canonical app-wide gate
    # (preferences.role == 'supporter' → frontend `supporter_role`)
    # actually reflects what the user told us at signup. Without this
    # mapping the role defaults to 'communicator' for everyone
    # regardless of pick — a real product gap because supporters
    # then run in communicator-shaped UI until they manually flip
    # Account View in /<user>/preferences.
    #
    # Gated on `new_record?` so users who later switch their Account
    # View aren't overwritten back on subsequent edits to other
    # preferences (e.g. updating their cookies setting).
    #
    # Values not in either list (`eval`, `manually-added-org-user`,
    # `individual`, etc.) leave preferences.role at its default
    # ('communicator' — set in User.preference_defaults['authenticated_user']).
    # Rationale: those values describe non-self-service or
    # device-account contexts where the role is configured later
    # by an admin or the per-device override.
    if self.new_record? && self.settings['preferences'] &&
       self.settings['preferences']['registration_type'].present?
      rt = self.settings['preferences']['registration_type']
      if rt == 'communicator'
        self.settings['preferences']['role'] = 'communicator'
      elsif ['therapist', 'parent', 'teacher', 'other',
             'manually-added-supervisor'].include?(rt)
        self.settings['preferences']['role'] = 'supporter'
      end
    end
    if params['preferences'] && !params['preferences']['cookies'].nil?
      # EU under-16: cookies / product-improvement opt-in stay off (set earlier too).
      self.settings['preferences']['cookies'] = eu_under_16? ? false : process_boolean(params['preferences']['cookies'])
    end
    if params['preferences']
      self.settings['preferences']['clear_vocalization_history'] = process_boolean(params['preferences']['clear_vocalization_history']) if params['preferences'] && params['preferences']['clear_vocalization_history'] != nil
      if self.settings['preferences']['clear_vocalization_history']
        self.settings['preferences']['clear_vocalization_history_minutes'] = params['preferences']['clear_vocalization_history_minutes'].to_i if params['preferences']['clear_vocalization_history_minutes']
        self.settings['preferences']['clear_vocalization_history_count'] = params['preferences']['clear_vocalization_history_count'].to_i if params['preferences']['clear_vocalization_history_count']
      end

      research_prefs = {}
      RESEARCH_PREFERENCE_PARAMS.each do |key|
        if !params['preferences'][key].blank?
          research_prefs[key.sub(/^research_/, '')] = params['preferences'][key]
          params['preferences'].delete(key)
        end
      end
      if research_prefs.keys.length > 0 && self.global_id && self.settings['preferences']['allow_log_reports'] && self.communicator_role?
        stash = JobStash.create(data: {'user_id' => self.global_id, 'details' => research_prefs})
        Webhook.schedule(:update_external_prefs, stash.global_id)
      end
    end

    if params['preferences'] && (params['preferences']['logging_code'] == false || params['preferences']['logging_code'] == 'false')
      self.settings['preferences'].delete('logging_code')
    end
    if self.settings['preferences']['logging_cutoff'].is_a?(String)
      if self.settings['preferences']['logging_cutoff'] == 'none' || self.settings['preferences']['logging_cutoff'] == 'false'
        self.settings['preferences'].delete('logging_cutoff')
      else
        self.settings['preferences']['logging_cutoff'] = self.settings['preferences']['logging_cutoff'].to_i
      end
    end
    if self.settings['preferences']['inflections_overlay']
      self.settings['preferences'].delete('long_press_edit')
    end
    if self.id && (self.settings['preferences']['activation_location'] == 'swipe' || self.settings['preferences']['inflections_overlay']) && !inflections_were_set
      self.schedule(:update_home_board_inflections)
    end
    if self.settings['preferences']['external_links']
      self.settings['preferences'].delete('confirm_external_links')
    end
    if params['offline_actions']
      params['offline_actions'].each do |action|
        # Defensive: the client-built offline_actions queue is meant to be an array
        # of hashes, but a corrupt/stale entry (e.g. an array) would make the
        # action['action'] read below raise "no implicit conversion of String into
        # Integer" and 500 the whole update — which then never clears the queue, so
        # the bad entry re-sends and fails on every save (a stuck poison-pill). Skip
        # anything that isn't a hash so one malformed entry can't wedge saves.
        next unless action.is_a?(Hash)
        if action['action'] == 'add_vocalization'
          self.settings['vocalizations'] ||= []
          action['id'] = nil if self.settings['vocalizations'].find{|v| v['id'] == action['id'] }
          cat = action['category'] || 'default'
          categories = (self.settings['preferences']['phrase_categories'] || [])
          cat = 'default' if !categories.include?(cat) && cat != 'default' && cat != 'journal'
          id = action['id'] || (rand(999).to_s + (Time.now.to_i % 1000).to_s + self.settings['vocalizations'].length.to_s)
          if cat == 'journal'
            LogSession.process_as_follow_on({
              'type' => 'journal',
              'vocalization' => action['value'],
              'category' => cat,
              'ts' => action['ts'] || Time.now.to_i,
              'id' => id
            }, {'user' => self, 'author' => non_user_params['updater'] || self, 'device' => non_user_params['device'] || self.devices.first}.with_indifferent_access)
          end
      
          self.settings['vocalizations'].unshift({
            'list' => action['value'],
            'category' => cat,
            'ts' => action['ts'] || Time.now.to_i,
            'id' => id
          })
          journal_cutoff = 2.weeks.ago
          self.settings['vocalizations'] = self.settings['vocalizations'].select{|v| v['category'] != 'journal' || (v['ts'] && v['ts'] > journal_cutoff.to_i) || v['id'] == id }
        elsif action['action'] == 'reorder_vocalizations'
          new_list = []
          journal_cutoff = 2.weeks.ago
          list = (self.settings['vocalizations'] || []).select{|v| v['category'] != 'journal' || (v['ts'] && v['ts'] > journal_cutoff.to_i) || v['id'] == id }
          action['value'].split(',').each do |id|
            item = list.find{|v| v['id'] == id }
            if item
              list -= [item]
              new_list << item
            end
          end
          new_list += list
          self.settings['vocalizations'] = new_list
        elsif action['action'] == 'remove_vocalization'
          self.settings['vocalizations'] = (self.settings['vocalizations'] || []).select{|v| v['id'] != action['value']}
        elsif action['action'] == 'add_contact'
          self.settings['contacts'] ||= []
          if action['value'] && action['value']['contact']
            hash = nil
            while !hash || self.settings['contacts'].detect{|c| c['hash'] == hash}
              hash = GoSecure.nonce('contact_hash')[0, 8]
            end
            contact_type = action['value']['contact'].match(/\@/) ? 'email' : 'sms'
            image_url = action['value']['image_url']
            if !image_url
              bucket = ENV['STATIC_S3_BUCKET'] || "lingolinq"
              id = hash.hex.to_i
              image_url = "https://#{bucket}.s3.amazonaws.com/avatars/avatar-#{id % 10}.png"
            end
            action['value']['contact'].strip!
            ref = action['value']['contact'].strip.downcase
            ref = ref.gsub(/[^\d\+\,]/, '') if contact_type == 'sms'
            existing = self.settings['contacts'].find{|c| c['ref'] == ref }
            if existing
              existing['email'] = contact_type == 'email' && action['value']['contact']
              existing['cell_phone'] = contact_type == 'sms' && action['value']['contact']
              existing['name'] = action['value']['name']
              existing['image_url'] = image_url
            else
              self.settings['contacts'] << {
                'contact_type' => contact_type,
                'email' => contact_type == 'email' && action['value']['contact'],
                'hash' => hash,
                'ref' => ref,
                'cell_phone' => contact_type == 'sms' && action['value']['contact'],
                'name' => action['value']['name'],
                'image_url' => image_url
              }
            end
          end
        elsif action['action'] == 'remove_contact'
          self.settings['contacts'] ||= []
          self.settings['contacts'] = self.settings['contacts'].select{|c| c['hash'] != action['value'] }
        end
      end
    end
    if params['preferences'] && !params['preferences']['cookies'].nil? && process_boolean(params['preferences']['cookies'])
      self.settings['preferences']['protected_user'] = false
    end
    self.settings['preferences']['stretch_buttons'] = nil if self.settings['preferences']['stretch_buttons'] == 'none'
    self.settings['preferences']['progress'] ||= {}
    if params['preferences'] && params['preferences']['progress']
      PROGRESS_PARAMS.each do |attr|
        self.settings['preferences']['progress'][attr] = params['preferences']['progress'][attr] if params['preferences']['progress'][attr]
      end
      if self.settings['preferences']['progress']['board_intros']
        self.settings['preferences']['progress']['board_intros'] = self.settings['preferences']['progress']['board_intros'].uniq
      end
    end
    if params['preferences'] && params['preferences']['requested_phrase_changes']
      (params['preferences']['requested_phrase_changes'] || []).each do |change|
        pieces = (change || "").to_s.split(/:/, 2)
        self.settings['preferences']['requested_phrases'] ||= []
        if pieces[0] == 'add'
          self.settings['preferences']['requested_phrases'] += [pieces[1]]
        elsif pieces[0] == 'remove'
          self.settings['preferences']['requested_phrases'] -= [pieces[1]]
        end
        self.settings['preferences']['requested_phrases'].uniq!
      end
    end
    
    @do_track_boards = true
    process_sidebar_boards(params['preferences']['sidebar_boards'], non_user_params) if params['preferences'] && params['preferences']['sidebar_boards']
    process_home_board(params['preferences']['home_board'], non_user_params) if params['preferences'] && params['preferences']['home_board'] && params['preferences']['home_board']['id']
    process_device(params['preferences']['device'], non_user_params) if params['preferences'] && params['preferences']['device']
    
    if non_user_params['premium_until']
      self.clear_existing_subscription
      if non_user_params['premium_until'] == 'forever'
        self.settings['subscription']['never_expires'] = true
        self.expires_at = nil
      end
    end
    
    if params['supervisee_code'].present?
      if !self.id
        add_processing_error("can't modify supervisees on create") 
        return false
      end
      # Try to link supervisee, but don't fail the entire update if it fails
      # This can happen if:
      # - Code is expired (older than 6 hours)
      # - Code references a deleted user
      # - User doesn't have premium/grace period
      # - Code format is invalid
      # - Stale code from previous session
      begin
        if self.link_to_supervisee_by_code(params['supervisee_code'])
          # Successfully linked
        else
          # Linking failed - log but don't block the update
          # This is likely a stale code from a previous session or deleted user
          code_parts = params['supervisee_code'].to_s.split(/-/, 3)
          if code_parts.length == 3
            begin
              timestamp = code_parts[2].to_i
              if timestamp > 0 && Time.at(timestamp) <= 6.hours.ago
                Rails.logger.debug("Expired supervisee_code skipped for user #{self.global_id}")
              else
                Rails.logger.warn("Supervisee link failed for user #{self.global_id} (code invalid, or target user may not exist or lack premium)")
              end
            rescue => e
              Rails.logger.warn("Invalid supervisee_code format for user #{self.global_id}")
            end
          else
            Rails.logger.warn("Invalid supervisee_code format for user #{self.global_id}")
          end
          # Don't fail the update - just skip the supervisee linking
        end
      rescue => e
        # If anything goes wrong, log it but don't fail the update
        Rails.logger.error("Error processing supervisee_code for user #{self.global_id}: #{e.message}")
      end
    end
    if params['supervisor_key'].present?
      if !self.id
        add_processing_error("can't modify supervisors on create") 
        return false
      end
      # Try to process supervisor_key, but don't fail the entire update if it fails
      # This can happen if the key is invalid, references a deleted user, etc.
      begin
        unless self.process_supervisor_key(params['supervisor_key'])
          # Processing failed - log but don't block the update
          # This is likely a stale key from a previous session or deleted user
          Rails.logger.warn("Supervisor key processing failed for user #{self.global_id} (key invalid, or references a deleted/ineligible user)")
          # Don't fail the update - just skip the supervisor key processing
        end
      rescue => e
        # If anything goes wrong, log it but don't fail the update
        Rails.logger.error("Error processing supervisor_key for user #{self.global_id}: #{e.message}")
      end
    end
    
    self.settings['pending'] = non_user_params[:pending] if self.settings['pending'] != false && non_user_params[:pending] != nil
    self.settings['public'] = !!params['public'] if params['public'] != nil
    self.settings['admin'] = !!non_user_params['admin'] if non_user_params['admin'] != nil
    if params['password'] && params['password'] != ""
      if !self.settings['password'] || valid_password?(params['old_password']) || non_user_params[:allow_password_change]
        @password_changed = !!self.settings['password']
        # Remember whether this was a self-service change (old password verified)
        # vs. a forced change without the old password (admin reset / forgot-password
        # token). Recorded in the audit trail by notify_of_changes (LL-747bb0e02d).
        @password_change_self_service = @password_changed && !non_user_params[:allow_password_change]
        self.generate_password(params['password'])
      else
        add_processing_error("incorrect current password")
        return false
      end
    end
    new_user_name = nil
    new_user_name = self.generate_user_name(non_user_params[:user_name], false) if non_user_params[:user_name]
    if !self.user_name
      new_user_name = self.generate_user_name(params['user_name'], false) if params['user_name'] && params['user_name'].length > 0
    end
    if new_user_name
      self.user_name = new_user_name.downcase
      self.settings['display_user_name'] = new_user_name
    end
    true
  end

  # Coerce the user-supplied home-dashboard preferences into safe shapes. These
  # five prefs drive the home grid's computed inline `grid-template-*` styles and
  # CSS class names (see app/frontend/app/utils/dashboard_sections.js and
  # components/dashboard/authenticated-view.js), so we constrain them to the known
  # section-key whitelist on write. Unknown/garbage values are dropped, which
  # makes the client fall back to its defaults — matching the frontend's own
  # fallback behavior — instead of persisting arbitrary client JSON.
  # Boards-page arrangement ('side-by-side' | 'top-down'). The stored value is echoed
  # back to the client and drives a `data-boards-layout` attribute on <body>, so it is
  # constrained to the two known variants on write — an unknown value is DROPPED rather
  # than persisted, which makes the client fall back to its own default (SIDE_BY_SIDE),
  # matching how dashboard_layout behaves.
  BOARDS_LAYOUT_VALUES = ['side-by-side', 'top-down']
  # Mirrors app/frontend/app/utils/board_categories.js BOARD_CATEGORIES. Kept as a
  # constant here so the SERVER, not the client, decides what may be stored.
  # MUST stay in step with BOARD_CATEGORIES in
  # app/frontend/app/utils/board_categories.js — `order` is filtered against this list,
  # so a category the client knows about but this array does not is silently dropped
  # from the user's saved order.
  BOARD_CATEGORY_KEYS = ['people', 'actions', 'describe', 'how_when', 'places',
                         'questions', 'social', 'no_not', 'words', 'controls',
                         'extra', 'things', 'keyboard']

  # `board_category_grouping` is a nested hash written verbatim by the PREFERENCE_PARAMS
  # loop, which coerces only TOP-LEVEL values — so its members were entirely unvalidated:
  #   * a form-encoded `enabled=false` stored the STRING "false", which every consumer
  #     read as truthy (they test `=== true` now, so a string reads as off — but storing
  #     a string at all is a bug, and the opposite coercion would have flipped it ON);
  #   * `order` and any extra keys were stored unbounded, then echoed back on every user
  #     load and in every sync payload for that user and their supervisors.
  # Constrain the shape on write, the same way boards_layout is.
  def sanitize_board_category_grouping!
    prefs = self.settings['preferences']
    return unless prefs.is_a?(Hash)
    return unless prefs.has_key?('board_category_grouping')
    val = prefs['board_category_grouping']
    unless val.is_a?(Hash)
      prefs.delete('board_category_grouping')
      return
    end
    enabled = val['enabled']
    order = val['order']
    order = [] unless order.is_a?(Array)
    truthy = ->(v) { [true, 'true', 1, '1'].include?(v) }
    # This method REBUILDS the hash from scratch, so any key not listed here is
    # discarded — silently, and server-side, which makes it an easy trap. Every
    # sub-preference of board_category_grouping must be echoed below or it will appear
    # to save on the client and be gone on the next read.
    #
    # `show_category_names` / `vertical_scroll` default to TRUE when ABSENT (rather than
    # coercing a missing key to false) because both describe what the grouped board
    # already does. An existing user whose stored hash predates these keys must keep
    # today's rendering, not lose their category headers and scrolling on next save.
    entry = lambda { |v|
      v = {} unless v.is_a?(Hash)
      ord = v['order']
      ord = [] unless ord.is_a?(Array)
      {
        'enabled' => truthy.call(v['enabled']),
        # Known keys only, de-duplicated, and bounded by the registry itself.
        'order' => ord.select { |k| BOARD_CATEGORY_KEYS.include?(k) }.uniq,
        'show_category_names' => v.has_key?('show_category_names') ? truthy.call(v['show_category_names']) : true,
        'vertical_scroll' => v.has_key?('vertical_scroll') ? truthy.call(v['vertical_scroll']) : true
      }
    }

    # PER-BOARD overrides. The top-level keys stay the user's default, used by any board
    # with no entry of its own; `boards` maps a board to a full settings hash in the same
    # shape. Sanitized with the SAME lambda so an override cannot smuggle in a key or a
    # category the top level would have rejected.
    #
    # This map has to be echoed here for the same reason every other sub-key does: this
    # method REBUILDS the hash, so anything not listed is discarded silently, server-side.
    #
    # KEYED BY BOARD KEY (`username/board-slug`), not by global_id. A global_id is stable
    # only within one database: the same board seeded on local, staging and production
    # gets a different id in each, so an id-keyed override silently stopped applying the
    # moment it crossed environments — there was no way to ship a curated per-board
    # arrangement with the board it belongs to. A board key survives that, because the
    # seed produces the same slug everywhere.
    #
    # The id shape is STILL ACCEPTED, because entries written before this change are
    # already stored that way and the frontend resolver still falls back to them (see
    # controllers/user/board-detail.js#board_category_settings). Dropping them here would
    # wipe a live preference on the user's next save of any unrelated setting.
    #
    # Bounded on both axes — shape and count — because it is client-supplied and otherwise
    # grows without limit. The length cap is 128 rather than 64 to fit a real key: the
    # longest in the seeded library run to ~50 characters, and a copy adds a `_<n>` suffix.
    boards = val['boards']
    boards = {} unless boards.is_a?(Hash)
    clean_boards = {}
    board_ref = /\A[0-9A-Za-z_\-]+(\/[0-9A-Za-z_\-]+)?\z/
    boards.each do |bid, bval|
      break if clean_boards.size >= 500
      next unless bid.is_a?(String) && bid.length <= 128 && bid.match(board_ref)
      next unless bval.is_a?(Hash)
      clean_boards[bid] = entry.call(bval)
    end

    prefs['board_category_grouping'] = entry.call(
      val.merge('enabled' => enabled, 'order' => order)
    ).merge('boards' => clean_boards)
  end

  def sanitize_boards_layout_preference!
    prefs = self.settings['preferences']
    return unless prefs.is_a?(Hash)
    if prefs.has_key?('boards_layout') && !BOARDS_LAYOUT_VALUES.include?(prefs['boards_layout'])
      prefs.delete('boards_layout')
    end
  end

  def sanitize_dashboard_preferences!
    prefs = self.settings['preferences']
    return unless prefs.is_a?(Hash)
    valid_keys = DASHBOARD_SECTION_KEYS

    # dashboard_layout: a single known variant, else fall back to default.
    if prefs.has_key?('dashboard_layout') && !['gentle', 'focused'].include?(prefs['dashboard_layout'])
      prefs.delete('dashboard_layout')
    end

    # dashboard_sections: { known_key => boolean }.
    if prefs.has_key?('dashboard_sections')
      src = prefs['dashboard_sections']
      if src.is_a?(Hash)
        clean = {}
        src.each do |k, v|
          next unless valid_keys.include?(k)
          clean[k] = (v == true || v == 'true')
        end
        prefs['dashboard_sections'] = clean
      else
        prefs.delete('dashboard_sections')
      end
    end

    # dashboard_order: ordered array of known keys, de-duplicated.
    if prefs.has_key?('dashboard_order')
      src = prefs['dashboard_order']
      if src.is_a?(Array)
        prefs['dashboard_order'] = src.select { |k| valid_keys.include?(k) }.uniq
      else
        prefs.delete('dashboard_order')
      end
    end

    # dashboard_positions: { known_key => known_key }.
    if prefs.has_key?('dashboard_positions')
      src = prefs['dashboard_positions']
      if src.is_a?(Hash)
        clean = {}
        src.each do |k, v|
          clean[k] = v if valid_keys.include?(k) && valid_keys.include?(v)
        end
        prefs['dashboard_positions'] = clean
      else
        prefs.delete('dashboard_positions')
      end
    end

    # dashboard_boards: only { 'side' => <string>, 'raised' => <boolean> }.
    if prefs.has_key?('dashboard_boards')
      src = prefs['dashboard_boards']
      if src.is_a?(Hash)
        clean = {}
        clean['side'] = src['side'].to_s if src['side'].is_a?(String)
        clean['raised'] = (src['raised'] == true || src['raised'] == 'true') if src.has_key?('raised')
        prefs['dashboard_boards'] = clean
      else
        prefs.delete('dashboard_boards')
      end
    end
  end

  def private_logging?
    !!(self.settings && self.settings['preferences'] && self.settings['preferences']['private_logging'])
  end

  def logging_cutoff_for(user, code)
    if self.settings['preferences']['logging_cutoff']
      if self.settings['preferences']['logging_code'] && code == self.settings['preferences']['logging_code']
        return  nil
      elsif self.settings['preferences']['logging_permissions'] && self.settings['preferences']['logging_permissions'][user.global_id]
        # options for manually granting temporary access, or longer-term access to specific supervisors
        exp = self.settings['preferences']['logging_permissions'][user.global_id]['expires']
        if exp
          if exp > Time.now.to_i
            return self.settings['preferences']['logging_permissions'][user.global_id]['cutoff']
          else
            self.settings['preferences']['logging_cutoff']
          end
        else
          return self.settings['preferences']['logging_permissions'][user.global_id]['cutoff']
        end
      else
        self.settings['preferences']['logging_cutoff']
      end
    else
      nil
    end
  end

  # Org data policy floor enforcement.
  # Returns the org's effective data policy, or empty hash if no org.
  # Memoized per instance to avoid repeated DB lookups during a single
  # request (LogSession save calls this multiple times).
  def effective_data_policy
    @effective_data_policy ||= begin
      org = self.managing_organization
      org ? org.effective_data_policy : {}
    end
  end

  def clear_effective_data_policy_cache
    @effective_data_policy = nil
  end

  def effective_logging_allowed?
    policy = effective_data_policy
    return false if policy['logging_allowed'] == false
    !!(self.settings && self.settings['preferences'] && self.settings['preferences']['logging'])
  end

  def effective_geo_logging_allowed?
    policy = effective_data_policy
    return false if policy['geo_logging_allowed'] == false
    !!(self.settings && self.settings['preferences'] && self.settings['preferences']['geo_logging'])
  end

  def effective_log_reports_allowed?
    policy = effective_data_policy
    return false if policy['log_reports_allowed'] == false
    !!(self.settings && self.settings['preferences'] && self.settings['preferences']['allow_log_reports'])
  end

  def effective_log_publishing_allowed?
    policy = effective_data_policy
    return false if policy['log_publishing_allowed'] == false
    !!(self.settings && self.settings['preferences'] && self.settings['preferences']['allow_log_publishing'])
  end

  def effective_logging_cutoff_for(user, code)
    base_cutoff = logging_cutoff_for(user, code)
    policy = effective_data_policy
    max_hours = policy['max_logging_cutoff_hours']
    return base_cutoff unless max_hours
    if base_cutoff.nil?
      max_hours
    else
      [base_cutoff, max_hours].min
    end
  end

  def update_home_board_inflections
    board = Board.find_by_path(self.settings['preferences']['home_board']['id']) if self.settings['preferences'] && self.settings['preferences']['home_board']
    if board
      board.schedule(:check_for_parts_of_speech_and_inflections, true)
      Board.find_all_by_global_id(board.settings['downstream_board_ids'] || []).each do |brd|
        brd.schedule(:check_for_parts_of_speech_and_inflections, true)
      end
    end
    ((self.settings['preferences'] || {})['sidebar_boards'] || []).each do |brd|
      board = Board.find_by_path(brd['key'])
      board.schedule(:check_for_parts_of_speech_and_inflections, true) if board
    end
  end

  def lookup_contact(user_id)
    return nil unless user_id
    a, b = user_id.split(/x/)
    contact = b || a
    res = (self.settings['contacts'] || []).detect{|c| c && c['hash'] == contact}
    res['id'] = "#{self.global_id}x#{res['hash']}" if res
    res
  end
  
  def display_user_name
    (self.settings && self.settings['display_user_name']) || self.user_name
  end

  def obfuscated_name
    name = display_user_name
    return name if name.length < 3
    
    parts = name.split(/\s+/)
    if parts.length > 1
      # "John Doe" -> "J. Doe" or "John D."
      # Let's do "John D."
      "#{parts[0]} #{parts[-1][0]}."
    else
      # "johndoe" -> "j...e"
      "#{name[0]}...#{name[-1]}"
    end
  end
  
  def process_device(device, non_user_params)
    device_key = (non_user_params['device'] && non_user_params['device'].unique_device_key) || 'default'    
    if device
      self.settings['preferences']['devices'] ||= {}
      # Since 'browser' is a single device, it's possible that the voice_uri set for one
      # computer won't match the voice_uri needed for a different computer. So this keeps
      # a list of recent voice_uris and the client just uses the most recent one.
      voice_uris = ((self.settings['preferences']['devices'][device_key] || {})['voice'] || {})['voice_uris'] || []
      if device['voice'] && device['voice']['voice_uri']
        voice_uris = [device['voice']['voice_uri']] + voice_uris
        device['voice']['voice_uris'] = voice_uris.uniq[0, 10]
        device['voice'].delete('voice_uri')
      end
      if non_user_params['device'] && device['long_token'] != nil
        non_user_params['device'].settings['long_token'] = !!device['long_token']
        non_user_params['device'].settings['long_token_set'] = true
        if device['asserted']
          non_user_params['device'].settings.delete('temporary_device')
          # Eval accounts are only allowed to be logged into one device at a time
          # so invalidate all other app logins when one is asserted
          # (not when logging in on a browser, just in an app)
          if self.eval_account? && non_user_params['device'].token_type == :app
            other_devices = Device.where(user_id: self.id, developer_key_id: 0).select{|d| d.token_type == :app && d != non_user_params['device'] }
            other_devices.each{|d| d.invalidate_keys! }
          end
        end
        non_user_params['device'].save
      end
      device['voice']['voice_uris'].uniq! if device['voice'] && device['voice']['voice_uris']
      device['alternate_voice']['voice_uris'].uniq! if device['alternate_voice'] && device['alternate_voice']['voice_uris']

      # For eye gaze users we will auto-enable the status so they can see eye status
      if device['dwell'] && !device['dwell_type']
        device['dwell_type'] = 'eyegaze'
      end
      if device['dwell'] && device['dwell_type'] == 'eyegaze'
        self.settings['preferences']['blank_status'] = true
      end

      self.settings['preferences']['devices'][device_key] ||= {}
      # Form-encoded requests send booleans as strings ("true"/"false").
      # Convert them back to actual booleans so the frontend (where "false"
      # is truthy in JavaScript) reads the correct value.
      device.each do |key, val|
          val = true if val == 'true'
          val = false if val == 'false'
          self.settings['preferences']['devices'][device_key][key] = val
      end
      # When no specific device was provided (supervisor editing another user),
      # propagate device preferences to all existing device keys so the value
      # is found regardless of which device the user reads from
      if !non_user_params['device']
        self.settings['preferences']['devices'].each do |existing_key, hash|
          next if existing_key == device_key
          device.each do |key, val|
            next if key == 'name' || key == 'id' || key == 'long_token'
            val = true if val == 'true'
            val = false if val == 'false'
            self.settings['preferences']['devices'][existing_key][key] = val
          end
        end
      end
    end
  end

  def copy_board_to_library(library_board, updater_id, symbol_library=nil)
    original = library_board && Board.find_by_path(library_board['id'])
    updater = User.find_by_path(updater_id)
    return false unless original && updater

    existing = self.boards.where(parent_board: original).order('id DESC').first
    if existing && ((existing.settings['swapped_library'] || 'original') == (symbol_library || 'original'))
      return true
    end

    new_board = original.copy_for(self, copier: updater)
    self.copy_board_links(
      old_board_id: original.global_id,
      new_board_id: new_board.global_id,
      ids_to_copy: [],
      auth_user: updater,
      user_for_paper_trail: "user:#{updater.global_id}",
      copier_id: updater.global_id,
      swap_library: symbol_library
    )
    true
  end

  def copy_to_home_board(home_board, updater_id, symbol_library)
    original = home_board && Board.find_by_path(home_board['id'])
    updater = User.find_by_path(updater_id)
    return unless original
    # First, if the user already has a copy as their home board, then stop
    current_home = self.settings['preferences']['home_board'] && Board.find_by_path(self.settings['preferences']['home_board']['id'])
    if current_home && current_home.parent_board == original && ((current_home.settings['swapped_library'] || 'original') == (symbol_library || 'original'))
      return true
    elsif current_home && current_home.global_id(true) == original.global_id
      return true
    end
    # Second, if the user already has a copy not as their home bord, then set that
    home = self.boards.where(parent_board: original).order('id DESC').first
    if home && ((home.settings['swapped_library'] || 'original') == (symbol_library || 'original'))
      self.settings['preferences']['home_board'] = {
        'id' => home.global_id,
        'key' => home.key
      }
      self.settings['preferences']['home_board']['locale'] = home_board['locale'] || home.settings['locale']
      self.settings['preferences']['home_board']['level'] = home_board['level'] if home_board['level']
      self.save
      self.schedule_audit_protected_sources
      return true
    end
    # Finally, create a brand new copy (or shallow clone)
    if home_board['shallow'] && (original.public? || original.allows?(updater, 'edit'))
      if !original.public?
        # TODO: seems like if any sub-boards aren't public then it should be shared as well
        original.share_with(self, true)
        if self.settings['available_private_board_ids']
          self.settings['available_private_board_ids']['generated'] = 0
          self.save
        end
        self.update_available_boards
      end
      # Shallow clone home boards should be remembered even if no longer set as home
      ue = UserExtra.find_or_create_by(user: self)
      ue.settings['replaced_roots'] ||= {}
      ue.settings['replaced_roots'][original.global_id(true)] = {
        'id' => "#{original.global_id(true)}-#{self.global_id}",
        'key' => "#{self.user_name}/my:#{original.key.sub(/\//, ':')}"
      }
      ue.save
      new_home = Board.find_by_global_id("#{original.global_id}-#{self.global_id}")
    else
      new_home = original.copy_for(self)
      self.copy_board_links(old_board_id: original.global_id, new_board_id: new_home.global_id, ids_to_copy: [], auth_user: updater, user_for_paper_trail: "user:#{updater.global_id}", copier_id: updater.global_id, swap_library: symbol_library)
    end
    self.settings['preferences']['home_board'] = {
      'id' => new_home.global_id,
      'key' => new_home.key
    }
    self.settings['preferences']['home_board']['locale'] = home_board['locale'] || new_home.settings['locale']
    self.settings['preferences']['home_board']['level'] = home_board['level'] if home_board['level']
    self.save
    self.schedule_audit_protected_sources
    return true
  end

  def schedule_audit_protected_sources
    ra_cnt = RemoteAction.where(path: "#{self.global_id}", action: 'audit_protected_sources').count
    RemoteAction.create(path: "#{self.global_id}", act_at: 10.minutes.from_now, action: 'audit_protected_sources') if ra_cnt == 0
  end
  
  def process_home_board(home_board, non_user_params)
    board = home_board && Board.find_by_path(home_board['id'])
    board_updater = non_user_params['updater']
    if home_board['copy'] && home_board['copy_from_org'] && board
      org = Organization.find_by_global_id(home_board['copy_from_org'])
      if org && non_user_params['updater']
        if Organization.attached_orgs(non_user_params['updater']).map{|o| o['id'] }.include?(org.global_id)
          non_user_params['org'] = org
          board_updater = board.user
        end
      end
    end
    # When the referenced board doesn't exist (deleted/invalid), clear the invalid home_board ref
    if home_board['id'] && !board
      json = (self.settings['preferences']['home_board'] || {}).slice('id', 'key').to_json
      self.settings['preferences'].delete('home_board')
      if (self.settings['preferences']['home_board'] || {}).slice('id', 'key').to_json != json
        notify('home_board_changed')
        self.schedule_audit_protected_sources
        self.schedule(:update_home_board_inflections)
      end
      return true
    end
    json = (self.settings['preferences']['home_board'] || {}).slice('id', 'key').to_json
    org_allowed_board = non_user_params['org'] && board && (non_user_params['org'].home_board_keys || []).include?(board.key)
    if board && board.allows?(self, 'view') && !home_board['copy']
      self.settings['preferences']['home_board'] = {
        'id' => board.global_id,
        'key' => board.key
      }
      self.settings['preferences']['home_board']['locale'] = home_board['locale'] || board.settings['locale']
      self.settings['preferences']['home_board']['level'] = home_board['level'] if home_board['level']
    elsif board && non_user_params['updater'] && (org_allowed_board || board.allows?(non_user_params['updater'], 'share'))
      if home_board['copy']
        if non_user_params['async']
          Progress.schedule(self, :copy_to_home_board, home_board, board_updater.global_id, home_board['symbol_library'])
        else
          self.copy_to_home_board(home_board, board_updater.global_id, home_board['symbol_library'])
        end
        return
      elsif non_user_params['async']
        board.schedule(:process_share, "add_deep-#{self.global_id}", non_user_params['updater'].global_id)
      else
        board.share_with(self, true)
      end
      self.settings['preferences']['home_board'] = {
        'id' => board.global_id,
        'key' => board.key
      }
      self.settings['preferences']['home_board']['locale'] = home_board['locale'] || board.settings['locale']
      self.settings['preferences']['home_board']['level'] = home_board['level'] if home_board['level']
    else
      self.settings['preferences'].delete('home_board')
    end
    if (self.settings['preferences']['home_board'] || {}).slice('id', 'key').to_json != json
      notify('home_board_changed')
      self.schedule_audit_protected_sources
      self.schedule(:update_home_board_inflections)
    end
    true
  end

  def process_sidebar_boards(sidebar, non_user_params)
    self.settings['preferences'] ||= {}
    result = []
    # Convert hash to array if needed (Rails params often come as hash with string keys)
    sidebar = sidebar.values if sidebar.is_a?(Hash)
    sidebar = [] unless sidebar.is_a?(Array)
    sidebar.each do |board|
      if board['alert']
        result.push({
          'name' => board['name'] || 'Alert',
          'alert' => true,
          'special' => true,
          'image' => board['image'] || 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/to%20sound.png'
        })
      elsif board['special'] && board['action']
        opts = {
          'name' => board['name'] || board['action'].split(/\(/)[0],
          'special' => true,
          'action' => board['action'],
          'image' => board['image'] || "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/touch_437_g.svg"
        }
        opts['arg'] = board['arg'] if board['arg'] != nil
        result.push(opts);
      else
        record = Board.find_by_path(board['key']) rescue nil
        allowed = record && record.allows?(self, 'view')
        if !allowed && record && non_user_params && non_user_params['updater'] && record.allows?(non_user_params['updater'], 'share')
          record.share_with(self, true)
          allowed = true
        end
        if record && allowed
          stored_key = board['key']
          if stored_key && stored_key.split('/').last == SystemBoardSources::CRISIS_VOCABULARY_SLUG
            stored_key = SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG)
          end
          brd = {
            'name' => board['name'] || record.settings['name'] || 'Board',
            'key' => stored_key,
            'image' => board['image'] || record.settings['image_url'] || '/images/lingolinq-board-icon.png',
            'home_lock' => !!board['home_lock']
          }
          # Hidden entries stay in the list but are not rendered on the sidebar.
          # Needed for auto-add boards (crisis-vocabulary): removing them outright
          # is undone by merge_missing_default_sidebar_boards on the next load, so
          # "hide" has to be a flag on a still-present entry rather than a delete.
          brd['hidden'] = true if board['hidden']
          brd['locale'] = board['locale'] || record.settings['locale']
          brd['level'] = board['level'] if board['level']
          valid_types = []
          if board['highlight_type'] == 'custom'
            valid_types = ['geos', 'ssids', 'times', 'places']
          elsif board['highlight_type'] == 'locations'
            valid_types = ['geos', 'ssids']
          elsif board['highlight_type'] == 'times'
            valid_types = ['times']
          elsif board['highlight_type'] == 'places'
            valid_types = ['places']
          else
            board.delete('highlight_type')
          end
          brd['highlight_type'] = board['highlight_type'] if board['highlight_type']
          if board['ssids'] && valid_types.include?('ssids')
            board['ssids'] = board['ssids'].split(/,/) if board['ssids'].is_a?(String)
            ssids = board['ssids'].map{|s| process_string(s) } 
            brd['ssids'] = ssids if ssids.length > 0
          end
          if board['geos'] && valid_types.include?('geos')
            geos = []
            board['geos'] = board['geos'].split(/;/) if board['geos'].is_a?(String)
            board['geos'].each do |geo|
              geo = geo.split(',') if geo.is_a?(String)
              if geo[0] && geo[1]
                geos << [geo[0].to_f, geo[1].to_f]
              end
            end
            brd['geos'] = geos if geos.length > 0
          end
          if board['times'] && valid_types.include?('times')
            board['times'] = board['times'].split(/;/).map{|t| t.split(/-/) } if board['times'].is_a?(String)
            times = []
            board['times'].each do |start_time, end_time|
              parts = [start_time, end_time].map do |time|
                time_pieces = time.sub(/[ap]m$/, '').split(/:/).map{|p| p.to_i }
                if time.match(/[ap]m$/)
                  if time_pieces[0] == 12 && time.match(/am$/)
                    time_pieces[0] = 0
                  elsif time_pieces[0] < 12 && time.match(/pm$/)
                    time_pieces[0] += 12
                  end
                end
                res = time_pieces[0] < 10 ? "0" : ""
                res += time_pieces[0].to_s
                res += time_pieces[1] < 10 ? ":0" : ":"
                res += time_pieces[1].to_s
              end              
              times.push([parts[0], parts[1]]) if parts[0] && parts[1]
            end
            brd['times'] = times if times.length > 0
          end
          if board['places'] && valid_types.include?('places')
            board['places'] = board['places'].split(/,/) if board['places'].is_a?(String)
            places = board['places'].map{|p| process_string(p) }
            brd['places'] = places if places.length > 0
          end
          brd.delete('highlight_type') unless brd['geos'] || brd['ssids'] || brd['times'] || brd['places']
          result.push(brd)
        end
      end
    end

    if result.length == 0
      self.settings['sidebar_changed'] = true
      self.settings['preferences'].delete('sidebar_boards')
    else
      result = result.uniq do |b|
        if b['special']
          b['alert'].to_s + "_" + b['action'].to_s + "_" + b['arg'].to_s
        elsif b['key'] && b['key'].split('/').last == SystemBoardSources::CRISIS_VOCABULARY_SLUG
          SystemBoardSources::CRISIS_VOCABULARY_SLUG
        else
          b['key']
        end
      end
      pre_json = self.settings['preferences']['sidebar_boards'].to_json
      self.settings['sidebar_changed'] = true if pre_json != result.to_json
      self.settings['preferences']['sidebar_boards'] = result
      self.settings['preferences']['prior_sidebar_boards'] ||= []
      self.settings['preferences']['prior_sidebar_boards'] += result
      self.settings['preferences']['prior_sidebar_boards'].uniq!{|b| b['alert'] ? 'alert' : b['key'] }
    end
  end
  
  def sidebar_boards
    stored = (self.settings && self.settings['preferences'] && self.settings['preferences']['sidebar_boards']) || []
    if stored.empty?
      return User.resolve_sidebar_boards_for(self, User.default_active_sidebar_boards)
    end

    User.resolve_sidebar_boards_for(self, User.merge_missing_default_sidebar_boards(stored))
  end

  def self.sidebar_system_keys
    [SystemBoardSources.board_key('keyboard')].freeze
  end

  def self.resolve_sidebar_boards_for(user, boards)
    entries = boards || []
    system_keys = []
    entries.each do |entry|
      next unless entry.is_a?(Hash)
      next if entry['alert'] || (entry['special'] && entry['alert'])
      key = entry['key']
      next unless key
      next if sidebar_system_keys.include?(key)
      system_keys << key
    end

    system_boards_by_key = {}
    if system_keys.any?
      Board.find_all_by_path(system_keys.uniq).each do |board|
        system_boards_by_key[board.key] = board
      end
    end

    copies_by_parent_id = {}
    parent_ids = system_boards_by_key.values.map(&:id).compact
    if parent_ids.any?
      user.boards.where(parent_board_id: parent_ids).order('parent_board_id ASC, id DESC').each do |copy|
        copies_by_parent_id[copy.parent_board_id] ||= copy
      end
    end

    resolved = entries.map { |entry| resolve_sidebar_entry(user, entry, system_boards_by_key, copies_by_parent_id) }
    dedupe_resolved_sidebar_boards(resolved)
  end

  def self.dedupe_resolved_sidebar_boards(boards)
    seen = {}
    boards.each_with_object([]) do |entry, result|
      identity = resolved_sidebar_board_identity(entry)
      next if identity && seen[identity]
      seen[identity] = true if identity
      result << entry
    end
  end

  # Identity for deduping sidebar entries after resolve_sidebar_entry has run.
  # Stored system keys and user copy keys can both resolve to the same final key.
  def self.resolved_sidebar_board_identity(entry)
    return nil unless entry.is_a?(Hash)
    if entry['special']
      entry['alert'].to_s + "_" + entry['action'].to_s + "_" + entry['arg'].to_s
    else
      entry['key']
    end
  end

  def self.sidebar_board_slug(entry)
    return nil unless entry.is_a?(Hash) && entry['key']
    entry['key'].split('/').last
  end

  def self.sidebar_stored_key_present?(stored, key)
    return false unless key
    slug = key.split('/').last
    (stored || []).any? do |entry|
      next false unless entry.is_a?(Hash)
      entry['key'] == key || (
        slug == SystemBoardSources::CRISIS_VOCABULARY_SLUG &&
        sidebar_board_slug(entry) == slug
      )
    end
  end

  # Default sidebar entries reference public system boards. Resolve to the user's
  # owned copy when one exists (parent_board lineage), except keyboard which stays
  # on the shared system board.
  def self.resolve_sidebar_entry(user, entry, system_boards_by_key = nil, copies_by_parent_id = nil)
    return entry unless entry.is_a?(Hash)
    return entry if entry['alert'] || (entry['special'] && entry['alert'])

    key = entry['key']
    return entry unless key
    return entry if sidebar_system_keys.include?(key)

    system_board = if system_boards_by_key
      system_boards_by_key[key]
    else
      Board.find_by_path(key)
    end
    return entry unless system_board

    # Stored key already references this user's board — do not swap to a lineage copy.
    return entry if system_board.user_id == user.id

    copy = if copies_by_parent_id
      copies_by_parent_id[system_board.id]
    else
      user.boards.where(parent_board_id: system_board.id).order('id DESC').first
    end
    return entry unless copy

    resolved = entry.merge(
      'key' => copy.key,
      'name' => copy.settings['name'] || entry['name']
    )
    resolved['image'] = copy.settings['image_url'] if copy.settings['image_url'].present?
    resolved
  end

  def self.sidebar_board_identity(board)
    return 'alert' if board.is_a?(Hash) && (board['alert'] || (board['special'] && board['alert']))
    board.is_a?(Hash) ? board['key'] : board
  end

  # Inject newly-added default sidebar entries (e.g. crisis-vocabulary) into an
  # older saved list without re-adding boards the user removed — and WITHOUT
  # reordering. The stored order IS the user's chosen sidebar order (drag / up-down
  # reorder in the Edit Sidebar panel), so it must be preserved on every load; only
  # still-missing auto-add defaults are appended.
  def self.merge_missing_default_sidebar_boards(stored)
    return default_active_sidebar_boards if stored.blank?

    defaults = default_sidebar_boards
    stored_ids = stored.map { |b| sidebar_board_identity(b) }.compact
    default_ids = defaults.map { |b| sidebar_board_identity(b) }

    return stored unless stored_ids.any? { |id| default_ids.include?(id) }

    missing_auto_add = sidebar_auto_add_keys.reject { |key| sidebar_stored_key_present?(stored, key) }
    return stored if missing_auto_add.empty?

    result = stored.dup
    defaults.each do |default_item|
      key = default_item['key']
      result << default_item if key && missing_auto_add.include?(key)
    end
    result
  end

  def self.sidebar_auto_add_keys
    [SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG)]
  end

  def self.inactive_by_default_sidebar_keys
    ['mbaud12/senner-baud-greetings']
  end

  def self.default_active_sidebar_boards
    default_sidebar_boards.reject { |b| inactive_by_default_sidebar_keys.include?(b['key']) }
  end
  
  def admin?
    self.settings['admin'] == true || Organization.admin_manager?(self)
  end
  
  def self.default_sidebar_boards
    [
      {'name' => "Yes/No", 'key' => 'lingolinq/yesno', 'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/yes_2.png', 'home_lock' => false},
      {'name' => "Inflections", 'key' => SystemBoardSources.board_key('inflections'), 'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/verb.png', 'home_lock' => false},
      {'name' => "Keyboard", 'key' => SystemBoardSources.board_key('keyboard'), 'image' => 'https://opensymbols.s3.amazonaws.com/libraries/noun-project/Computer%20Keyboard-19d40c3f5a.svg', 'home_lock' => false},
      {'name' => 'Social', 'key' => 'mbaud12/senner-baud-greetings', 'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/greet_2.png', 'home_lock' => false},
      {'name' => "Crisis Vocabulary", 'key' => SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG), 'image' => 'https://cdn-icons-png.flaticon.com/512/7373/7373323.png', 'home_lock' => false},
      {'name' => "Alert", 'special' => true, 'alert' => true, 'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/to%20sound.png'}
    ]
  end

  def notify_of_changes
    if @password_changed
      UserMailer.schedule_delivery(:password_changed, self.global_id)
      # Record an immutable audit trail entry for every password change, including
      # admin-initiated / token resets (LL-747bb0e02d). log_command is best-effort
      # (it rescues and never raises), so a failed audit insert can never break the
      # password change or alter the existing mailer behavior. No password material
      # or PII is stored - only the change type and self-service flag; user_key is
      # the opaque global_id.
      AuditEvent.log_command(self.global_id, {
        'type' => 'password_changed',
        'self_service' => !!@password_change_self_service
      })
      @password_changed = false
      @password_change_self_service = false
    end
    if @email_changed
      # TODO: should have confirmation flow for new email address
      UserMailer.schedule_delivery(:email_changed, self.global_id)
      @email_changed = false
    end
    if @opt_out
      AdminMailer.schedule_delivery(:opt_out, self.global_id, @opt_out)
      @opt_out = false
    end
    true
  end

  def enabled_protected_sources(include_supervisees=false)
    # For local dev: set DEVELOPMENT_EXTRAS_ENABLED=1 to see premium symbols (lessonpix, pcs, symbolstix)
    if Rails.env.development? && ENV['DEVELOPMENT_EXTRAS_ENABLED'].to_s =~ /^(1|true|yes)$/i
      return %w[lessonpix pcs symbolstix]
    end
    cache_key = "protected_sources/#{include_supervisees}"
    res = get_cached(cache_key)
    return res if res
    self.settings ||= {}
    res = []
    res << 'lessonpix' if self && (Uploader.lessonpix_credentials(self) || self.subscription_hash['extras_enabled'])
    res << 'pcs' if self && self.subscription_hash['extras_enabled']
    res << 'symbolstix' if self && self.subscription_hash['extras_enabled']
    if include_supervisees
      self.supervisees.each do |u| 
        res += u.enabled_protected_sources 
      end
    end
    res = res.uniq
    set_cached(cache_key, res)
    res
  end
  
  def add_user_notification(args)
    args = args.with_indifferent_access
    self.settings['user_notifications'] ||= []
    self.settings['user_notifications'].reject!{|n| n['type'] == args['type'] && n['id'] == args['id'] }
    args['added_at'] = Time.now.utc.iso8601
    self.settings['user_notifications'].unshift(args)
    self.settings['user_notifications'] = self.settings['user_notifications'][0, 10]
    self.save
  end
  
  def handle_notification(notification_type, record, args)
    if notification_type == 'push_message'
      if record.user_id == self.id
        if record.data['notify_user']
          self.settings['unread_alerts'] = (self.settings['unread_alerts'] || 0) + 1
          self.settings['last_alert_access'] = (record.started_at || 0).to_i
        end
        if !record.data['notify_user_only']
          self.settings['unread_messages'] = (self.settings['unread_messages'] || 0) + 1
          # last_message_read is a bad name, but it marks the most-recent
          # unread or view by the user, that way we have something more 
          # reliable to set then explicitly setting the unread count to 0,
          # which may happen inadvertently with multiple devices
          self.settings['last_message_read'] = (record.started_at || 0).to_i
        end
        self.save
      end
      share_index = (record.data['share_user_ids'] || []).index(self.global_id)
      id = record.global_id
      if share_index && record.reply_nonce
        id = "#{record.global_id}x#{record.reply_nonce}#{Utterance.to_alpha_code(share_index)}"
      end
      self.add_user_notification({
        :id => record.global_id,
        :type => notification_type,
        :user_name => record.user.user_name,
        :author_user_name => record.author.user_name,
        :text => record.data['note']['text'],
        :occurred_at => record.started_at.iso8601
      })
      UserMailer.schedule_delivery(:log_message, self.global_id, record.global_id)
    elsif notification_type == 'home_board_changed'
      hb = (record.settings && record.settings['preferences'] && record.settings['preferences']['home_board']) || {}
      self.add_user_notification({
        :type => 'home_board_changed',
        :occurred_at => record.updated_at.iso8601,
        :user_name => record.user_name,
        :key => hb['key'],
        :id => hb['id']
      })
    elsif notification_type == 'board_buttons_changed'
      my_ubcs = UserBoardConnection.where(:user_id => self.id, :board_id => record.id)
      supervisee_ubcs = UserBoardConnection.where(:user_id => supervisees.map(&:id), :board_id => record.id)
      self.add_user_notification({
        :type => notification_type,
        :occurred_at => record.updated_at.iso8601,
        :for_user => my_ubcs.count > 0,
        :for_supervisees => supervisee_ubcs.map{|ubc| ubc.user.user_name }.sort,
        :previous_revision => args['revision'],
        :name => record.settings['name'],
        :key => record.key,
        :id => record.global_id
      })
    elsif notification_type == 'org_removed'
      self.add_user_notification({
        :type => 'org_removed',
        :org_id => record.global_id,
        :org_name => record.settings['name'],
        :user_type => args['user_type'],
        :occurred_at => args['removed_at']
      })
    elsif notification_type == 'utterance_shared'
      pref = (self.settings && self.settings['preferences'] && self.settings['preferences']['share_notifications']) || 'email'
      sharer = User.find_by_global_id(args['sharer']['user_id'])
      # Utterance.deliver_message
      record.deliver_message(pref, self, args, sharer)
      if pref == 'none'
        return
      end
      self.add_user_notification({
        :type => notification_type,
        :occurred_at => record.updated_at.iso8601,
        :sharer_user_name => args['sharer']['user_name'],
        :text => args['text'],
        :id => record.global_id
      })
    elsif notification_type == 'log_summary'
      self.next_notification_at = self.next_notification_schedule
      self.save
      UserMailer.schedule_delivery(:log_summary, self.global_id)
    elsif notification_type == 'badge_awarded'
      self.add_user_notification({
        :type => 'badge_awarded',
        :occurred_at => record.awarded_at,
        :user_name => record.user.user_name,
        :badge_name => record.data['name'],
        :badge_level => record.level,
        :id => record.global_id
      })
      if self.settings['preferences'] && self.settings['preferences']['goal_notifications'] != 'disabled'
        UserMailer.schedule_delivery(:badge_awarded, self.global_id, record.global_id)
      end
    end
  end
  
  def next_notification_schedule
    res = Time.now.utc
    cutoff = res + 24.hours
    if !self.settings || !self.settings['preferences'] || !self.settings['preferences']['notification_frequency'] || self.settings['preferences']['notification_frequency'] == ''
      return nil
    elsif self.settings && self.settings['preferences'] && self.settings['preferences']['notification_frequency'] == '1_month'
    else
      res -= 24.hours
      already_friday_or_saturday = res.wday == 5 || res.wday == 6
      # friday or saturday in the US
      friday_or_saturday = (self.id || 0) % 2 == 0 ? 5 : 6
      while res.wday != friday_or_saturday
        if already_friday_or_saturday
          res += 1.day
        else
          res -= 1.day
        end
      end
    end
    if self.settings && self.settings['preferences'] && self.settings['preferences']['notification_frequency'] == '2_weeks'
      cutoff += 8.days
    end
          # 6pm eastern thru 10pm eastern
    hours = [22, 23, 0, 1, 2]
    hour_idx = (self.id || 0) % hours.length
    hour = hours[hour_idx]
    if hour < 20
      res += 1.day
    end
    min = (self.id || 0) % 2 == 0 ? 0 : 30
    res = res.change(:hour => hour, :min => min)
    # set to a nice happy time of day
    while res < cutoff
      if self.settings && self.settings['preferences'] && self.settings['preferences']['notification_frequency'] == '2_weeks'
        # since the cutoff was extended, it'll get to 2 weeks via cutoff, this just makes it a little cleaner
        res += 7.days
      elsif self.settings && self.settings['preferences'] && self.settings['preferences']['notification_frequency'] == '1_month'
        res += 1.month
      else
        res += 7.days
      end
    end
    res
  end
  
  def default_listeners(notification_type)
    if notification_type == 'home_board_changed'
      ([self] + self.supervisors).uniq.map(&:record_code)
    elsif notification_type == 'log_summary'
      [self].map(&:record_code)
    else
      []
    end
  end
  
  def replace_board(opts)
    opts = opts.with_indifferent_access
    starting_old_board_id = opts[:old_board_id]
    starting_new_board_id = opts[:new_board_id]
    ids_to_copy = opts[:ids_to_copy] || []
    update_inline = opts[:update_inline] || false
    make_public = opts[:make_public] || false
    whodunnit = opts[:user_for_paper_trail] || nil

    prior = PaperTrail.request.whodunnit
    PaperTrail.request.whodunnit = whodunnit if whodunnit
    starting_old_board = Board.find_by_path(starting_old_board_id)
    starting_new_board = Board.find_by_path(starting_new_board_id)
    valid_ids = nil
    if ids_to_copy && ids_to_copy.length > 0
      valid_ids = ids_to_copy.split(/,/)
      valid_ids = nil if valid_ids.length == 0
    end
    Board.replace_board_for(self, {
      :starting_old_board => starting_old_board, 
      :starting_new_board => starting_new_board, 
      :old_default_locale => opts[:old_default_locale],
      :new_default_locale => opts[:new_default_locale],
      :copy_prefix => opts[:copy_prefix],
      :valid_ids => valid_ids, 
      :update_inline => update_inline, 
      :copier => User.find_by_path(opts[:copier_id]),
      :make_public => make_public, 
      :new_owner => opts[:new_owner],
      :disconnect => opts[:disconnect],
      :authorized_user => User.whodunnit_user(PaperTrail.request.whodunnit)
    })
    ids = [starting_old_board_id]
    ids += (starting_old_board.reload.downstream_board_ids || []) if starting_old_board
    # This was happening too slowly/unreliably in a separate bg job
#    button_set = BoardDownstreamButtonSet.update_for(starting_new_board.global_id, true)
    {'affected_board_ids' => ids.uniq}
  ensure
    PaperTrail.request.whodunnit = prior
  end
  
  def copy_board_links(opts)
    opts = opts.with_indifferent_access
    starting_old_board_id = opts[:old_board_id]
    starting_new_board_id = opts[:new_board_id]
    ids_to_copy = opts[:ids_to_copy] || []
    make_public = opts[:make_public] || false
    expand_selected_board_ids = opts[:expand_selected_board_ids] == true || opts[:expand_selected_board_ids].to_s == 'true' || opts[:expand_selected_board_ids].to_s == '1'
    whodunnit = opts[:user_for_paper_trail] || nil
    swap_library = opts[:swap_library]

    prior = PaperTrail.request.whodunnit
    PaperTrail.request.whodunnit = whodunnit if whodunnit
    starting_old_board = Board.find_by_path(starting_old_board_id)
    starting_new_board = Board.find_by_path(starting_new_board_id)
    valid_ids = nil
    if ids_to_copy && ids_to_copy.length > 0
      valid_ids = ids_to_copy.split(/,/)
      valid_ids = nil if valid_ids.length == 0
    end
    user = self
    change_hash = Board.copy_board_links_for(user, {
      :starting_old_board => starting_old_board, 
      :starting_new_board => starting_new_board, 
      :old_default_locale => opts[:old_default_locale],
      :new_default_locale => opts[:new_default_locale],
      :copy_prefix => opts[:copy_prefix],
      :valid_ids => valid_ids, 
      :expand_selected_board_ids => expand_selected_board_ids,
      :copier => User.find_by_path(opts[:copier_id]),
      :make_public => make_public, 
      :new_owner => opts[:new_owner],
      :disconnect => opts[:disconnect],
      :authorized_user => opts[:auth_user] || User.whodunnit_user(PaperTrail.request.whodunnit)
    }) || {}
    updated_ids = [starting_new_board_id]
    ids = [starting_old_board_id]
    ids += (starting_old_board.reload.downstream_board_ids || []) if starting_old_board
    ids.each do |id|
      updated_ids << change_hash[id][:id] if change_hash[id]
    end
    res = {
      'affected_board_ids' => ids.uniq,
      'new_board_ids' => updated_ids.uniq
    }
    if swap_library && swap_library != 'default' && swap_library != 'original'
      ids = res['new_board_ids']
      ids.instance_variable_set('@skip_keyboard', true)
      swap_library.instance_variable_set('@skip_swapped', true)
      starting_new_board.reload
      starting_new_board.swap_images(swap_library, self, ids)
      res['swap_library'] = swap_library
    end
    PaperTrail.request.whodunnit = prior
    # This was happening too slowly/unreliably in a separate bg job
    self.update_available_boards
    # button_set = BoardDownstreamButtonSet.update_for(starting_new_board.global_id, true)
    res
  # ensure
  #   PaperTrail.request.whodunnit = prior
  end

  def self.whodunnit_user(whodunnit)
    if whodunnit && whodunnit.match(/^user:/)
      User.find_by_path(whodunnit.split(/[:\.]/)[1])
    else
      nil
    end
  end
  
  def user_token
    token = "#{self.global_id}-"
    token = token + GoSecure.sha512(token, 'user_token verifier')[0, 30]
    token
  end
  
  def self.find_by_token(token)
    return nil unless token
    user_id, hash = token.split(/-/)
    return nil unless user_id && hash
    verifier = GoSecure.sha512("#{user_id}-", 'user_token verifier')[0, 30]
    # Constant-time compare so a timing side-channel can't be used to recover the
    # verifier byte-by-byte (LL-90045bb29c). Same pattern as find_by_protected_image_token
    # below; secure_compare returns false on a length mismatch, so behavior is unchanged.
    return nil unless ActiveSupport::SecurityUtils.secure_compare(hash, verifier)
    User.find_by_global_id(user_id)
  end

  # Unlike user_token above, this is a purpose-scoped, time-limited credential for
  # protected_image only: bounds how long a leaked URL (query-string tokens land in
  # access logs, browser history, and Referer headers) stays valid. The default outlasts
  # the 12-day CDN cache-control window protected_image already sets on successful
  # redirects, so it won't expire while a synced board is still relying on the cached copy.
  PROTECTED_IMAGE_TOKEN_LIFESPAN = 30.days

  def protected_image_token(lifespan=PROTECTED_IMAGE_TOKEN_LIFESPAN)
    expires_at = (Time.now + lifespan).to_i
    sig = GoSecure.sha512("#{self.global_id}-#{expires_at}", 'protected_image_token verifier')[0, 30]
    "#{self.global_id}-#{expires_at}-#{sig}"
  end

  # Accepts the newer expiring protected_image_token format (3 hyphen-separated parts)
  # or falls back to the legacy permanent user_token format (2 parts), so image URLs
  # embedded in boards cached client-side before this format existed keep resolving.
  # The legacy branch is logged (not just silently accepted) because it's the residual
  # of LL-310b464be4 this PR intentionally leaves open: sunsetting it needs evidence of
  # how often it's still hit, not a guess.
  def self.find_by_protected_image_token(token)
    return nil unless token
    parts = token.to_s.split(/-/)
    unless parts.length == 3
      user = find_by_token(token)
      Rails.logger.info("[protected_image_legacy_token] accepted permanent-format token for #{user.global_id}") if user
      return user
    end
    user_id, expires_at, sig = parts
    return nil unless expires_at.match?(/\A\d+\z/)
    verifier = GoSecure.sha512("#{user_id}-#{expires_at}", 'protected_image_token verifier')[0, 30]
    return nil unless ActiveSupport::SecurityUtils.secure_compare(sig, verifier)
    return nil if expires_at.to_i < Time.now.to_i
    User.find_by_global_id(user_id)
  end

  # Purpose-scoped, expiring credential for lesson/board SHARE links (LL-90045bb29c option (b)).
  # Replaces the permanent user_token that was embedded in navigable /lessons/... URLs, where it
  # leaked into browser history, access logs, and Referer headers as a non-revocable bearer
  # credential. Same expiring-HMAC design as protected_image_token above, with its own verifier
  # purpose string. The MINT is gated by a kill-switch (FeatureFlags.expiring_lesson_share_tokens_enabled?)
  # so ops can revert construction to the legacy permanent token in one switch; the finder accepts
  # both formats regardless, so flipping the switch either way never breaks an already-issued link.
  LESSON_SHARE_TOKEN_LIFESPAN = 30.days

  def lesson_share_token(lifespan=LESSON_SHARE_TOKEN_LIFESPAN)
    return user_token unless FeatureFlags.expiring_lesson_share_tokens_enabled?(self)
    expires_at = (Time.now + lifespan).to_i
    sig = GoSecure.sha512("#{self.global_id}-#{expires_at}", 'lesson_share_token verifier')[0, 30]
    "#{self.global_id}-#{expires_at}-#{sig}"
  end

  # Accepts the expiring lesson_share_token format (3 hyphen-separated parts) or falls back to the
  # legacy permanent user_token format (2 parts), so lesson/board share URLs created before this
  # format existed keep resolving. The legacy branch is logged (not silently accepted) so the
  # residual permanent-token exposure can be measured before it is sunset (tracked under
  # LL-90045bb29c option (c) / LL-310b464be4).
  def self.find_by_lesson_share_token(token)
    return nil unless token
    parts = token.to_s.split(/-/)
    unless parts.length == 3
      user = find_by_token(token)
      Rails.logger.info("[lesson_share_legacy_token] accepted permanent-format token for #{user.global_id}") if user
      return user
    end
    user_id, expires_at, sig = parts
    return nil unless expires_at.match?(/\A\d+\z/)
    verifier = GoSecure.sha512("#{user_id}-#{expires_at}", 'lesson_share_token verifier')[0, 30]
    return nil unless ActiveSupport::SecurityUtils.secure_compare(sig, verifier)
    return nil if expires_at.to_i < Time.now.to_i
    User.find_by_global_id(user_id)
  end

  def notify_on(attributes, notification_type)
    # TODO: ...
  end

  def self.flush_old_versions
    if PaperTrail::Version.where({item_type: 'LogSession'}).where(['created_at < ?', 1.week.ago]).count > 300
      PaperTrail::Version.where({item_type: 'LogSession'}).where(['created_at < ?', 1.week.ago]).delete_all
    end
    if PaperTrail::Version.where({item_type: 'User'}).where(['created_at < ?', 1.months.ago]).count > 300
      PaperTrail::Version.where({item_type: 'User'}).where(['created_at < ?', 1.months.ago]).delete_all
    end
    if PaperTrail::Version.where({item_type: 'Board'}).where(['created_at < ?', 6.months.ago]).count > 300
      PaperTrail::Version.where({item_type: 'Board'}).where(['created_at < ?', 6.months.ago]).delete_all
    end

  end
end
