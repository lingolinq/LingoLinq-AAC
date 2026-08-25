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

    # NOTE: there is deliberately no example here that builds a consent URL by
    # interpolating absolute_host into a string literal and then asserts on the
    # concatenation. One used to live here, titled "produces a followable consent
    # link, which is the defect this exists for" -- it was a tautology. It
    # restated the `strips a trailing slash` / `adds https to a bare host` cases
    # above with a longer path, touched no mailer, view or controller, and would
    # have passed unchanged with every production call site reverted to
    # current_host. A unit test of a pure function cannot show that the defect is
    # fixed; only a caller can.
    #
    # The real coverage is
    # spec/mailers/user_mailer_spec.rb "builds parent-facing links as ABSOLUTE
    # urls when there is no request host", which renders parental_consent_request
    # with a bare host and asserts on the hrefs in both message parts. That one
    # was confirmed to fail when a single call site is reverted.
  end
end
