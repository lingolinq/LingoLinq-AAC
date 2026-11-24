require 'spec_helper'

# Pins GitHub #1061 / KAN-118: the 2026-08-30 (#888) retraction of the
# "45 CFR 164.316(b)(2) six-year floor" framing in these two files. It
# forbids the develop-era assertion *shapes* listed below, not every
# possible rewording of the statutory-floor claim. ai_api_log.rb already
# quotes the phrase in order to retract it.
#
# Runtime behaviour (EuJurisdiction.retention_stamp mapping :unknown to nil)
# is unchanged. This spec only refuses the listed assertion wording.
describe 'retracted HIPAA six-year-floor citations' do
  # Assertion shapes that present 164.316(b)(2) as a statutory retention floor
  # for ai_api_logs. Quoting the retracted phrasing in order to retract it
  # ("the earlier ... framing was retracted") is allowed: none of these
  # patterns match that sentence.
  retracted_assertions = [
    /HIPAA six-year audit trail \(45 CFR 164\.316\(b\)\(2\)/,
    # \s+ and the optional # span a comment line break: develop wrapped one of
    # these as "inside" / "# the six-year floor".
    /inside\s+(?:#\s+)?the six-year floor/i,
    /HIPAA hard floor/,
    /6-year HIPAA audit floor/,
    /HIPAA audit-floor rows/,
    # The same #888 retraction: Article 50 imposes no record-keeping period.
    /Article 50 RETENTION/,
    # purge_old_eu_logs! has no healthcare carve-out; only the absence of a
    # per-row marker is true today.
    /it excludes (?:HIPAA-covered|healthcare-linked) rows/
  ].freeze

  [
    'lib/eu_jurisdiction.rb',
    'lib/tasks/scheduler.rake'
  ].each do |rel|
    it "does not reassert a retracted retention basis in #{rel}" do
      source = File.read(Rails.root.join(rel))
      hits = retracted_assertions.select { |pattern| source.match?(pattern) }
      expect(hits).to eq([]),
        "#{rel} still asserts a retracted retention basis via #{hits.map(&:inspect).join(', ')}"
    end
  end

  # The legal-doc side of the same retraction. Only the unattested drafts are
  # listed: attested records are frozen, and a dated CORRECTED note may quote the
  # withdrawn basis, so the Article 50 pattern anchors on the table cell.
  retracted_doc_assertions = [
    /HIPAA six-year (?:floor|fail-safe)/,
    /6-year HIPAA (?:audit )?floor/,
    /HIPAA 6-year floor/,
    /six-year HIPAA floor/i,
    /\| HIPAA 45 CFR(?: §)? 164\.316\(b\)\(2\)\(i\)/,
    /audit-floor purposes/,
    /six-year access-log rule/,
    /\| EU AI Act Article 50 record-keeping/
  ].freeze

  [
    'docs/legal/2026-09-22_data-retention.md',
    'docs/legal/2026-08-25_ai-data-flow-classification.md',
    'docs/legal/2026-08-24_ai-governance-memo.md'
  ].each do |rel|
    it "does not reassert a retracted retention basis in #{rel}" do
      source = File.read(Rails.root.join(rel))
      hits = retracted_doc_assertions.select { |pattern| source.match?(pattern) }
      expect(hits).to eq([]),
        "#{rel} still asserts a retracted retention basis via #{hits.map(&:inspect).join(', ')}"
    end
  end

  it 'points scheduler.rake at the current retention drafts, not the frozen records' do
    source = File.read(Rails.root.join('lib/tasks/scheduler.rake'))
    expect(source).to include('docs/legal/2026-09-22_data-retention.md')
    expect(source).to include('docs/legal/2026-08-25_ai-data-flow-classification.md')
    expect(source).not_to match(/DATA_RETENTION\.md|AI_DATA_FLOW_CLASSIFICATION\.md/)
  end

  # GitHub #1060 and #1061, cell by cell: a schedule row must not state a window or
  # basis the code or the retraction contradicts. Notes cells may quote the old text.
  describe 'the 2026-09-22 retention schedule' do
    schedule = File.read(Rails.root.join('docs/legal/2026-09-22_data-retention.md'))
    cell = lambda do |label, index|
      row = schedule.lines.find { |line| line.start_with?("| #{label}") }
      row && row.split('|')[index].to_s.strip
    end

    {
      'User account records' => /12 months/,
      'Communication snapshots' => /no cascade/,
      'ClusterLocation' => /\ANo window enforced|\A\*\*No window enforced/,
      'Authentication and audit trails' => /intended, not implemented/,
      'Analytics events' => /intended, not implemented/,
      "Children's data" => /not automatically deleted/
    }.each do |label, window|
      it "states the real window for #{label}" do
        expect(cell.call(label, 2)).to match(window)
      end
    end

    it 'keeps the 2-year soft delete out of the account window' do
      expect(cell.call('User account records', 2)).not_to match(/soft-delete|2 years/)
    end

    [
      'AI API logs (`AiApiLog`), EU-jurisdiction accounts',
      'AI API logs (`AiApiLog`), healthcare-linked accounts'
    ].each do |label|
      it "states no established basis for #{label}" do
        expect(cell.call(label, 3)).to include('Not established')
      end
    end
  end
end
