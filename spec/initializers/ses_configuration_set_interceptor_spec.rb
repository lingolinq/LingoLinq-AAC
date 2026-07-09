require 'spec_helper'

# LL-42a24ee911 remediation: unit-level guard on the ActionMailer interceptor that tags
# outgoing mail with the SES configuration set (see config/initializers/amazon_ses.rb and
# scripts/gcp/phase5-ses-config-set-setup.sh). Env-gated like WriteFreeze, not a
# lib/feature_flags.rb entry -- this is operator infra observability, not user-facing behavior.
describe SesConfigurationSetInterceptor do
  let(:message) { Mail.new(to: 'a@example.com', from: 'b@example.com', subject: 'hi', body: 'hi') }

  describe '.delivering_email' do
    it 'does not set the header when SES_CONFIGURATION_SET is unset (default, safe no-op)' do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return(nil)
      SesConfigurationSetInterceptor.delivering_email(message)
      expect(message.header['X-SES-CONFIGURATION-SET']).to eq(nil)
    end

    it 'does not set the header when SES_CONFIGURATION_SET is blank' do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return('')
      SesConfigurationSetInterceptor.delivering_email(message)
      expect(message.header['X-SES-CONFIGURATION-SET']).to eq(nil)
    end

    it 'sets the X-SES-CONFIGURATION-SET header when SES_CONFIGURATION_SET is set' do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return('lingolinq-transactional')
      SesConfigurationSetInterceptor.delivering_email(message)
      expect(message.header['X-SES-CONFIGURATION-SET'].value).to eq('lingolinq-transactional')
    end
  end

  it 'is registered as an ActionMailer interceptor, so an actual deliver_now call tags the header' do
    # Proves the interceptor is wired up at boot (config/initializers/amazon_ses.rb), not just
    # callable in isolation. Test env's delivery_method is :test, so this stores the message in
    # ActionMailer::Base.deliveries rather than hitting SES.
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return('lingolinq-transactional')
    ActionMailer::Base.mail(to: 'a@example.com', from: 'b@example.com', subject: 'hi', body: 'hi').deliver_now
    expect(ActionMailer::Base.deliveries.last.header['X-SES-CONFIGURATION-SET'].value)
      .to eq('lingolinq-transactional')
  end
end
