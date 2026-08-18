#!/usr/bin/env ruby
# frozen_string_literal: true

# citation-check.rb - mechanical evidence validator for the findings register.
#
# Part of the Audit/Compliance Modernization (Phase 1 "Foundation"). The register
# (audit-reports/FINDINGS.json) only earns trust if every active finding's evidence
# anchor actually exists in the code it cites. This script proves that: for each
# active finding it reads the cited file AT the recorded commit SHA and asserts the
# quoted snippet is really there. A finding whose citation cannot be verified is
# bounced (non-zero exit), never silently trusted.
#
# It is the acceptance test for the register and is safe to run in CI: pure git +
# filesystem, no network, no database, no app boot.
#
# Usage:
#   ruby scripts/citation-check.rb [FINDINGS.json]      # validate (default file: audit-reports/FINDINGS.json)
#   ruby scripts/citation-check.rb --render [FINDINGS.json]  # (re)generate the sibling FINDINGS.md from the JSON
#   ruby scripts/citation-check.rb --report OUT.json [FINDINGS.json]  # also write a machine-readable result
#
# Exit codes: 0 = all active citations verified (and ids consistent); 1 = one or more failures.

require 'json'
require 'digest'
require 'open3'
require 'optparse'

DEFAULT_REGISTER = 'audit-reports/FINDINGS.json'

# Statuses whose evidence anchor must point at real, current code. Superseded and
# accepted-risk findings are intentionally NOT citation-validated (their premise may
# no longer exist in the tree, which is the whole point of those statuses).
ACTIVE_STATUSES = %w[open remediated-unverified verified-closed].freeze

# Evidence types that carry a checkable file:line snippet. Attestation findings are
# closed by an external legal artifact, not by a code anchor, so they are reported
# as SKIP rather than failed.
CHECKABLE_EVIDENCE_TYPES = %w[code doc].freeze

# Line-number drift tolerance: snippets move as files change. The hard gate is that
# the snippet EXISTS at the SHA; line number is advisory and only warned on.
LINE_DRIFT_TOLERANCE = 8

options = { mode: :check, report: nil }
parser = OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/citation-check.rb [--render] [--report OUT.json] [FINDINGS.json]'
  o.on('--render', 'Regenerate the sibling FINDINGS.md from the register JSON') { options[:mode] = :render }
  o.on('--report FILE', 'Write a JSON result document to FILE') { |f| options[:report] = f }
end
parser.parse!(ARGV)

register_path = ARGV[0] || DEFAULT_REGISTER
unless File.file?(register_path)
  warn "citation-check: register not found: #{register_path}"
  exit 1
end

register = JSON.parse(File.read(register_path))
meta = register['meta'] || {}
findings = register['findings'] || []
audited_sha = meta['auditedSha']
$audited_sha = audited_sha

# Normalize whitespace so snippet matching survives reindentation: trim ends and
# collapse internal runs of whitespace to a single space.
def normalize(str)
  str.to_s.gsub(/\s+/, ' ').strip
end

# Deterministic id, identical to the generator: LL- + sha256(ruleKey|path)[0,10],
# where path is the evidence file (or the ruleKey when a finding has no file anchor).
def expected_id(finding)
  rule_key = finding['ruleKey'].to_s
  path = (finding['evidence'] && finding['evidence']['file']) || rule_key
  'LL-' + Digest::SHA256.hexdigest("#{rule_key}|#{path}")[0, 10]
end

# Return the file contents at a given git sha, or nil if the path does not exist there.
# Falls back to the working tree when no sha is recorded.
def file_at_sha(path, sha)
  if sha.nil? || sha.empty?
    return File.file?(path) ? File.read(path) : nil
  end
  out, _err, status = Open3.capture3('git', 'show', "#{sha}:#{path}")
  status.success? ? out : nil
end

def check_finding(finding)
  ev = finding['evidence'] || {}
  type = ev['type']
  result = { id: finding['id'], legacyId: finding['legacyId'], status: finding['status'] }

  # id integrity (applies to every finding regardless of status)
  exp = expected_id(finding)
  if finding['id'] != exp
    return result.merge(verdict: 'FAIL', reason: "id mismatch: stored #{finding['id'].inspect}, expected #{exp.inspect}")
  end

  unless ACTIVE_STATUSES.include?(finding['status'])
    return result.merge(verdict: 'SKIP', reason: "status #{finding['status']} is not citation-validated")
  end

  unless CHECKABLE_EVIDENCE_TYPES.include?(type)
    attested = !finding.dig('closureEvidence', 'attestation').to_s.empty?
    basis = attested ? 'closed by attestation' : 'unattested -- relies on manual/human review, not mechanically verified'
    return result.merge(verdict: 'SKIP', reason: "evidence type #{type.inspect} has no code anchor (#{basis})")
  end

  file = ev['file']
  snippet = ev['snippet']
  if file.to_s.empty? || snippet.to_s.empty?
    return result.merge(verdict: 'FAIL', reason: 'active code/doc finding is missing evidence.file or evidence.snippet')
  end

  # The register pins evidence to a commit. If meta.auditedSha is set, an active finding
  # MUST carry a non-empty evidence.sha; otherwise file_at_sha would silently validate
  # against the working tree / HEAD instead of the audited commit.
  if !$audited_sha.to_s.empty? && ev['sha'].to_s.empty?
    return result.merge(verdict: 'FAIL', reason: "active finding has empty evidence.sha but meta.auditedSha is set (#{$audited_sha})")
  end

  contents = file_at_sha(file, ev['sha'])
  return result.merge(verdict: 'FAIL', reason: "file not found at sha: #{file}@#{ev['sha']}") if contents.nil?

  norm_snippet = normalize(snippet)
  matches = []
  contents.each_line.with_index(1) do |line, lineno|
    matches << lineno if normalize(line).include?(norm_snippet)
  end

  if matches.empty?
    return result.merge(verdict: 'FAIL', reason: "snippet not present in #{file}@#{ev['sha']}: #{snippet.inspect}")
  end

  recorded = ev['line']
  # When a line is recorded, the snippet MUST appear within tolerance of it. A snippet can
  # legitimately occur more than once (e.g. the same env-var key under the web and worker
  # services), so we anchor to the nearest occurrence and require that occurrence to be at
  # the cited line; an occurrence that is far away means the citation points at the wrong
  # instance (or the code moved), which is a FAIL, not a pass-with-warning. This is the
  # guarantee the register's README makes: the snippet is really at the cited file:line.
  if recorded
    matched_line = matches.min_by { |m| (m - recorded).abs }
    if (matched_line - recorded).abs > LINE_DRIFT_TOLERANCE
      occ = matches.size > 1 ? " (snippet occurs at lines #{matches.join(', ')})" : ''
      return result.merge(verdict: 'FAIL', matchedLine: matched_line,
                          reason: "snippet not at cited line #{recorded}; nearest occurrence is line #{matched_line}#{occ}")
    end
    res = result.merge(verdict: 'PASS', matchedLine: matched_line)
    # Ambiguity is acceptable only because the recorded line disambiguates; surface it.
    res = res.merge(warning: "snippet is non-unique (lines #{matches.join(', ')}); anchored by cited line #{recorded}") if matches.size > 1
    return res
  end

  result.merge(verdict: 'PASS', matchedLine: matches.first)
end

# ---- render mode: FINDINGS.md from the JSON --------------------------------------

SEVERITY_ORDER = { 'critical' => 0, 'high' => 1, 'medium' => 2, 'low' => 3 }.freeze
STATUS_SECTIONS = [
  ['open', 'Open'],
  ['remediated-unverified', 'Remediated (awaiting verification)'],
  ['verified-closed', 'Verified closed'],
  ['accepted-risk', 'Accepted risk'],
  ['superseded', 'Superseded / obsolete']
].freeze

# A finding's triage state. Disposition is optional and orthogonal to status; a finding with no
# disposition object (every /audit-run finding, and any pre-1.1 finding) reads as "untriaged".
# Only Scot sets a non-untriaged value (see meta.governance).
def disposition_state(finding)
  d = finding['disposition']
  state = d.is_a?(Hash) ? d['state'] : d
  state.to_s.empty? ? 'untriaged' : state
end

# Origin of the finding: "pr-review" (promoted from a PR review by scripts/promote-finding.rb) or
# "audit-run" (the default, from the periodic fan-out). Surfaced so the register attributes each
# finding to where it came from (the evaluation's attribution requirement).
def finding_source(finding)
  src = finding['source']
  kind = src.is_a?(Hash) ? src['kind'] : src
  kind.to_s.empty? ? 'audit-run' : kind
end

def render_markdown(register)
  meta = register['meta'] || {}
  findings = register['findings'] || []
  open_active = findings.select { |f| %w[open remediated-unverified].include?(f['status']) }
  open_crit = open_active.count { |f| f['severity'] == 'critical' }
  open_high = open_active.count { |f| f['severity'] == 'high' }

  out = +""
  out << "# LingoLinq-AAC Findings Register\n\n"
  out << "> Generated from `audit-reports/FINDINGS.json` by `scripts/citation-check.rb --render`.\n"
  out << "> Do not hand-edit; edit the JSON (the source of truth) and re-render.\n\n"
  out << "**Audited:** `#{meta['auditedRef']}` @ `#{meta['auditedSha']}` on #{meta['auditedDate']}  \n"
  out << "**Seed:** #{meta['seedSource']}  \n"
  out << "**Headline (open + remediated-unverified):** #{open_crit} Critical / #{open_high} High\n\n"
  out << "Statuses are verified against live code at the audited SHA, not copied from the dated report prose. "
  out << "Only Scot closes a finding, downgrades severity, accepts risk, or sets a disposition. "
  out << "Disposition (triage) is orthogonal to status: a finding can be `open` yet "
  out << "`dismissed-false-positive`/`wontfix`/`accepted`; blank reads as `untriaged`.\n\n"

  STATUS_SECTIONS.each do |status, heading|
    group = findings.select { |f| f['status'] == status }
    next if group.empty?

    group = group.sort_by { |f| [SEVERITY_ORDER[f['severity']] || 9, f['legacyId'].to_s] }
    out << "## #{heading} (#{group.size})\n\n"
    out << "| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |\n"
    out << "|---|---|---|---|---|---|---|---|\n"
    group.each do |f|
      ev = f['evidence'] || {}
      anchor = ev['file'] ? "`#{ev['file']}`#{ev['line'] ? ":#{ev['line']}" : ''}" : '(attestation)'
      fw = (f['frameworks'] || []).join(', ')
      title = f['title'].to_s.gsub('|', '\\|')
      disp = disposition_state(f)
      disp = "**#{disp}**#{f['regression'] ? ' ⚠regression' : ''}" unless disp == 'untriaged'
      out << "| #{f['id']} | #{f['legacyId']} | #{f['severity']} | #{fw} | #{disp} | #{finding_source(f)} | #{title} | #{anchor} |\n"
    end
    out << "\n"
  end

  out << "---\n\n"
  out << "_#{findings.size} findings total. Re-run `ruby scripts/citation-check.rb` to validate every active citation._\n"
  out
end

if options[:mode] == :render
  md_path = File.join(File.dirname(register_path), 'FINDINGS.md')
  File.write(md_path, render_markdown(register))
  puts "Rendered #{md_path} from #{register_path}"
  exit 0
end

# ---- check mode ------------------------------------------------------------------

results = findings.map { |f| check_finding(f) }
failed = results.select { |r| r[:verdict] == 'FAIL' }
passed = results.select { |r| r[:verdict] == 'PASS' }
skipped = results.select { |r| r[:verdict] == 'SKIP' }
warned = results.select { |r| r[:warning] }

puts "citation-check: #{register_path} @ #{audited_sha}"
puts "-" * 72
results.each do |r|
  tag = r[:verdict]
  line = "  [#{tag}] #{r[:id]} (#{r[:legacyId]})"
  line << " - #{r[:reason]}" if r[:reason]
  line << " [#{r[:warning]}]" if r[:warning]
  puts line
end
puts "-" * 72
puts "PASS: #{passed.size}   FAIL: #{failed.size}   SKIP: #{skipped.size}   (warnings: #{warned.size})"

if options[:report]
  report = {
    'register' => register_path,
    'auditedSha' => audited_sha,
    'summary' => { 'pass' => passed.size, 'fail' => failed.size, 'skip' => skipped.size, 'warnings' => warned.size },
    'results' => results
  }
  File.write(options[:report], JSON.pretty_generate(report) + "\n")
  puts "Wrote #{options[:report]}"
end

exit(failed.empty? ? 0 : 1)
