# frozen_string_literal: true

require 'spec_helper'
require 'stringio'
require 'pii_scrubbing_formatter'

describe PiiScrubbingFormatter do
  it "should scrub email from a plainly-formatted line" do
    out = PiiScrubbingFormatter.new.call('INFO', Time.now, nil, 'user parent@example.com signed in')
    expect(out).not_to include('parent@example.com')
    expect(out).to include('[REDACTED_EMAIL]')
  end

  it "should preserve the standard format (severity + message + newline)" do
    out = PiiScrubbingFormatter.new.call('WARN', Time.now, nil, 'something happened')
    expect(out).to include('WARN')
    expect(out).to include('something happened')
    expect(out).to end_with("\n")
  end

  it "should keep global_ids intact" do
    out = PiiScrubbingFormatter.new.call('INFO', Time.now, nil, 'Token issued for user 1_2345')
    expect(out).to include('1_2345')
  end

  context "composed with ActiveSupport::TaggedLogging (the production wiring)" do
    it "should scrub email AND keep the request-id tag" do
      io = StringIO.new
      logger = ActiveSupport::Logger.new(io)
      logger.formatter = PiiScrubbingFormatter.new
      tagged = ActiveSupport::TaggedLogging.new(logger)

      tagged.tagged('req-abc123') do
        tagged.info('SAML logout for parent@example.com')
      end

      output = io.string
      expect(output).to include('[req-abc123]')
      expect(output).not_to include('parent@example.com')
      expect(output).to include('[REDACTED_EMAIL]')
    end
  end
end
