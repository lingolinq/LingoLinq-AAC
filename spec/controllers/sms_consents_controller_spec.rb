require 'spec_helper'

describe SmsConsentsController, :type => :controller do
  render_views

  def enable_flag!(user)
    user.settings ||= {}
    user.settings['feature_flags'] = {'sms_recipient_consent' => true}
    user.save
    user
  end

  before(:each) do
    allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(FeatureFlags::AVAILABLE_FRONTEND_FEATURES)
  end

  env_wrap({
    'SMS_ENCRYPTION_KEY' => 'sms-consent-spec-key'
  }) do
    describe "GET show" do
      it "renders the disclosure form for a valid invite" do
        user = enable_flag!(User.create)
        user.settings['name'] = 'Alex Example'
        user.save
        invite = SmsConsentInvite.issue!(user)
        get :show, params: { token: invite.token }
        expect(response).to be_successful
        expect(response.body).to include('Alex Example')
        expect(response.body).to include('Message and data rates may apply.')
        expect(response.body).to include('Reply STOP to opt out, HELP for help.')
        expect(response.body).to include('/terms')
        expect(response.body).to include('/privacy')
        expect(response.body).not_to include('checked')
        expect(response.body).to include('type="checkbox"')
      end

      it "does not grant on GET" do
        user = enable_flag!(User.create)
        invite = SmsConsentInvite.issue!(user)
        expect {
          get :show, params: { token: invite.token }
        }.not_to change { SmsConsent.count }
      end

      it "renders invalid for a missing token" do
        get :show, params: { token: 'missing' }
        expect(response).to be_successful
        expect(response.body).to include('Link invalid or expired')
      end
    end

    describe "POST submit" do
      it "does not grant without the agreement checkbox" do
        user = enable_flag!(User.create)
        invite = SmsConsentInvite.issue!(user)
        post :submit, params: { token: invite.token, phone: '5558675309' }
        expect(SmsConsent.granted?(user, '5558675309')).to eq(false)
        expect(response.body).to include('Check the agreement box to continue.')
      end

      it "grants when the number is confirmed and the box is checked" do
        user = enable_flag!(User.create)
        invite = SmsConsentInvite.issue!(user)
        post :submit, params: { token: invite.token, phone: '(555) 867-5309', agree: '1' }
        expect(SmsConsent.granted?(user, '5558675309')).to eq(true)
        expect(response.body).to include('Consent recorded')
        row = SmsConsent.find_by(user_id: user.id)
        expect(row.disclosure_version).to eq(SmsConsent::DISCLOSURE_VERSION)
        expect(row.request_ip).to be_present
      end

      it "does not grant for an expired invite" do
        user = enable_flag!(User.create)
        invite = SmsConsentInvite.issue!(user)
        invite.update!(expires_at: 1.hour.ago)
        post :submit, params: { token: invite.token, phone: '5558675309', agree: '1' }
        expect(SmsConsent.granted?(user, '5558675309')).to eq(false)
        expect(response.body).to include('Link invalid or expired')
      end
    end
  end

  it "keeps matching sms_consent keys in en.yml and es.yml" do
    en = I18n.t('sms_consent', locale: :en)
    es = I18n.t('sms_consent', locale: :es)
    expect(es.keys.sort).to eq(en.keys.sort)
  end
end
