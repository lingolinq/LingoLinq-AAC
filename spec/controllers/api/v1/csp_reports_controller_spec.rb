require 'spec_helper'

describe Api::V1::CspReportsController, :type => :controller do
  describe 'create' do
    def post_report(body, content_type: 'application/csp-report')
      json = body.is_a?(String) ? body : body.to_json
      request.headers['Content-Type'] = content_type
      # Rails 7.2 rebuilds the test request in #process; pass body: so it is set
      # on the new request (RAW_POST_DATA on the old env is dropped by scrub_env!).
      post 'create', body: json
    end

    it 'returns 204 for a valid legacy csp-report payload' do
      payload = {
        'csp-report' => {
          'violated-directive' => 'script-src',
          'blocked-uri'        => 'https://evil.example.com/x.js',
          'document-uri'       => 'https://app.example.com/boards'
        }
      }
      post_report(payload)
      expect(response.status).to eq(204)
    end

    it 'returns 204 for a valid Reporting API array payload' do
      payload = [
        {
          'type' => 'csp-violation',
          'body' => {
            'effectiveDirective' => 'script-src',
            'blockedURL'         => 'https://evil.example.com/x.js',
            'documentURL'        => 'https://app.example.com/boards'
          }
        }
      ]
      post_report(payload, content_type: 'application/reports+json')
      expect(response.status).to eq(204)
    end

    it 'returns 204 for malformed JSON without raising' do
      request.headers['Content-Type'] = 'application/csp-report'
      post 'create', body: 'this is not json at all {{{'
      expect(response.status).to eq(204)
    end

    it 'returns 204 for an empty body' do
      request.headers['Content-Type'] = 'application/csp-report'
      post 'create', body: ''
      expect(response.status).to eq(204)
    end

    it 'returns 204 and logs via Rails.logger when Sentry is unavailable' do
      payload = {
        'csp-report' => {
          'violated-directive' => 'img-src',
          'blocked-uri'        => 'https://evil.example.com/img.png',
          'document-uri'       => 'https://app.example.com/'
        }
      }
      expect(Rails.logger).to receive(:warn).with(/\[CSP\] violation/)
      allow(subject).to receive(:sentry_available?).and_return(false)
      post_report(payload)
      expect(response.status).to eq(204)
    end

    it 'forwards to Sentry when the Sentry SDK is available' do
      payload = {
        'csp-report' => {
          'violated-directive' => 'script-src',
          'blocked-uri'        => 'https://cdn.example.com/lib.js',
          'document-uri'       => 'https://app.example.com/dash'
        }
      }
      sentry = double('Sentry', capture_event: nil)
      stub_const('Sentry', sentry)
      allow(sentry).to receive(:respond_to?).with(:capture_event).and_return(true)
      allow(sentry).to receive(:respond_to?).with(:initialized?).and_return(false)
      expect(sentry).to receive(:capture_event).once
      post_report(payload)
      expect(response.status).to eq(204)
    end

    it 'normalizes Reporting API camelCase keys to hyphen-case equivalents' do
      sentry = double('Sentry', capture_event: nil)
      stub_const('Sentry', sentry)
      allow(sentry).to receive(:respond_to?).with(:capture_event).and_return(true)
      allow(sentry).to receive(:respond_to?).with(:initialized?).and_return(false)

      captured = nil
      allow(sentry).to receive(:capture_event) { |ev| captured = ev }

      payload = [
        {
          'type' => 'csp-violation',
          'body' => {
            'effectiveDirective' => 'connect-src',
            'blockedURL'         => 'https://evil.example.com/api'
          }
        }
      ]
      post_report(payload, content_type: 'application/reports+json')
      expect(response.status).to eq(204)
      expect(captured[:tags][:directive]).to eq('connect-src')
      expect(captured[:tags][:blocked_uri]).to eq('https://evil.example.com/api')
    end

    it 'strips query strings from URLs before logging to prevent PII leakage' do
      warned = nil
      allow(Rails.logger).to receive(:warn) { |msg| warned = msg }
      allow(subject).to receive(:sentry_available?).and_return(false)

      payload = {
        'csp-report' => {
          'violated-directive' => 'script-src',
          'blocked-uri'        => 'https://evil.example.com/x.js?token=SECRET',
          'document-uri'       => 'https://app.example.com/dash?session=ABC'
        }
      }
      post_report(payload)
      expect(warned).not_to include('SECRET')
      expect(warned).not_to include('ABC')
    end

    it 'parse_report_body rejects when Content-Length exceeds the cap' do
      max = Api::V1::CspReportsController::MAX_REPORT_BYTES
      req = double('Request', content_length: max + 1, body: StringIO.new(''))
      ctrl = described_class.new
      allow(ctrl).to receive(:request).and_return(req)
      expect(Rails.logger).to receive(:warn).with(/oversized/)
      expect(ctrl.send(:parse_report_body)).to eq({})
    end

  end
end