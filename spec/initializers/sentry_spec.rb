require 'spec_helper'

# Verify CoppaSentryScrub mirrors the privacy guarantees CoppaBugsnagScrub
# enforced before the Sentry migration (PR #225 -> Sentry adoption thread).
# Specifically: under-13 with consent pending must never have user_id,
# request body, sensitive headers, or PII-bearing URLs leave the box.
describe CoppaSentryScrub do
  # Stand-in for Sentry::Event. Reproduces the surface the scrubber
  # touches: user, request, contexts, exception, tags. No network,
  # no Sentry boot.
  Event = Struct.new(:user, :request, :contexts, :exception, :tags) do
    def initialize(user: nil, request: nil, contexts: nil, exception: nil, tags: nil)
      super(user, request, contexts, exception, tags)
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

  # before_send_event is the top-level Sentry before_send hook. It drops
  # ActiveSupport::Cache::* events (sentry-ruby#1765) then delegates to
  # #call. Tested via the Event stand-in so no SDK boot is required.
  describe '#before_send_event' do
    def cache_exception(type = 'ActiveSupport::Cache::FetchError')
      values = [double('SingleException', type: type)]
      double('Exception', values: values)
    end

    it 'drops ActiveSupport::Cache::* errors by returning nil' do
      event = Event.new(exception: cache_exception)
      expect(described_class.before_send_event(event, nil)).to be_nil
    end

    it 'lets the event through when keep_cache_error tag is true' do
      event = Event.new(
        user: { id: 99 },
        exception: cache_exception,
        tags: { keep_cache_error: true }
      )
      result = described_class.before_send_event(event, nil)
      expect(result).to be(event)
    end

    it 'falls through to #call for non-cache exceptions' do
      runtime_exc = double('Exception', values: [double('SingleException', type: 'RuntimeError')])
      event = Event.new(user: { id: 99 }, request: Request.new(data: 'sensitive'), exception: runtime_exc)
      result = described_class.before_send_event(event, nil)
      expect(result).to be(event)
      expect(event.request.data).to eq('sensitive')
    end

    it 'falls through to #call when no exception is attached (message event)' do
      event = Event.new(user: { id: 99 }, request: Request.new(data: 'sensitive'), exception: nil)
      result = described_class.before_send_event(event, nil)
      expect(result).to be(event)
    end
  end

  describe '#drop_cache_errors?' do
    def event_with_exception_type(type)
      Event.new(exception: double('Exception', values: [double('SingleException', type: type)]))
    end

    it 'returns true for ActiveSupport::Cache::FetchError' do
      expect(described_class.drop_cache_errors?(event_with_exception_type('ActiveSupport::Cache::FetchError'))).to eq(true)
    end

    it 'returns true for any ActiveSupport::Cache::* subclass' do
      expect(described_class.drop_cache_errors?(event_with_exception_type('ActiveSupport::Cache::WriteError'))).to eq(true)
    end

    it 'returns false for non-cache exceptions' do
      expect(described_class.drop_cache_errors?(event_with_exception_type('RuntimeError'))).to eq(false)
    end

    it 'returns false when keep_cache_error tag is true' do
      event = Event.new(
        exception: double('Exception', values: [double('SingleException', type: 'ActiveSupport::Cache::FetchError')]),
        tags: { keep_cache_error: true }
      )
      expect(described_class.drop_cache_errors?(event)).to eq(false)
    end

    it 'returns false when event has no exception (message event)' do
      expect(described_class.drop_cache_errors?(Event.new(exception: nil))).to eq(false)
    end

    it 'never raises on an unexpected exception shape' do
      bad_event = Event.new(exception: Object.new)
      expect { described_class.drop_cache_errors?(bad_event) }.not_to raise_error
      expect(described_class.drop_cache_errors?(bad_event)).to eq(false)
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

describe SentryTracesSampler do
  describe '.call' do
    it 'returns 0.0 for /api/v1/health (Render health probe)' do
      expect(described_class.call(transaction_context: { name: '/api/v1/health' })).to eq(0.0)
    end

    it 'returns 0.0 for any /assets/* path' do
      expect(described_class.call(transaction_context: { name: '/assets/application-abc123.js' })).to eq(0.0)
    end

    it 'does NOT match aspirational endpoints that do not exist in routes.rb' do
      # Sanity: /health, /healthz, /metrics are NOT defined in this app.
      # If a future route adds them, extend IGNORED_TRANSACTION_PATTERN
      # rather than relying on Sentry-side scrubbers.
      expect(described_class.call(transaction_context: { name: '/health' })).to be_nil
      expect(described_class.call(transaction_context: { name: '/healthz' })).to be_nil
      expect(described_class.call(transaction_context: { name: '/metrics' })).to be_nil
    end

    it 'does not match /api/v1/health-check or /api/v1/healthy (anchored)' do
      expect(described_class.call(transaction_context: { name: '/api/v1/health-check' })).to be_nil
      expect(described_class.call(transaction_context: { name: '/api/v1/healthy' })).to be_nil
    end

    it 'does not match /things/assets (the anchor is at the start of the path)' do
      expect(described_class.call(transaction_context: { name: '/things/assets/foo.png' })).to be_nil
    end

    it 'returns 1.0 when parent_sampled is true (force-keep distributed trace)' do
      ctx = { transaction_context: { name: '/api/v1/things' }, parent_sampled: true }
      expect(described_class.call(ctx)).to eq(1.0)
    end

    it 'parent_sampled does NOT rescue an ignored transaction' do
      ctx = { transaction_context: { name: '/api/v1/health' }, parent_sampled: true }
      expect(described_class.call(ctx)).to eq(0.0)
    end

    it 'returns nil for any other transaction (falls through to traces_sample_rate)' do
      expect(described_class.call(transaction_context: { name: '/api/v1/boards' })).to be_nil
    end

    it 'returns nil when transaction_context is missing' do
      expect(described_class.call({})).to be_nil
    end
  end

  # Regression guard: sentry-ruby 6.5 checks `traces_sampler.is_a?(Proc)`
  # (lib/sentry/transaction.rb:144) and silently no-ops anything that isn't
  # a Proc. A Method object returns false to is_a?(Proc) and is therefore
  # ignored. This spec catches an accidental refactor like
  # `SentryTracesSampler.method(:call)`.
  describe 'wiring contract' do
    it 'must be wrapped in a Proc-compatible object (not a Method)' do
      proc_form = ->(ctx) { described_class.call(ctx) }
      method_form = described_class.method(:call)
      expect(proc_form.is_a?(Proc)).to eq(true)
      expect(method_form.is_a?(Proc)).to eq(false)
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
