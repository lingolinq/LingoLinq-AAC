class UserMailer < ActionMailer::Base
  include General
  include SystemEmailOverride
  helper MailerHelper
  default from: ENV['DEFAULT_EMAIL_FROM']
  layout 'email'
  
  def self.bounce_email(email)
    hash = User.generate_email_hash(email)
    users = User.where(:email_hash => hash)
    users.each do |user|
      user.update_setting('email_disabled', true)
    end
  end

  # Queues or immediately delivers parent-facing COPPA mailers. In development,
  # set INLINE_PARENTAL_CONSENT_EMAIL=1 to bypass Resque (same as signup request).
  def self.schedule_parent_consent_delivery(delivery_type, user_id)
    if Rails.env.development? && inline_parental_consent_email?
      deliver_message(delivery_type, user_id)
      Rails.logger.info("[COPPA] #{delivery_type} delivered inline for user=#{user_id}")
    else
      schedule_delivery(delivery_type, user_id)
      Rails.logger.info("[COPPA] #{delivery_type} queued for user=#{user_id} (start Resque priority worker, or set INLINE_PARENTAL_CONSENT_EMAIL=1 in development)")
    end
  end

  def self.inline_parental_consent_email?
    %w[1 true yes on].include?(ENV['INLINE_PARENTAL_CONSENT_EMAIL'].to_s.strip.downcase)
  end

  def new_user_registration(user_id)
    @user = User.find_by_global_id(user_id)
    d = @user.devices[0]
    ip = d && d.settings['ip_address']
    @location = nil
    if ip && ENV['IPLOCATE_API_KEY']
      url = "https://iplocate.io/api/lookup/#{ip}?apikey=#{ENV['IPLOCATE_API_KEY']}"
      begin
        res = Typhoeus.get(url, timeout: 5)
        json = JSON.parse(res.body)
        @location = json && "#{json['city']}, #{json['subdivision']}, #{json['country_code']}"
      rescue => e
      end
    end
    recipient = JsonApi::Json.current_domain['settings']['admin_email'] || ENV['NEW_REGISTRATION_EMAIL']
    if recipient
      user_type = @user.supporter_registration? ? 'Supervisor' : 'Communicator'
      mail(to: recipient, subject: "#{app_name} - New #{user_type} Registration", reply_to: @user.settings['email'])
    end
  end

  def eval_welcome(user_id)
    @user = User.find_by_path(user_id)
  end
  
  def password_changed(user_id)
    @user = User.find_by_global_id(user_id)
    mail_message(@user, "Password Changed")
  end
  
  def email_changed(user_id)
    @user = User.find_by_global_id(user_id)
    mail_message(@user, "Email Changed")
    @old_email = true
    mail_message(@user, "Email Changed", 'email_changed_prior_address')
  end
  
  def badge_awarded(user_id, badge_id)
    @recipient = User.find_by_global_id(user_id)
    @badge = UserBadge.find_by_global_id(badge_id)
    @user = @badge.user
    @goal = @badge.user_goal
    @for_self = @badge.user_id == @recipient.id
    mail_message(@recipient, "Badge Awarded")
  end
  
  def confirm_registration(user_id)
    @user = User.find_by_global_id(user_id)
    mail_message(@user, "Welcome!")
  end
  
  def login_no_user(email)
    @email = email
    @full_domain = full_domain_enabled
    mail(to: email, subject: "#{app_name} - Login Help")
  end
  
  def forgot_password(user_ids)
    @users = User.find_all_by_global_id(user_ids)
    @user = @users.first
    mail_message(@user, "Forgot Password Confirmation")
  end
  
  def log_message(user_id, log_id)
    @user = User.find_by_global_id(user_id)
    @log = LogSession.find_by_global_id(log_id)
    @author = @log.author
    @author_name = (@log.data['author_contact'] || {})['name'] || @author.settings['name']
    @target = @log.user
    mail_message(@user, "New Message")
  end
  
  def log_summary(user_id)
    @user = User.find_by_global_id(user_id)
    @supervisees = User.find_all_by_global_id(@user.supervised_user_ids)
    @log_duration = 'the last week'
    @log_period = 'week'
    pre_start = 2.weeks.ago
    pre_end = 1.week.ago
    if @user.settings['next_notification_delay'] == '2_weeks'
      pre_start = 4.weeks.ago
      pre_end = 2.weeks.ago
      @log_duration = 'the last two weeks'
      @log_period = 'two weeks'
    elsif @user.settings['next_notification_delay'] == '1_month'
      pre_start = 2.months.ago
      pre_end = 1.month.ago
      @log_duration = 'the last month'
      @log_period = 'month'
    end
    @users = []
    users_to_check = []
    users_to_check << @user if @user.any_premium_or_grace_period? && @user.settings['preferences'] && @user.settings['preferences']['role'] == 'communicator'
    users_to_check += @supervisees
    
    users_to_check.uniq.each do |user|
      # collect stats for the time period
      # also should compare to last time period
      # - total sessions (delta vs. last time period)
      # - total buttons (delta vs. last time period)
      # - new words since last time period
      # - lost words since last time period
      # - number of new notes in time period (with link if any)
      # - primary goal status weighted average (vs. last time period)
      # - link to update primary goal status
      pre_stats = nil
      current_stats = nil
      user_report = OpenStruct.new({
        :label => user.user_name,
        :user_name => user.user_name,
        :premium => user.any_premium_or_grace_period?,
        :pre_start => pre_start.iso8601[0, 10],
        :pre_end => pre_end.iso8601[0, 10],
        :start => pre_end.iso8601[0, 10],
        :end => Time.now.iso8601[0, 10]
      })
      begin
        if user.any_premium_or_grace_period? && user.settings['preferences'] && user.settings['preferences']['role'] == 'communicator'
          user_report.pre_stats = Stats.cached_daily_use(user.global_id, {:start_at => pre_start, :end_at => pre_end})
          user_report.current_stats = Stats.cached_daily_use(user.global_id, {:start_at => pre_end, :end_at => Time.now})
          broad_state = Stats.cached_daily_use(user.global_id, {:start_at => [pre_start, 4.weeks.ago].min, :end_at => Time.now})
          # TODO: sharding
          user_report.total_notes = LogSession.where(:user_id => user.id).where(:log_type => ['note', 'assessment']).where(['started_at > ? AND ended_at < ?', pre_start, Time.now]).count
          user_report.primary_goal = UserGoal.primary_goal(user)
          user_report.secondary_goal_count = UserGoal.secondary_goals(user).length
          if user_report.pre_stats[:total_sessions] > 0
            user_report.total_sessions_delta = (user_report.current_stats[:total_sessions].to_f / user_report.pre_stats[:total_sessions].to_f * 100.0).round(0) - 100.0
            # if user_report.current_stats[:total_sessions].to_f < user_report.pre_stats[:total_sessions].to_f
            #   user_report.total_sessions_delta = (user_report.current_stats[:total_sessions].to_f / user_report.pre_stats[:total_sessions].to_f * 100.0).round(0) - 100.0
            # end
          end
          if user_report.pre_stats[:modeled_buttons] > 0
            user_report.modeled_buttons_delta = (user_report.current_stats[:modeled_buttons].to_f / user_report.pre_stats[:modeled_buttons].to_f * 100.0).round(0) - 100.0
          end
          if user_report.pre_stats[:total_buttons] > 0
            user_report.total_buttons_delta = (user_report.current_stats[:total_buttons].to_f / user_report.pre_stats[:total_buttons].to_f * 100.0).round(0) - 100.0
            # if user_report.current_stats[:total_buttons].to_f < user_report.pre_stats[:total_buttons].to_f 
            #   user_report.total_buttons_delta = (user_report.current_stats[:total_buttons].to_f / user_report.pre_stats[:total_buttons].to_f * 100.0).round(0) - 100.0
            # end
          end
          user_report.lost_words = (broad_state[:dwindling_words] || []).sort_by(&:last).reverse.map(&:first).join(', ')
          user_report.gained_words = (broad_state[:emergent_words] || []).sort_by(&:last).reverse.map(&:first).join(', ')

          if user_report.gained_words.length == 0
            # lost_percents = []
            # # TODO: this really shouldn't be in a mailer, put it in a lib or something
            # user_report.pre_stats[:words_by_frequency].each do |word|
            #   pre_percent = word['count'].to_f / user_report.pre_stats[:total_words].to_f
            #   found_word = user_report.current_stats[:words_by_frequency].detect{|w| w['text'] == word['text'] }
            #   post_percent = found_word ? (found_word['count'].to_f / user_report.current_stats[:total_words].to_f) : 0.0
            #   if post_percent < pre_percent
            #     res = {
            #       :text => word['text'],
            #       :multiplier => pre_percent / post_percent
            #     }
            #     if post_percent == 0
            #       res[:multiplier] = pre_percent * 100.0 * 10.0
            #     end
            #     lost_percents.push(res)
            #   end
            # end
            # lost_percents = lost_percents.sort_by{|p| p[:multiplier] }.reverse
            # user_report.lost_words = lost_percents[0, 10].map{|p| p[:text] }.join(', ')

            # gained_percents = []
            # user_report.current_stats[:words_by_frequency].each do |word|
            #   post_percent = word['count'].to_f / user_report.current_stats[:total_words].to_f
            #   found_word = user_report.pre_stats[:words_by_frequency].detect{|w| w['text'] == word['text'] }
            #   pre_percent = found_word ? (found_word['count'].to_f / user_report.pre_stats[:total_words].to_f) : 0.0
            #   if post_percent > pre_percent
            #     res = {
            #       :text => word['text'],
            #       :multiplier => post_percent / pre_percent
            #     }
            #     if pre_percent == 0
            #       res[:multiplier] = post_percent * 100.0 * 10.0
            #     end
            #     gained_percents.push(res)
            #   end
            # end
            # gained_percents = gained_percents.sort_by{|p| p[:multiplier] }.reverse
            # user_report.gained_words = gained_percents[0, 10].map{|p| p[:text] }.join(', ')
          end

          # TODO: average goal status specific to the time range, plus delta
        end
      rescue Stats::StatsError => e
      end
      @users << user_report
    end
    mail_message(@user, "Communication Report")
  end

  def usage_reminder(user_id)
    return unless full_domain_enabled
    @user = User.find_by_global_id(user_id)
    
    @logging_disabled = !@user.settings['preferences']['logging']
    @no_recent_activity = @user.devices.all?{|d| d.updated_at < 4.days.ago}
    @no_home_board = @user.settings['preferences']['home_board']
    @supporter = @user.settings['preferences']['role'] == 'supporter'
    @supporter_no_supervisees = @user.settings['preferences']['role'] == 'supporter' && @user.supervised_user_ids.empty?
    @no_subscription = @user.grace_period?

    mail_message(@user, "Checking In")
  end
  
  def utterance_share(opts)
    @user = User.find_by_global_id(opts['sharer_id'])
    @recipient = User.find_by_global_id(opts['recipient_id'])
    @sender = @user && @user.settings['name']
    @sender ||= @user && @user.user_name
    @sender ||= opts['sharer_name']
    @sender ||= 'someone'
    @reply_url = opts['reply_url']
    if opts['reply_id']
    end
    @prior = LogSession.find_reply(opts['reply_id'], @user, @recipient)
    @message = opts['message'] || "no message"
    mail(to: opts['to'], subject: opts['subject'], reply_to: @user.settings['email'])
  end

  def lesson_assigned(lesson_id, user_ids)
    @lesson = Lesson.find_by_path(lesson_id)
    User.find_batches_by_global_id(user_ids) do |u|
      @user = u
      mail(to: u.named_email, subject: "#{app_name} - New Lesson Assigned")
    end
  end
  
  def organization_assigned(user_id, org_id)
    @user = User.find_by_global_id(user_id)
    @org = Organization.find_by_global_id(org_id)
    mail_message(@user, "Organization Sponsorship Added") if @user && @org
  end
  
  def organization_unassigned(user_id, org_id)
    @user = User.find_by_global_id(user_id)
    @org = Organization.find_by_global_id(org_id)
    if !UserLink.links_for(@user).detect{|l| l['type'] == 'org_user' && l['record_code'] == Webhook.get_record_code(@org)}
      mail_message(@user, "Organization Sponsorship Removed") if @user && @org
    end
  end

  def valet_password_enabled(user_id)
    @user = User.find_by_global_id(user_id)
    @re_enable = true if @user.settings['valet_password_disabled_since'] && @user.settings['valet_password_disabled_since'] > 4.weeks.ago.to_i
    mail_message(@user, "Valet Login Enabled") if @user
  end
  
  def valet_password_used(user_id)
    @user = User.find_by_global_id(user_id)
    mail_message(@user, "Valet Login Used") if @user
  end

  # Sends the approval link to the parent/guardian address collected at signup (settings['coppa']['parent_email']),
  # not the child's account email. Delivery is normally via UserMailer.schedule_delivery -> Resque.
  def parental_consent_request(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['coppa'] : nil
    subject = SystemEmailI18n.resolve('user_mailer/parental_consent_request', 'parental_consent_mailer.subject', 'app_name' => app_name)

    unless c.is_a?(Hash) && c['parent_email'].present? && c['parent_consent_token'].present?
      Rails.logger.warn("Skipping parental_consent_request for user #{user_id}: missing COPPA parent_email or parent_consent_token")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    esc_tok = CGI.escape(c['parent_consent_token'].to_s)
    @consent_url = "#{JsonApi::Json.current_host}/parental_consent/complete?user_id=#{@user.global_id}&token=#{esc_tok}"
    @decline_url = "#{JsonApi::Json.current_host}/parental_consent/decline?user_id=#{@user.global_id}&token=#{esc_tok}"
    @offboarding = !!c['offboarding']
    # COPPA direct-notice: surface our privacy practices to the parent before they consent.
    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @child_name = @user.settings['name']
    @parent_email = c['parent_email']
    @consent_age = JsonApi::Json.coppa_consent_age(@user)
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  # After offboarding COPPA decline/expiry: tell the parent we exported and will delete.
  def parental_consent_offboarding_export(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['coppa'] : nil
    subject = SystemEmailI18n.resolve(
      'user_mailer/parental_consent_offboarding_export',
      'parental_consent_offboarding_export_mailer.subject',
      'app_name' => app_name
    )

    unless c.is_a?(Hash) && c['parent_email'].present? && c['offboarding_export_scheduled_at'].present?
      Rails.logger.warn("Skipping parental_consent_offboarding_export for user #{user_id}: missing parent_email or export stamp")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    @parent_email = c['parent_email']
    @child_username = @user.display_user_name
    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @contact_url = "#{JsonApi::Json.current_host}/contact"
    @export_url = nil
    if c['offboarding_export_path'].present?
      @export_url = Uploader.presigned_url_for_uploads(c['offboarding_export_path'])
    end
    @deletion_at = @user.schedule_deletion_at && @user.schedule_deletion_at.utc
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  # COPPA email-plus confirmatory message to the parent after they approve the child account.
  def parental_consent_confirmation(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['coppa'] : nil
    subject = SystemEmailI18n.resolve('user_mailer/parental_consent_confirmation', 'parental_consent_confirmation_mailer.subject', 'app_name' => app_name)

    unless c.is_a?(Hash) && c['parent_email'].present? && c['parent_consent_granted_at'].present? && c['parent_consent_revoke_token'].present?
      Rails.logger.warn("Skipping parental_consent_confirmation for user #{user_id}: missing COPPA parent_email, grant timestamp, or revoke token")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    esc_tok = CGI.escape(c['parent_consent_revoke_token'].to_s)
    @revoke_url = "#{JsonApi::Json.current_host}/parental_consent/revoke?user_id=#{@user.global_id}&token=#{esc_tok}"
    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @contact_url = "#{JsonApi::Json.current_host}/contact"
    @child_name = @user.settings['name']
    @child_username = @user.display_user_name
    @parent_email = c['parent_email']
    @registered_at = @user.created_at && @user.created_at.utc
    @granted_at = begin
      Time.iso8601(c['parent_consent_granted_at']).utc
    rescue ArgumentError
      nil
    end
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  # Acknowledges to the parent that parental consent was withdrawn.
  def parental_consent_revoked(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['coppa'] : nil
    subject = SystemEmailI18n.resolve('user_mailer/parental_consent_revoked', 'parental_consent_revoked_mailer.subject', 'app_name' => app_name)

    unless c.is_a?(Hash) && c['parent_email'].present? && c['parent_consent_revoked_at'].present?
      Rails.logger.warn("Skipping parental_consent_revoked for user #{user_id}: missing COPPA parent_email or revoke timestamp")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @contact_url = "#{JsonApi::Json.current_host}/contact"
    @child_name = @user.settings['name']
    @child_username = @user.display_user_name
    @parent_email = c['parent_email']
    @revoked_at = begin
      Time.iso8601(c['parent_consent_revoked_at']).utc
    rescue ArgumentError
      nil
    end
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  # EU AI parental consent request: parent must approve before AI features can be enabled.
  # Core AAC without AI remains available. Blob: settings['eu_ai_parental_consent'].
  def eu_ai_parental_consent_request(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['eu_ai_parental_consent'] : nil
    subject = SystemEmailI18n.resolve('user_mailer/eu_ai_parental_consent_request', 'eu_ai_parental_consent_mailer.subject', 'app_name' => app_name)

    unless c.is_a?(Hash) && c['parent_email'].present? && c['parent_consent_token'].present?
      Rails.logger.warn("Skipping eu_ai_parental_consent_request for user #{user_id}: missing parent_email or parent_consent_token")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    esc_tok = CGI.escape(c['parent_consent_token'].to_s)
    @consent_url = "#{JsonApi::Json.current_host}/eu_ai_parental_consent/complete?user_id=#{@user.global_id}&token=#{esc_tok}"
    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @child_name = @user.settings['name']
    @parent_email = c['parent_email']
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  def eu_ai_parental_consent_confirmation(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['eu_ai_parental_consent'] : nil
    subject = SystemEmailI18n.resolve('user_mailer/eu_ai_parental_consent_confirmation', 'eu_ai_parental_consent_confirmation_mailer.subject', 'app_name' => app_name)

    unless c.is_a?(Hash) && c['parent_email'].present? && c['parent_consent_granted_at'].present? && c['parent_consent_revoke_token'].present?
      Rails.logger.warn("Skipping eu_ai_parental_consent_confirmation for user #{user_id}: missing parent_email, grant timestamp, or revoke token")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    esc_tok = CGI.escape(c['parent_consent_revoke_token'].to_s)
    @revoke_url = "#{JsonApi::Json.current_host}/eu_ai_parental_consent/revoke?user_id=#{@user.global_id}&token=#{esc_tok}"
    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @contact_url = "#{JsonApi::Json.current_host}/contact"
    @child_name = @user.settings['name']
    @child_username = @user.display_user_name
    @parent_email = c['parent_email']
    @granted_at = begin
      Time.iso8601(c['parent_consent_granted_at']).utc
    rescue ArgumentError
      nil
    end
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

  def eu_ai_parental_consent_revoked(user_id)
    @user = User.find_by_global_id(user_id)
    c = (@user && @user.settings) ? @user.settings['eu_ai_parental_consent'] : nil
    subject = SystemEmailI18n.resolve('user_mailer/eu_ai_parental_consent_revoked', 'eu_ai_parental_consent_revoked_mailer.subject', 'app_name' => app_name)

    unless c.is_a?(Hash) && c['parent_email'].present? && c['parent_consent_revoked_at'].present?
      Rails.logger.warn("Skipping eu_ai_parental_consent_revoked for user #{user_id}: missing parent_email or revoke timestamp")
      message = mail(subject: subject)
      message.perform_deliveries = false
      return message
    end

    @privacy_url = "#{JsonApi::Json.current_host}/privacy"
    @contact_url = "#{JsonApi::Json.current_host}/contact"
    @child_name = @user.settings['name']
    @child_username = @user.display_user_name
    @parent_email = c['parent_email']
    @revoked_at = begin
      Time.iso8601(c['parent_consent_revoked_at']).utc
    rescue ArgumentError
      nil
    end
    from = JsonApi::Json.current_domain['settings']['admin_email']
    opts = {to: @parent_email, subject: subject}
    opts[:from] = from if !from.blank?
    mail(opts)
  end

end
