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

  it 'still delivers via deliver_now when SES_CONFIGURATION_SET is unset (no-op path is not fatal)' do
    # The interceptor is registered unconditionally; this proves the unset/no-op branch does not
    # itself break the ActionMailer delivery path (e.g. by raising on a nil header assignment).
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return(nil)
    ActionMailer::Base.mail(to: 'a@example.com', from: 'b@example.com', subject: 'hi', body: 'hi').deliver_now
    expect(ActionMailer::Base.deliveries.last.header['X-SES-CONFIGURATION-SET']).to eq(nil)
  end

  it 'regression guard: only adds the configuration-set header, never touches to/from/subject/body' do
    # Guards against a future edit to delivering_email accidentally mutating message content
    # instead of just the diagnostic header -- the interceptor's whole job is to be invisible to
    # the mail's actual payload. Stubs the header-setting path (not the no-op) since that's the
    # branch that actually touches the message object.
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return('lingolinq-transactional')
    before = {
      to: message.to,
      from: message.from,
      subject: message.subject,
      body: message.body.to_s
    }

    SesConfigurationSetInterceptor.delivering_email(message)

    expect(message.to).to eq(before[:to])
    expect(message.from).to eq(before[:from])
    expect(message.subject).to eq(before[:subject])
    expect(message.body.to_s).to eq(before[:body])
  end

  it 'does not duplicate the header if delivering_email runs twice on the same message' do
    # message.header[]= appends rather than replaces, so a message re-run through the
    # interceptor (e.g. a manual delivery retry on the same Mail object) could end up with two
    # X-SES-CONFIGURATION-SET fields, which is undefined behavior for SES to receive.
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with('SES_CONFIGURATION_SET').and_return('lingolinq-transactional')

    SesConfigurationSetInterceptor.delivering_email(message)
    SesConfigurationSetInterceptor.delivering_email(message)

    expect(Array(message.header['X-SES-CONFIGURATION-SET']).size).to eq(1)
    expect(message.header['X-SES-CONFIGURATION-SET'].value).to eq('lingolinq-transactional')
  end
end
