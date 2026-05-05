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
    RequestStore.clear!
  end

  after { RequestStore.clear! }

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

    # Regression: the production set_sentry_user path stores
    # SHA-512(remote_ip) into Sentry.user.id for issue grouping. That hex
    # string never matches a User row, so before this fix the COPPA branch
    # was dead code in production. The User reference must come from
    # RequestStore, not from the event's user.id field.
    it 'scrubs a child user when only RequestStore identifies them (hashed IP id)' do
      RequestStore.store[CoppaSentryScrub::REQUEST_STORE_KEY] = child_user_record
      sha_id = '0' * 128
      event = Event.new(
        user: { id: sha_id },
        request: Request.new(data: { board: 'private' }, ip_address: '203.0.113.7')
      )

      described_class.call(event, nil)

      expect(event.user).to eq({ id: '[REDACTED_ID]' })
      expect(event.request.data).to eq('[REDACTED]')
      expect(event.request.ip_address).to eq('[REDACTED_IP]')
    end

    it 'leaves an adult event alone even when RequestStore is set' do
      RequestStore.store[CoppaSentryScrub::REQUEST_STORE_KEY] = adult_user_record
      event = Event.new(
        user: { id: 'a' * 128 },
        request: Request.new(data: 'sensitive')
      )

      described_class.call(event, nil)

      expect(event.request.data).to eq('sensitive')
    end

    it 'leaves the event alone when only a hex hash id is set and RequestStore is empty' do
      sha_id = 'f' * 128
      event = Event.new(user: { id: sha_id }, request: Request.new(data: 'sensitive'))

      described_class.call(event, nil)

      expect(event.user).to eq({ id: sha_id })
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

  # before_breadcrumb runs for ALL users, COPPA-pending or not. This is the
  # global second line of defense against access_token / reset_token / email
  # leaking through Sentry's auto-captured HTTP and ActiveSupport breadcrumbs.
  describe '#scrub_breadcrumb' do
    Breadcrumb = Struct.new(:message, :data, :category) do
      def initialize(message: nil, data: nil, category: nil)
        super(message, data, category)
      end
    end

    it 'redacts access_token from breadcrumb url' do
      bc = Breadcrumb.new(
        category: 'http',
        data: { 'url' => 'https://api.example.com/v1/things?access_token=abc123&page=2' }
      )
      described_class.scrub_breadcrumb(bc)
      expect(bc.data['url']).to include('access_token=[REDACTED]')
      expect(bc.data['url']).to include('page=2')
    end

    it 'redacts multiple sensitive keys in one url' do
      bc = Breadcrumb.new(
        data: { url: 'https://x.test/?token=t1&password=p1&page=ok' }
      )
      described_class.scrub_breadcrumb(bc)
      expect(bc.data[:url]).to include('token=[REDACTED]')
      expect(bc.data[:url]).to include('password=[REDACTED]')
      expect(bc.data[:url]).to include('page=ok')
    end

    it 'redacts sensitive keys appearing in the breadcrumb message string' do
      bc = Breadcrumb.new(message: 'GET /reset?reset_token=r1&user=42')
      described_class.scrub_breadcrumb(bc)
      expect(bc.message).to include('reset_token=[REDACTED]')
      expect(bc.message).to include('user=42')
    end

    it 'is safe on a breadcrumb with no data and no message' do
      bc = Breadcrumb.new
      expect { described_class.scrub_breadcrumb(bc) }.not_to raise_error
    end

    it 'never raises when breadcrumb shape is unexpected' do
      bc = Breadcrumb.new(data: 'not_a_hash', message: nil)
      expect { described_class.scrub_breadcrumb(bc) }.not_to raise_error
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
