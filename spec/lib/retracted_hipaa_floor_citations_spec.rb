require 'spec_helper'

# Pins GitHub #1061 / KAN-118: the 2026-08-30 (#888) retraction of the
# "45 CFR 164.316(b)(2) six-year floor" framing must reach every file that
# still reasons from that premise. ai_api_log.rb already carries the
# retraction; these two files still asserted the withdrawn statutory floor
# as of origin/develop d5966fc2b.
#
# Runtime behaviour (EuJurisdiction.retention_stamp mapping :unknown to nil)
# is unchanged. This spec only refuses the retracted assertion wording.
describe 'retracted HIPAA six-year-floor citations' do
  # Assertion shapes that present 164.316(b)(2) as a statutory retention floor
  # for ai_api_logs. Quoting the retracted phrasing in order to retract it
  # ("the earlier ... framing was retracted") is allowed: none of these
  # patterns match that sentence.
  retracted_assertions = [
    /HIPAA six-year audit trail \(45 CFR 164\.316\(b\)\(2\)/,
    /INSIDE the six-year floor/,
    /inside the six-year floor/,
    /HIPAA hard floor/,
    /6-year HIPAA audit floor/,
    /HIPAA audit-floor rows/
  ].freeze

  [
    'lib/eu_jurisdiction.rb',
    'lib/tasks/scheduler.rake'
  ].each do |rel|
    it "does not reassert the retracted 164.316(b)(2) statutory floor in #{rel}" do
      source = File.read(Rails.root.join(rel))
      hits = retracted_assertions.select { |pattern| source.match?(pattern) }
      expect(hits).to eq([]),
        "#{rel} still asserts the retracted statutory floor via #{hits.map(&:inspect).join(', ')}"
    end
  end
end
