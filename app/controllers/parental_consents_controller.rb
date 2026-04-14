# One-click parental consent completion for COPPA minor registration (token in URL).
# GET is used so the parent can approve from the email link without CSRF/session setup.
class ParentalConsentsController < ApplicationController
  def complete
    response.headers['Referrer-Policy'] = 'no-referrer'
    user = User.find_by_path(params[:user_id].presence || params['user_id'])
    token = params[:token].presence || params['token']
    @success = false
    @already_granted = false
    c = user && user.settings && user.settings['coppa']
    if user && c.is_a?(Hash) && c['parent_consent_granted_at'].present? && !user.coppa_parental_consent_pending?
      @already_granted = true
      @success = true
    elsif user && user.grant_parental_consent!(token)
      @success = true
      UserMailer.schedule_delivery(:confirm_registration, user.global_id)
      UserMailer.schedule_delivery(:new_user_registration, user.global_id)
      ExternalTracker.track_new_user(user)
      d = Device.find_or_create_by(user_id: user.id, device_key: 'default', developer_key_id: 0)
      d.generate_token!(!!d.settings['app'])
    end
    render layout: 'parental_consent'
  end
end
