# Parental consent links for COPPA registration (token in the URL).
# GET renders a confirmation page and writes nothing. POST performs the action.
# Mail-security scanners, inbox previews and browser prefetch fetch the link
# with no person involved. ApplicationController sets
# `protect_from_forgery with: :null_session`, so a missing authenticity token
# does not raise. An Origin of "null" still raises before that strategy runs,
# and Referrer-Policy no-referrer makes a browser send that origin, so these
# pages send strict-origin: the token stays out of the Referer, and the POST
# origin is the site itself. The security property is that those fetchers
# issue GETs, not POSTs. The URL token remains the authorization. Decline
# already worked this way; complete and revoke follow it (#1338).
class ParentalConsentsController < ApplicationController
  # GET /parental_consent/complete. Renders the confirmation page. No mutation.
  def complete
    prepare_complete_context
    render 'complete', layout: 'parental_consent'
  end

  # POST /parental_consent/complete. Approves the account.
  def complete_submit
    prepare_complete_context
    if @state == :confirm && approve_parental_account!
      @success = true
      @state = :granted
    elsif @state == :confirm
      @state = :invalid
      @success = false
    end
    render 'complete', layout: 'parental_consent'
  end

  # GET /parental_consent/decline -- renders the confirmation page. NO MUTATION.
  def decline
    prepare_decline_context
    render 'decline', layout: 'parental_consent'
  end

  # POST /parental_consent/decline -- performs the decline.
  def decline_submit
    prepare_decline_context
    if @state == :confirm
      if @decline_user.decline_parental_consent!(@decline_token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        @state = decline_outcome_state
      else
        # A concurrent decline or a state change between the GET and this POST.
        # Nothing was changed.
        @state = :invalid
        @success = false
      end
    end
    render 'decline', layout: 'parental_consent'
  end

  # GET /parental_consent/revoke. Renders the confirmation page. No mutation.
  def revoke
    prepare_revoke_context
    render 'revoke', layout: 'parental_consent'
  end

  # POST /parental_consent/revoke. Withdraws consent. Does not call
  # revoke_ai_consent!; that question is left open for reviewers (#1338).
  def revoke_submit
    prepare_revoke_context
    if @state == :confirm
      if @revoke_user.revoke_parental_consent!(@revoke_token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        @state = :revoked
        UserMailer.schedule_parent_consent_delivery(:parental_consent_revoked, @revoke_user.global_id)
      else
        @state = :invalid
        @success = false
      end
    end
    render 'revoke', layout: 'parental_consent'
  end

  private

  def prepare_complete_context
    response.headers['Referrer-Policy'] = 'strict-origin'
    @complete_user = User.find_by_path(params[:user_id].presence || params['user_id'])
    @complete_token = params[:token].presence || params['token']
    @success = false
    @already_granted = false
    @records_ai_consent = parent_ai_notice_current?(@complete_user, 'coppa')
    @state = :invalid
    return unless @complete_user && @complete_user.valid_parent_consent_grant_link_token?(@complete_token)
    if @complete_user.coppa_parental_consent_active?
      @already_granted = true
      @success = true
      @state = :already_granted
    elsif @complete_user.coppa_parental_consent_pending? && !consent_link_expired?(@complete_user.settings && @complete_user.settings['coppa'])
      @state = :confirm
    end
  end

  def prepare_revoke_context
    response.headers['Referrer-Policy'] = 'strict-origin'
    @revoke_user = User.find_by_path(params[:user_id].presence || params['user_id'])
    @revoke_token = params[:token].presence || params['token']
    @success = false
    @already_revoked = false
    @state = :invalid
    return unless @revoke_user && @revoke_user.valid_parent_consent_revoke_link_token?(@revoke_token)
    if @revoke_user.coppa_parental_consent_revoked?
      @already_revoked = true
      @success = true
      @state = :already_revoked
    elsif @revoke_user.settings.dig('coppa', 'parent_consent_granted_at').present?
      @state = :confirm
    end
  end

  # Same stamp record_parent_ai_consent! requires. A link sent before the email
  # carried the current AI notice still approves the account and records no
  # AI consent, so the confirmation page must not say that it will.
  def parent_ai_notice_current?(user, bucket)
    blob = user && user.settings.is_a?(Hash) ? user.settings[bucket] : nil
    stamped = blob.is_a?(Hash) ? blob['ai_disclosures_version'] : nil
    stamped == LingoLinq::AiConsentDisclosures::CURRENT_VERSION
  end

  # Same expiry rule User#grant_parental_consent! enforces: a blank expiry is
  # still open, a past or unparseable expiry is refused. Read here so the GET
  # can refuse without calling the grant.
  def consent_link_expired?(blob)
    exp = blob.is_a?(Hash) ? blob['parent_consent_expires_at'] : nil
    return false if exp.blank?
    Time.iso8601(exp) < Time.now.utc
  rescue ArgumentError
    true
  end

  def approve_parental_account!
    user = @complete_user
    token = @complete_token
    return false unless user.grant_parental_consent!(token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
    # grant_parental_consent! writes the immutable COPPA AuditEvent atomically
    # with the consent grant (see User#grant_parental_consent!).
    # AI data-sharing consent (#1136) comes with the parent's approval. Outside
    # grant_parental_consent!'s own lock, after it has committed.
    user.record_parent_ai_consent!(request: 'coppa', ip: request.remote_ip, user_agent: request.headers['User-Agent'])
    UserMailer.schedule_parent_consent_delivery(:parental_consent_confirmation, user.global_id)
    # Signup activation side effects (welcome mail, tracker, device mint) are
    # only for new under-13 registrations. Org-offboarding grants unlock an
    # existing account. The communicator logs in after consent.
    offboarding = user.settings.dig('coppa', 'offboarding')
    unless offboarding
      UserMailer.schedule_delivery(:confirm_registration, user.global_id)
      UserMailer.schedule_delivery(:new_user_registration, user.global_id)
      ExternalTracker.track_new_user(user)
      d = Device.find_or_create_by(user_id: user.id, device_key: 'default', developer_key_id: 0)
      d.settings['ip_address'] = request.remote_ip
      log_installed_client_signal('parental_consents#complete')
      apply_device_classification!(d, installed_app?)
      d.settings['user_agent'] = request.headers['User-Agent']
      d.save
      d.generate_token!(!!d.settings['app'])
    end
    true
  end

  # Resolves the account, the token and which of the four page states applies,
  # WITHOUT writing anything. Shared by the GET and the POST so the confirmation
  # page and the action that follows it can never disagree about who is being
  # declined or whether the link is still good.
  #
  #   :invalid                 -- no such user, or the token does not check out
  #   :already_declined        -- a previous decline already landed and, for
  #                               offboarding, the export has been scheduled
  #   :declined_export_pending -- declined, but the offboarding export is not
  #                               scheduled yet (first POST or a later revisit)
  #   :confirm                 -- valid and still pending; GET stops here, POST acts
  #   :declined                -- set by decline_submit after a successful decline
  def prepare_decline_context
    response.headers['Referrer-Policy'] = 'strict-origin'
    @decline_user = User.find_by_path(params[:user_id].presence || params['user_id'])
    @decline_token = params[:token].presence || params['token']
    @success = false
    @already_declined = false
    @offboarding = false
    @state = :invalid
    return unless @decline_user && @decline_user.valid_parent_consent_grant_link_token?(@decline_token)

    c = @decline_user.settings && @decline_user.settings['coppa']
    return unless c.is_a?(Hash)
    @offboarding = !!c['offboarding']
    @state =
      if c['parent_consent_declined_at'].present?
        @already_declined = true
        @success = true
        if @offboarding && c['offboarding_export_scheduled_at'].blank?
          :declined_export_pending
        else
          :already_declined
        end
      elsif !declinable?(c)
        :not_declinable
      else
        :confirm
      end
  end

  # Mirrors every refusal in User#decline_parental_consent!. Without this the
  # confirmation page offers "Decline and delete the account" to a parent whose
  # consent was already granted or whose window expired, and the POST then dead-ends
  # on "Link invalid" with nowhere to go -- worse than the pre-change behaviour,
  # which showed invalid immediately. It also catches an offboarding account the
  # sweep has already scheduled, where the page's "Nothing has changed yet" would
  # be false.
  def declinable?(c)
    return false unless c['pending_parent_consent']
    return false if c['parent_consent_granted_at'].present?
    return false if c['offboarding_export_scheduled_at'].present?
    exp = c['parent_consent_expires_at']
    return true if exp.blank?
    begin
      Time.iso8601(exp) >= Time.now.utc
    rescue ArgumentError
      false
    end
  end

  # The decline itself always persists (and revokes tokens). For an ORG OFFBOARDING
  # it also kicks off export-then-delete, and that can fail -- an S3 error leaves the
  # account declined but with no export and no schedule_deletion_at. Reporting
  # "scheduled for export and deletion" then would be a straight lie to the parent,
  # so read the persisted result rather than assuming it worked.
  def decline_outcome_state
    return :declined unless @offboarding
    c = @decline_user.reload.settings['coppa'] || {}
    c['offboarding_export_scheduled_at'].present? ? :declined : :declined_export_pending
  end
end
