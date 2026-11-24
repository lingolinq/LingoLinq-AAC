# EU AI parental consent for under-16 communicators (token in the URL).
# GET renders a confirmation page and writes nothing. POST grants or withdraws.
# Unlike COPPA signup consent, this does not create devices or welcome emails.
# Scanners fetch the inbox link; the URL token stays the authorization (#1338).
class EuAiParentalConsentsController < ApplicationController
  def complete
    prepare_complete_context
    render 'complete', layout: 'parental_consent'
  end

  def complete_submit
    prepare_complete_context
    if @state == :confirm
      if @complete_user.grant_eu_ai_parental_consent!(@complete_token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        @state = :granted
        # AI data-sharing consent (#1136) comes with the parent's approval of AI features.
        @complete_user.record_parent_ai_consent!(request: 'eu_ai_parental_consent', ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        UserMailer.schedule_parent_consent_delivery(:eu_ai_parental_consent_confirmation, @complete_user.global_id)
      else
        @state = :invalid
        @success = false
      end
    end
    render 'complete', layout: 'parental_consent'
  end

  def revoke
    prepare_revoke_context
    render 'revoke', layout: 'parental_consent'
  end

  # Does not call revoke_ai_consent!. Whether withdrawal should also clear the
  # AI data-sharing grant is an open question for reviewers (#1338).
  def revoke_submit
    prepare_revoke_context
    if @state == :confirm
      if @revoke_user.revoke_eu_ai_parental_consent!(@revoke_token, ip: request.remote_ip, user_agent: request.headers['User-Agent'])
        @success = true
        @state = :revoked
        UserMailer.schedule_parent_consent_delivery(:eu_ai_parental_consent_revoked, @revoke_user.global_id)
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
    @state = :invalid
    return unless @complete_user && @complete_user.valid_eu_ai_parent_consent_grant_link_token?(@complete_token)
    if @complete_user.eu_ai_parental_consent_active?
      @already_granted = true
      @success = true
      @state = :already_granted
    elsif @complete_user.eu_ai_parental_consent_pending? && !consent_link_expired?(@complete_user.settings && @complete_user.settings['eu_ai_parental_consent'])
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
    return unless @revoke_user && @revoke_user.valid_eu_ai_parent_consent_revoke_link_token?(@revoke_token)
    if @revoke_user.eu_ai_parental_consent_revoked?
      @already_revoked = true
      @success = true
      @state = :already_revoked
    elsif @revoke_user.settings.dig('eu_ai_parental_consent', 'parent_consent_granted_at').present?
      @state = :confirm
    end
  end

  def consent_link_expired?(blob)
    exp = blob.is_a?(Hash) ? blob['parent_consent_expires_at'] : nil
    return false if exp.blank?
    Time.iso8601(exp) < Time.now.utc
  rescue ArgumentError
    true
  end
end
