require 'spec_helper'
require 'rack/test'

# End-to-end exercise of the cutover write-freeze middleware through the full
# Rack stack. Toggles the freeze via WriteFreeze.enabled? (which reads
# WRITE_FREEZE at request time in production) and asserts the 503 + Retry-After
# behavior, the read/auth pass-through, and the JSON vs HTML body negotiation.
# See scripts/gcp/PHASE5-CUTOVER-RUNBOOK.md step 1.
describe "write-freeze middleware" do
  include Rack::Test::Methods

  def app
    LingoLinq::Application
  end

  def response
    last_response
  end

  context "when the freeze is OFF (default)" do
    before { allow(WriteFreeze).to receive(:enabled?).and_return(false) }

    it "does not intercept mutating requests (they reach the app)" do
      post "/api/v1/boards", {}.to_json, 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'
      expect(response.status).not_to eq(503)
    end

    it "does not intercept reads" do
      get "/api/v1/status/heartbeat"
      expect(response.status).to eq(200)
    end
  end

  context "when the freeze is ON" do
    before { allow(WriteFreeze).to receive(:enabled?).and_return(true) }

    it "lets reads pass through (users can still view and speak boards)" do
      get "/api/v1/status/heartbeat"
      expect(response.status).to eq(200)
      expect(JSON.parse(response.body)['active']).to eq(true)
    end

    it "rejects a data-mutating API request with 503 + Retry-After and a JSON body" do
      post "/api/v1/boards", {}.to_json, 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'
      expect(response.status).to eq(503)
      expect(response.headers['Retry-After']).to eq(WriteFreeze::RETRY_AFTER_SECONDS.to_s)
      expect(response.headers['Content-Type']).to eq('application/json')
      json = JSON.parse(response.body)
      expect(json['error']).to be_a(String)
      expect(json['error']).not_to be_empty
      expect(json['retry_after']).to eq(WriteFreeze::RETRY_AFTER_SECONDS)
    end

    it "rejects each mutating verb on a data path" do
      %w[POST PUT PATCH DELETE].each do |verb|
        send(verb.downcase, "/api/v1/boards/1_2", {}.to_json, 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json')
        expect(response.status).to eq(503), "#{verb} should be rejected"
      end
    end

    it "returns an HTML maintenance page for a browser side-effect GET navigation" do
      # parental_consent/complete is a browser navigation (parent clicks an email
      # link) and is a side-effect GET, so it is rejected with the HTML page.
      get "/parental_consent/complete", {}, 'HTTP_ACCEPT' => 'text/html'
      expect(response.status).to eq(503)
      expect(response.headers['Retry-After']).to eq(WriteFreeze::RETRY_AFTER_SECONDS.to_s)
      expect(response.headers['Content-Type']).to match(%r{text/html})
      expect(response.body).to match(/Temporarily read-only/)
    end

    it "rejects a side-effect GET (e.g. upload_success) that would write to the abandoned DB" do
      get "/api/v1/images/1_2/upload_success", {}, 'HTTP_ACCEPT' => 'application/json'
      expect(response.status).to eq(503)
      expect(response.headers['Retry-After']).to eq(WriteFreeze::RETRY_AFTER_SECONDS.to_s)
    end

    it "returns JSON for a mutating request even when Accept is absent (sync clients never get HTML)" do
      post "/api/v1/boards", {}.to_json, 'CONTENT_TYPE' => 'application/json'
      expect(response.status).to eq(503)
      expect(response.headers['Content-Type']).to eq('application/json')
      expect(JSON.parse(response.body)['retry_after']).to eq(WriteFreeze::RETRY_AFTER_SECONDS)
    end

    it "rejects new-account signup but still allows existing-user SSO link" do
      post "/auth/google/signup", {}, 'HTTP_ACCEPT' => 'application/json'
      expect(response.status).to eq(503)
      post "/auth/google/link", {}, 'HTTP_ACCEPT' => 'application/json'
      expect(response.status).not_to eq(503)
    end

    it "still allows allowlisted auth/session writes (sign-in is not blocked)" do
      # No valid credentials, so the app may answer 400/401, but it must NOT be
      # the freeze 503 - the request reaches the auth controller.
      post "/token", { :grant_type => 'password' }, 'HTTP_ACCEPT' => 'application/json'
      expect(response.status).not_to eq(503)
    end
  end
end
