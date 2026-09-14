# Unauthenticated SMS recipient opt-in. GET renders the disclosure and mutates
# nothing (inbox scanners fetch GET). POST is the only grant path.
class SmsConsentsController < ApplicationController
  layout 'parental_consent'

  def show
    load_form
    render :show
  end

  def submit
    load_form
    if @page_state == :form
      unless params['agree'] == '1'
        @error = 'must_agree'
        render :show
        return
      end
      number = params['phone']
      if number.blank?
        @error = 'missing_phone'
        render :show
        return
      end
      SmsConsent.grant!(
        @invite.user,
        number,
        ip: request.remote_ip,
        disclosure_version: SmsConsent::DISCLOSURE_VERSION
      )
      @page_state = :thanks
    end
    render :show
  end

  private

  def load_form
    @invite = SmsConsentInvite.find_valid(params[:token] || params['token'])
    @communicator_name = @invite && @invite.communicator_name
    @disclosure_version = SmsConsent::DISCLOSURE_VERSION
    @page_state = @invite ? :form : :invalid
  end
end
