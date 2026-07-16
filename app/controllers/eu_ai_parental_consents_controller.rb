# One-click EU AI parental consent for under-16 EU communicators (token in URL).
# GET so the parent can approve from email without CSRF/session setup.
# Unlike COPPA signup consent, this does NOT create devices or welcome emails —
# only grant/revoke + confirmation mailer.
class EuAiParentalConsentsController < ApplicationController
  def complete
    response.headers['Referrer-Policy'] = 'no-referrer'
    user = User.find_by_path(params[:user_id].presence || params['user_id'])
    token = params[:token].presence || params['token']
    @success = false
    @already_granted = false
    if user && user.valid_eu_ai_parent_consent_grant_link_token?(token)
      if user.eu_ai_parental_consent_active?
        @already_granted = true
        @success = true
      elsif user.eu_ai_parental_consent_pending? && user.grant_eu_ai_parental_consent!(token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        UserMailer.schedule_parent_consent_delivery(:eu_ai_parental_consent_confirmation, user.global_id)
      end
    end
    render layout: 'parental_consent'
  end

  def revoke
    response.headers['Referrer-Policy'] = 'no-referrer'
    user = User.find_by_path(params[:user_id].presence || params['user_id'])
    token = params[:token].presence || params['token']
    @success = false
    @already_revoked = false
    if user && user.valid_eu_ai_parent_consent_revoke_link_token?(token)
      if user.eu_ai_parental_consent_revoked?
        @already_revoked = true
        @success = true
      elsif user.revoke_eu_ai_parental_consent!(token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        UserMailer.schedule_parent_consent_delivery(:eu_ai_parental_consent_revoked, user.global_id)
      end
    end
    render 'revoke', layout: 'parental_consent'
  end
end
