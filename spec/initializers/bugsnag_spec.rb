require 'spec_helper'

describe CoppaBugsnagScrub do
  # Stand-in for Bugsnag::Report. Reproduces the surface the scrubber
  # touches: user, meta_data, context. No network, no Bugsnag boot.
  class FakeReport
    attr_accessor :user, :meta_data, :context

    def initialize(user: nil, meta_data: {}, context: nil)
      @user = user
      @meta_data = meta_data
      @context = context
    end
  end

  let(:child_user) { double('User', id: 101, coppa_parental_consent_pending?: true) }
  let(:adult_user) { double('User', id: 202, coppa_parental_consent_pending?: false) }

  before do
    allow(User).to receive(:where).with(id: child_user.id).and_return(double(first: child_user))
    allow(User).to receive(:where).with(id: adult_user.id).and_return(double(first: adult_user))
    allow(User).to receive(:where).with(id: 0).and_return(double(first: nil))
  end

  let(:request_meta) do
    {
      request: {
        url: 'https://app.lingolinq.com/api/v1/words/predict?token=abc',
        path: '/api/v1/users/1_2/words/predict',
        clientIp: '203.0.113.42',
        params: { sentence: 'i want juice', user_id: '1_2' },
        body: { sentence: 'i want juice' },
        referer: 'https://app.lingolinq.com/users/1_2'
      },
      headers: {
        'Cookie' => 'session=secret',
        'Authorization' => 'Bearer token-xyz',
        'X-Forwarded-For' => '203.0.113.42',
        'User-Agent' => 'Mozilla/5.0'
      },
      cookies: {
        'Cookie' => 'session=secret'
      }
    }
  end

  let(:child_user_hash) { { id: child_user.id, email: 'parent@example.com', name: 'Kid' } }
  let(:adult_user_hash) { { id: adult_user.id, email: 'adult@example.com' } }

  describe '.call' do
    context 'when the affected user is COPPA-pending' do
      it 'clears the user identity hash' do
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta)
        described_class.call(report)
        expect(report.user).to eq({})
      end

      it 'redacts client IP, body, params, and referer in the request tab' do
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta)
        described_class.call(report)

        req = report.meta_data[:request]
        expect(req[:clientIp]).to eq('[REDACTED_IP]')
        expect(req[:params]).to eq('[REDACTED]')
        expect(req[:body]).to eq('[REDACTED]')
        expect(req[:referer]).to eq('[REDACTED]')
      end

      it 'strips query strings and redacts global_id segments from urls and paths' do
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta)
        described_class.call(report)

        req = report.meta_data[:request]
        expect(req[:url]).not_to include('token=abc')
        expect(req[:url]).not_to include('1_2')
        expect(req[:path]).to include('[REDACTED_ID]')
        expect(req[:path]).not_to include('1_2')
      end

      it 'redacts sensitive headers in the headers tab' do
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta)
        described_class.call(report)

        headers = report.meta_data[:headers]
        expect(headers['Cookie']).to eq('[REDACTED]')
        expect(headers['Authorization']).to eq('[REDACTED]')
        expect(headers['X-Forwarded-For']).to eq('[REDACTED]')
        expect(headers['User-Agent']).to eq('Mozilla/5.0')
      end

      it 'redacts sensitive headers in the cookies tab' do
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta)
        described_class.call(report)
        expect(report.meta_data[:cookies]['Cookie']).to eq('[REDACTED]')
      end

      it 'redacts context when it contains a global_id' do
        report = FakeReport.new(user: child_user_hash, meta_data: {}, context: 'users#show 1_2')
        described_class.call(report)
        expect(report.context).to eq('[REDACTED]')
      end

      it 'redacts context when it contains an email-style segment' do
        report = FakeReport.new(user: child_user_hash, meta_data: {}, context: 'users#show kid@example.com')
        described_class.call(report)
        expect(report.context).to eq('[REDACTED]')
      end

      it 'leaves a plain controller#action context alone' do
        report = FakeReport.new(user: child_user_hash, meta_data: {}, context: 'users#show')
        described_class.call(report)
        expect(report.context).to eq('users#show')
      end

      it 'tolerates string-keyed meta_data tabs' do
        meta = {
          'request' => { 'clientIp' => '203.0.113.42', 'params' => { 'sentence' => 'hi' } },
          'headers' => { 'Cookie' => 'session=secret' }
        }
        report = FakeReport.new(user: child_user_hash, meta_data: meta)
        described_class.call(report)
        expect(report.meta_data['request']['clientIp']).to eq('[REDACTED_IP]')
        expect(report.meta_data['request']['params']).to eq('[REDACTED]')
        expect(report.meta_data['headers']['Cookie']).to eq('[REDACTED]')
      end
    end

    context 'when the affected user is not COPPA-pending' do
      it 'leaves the report payload intact' do
        report = FakeReport.new(user: adult_user_hash, meta_data: request_meta.deep_dup, context: 'users#show')

        described_class.call(report)

        expect(report.user).to eq(adult_user_hash)
        expect(report.meta_data[:request][:clientIp]).to eq('203.0.113.42')
        expect(report.meta_data[:request][:body]).to eq({ sentence: 'i want juice' })
        expect(report.meta_data[:headers]['Cookie']).to eq('session=secret')
        expect(report.context).to eq('users#show')
      end
    end

    context 'when the report has no user' do
      it 'is a no-op when user is nil' do
        report = FakeReport.new(user: nil, meta_data: request_meta.deep_dup)
        described_class.call(report)
        expect(report.meta_data[:request][:clientIp]).to eq('203.0.113.42')
      end

      it 'is a no-op when the user hash has no id' do
        report = FakeReport.new(user: { email: 'nobody@example.com' }, meta_data: request_meta.deep_dup)
        described_class.call(report)
        expect(report.meta_data[:request][:clientIp]).to eq('203.0.113.42')
      end

      it 'is a no-op when the user_id does not match a row' do
        report = FakeReport.new(user: { id: 0 }, meta_data: request_meta.deep_dup)
        described_class.call(report)
        expect(report.meta_data[:request][:clientIp]).to eq('203.0.113.42')
      end
    end

    context 'failure tolerance' do
      it 'swallows errors so bugsnag delivery is never blocked' do
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta)
        allow(described_class).to receive(:scrub!).and_raise(StandardError, 'boom')
        expect { described_class.call(report) }.not_to raise_error
      end

      it 'swallows database errors during user lookup' do
        allow(User).to receive(:where).and_raise(ActiveRecord::StatementInvalid, 'db down')
        report = FakeReport.new(user: child_user_hash, meta_data: request_meta.deep_dup)
        expect { described_class.call(report) }.not_to raise_error
        expect(report.meta_data[:request][:clientIp]).to eq('203.0.113.42')
      end
    end
  end

  describe '.redact_url' do
    it 'drops the query string' do
      url = 'https://app.lingolinq.com/api/v1/words/predict?token=abc&user=1_2'
      expect(described_class.redact_url(url)).to eq('https://app.lingolinq.com/api/v1/words/predict')
    end

    it 'redacts global_id segments inside the path' do
      url = 'https://app.lingolinq.com/api/v1/users/1_2/boards/3_4'
      result = described_class.redact_url(url)
      expect(result).to include('[REDACTED_ID]')
      expect(result).not_to include('1_2')
      expect(result).not_to include('3_4')
    end

    it 'returns non-string input unchanged' do
      expect(described_class.redact_url(nil)).to be_nil
      expect(described_class.redact_url(42)).to eq(42)
    end
  end
end
