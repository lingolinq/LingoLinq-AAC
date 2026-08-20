#!/usr/bin/env ruby
# frozen_string_literal: true

# register-lint.rb - structural validator for a findings register.
#
# WHY THIS EXISTS
#   CI's audit-artifacts-integrity job runs only the render `--check` scripts. Those compare a
#   generated markdown against its JSON source; none of them reads the fields the register's
#   CONSUMERS depend on. So a structurally malformed row merges green and detonates weeks later
#   in whoever runs the next promotion or merge. Observed case: a finding whose `source` was
#   written as a bare String instead of an object crashed scripts/promote-finding.rb outright
#   (`undefined method 'dig' for an instance of String`) for the ENTIRE register, while
#   citation-check.rb and every render check stayed green.
#
#   This script closes that gap: it validates the shapes and enum values that
#   scripts/audit-merge.rb, scripts/promote-finding.rb, and scripts/citation-check.rb assume when
#   they walk a register, and fails the build the moment a row violates one.
#
# RELATIONSHIP TO citation-check.rb (complementary, not overlapping)
#   citation-check validates EVIDENCE: id integrity, that the snippet exists in the cited file at
#   the cited sha, and line drift. It needs git history, so it is deliberately not a CI gate.
#   register-lint validates STRUCTURE: field shapes, enum membership, id uniqueness. It touches no
#   git and no network, which is exactly what makes it CI-safe alongside the render checks.
#   Neither subsumes the other; run both.
#
# GOVERNANCE
#   This script is READ-ONLY. It never writes, normalizes, or "fixes" a register - a malformed row
#   is reported for a human to correct, because silently rewriting rows in the compliance SSOT is
#   the failure mode the whole register design exists to prevent.
#
# Pure stdlib (json). No git, no network, no app boot. Safe in CI.
#
# Usage:
#   ruby scripts/register-lint.rb [REGISTER.json ...]   # default: audit-reports/FINDINGS.json
#   ruby scripts/register-lint.rb --quiet ...           # print only failures
#
# Exit codes: 0 = every register structurally valid; 1 = one or more violations (or unreadable).

require 'json'
require 'optparse'

DEFAULT_REGISTERS = ['audit-reports/FINDINGS.json'].freeze

# Fallbacks used only when a register's meta omits the enum. The register declares its own enums in
# meta (statusEnum, severityEnum, frameworkEnum, dispositionEnum, sourceEnum) and those win, so a
# schema change lands in one place; these keep the linter useful against a meta-less register.
FALLBACK_ENUMS = {
  'statusEnum' => %w[open remediated-unverified verified-closed accepted-risk superseded],
  'severityEnum' => %w[critical high medium low],
  'frameworkEnum' => %w[FERPA COPPA HIPAA GDPR WCAG SOC2],
  'dispositionEnum' => %w[untriaged accepted fixed dismissed-false-positive wontfix],
  'sourceEnum' => %w[audit-run pr-review manual]
}.freeze

# Fields every consumer reaches into with Hash accessors (`f.dig('source', 'promotedDate')`,
# `f['evidence']['file']`, ...). A non-Hash here is the crash class this linter was written for.
# `evidence` is required because citation-check and both mergers unconditionally read it;
# the rest are optional (a pre-1.1 finding legitimately omits them) but must be Hashes when present.
OBJECT_FIELDS = %w[evidence remediation closureEvidence disposition source].freeze
REQUIRED_OBJECT_FIELDS = %w[evidence].freeze

options = { quiet: false }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/register-lint.rb [--quiet] [REGISTER.json ...]'
  o.on('--quiet', 'Print only violations, not the per-register OK lines') { options[:quiet] = true }
end.parse!(ARGV)

registers = ARGV.empty? ? DEFAULT_REGISTERS : ARGV

# Collect (not raise) every problem in one register so a caller sees the full picture in one run
# rather than fixing one row at a time.
def lint_register(path)
  errors = []

  unless File.file?(path)
    return ["register not found: #{path}"]
  end

  begin
    register = JSON.parse(File.read(path))
  rescue JSON::ParserError => e
    return ["#{path}: unparseable JSON: #{e.message[0, 200]}"]
  end

  unless register.is_a?(Hash)
    return ["#{path}: top level must be an object, got #{register.class}"]
  end

  meta = register['meta']
  errors << "#{path}: meta must be an object, got #{meta.class}" unless meta.nil? || meta.is_a?(Hash)
  meta = {} unless meta.is_a?(Hash)

  findings = register['findings']
  unless findings.is_a?(Array)
    errors << "#{path}: findings must be an array, got #{findings.class}"
    return errors
  end

  enum = ->(key) { Array(meta[key]).empty? ? FALLBACK_ENUMS[key] : Array(meta[key]) }
  statuses = enum.call('statusEnum')
  severities = enum.call('severityEnum')
  frameworks = enum.call('frameworkEnum')
  dispositions = enum.call('dispositionEnum')
  sources = enum.call('sourceEnum')

  seen_ids = {}

  findings.each_with_index do |f, i|
    # Identify the row by id when we can, index otherwise, so an error line is actionable even
    # when the malformed part IS the id.
    where = "#{path}[#{i}]#{f.is_a?(Hash) && f['id'] ? " #{f['id']}" : ''}"

    unless f.is_a?(Hash)
      errors << "#{where}: finding must be an object, got #{f.class}"
      next
    end

    id = f['id']
    if !id.is_a?(String) || id.strip.empty?
      errors << "#{where}: id must be a non-empty string, got #{id.inspect}"
    elsif seen_ids.key?(id)
      # A duplicate id silently shadows a row: both mergers build `by_id` last-write-wins, so the
      # earlier finding becomes unreachable and its Scot-owned status can never be re-found.
      errors << "#{where}: duplicate id (also at index #{seen_ids[id]}); by_id lookups would shadow one of them"
    else
      seen_ids[id] = i
    end

    rule_key = f['ruleKey']
    if !rule_key.is_a?(String) || rule_key.strip.empty?
      errors << "#{where}: ruleKey must be a non-empty string, got #{rule_key.inspect}"
    end

    unless statuses.include?(f['status'])
      errors << "#{where}: status #{f['status'].inspect} not in statusEnum #{statuses.join('|')}"
    end

    unless severities.include?(f['severity'])
      errors << "#{where}: severity #{f['severity'].inspect} not in severityEnum #{severities.join('|')}"
    end

    fw = f['frameworks']
    if fw.nil?
      # allowed: a finding with no framework mapping
    elsif !fw.is_a?(Array)
      errors << "#{where}: frameworks must be an array, got #{fw.class}"
    else
      bad = fw.reject { |x| frameworks.include?(x) }
      errors << "#{where}: frameworks #{bad.inspect} not in frameworkEnum #{frameworks.join('|')}" unless bad.empty?
    end

    OBJECT_FIELDS.each do |field|
      value = f[field]
      if value.nil?
        errors << "#{where}: #{field} is required and must be an object" if REQUIRED_OBJECT_FIELDS.include?(field)
      elsif !value.is_a?(Hash)
        # THE crash class: consumers call .dig/[] on these. A String here takes down the whole run.
        errors << "#{where}: #{field} must be an object, got #{value.class} (#{value.inspect[0, 60]}) " \
                  '-- consumers call .dig on it and would crash'
      end
    end

    if f['disposition'].is_a?(Hash)
      state = f['disposition']['state']
      unless state.nil? || dispositions.include?(state)
        errors << "#{where}: disposition.state #{state.inspect} not in dispositionEnum #{dispositions.join('|')}"
      end
    end

    if f['source'].is_a?(Hash)
      kind = f['source']['kind']
      unless kind.nil? || sources.include?(kind)
        errors << "#{where}: source.kind #{kind.inspect} not in sourceEnum #{sources.join('|')}"
      end
    end

    # Both mergers do `[existing['notes'], note].compact.reject(&:empty?).join(' | ')`. A non-String
    # notes raises NoMethodError there (Integer) or silently corrupts the join (Hash), so pin it.
    %w[title notes].each do |field|
      value = f[field]
      errors << "#{where}: #{field} must be a string or null, got #{value.class}" unless value.nil? || value.is_a?(String)
    end

    if f['evidence'].is_a?(Hash)
      line = f['evidence']['line']
      unless line.nil? || line.is_a?(Numeric)
        # citation-check does arithmetic on this ((matched_line - recorded).abs); a String line
        # raises there instead of failing the finding cleanly.
        errors << "#{where}: evidence.line must be a number or null, got #{line.inspect}"
      end
    end
  end

  errors
end

total_errors = 0
registers.each do |path|
  errors = lint_register(path)
  total_errors += errors.size
  if errors.empty?
    puts "register-lint: OK  #{path}" unless options[:quiet]
  else
    warn "register-lint: FAIL  #{path}  (#{errors.size} violation#{errors.size == 1 ? '' : 's'})"
    errors.each { |e| warn "  - #{e}" }
  end
end

exit(total_errors.zero? ? 0 : 1)
