require 'spec_helper'

# Verify CoppaSentryScrub mirrors the privacy guarantees CoppaBugsnagScrub
# enforced before the Sentry migration (PR #225 -> Sentry adoption thread).
# Specifically: under-13 with consent pending must never have user_id,
# request body, sensitive headers, or PII-bearing URLs leave the box.
describe CoppaSentryScrub do
  # Stand-in for Sentry::Event. Reproduces the surface the scrubber
  # touches: user, request, contexts. No network, no Sentry boot.
  Event = Struct.new(:user, :request, :contexts) do
    def initialize(user: nil, request: nil, contexts: nil)
      super(user, request, contexts)
    end
  end

  Request = Struct.new(:url, :ip_address, :data, :headers, :cookies, :query_string) do
    def initialize(**kwargs)
      super(*members.map { |m| kwargs[m] })
    end
  end

  let(:child_user_record) do
    instance_double('User', id: 42, coppa_parental_consent_pending?: true)
  end
  let(:adult_user_record) do
    instance_double('User', id: 99, coppa_parental_consent_pending?: false)
  end

  before do
    allow(User).to receive(:where).with(id: 42).and_return(double(first: child_user_record))
    allow(User).to receive(:where).with(id: 99).and_return(double(first: adult_user_record))
    allow(User).to receive(:where).with(id: 0).and_return(double(first: nil))
  end

  describe '#call' do
    it 'returns the event unchanged when user is nil' do
      event = Event.new(user: nil, request: Request.new(data: 'sensitive'))
      result = described_class.call(event, nil)
      expect(result.request.data).to eq('sensitive')
    end

    it 'returns the event unchanged for an adult user' do
      event = Event.new(
        user: { id: 99 },
        request: Request.new(url: 'https://example.com/u/123_456', data: 'sensitive')
      )
      result = described_class.call(event, nil)
      expect(result.user).to eq({ id: 99 })
      expect(result.request.data).to eq('sensitive')
      expect(result.request.url).to eq('https://example.com/u/123_456')
    end

    it 'redacts user, request body, and sensitive headers for a child user' do
      event = Event.new(
        user: { id: 42, email: 'kid@example.com' },
        request: Request.new(
          url: 'https://example.com/u/123_456?token=abc',
          ip_address: '203.0.113.7',
          data: { board: 'private' },
          headers: { 'Cookie' => 'session=xyz', 'Content-Type' => 'application/json' },
          cookies: { 'session' => 'xyz' }
        )
      )

      described_class.call(event, nil)

      expect(event.user).to eq({ id: '[REDACTED_ID]' })
      expect(event.request.ip_address).to eq('[REDACTED_IP]')
      expect(event.request.data).to eq('[REDACTED]')
      expect(event.request.headers['Cookie']).to eq('[REDACTED]')
      expect(event.request.headers['Content-Type']).to eq('application/json')
      expect(event.request.cookies).to eq('[REDACTED]')
      expect(event.request.url).not_to include('123_456')
      expect(event.request.url).not_to include('token=abc')
    end

    it 'drops the trace context for a child user' do
      contexts = { trace: { span_id: 'abc' }, runtime: { name: 'ruby' } }
      event = Event.new(user: { id: 42 }, request: Request.new, contexts: contexts)

      described_class.call(event, nil)

      expect(event.contexts).not_to have_key(:trace)
      expect(event.contexts).to have_key(:runtime)
    end

    it 'never raises out of the scrubber' do
      bad_user = Class.new do
        def coppa_parental_consent_pending?; raise 'boom'; end
      end.new
      allow(User).to receive(:where).with(id: 1).and_return(double(first: bad_user))
      event = Event.new(user: { id: 1 }, request: Request.new(data: 'whatever'))
      expect { described_class.call(event, nil) }.not_to raise_error
    end

    it 'leaves data alone when user_id does not resolve to a user record' do
      event = Event.new(user: { id: 0 }, request: Request.new(data: 'sensitive'))
      described_class.call(event, nil)
      expect(event.request.data).to eq('sensitive')
    end
  end

  describe '#redact_url' do
    it 'strips query string and global id substrings' do
      url = 'https://example.com/api/v1/users/42_999_xyz?auth=token'
      expect(described_class.redact_url(url)).to eq('https://example.com/api/v1/users/[REDACTED_ID]')
    end

    it 'leaves urls without identifiers alone' do
      expect(described_class.redact_url('https://example.com/health')).to eq('https://example.com/health')
    end
  end
end

describe 'config/initializers/sentry.rb' do
  it 'does not boot Sentry when SENTRY_DSN is blank' do
    # The initializer is gated on ENV['SENTRY_DSN']. In the test env we boot
    # without a DSN, so Sentry should remain uninitialized.
    expect(Sentry.initialized?).to eq(false)
  end
end
