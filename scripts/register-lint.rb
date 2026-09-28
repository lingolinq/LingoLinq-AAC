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
#   citation-check validates EVIDENCE: id integrity (except the recomputation for any row whose
#   ruleKey is the self-referencing withheld form), that the snippet exists in the cited file at the
#   cited sha, and line drift. It needs git history, so it is deliberately not a CI gate.
#   register-lint validates STRUCTURE: field shapes, enum membership, id uniqueness, and id
#   derivation (the same expression as citation-check; see the derivation block for the rows it
#   skips). It also enforces that form's shape and the closed list of ids allowed to use it (see
#   SELF_FORM_LIST_BASENAME). It touches no git and no network,
#   which is exactly what makes it CI-safe alongside the render checks. Neither subsumes the other;
#   run both.
#
# GOVERNANCE
#   This script is READ-ONLY. It never writes, normalizes, or "fixes" a register - a malformed row
#   is reported for a human to correct, because silently rewriting rows in the compliance SSOT is
#   the failure mode the whole register design exists to prevent.
#
# Pure stdlib (json, digest, set). No git, no network, no app boot. Safe in CI.
#
# Usage:
#   ruby scripts/register-lint.rb [REGISTER.json ...]   # default: audit-reports/FINDINGS.json
#   ruby scripts/register-lint.rb --quiet ...           # print only failures
#
# Exit codes: 0 = every register structurally valid; 1 = one or more violations (or unreadable).

require 'digest'
require 'json'
require 'optparse'
require 'set'

DEFAULT_REGISTERS = ['audit-reports/FINDINGS.json'].freeze

# Fallbacks used only when a register's meta omits the enum. The register declares its own enums in
# meta (statusEnum, severityEnum, frameworkEnum, dispositionEnum, sourceEnum, evidenceTypeEnum) and
# those win, so a schema change lands in one place; these keep the linter useful against a meta-less
# register.
FALLBACK_ENUMS = {
  'statusEnum' => %w[open remediated-unverified verified-closed accepted-risk superseded],
  'severityEnum' => %w[critical high medium low],
  'frameworkEnum' => %w[FERPA COPPA HIPAA GDPR WCAG SOC2],
  'dispositionEnum' => %w[untriaged accepted fixed dismissed-false-positive wontfix],
  'sourceEnum' => %w[audit-run pr-review manual],
  # Must stay in lockstep with citation-check.rb CHECKABLE_EVIDENCE_TYPES plus the
  # two non-checkable kinds that script SKIPs. An unknown type is skipped there too,
  # so the linter is the only CI gate that can reject a mistype.
  'evidenceTypeEnum' => %w[code doc runtime attestation]
}.freeze

# Evidence kinds citation-check.rb actually re-resolves. Everything else is SKIP'd.
CHECKABLE_EVIDENCE_TYPES = %w[code doc].freeze

# Fields every consumer reaches into with Hash accessors (`f.dig('source', 'promotedDate')`,
# `f['evidence']['file']`, ...). A non-Hash here is the crash class this linter was written for.
# `evidence` is required because citation-check and both mergers unconditionally read it;
# the rest are optional (a pre-1.1 finding legitimately omits them) but must be Hashes when present.
OBJECT_FIELDS = %w[evidence remediation closureEvidence disposition source].freeze
REQUIRED_OBJECT_FIELDS = %w[evidence].freeze

# A row whose ruleKey is withheld under the security disclosure policy carries a neutral
# self-referencing slug: this prefix + its own id, lowercased, on an id of the canonical shape.
# scripts/citation-check.rb (withheld_rule_key?) skips id recomputation for exactly that shape and
# is not a CI gate, so the shape is enforced here. The form is not used in the Ember upgrade register.
WITHHELD_RULE_KEY_PREFIX = 'minimized-finding-'
CANONICAL_ID = /\ALL-[0-9a-f]{10}\z/
WITHHELD_FORM_EXCLUDED_REGISTERS = %w[FINDINGS-EMBER.json].freeze

# Only a row whose id is on the closed list may use that form. The list is a separate file beside
# the register (audit-reports/SELF-REFERENCING-RULEKEY-IDS.json for audit-reports/FINDINGS.json), so
# an edit to the register alone cannot add a row to it, and neither merger writes it. A missing list
# is an empty one: it licenses nothing. The file must be a regular file (a symlink is refused, even a
# dangling one), valid UTF-8, and byte-identical to its canonical form (see self_form_list). Shape:
# {"description": String, "ids": [id, ...]}; any other key or an entry that is not a canonical id is
# a violation, and every entry must name a row of this register that carries exactly the form.
SELF_FORM_LIST_BASENAME = 'SELF-REFERENCING-RULEKEY-IDS.json'
SELF_FORM_LIST_KEYS = %w[description ids].freeze

options = { quiet: false }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/register-lint.rb [--quiet] [REGISTER.json ...]'
  o.on('--quiet', 'Print only violations, not the per-register OK lines') { options[:quiet] = true }
end.parse!(ARGV)

registers = ARGV.empty? ? DEFAULT_REGISTERS : ARGV

# Reads the closed list beside the register. Returns [Set of the valid canonical ids, errors]. Every
# problem is returned as an error, so a bad list fails the run. A malformed entry, and every entry of
# a list that is not a readable regular file, not valid UTF-8, not valid JSON, not in canonical form,
# or not an object with an "ids" array, is also left out of the Set.
#
# Canonical form is JSON.pretty_generate of the parsed list plus one trailing newline, compared byte
# for byte. JSON.parse keeps only the last copy of a repeated key and skips /* */ and // comments, so
# without this comparison a reader of the file could see a different list from the one enforced. The
# comparison refuses both, whatever the json gem version, and the message shows the form to write.
def self_form_list(register_path)
  list_path = File.join(File.dirname(register_path), SELF_FORM_LIST_BASENAME)
  return [Set.new, []] unless File.exist?(list_path) || File.symlink?(list_path)

  begin
    unless File.lstat(list_path).file?
      return [Set.new, ["closed list #{list_path} must be a regular file (not a symlink, directory or other file type)"]]
    end

    raw = File.binread(list_path).force_encoding(Encoding::UTF_8)
  rescue SystemCallError, IOError => e
    return [Set.new, ["closed list #{list_path} cannot be read: #{e.message[0, 120]}"]]
  end
  return [Set.new, ["closed list #{list_path} is not valid UTF-8"]] unless raw.valid_encoding?

  begin
    list = JSON.parse(raw)
  rescue JSON::ParserError => e
    return [Set.new, ["closed list #{list_path} is not valid JSON: #{e.message[0, 120]}"]]
  end

  begin
    canonical = JSON.pretty_generate(list) + "\n"
  rescue JSON::JSONError, EncodingError => e
    return [Set.new, ["closed list #{list_path} cannot be put in canonical form: #{e.message[0, 120]}"]]
  end
  unless raw == canonical
    return [Set.new, ["closed list #{list_path} is not in its canonical form (JSON.pretty_generate plus a " \
                      "trailing newline, byte for byte); expected:\n#{canonical}"]]
  end

  unless list.is_a?(Hash) && list['ids'].is_a?(Array)
    return [Set.new, ["closed list #{list_path} must be an object with an \"ids\" array"]]
  end

  errors = (list.keys - SELF_FORM_LIST_KEYS).map { |k| "closed list #{list_path} has an unexpected key #{k.inspect}" }
  if list.key?('description') && !list['description'].is_a?(String)
    errors << "closed list #{list_path}: description must be a string"
  end

  ids = Set.new
  list['ids'].each do |entry|
    if !entry.is_a?(String) || !entry.match?(CANONICAL_ID)
      errors << "closed list entry must be LL-<10 lowercase hex>, got #{entry.inspect}"
    elsif ids.include?(entry)
      errors << "closed list entry #{entry.inspect} appears more than once"
    else
      ids << entry
    end
  end
  [ids, errors]
end

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
  evidence_types = enum.call('evidenceTypeEnum')

  seen_ids = {}
  listed, list_errors = self_form_list(path)
  errors.concat(list_errors)
  row_ids = Set.new

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
    row_ids << id if id.is_a?(String)

    rule_key = f['ruleKey']
    self_form = id.is_a?(String) && id.match?(CANONICAL_ID) && rule_key == "#{WITHHELD_RULE_KEY_PREFIX}#{id.downcase}"
    if !rule_key.is_a?(String) || rule_key.strip.empty?
      errors << "#{where}: ruleKey must be a non-empty string, got #{rule_key.inspect}"
    elsif rule_key.strip.downcase.start_with?(WITHHELD_RULE_KEY_PREFIX)
      if WITHHELD_FORM_EXCLUDED_REGISTERS.include?(File.basename(path))
        errors << "#{where}: the withheld form of ruleKey is not used in this register"
      elsif !(id.is_a?(String) && id.match?(CANONICAL_ID) && rule_key == "#{WITHHELD_RULE_KEY_PREFIX}#{id.downcase}")
        errors << "#{where}: a ruleKey in the withheld form must equal \"#{WITHHELD_RULE_KEY_PREFIX}\" + this row's id " \
                  'lowercased, on an id of the form LL-<10 lowercase hex>'
      elsif !listed.include?(id)
        errors << "#{where}: ruleKey is in the self-referencing form but this id is not on the closed list " \
                  "(#{SELF_FORM_LIST_BASENAME} beside the register)"
      end
    end
    if id.is_a?(String) && listed.include?(id) && !self_form
      errors << "#{where}: id is on the closed list but its ruleKey is not \"#{WITHHELD_RULE_KEY_PREFIX}\" + this id lowercased"
    end

    # A non-null evidence.file must be a non-empty String. For "" citation-check hashes ruleKey|""
    # (expected_id) while audit-merge.rb and promote-finding.rb anchor on the ruleKey; for false
    # citation-check anchors on the ruleKey while the mergers hash "false". Neither merger writes an
    # empty or non-String file (both convert it with to_s; audit-merge omits an empty one and
    # promote-finding refuses the finding). null is read as absent by all three, so it stays legal.
    ev = f['evidence']
    ev_file = ev.is_a?(Hash) ? ev['file'] : nil
    unless ev_file.nil? || (ev_file.is_a?(String) && !ev_file.empty?)
      errors << "#{where}: evidence.file must be a non-empty string when present, got #{ev_file.inspect}"
    end

    # Id derivation, the expression in scripts/citation-check.rb expected_id: LL- + the first 10 hex of
    # sha256(ruleKey|evidence.file), or ruleKey|ruleKey without a file. Runs on every status and
    # compares exactly. It skips three kinds of row: a listed row in the self-referencing form, whose
    # id is not derived from its ruleKey; a row whose id or ruleKey is not a non-blank String; and a
    # row whose evidence is present but not an object. The last two are refused by their own rules.
    # A row with no evidence, or with an evidence object whose file is not a non-empty String, is
    # still derived, so it can report an id mismatch as well as its own violation.
    if id.is_a?(String) && !id.strip.empty? && rule_key.is_a?(String) && !rule_key.strip.empty? &&
       (ev.nil? || ev.is_a?(Hash)) && !(self_form && listed.include?(id))
      expected = 'LL-' + Digest::SHA256.hexdigest("#{rule_key}|#{(ev && ev['file']) || rule_key}")[0, 10]
      unless id == expected
        errors << "#{where}: id mismatch: stored #{id.inspect}, expected #{expected.inspect} " \
                  '(LL- + sha256 of ruleKey|evidence.file, or ruleKey|ruleKey without a file)'
      end
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

      # evidence.sha rules. Two separate guarantees, because this is the ONLY gate that runs
      # in CI: citation-check.rb re-resolves every snippet at its sha, but ci.yml:153 states it
      # is deliberately NOT a CI job, so a register that never runs the local
      # regenerate-register.sh wrapper is checked by this file alone.
      #
      #   1. A `code` or `doc` row MUST carry a sha. citation-check's file_at_sha falls back to
      #      the WORKING TREE when the sha is blank, so a blank-sha finding silently validates
      #      against whatever happens to be checked out instead of against a pinned commit --
      #      the evidence stops being anchored to the commit it was proven at.
      #   2. Any sha that IS present must be a FULL 40-hex id, never an abbreviation.
      #      citation-check resolves a prefix happily (`git show <prefix>:<path>` works), so a
      #      short sha passes the day it is written and silently becomes ambiguous as the repo
      #      grows. audit-merge.rb writes whatever --sha it is handed, so the abbreviation
      #      enters at the call site, not in the merger.
      #
      # Blank is permitted ONLY for known non-checkable evidence (runtime, attestation),
      # which has no file to resolve. Unknown types must not inherit that exemption:
      # citation-check.rb SKIPs every type other than code/doc, so a mistype like "cod"
      # with a blank sha would otherwise be unanchored AND uninspected.
      # Type derivation mirrors audit-merge.rb, except blank/whitespace strings are
      # treated as absent (`""` is truthy in Ruby, so `ev['type'] || ...` would keep it).
      ev = f['evidence']
      sha = ev['sha']
      raw_type = ev['type']
      ev_type = if raw_type.nil? || (raw_type.is_a?(String) && raw_type.strip.empty?)
                  ev['file'].to_s.empty? ? 'runtime' : 'code'
                elsif raw_type.is_a?(String)
                  raw_type.strip
                else
                  raw_type
                end
      unless evidence_types.include?(ev_type)
        errors << "#{where}: evidence.type #{ev_type.inspect} not in evidenceTypeEnum #{evidence_types.join('|')}"
      end
      full_sha = sha.to_s.match?(/\A[0-9a-f]{40}\z/)
      if CHECKABLE_EVIDENCE_TYPES.include?(ev_type)
        unless full_sha
          errors << "#{where}: #{ev_type} evidence must carry a full 40-character lowercase hex evidence.sha " \
                    "(citation-check falls back to the working tree when it is blank), got #{sha.inspect}"
        end
      elsif !(sha.nil? || sha.to_s.empty?) && !full_sha
        errors << "#{where}: evidence.sha must be a full 40-character lowercase hex commit id when present, got #{sha.inspect}"
      end
    end
  end

  # No stale entries: every listed id must name a row of this register.
  (listed - row_ids).sort.each do |entry|
    errors << "#{path}: closed list entry #{entry.inspect} does not resolve to a row in #{File.basename(path)}"
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
