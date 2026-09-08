require 'spec_helper'

describe SmsConsentInvite, :type => :model do
  def enable_flag!(user)
    user.settings ||= {}
    user.settings['feature_flags'] = {'sms_recipient_consent' => true}
    user.save
    user
  end

  before(:each) do
    allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(FeatureFlags::AVAILABLE_FRONTEND_FEATURES)
  end

  it "issues a token only when the communicator flag is on" do
    user = User.create
    expect { SmsConsentInvite.issue!(user) }.to raise_error('sms_recipient_consent disabled')
    enable_flag!(user)
    invite = SmsConsentInvite.issue!(user)
    expect(invite.token).to be_present
    expect(invite.expires_at).to be > Time.now
    expect(invite.user_id).to eq(user.id)
  end

  it "find_valid returns nil for missing, expired, or flag-off invites" do
    user = enable_flag!(User.create)
    invite = SmsConsentInvite.issue!(user)
    expect(SmsConsentInvite.find_valid(invite.token)).to eq(invite)
    expect(SmsConsentInvite.find_valid('nope')).to eq(nil)
    expect(SmsConsentInvite.find_valid(nil)).to eq(nil)

    invite.update!(expires_at: 1.hour.ago)
    expect(SmsConsentInvite.find_valid(invite.token)).to eq(nil)

    invite.update!(expires_at: 1.day.from_now)
    user.settings['feature_flags'] = {}
    user.save
    expect(SmsConsentInvite.find_valid(invite.token)).to eq(nil)
  end

  it "uses the communicator's display name when present" do
    user = enable_flag!(User.create)
    user.settings['name'] = 'Alex Example'
    user.save
    invite = SmsConsentInvite.issue!(user)
    expect(invite.communicator_name).to eq('Alex Example')
  end
end
