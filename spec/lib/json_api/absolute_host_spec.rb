require 'spec_helper'

# `current_host` is only absolute when it was set from a web request
# (application_controller#set_host prepends request.protocol). Its fallback,
# ENV['DEFAULT_HOST'], is a BARE host by design -- .env.example documents it as
# e.g. "www.lingolinq.com". Mail is delivered from a Resque worker, which has no
# request and does not restore one, so every link built as
# "#{current_host}/path" reached the recipient as "www.lingolinq.com/path" -- a
# RELATIVE url inside an <a href>, which a mail client cannot follow. That broke
# the COPPA parental-consent approval link, i.e. the only route to activating a
# child's account.
# See docs/task-management/2026-08-24-n1-under-13-signup-path.md
describe JsonApi::Json do
  describe ".absolute_host" do
    it "prepends https to a bare host, which is how DEFAULT_HOST is configured" do
      expect(JsonApi::Json).to receive(:current_host).and_return('www.lingolinq.com')
      expect(JsonApi::Json.absolute_host).to eq('https://www.lingolinq.com')
    end

    it "is idempotent -- a request-set host already carries its scheme" do
      expect(JsonApi::Json).to receive(:current_host).and_return('https://www.lingolinq.com')
      expect(JsonApi::Json.absolute_host).to eq('https://www.lingolinq.com')
    end

    it "does not downgrade or double-prefix an http host" do
      expect(JsonApi::Json).to receive(:current_host).and_return('http://staging.lingolinq.com')
      expect(JsonApi::Json.absolute_host).to eq('http://staging.lingolinq.com')
    end

    it "uses http for loopback hosts, with or without a port" do
      expect(JsonApi::Json).to receive(:current_host).and_return('localhost:5000')
      expect(JsonApi::Json.absolute_host).to eq('http://localhost:5000')
      expect(JsonApi::Json).to receive(:current_host).and_return('127.0.0.1:3000')
      expect(JsonApi::Json.absolute_host).to eq('http://127.0.0.1:3000')
      expect(JsonApi::Json).to receive(:current_host).and_return('localhost')
      expect(JsonApi::Json.absolute_host).to eq('http://localhost')
    end

    it "does not treat a host merely STARTING with localhost as loopback" do
      expect(JsonApi::Json).to receive(:current_host).and_return('localhost.evil.com')
      expect(JsonApi::Json.absolute_host).to eq('https://localhost.evil.com')
    end

    it "strips a trailing slash so callers interpolating /path do not double up" do
      expect(JsonApi::Json).to receive(:current_host).and_return('www.lingolinq.com/')
      expect(JsonApi::Json.absolute_host).to eq('https://www.lingolinq.com')
    end

    it "returns blank unchanged rather than inventing a scheme-only url" do
      expect(JsonApi::Json).to receive(:current_host).and_return(nil)
      expect(JsonApi::Json.absolute_host).to eq('')
    end

    it "produces a followable consent link, which is the defect this exists for" do
      expect(JsonApi::Json).to receive(:current_host).at_least(:once).and_return('www.lingolinq.com')
      url = "#{JsonApi::Json.absolute_host}/parental_consent/complete?user_id=1_1&token=abc"
      expect(url).to eq('https://www.lingolinq.com/parental_consent/complete?user_id=1_1&token=abc')
      expect(url).to match(%r{\Ahttps?://})
    end
  end
end
