# One-click parental consent completion for COPPA minor registration (token in URL).
# GET is used so the parent can approve from the email link without CSRF/session setup.
#
# DECLINE IS THE EXCEPTION, and deliberately so. #complete and #revoke act on GET
# because that is what a one-click email link needs, but #decline is the only one
# of the three that DESTROYS the account: it schedules deletion 36 hours out (or,
# for an org offboarding, an export-then-delete). Mail-security link scanners,
# inbox link previews and browser prefetch all fetch URLs out of a parent's inbox
# with no human involved, so a decline-on-GET lets a robot delete a child's AAC
# account. #decline therefore renders a confirmation page and mutates nothing;
# #decline_submit does the work on POST.
#
# Note what the POST does and does not buy: ApplicationController sets
# `protect_from_forgery with: :null_session`, so a missing authenticity token
# does NOT raise here. The security property is that automated fetchers issue
# GETs, not POSTs. The URL token remains the actual authorization.
class ParentalConsentsController < ApplicationController
  def complete
    response.headers['Referrer-Policy'] = 'no-referrer'
    user = User.find_by_path(params[:user_id].presence || params['user_id'])
    token = params[:token].presence || params['token']
    @success = false
    @already_granted = false
    if user && user.valid_parent_consent_grant_link_token?(token)
      if user.coppa_parental_consent_active?
        @already_granted = true
        @success = true
      elsif user.coppa_parental_consent_pending? && user.grant_parental_consent!(token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        # grant_parental_consent! writes the immutable COPPA AuditEvent atomically
        # with the consent grant (see User#grant_parental_consent!).
        @success = true
        UserMailer.schedule_parent_consent_delivery(:parental_consent_confirmation, user.global_id)
        # Signup activation side effects (welcome mail, tracker, device mint) are
        # only for new under-13 registrations. Org-offboarding grants unlock an
        # existing account — the communicator logs in after consent.
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
      end
    end
    render layout: 'parental_consent'
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

  def revoke
    response.headers['Referrer-Policy'] = 'no-referrer'
    user = User.find_by_path(params[:user_id].presence || params['user_id'])
    token = params[:token].presence || params['token']
    @success = false
    @already_revoked = false
    if user && user.valid_parent_consent_revoke_link_token?(token)
      if user.coppa_parental_consent_revoked?
        @already_revoked = true
        @success = true
      elsif user.revoke_parental_consent!(token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        UserMailer.schedule_parent_consent_delivery(:parental_consent_revoked, user.global_id)
      end
    end
    render 'revoke', layout: 'parental_consent'
  end

  private

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
    response.headers['Referrer-Policy'] = 'no-referrer'
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
