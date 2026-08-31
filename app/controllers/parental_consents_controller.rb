# One-click parental consent completion for COPPA minor registration (token in URL).
# GET is used so the parent can approve from the email link without CSRF/session setup.
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

  def decline
    response.headers['Referrer-Policy'] = 'no-referrer'
    user = User.find_by_path(params[:user_id].presence || params['user_id'])
    token = params[:token].presence || params['token']
    @success = false
    @already_declined = false
    @offboarding = false
    if user && user.valid_parent_consent_grant_link_token?(token)
      c = user.settings && user.settings['coppa']
      @offboarding = !!(c.is_a?(Hash) && c['offboarding'])
      if c.is_a?(Hash) && c['parent_consent_declined_at'].present?
        @already_declined = true
        @success = true
      elsif user.decline_parental_consent!(token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
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
end
