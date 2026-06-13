#!/usr/bin/env ruby
# frozen_string_literal: true

# audit-merge.rb - deterministic reconciler for the findings register.
#
# Part of the Audit/Compliance Modernization (Phase 2 "Agent migration"). The /audit-run
# orchestrator fans out the read-only domain finders, then feeds their JSON outputs here to
# reconcile against audit-reports/FINDINGS.json. This script exists so reconciliation is
# MECHANICAL and SAFE rather than free-form: it encodes the one governance rule that protects
# the single source of truth (plan section 5.6, checkpoint 1):
#
#   Only Scot closes a finding, downgrades severity, or accepts risk.
#
# Therefore this script:
#   * NEVER writes status "verified-closed", "accepted-risk", or "superseded".
#   * NEVER downgrades an existing finding's severity (a finder cannot lower it).
#   * Adds genuinely new findings as status "open".
#   * For a known id still status "open"/"remediated-unverified": refreshes lastSeen and
#     re-anchors evidence to the new audited SHA (so citation-check stays green), keeps the
#     Scot-owned fields (status, severity, owner, firstSeen, closureEvidence).
#   * For a known id that was previously closed/accepted/superseded but a finder re-surfaced:
#     leaves the Scot-owned status UNTOUCHED, sets regression:true with a loud note, and lists
#     it in the summary so the adversary verifies and Scot decides whether to reopen.
#   * Leaves register findings NOT seen this run completely unchanged (different scan scope).
#
# Pure git-free stdlib (json, digest, date). No network, no app boot. Safe in CI.
#
# Usage:
#   ruby scripts/audit-merge.rb --register audit-reports/FINDINGS.json \
#     --sha <auditedSha> [--ref <ref>] [--date YYYY-MM-DD] \
#     --in finder1.json [--in finder2.json ...] \
#     --out audit-reports/FINDINGS.json [--summary OUT.json]
#
# Exit codes: 0 = merged OK; 1 = bad input / invariant violation.

require 'json'
require 'digest'
require 'date'
require 'optparse'
require 'open3'

SEVERITY_ENUM = %w[critical high medium low].freeze
FRAMEWORK_ENUM = %w[FERPA COPPA HIPAA GDPR WCAG SOC2].freeze
# Statuses a finder may NOT change. If a known id carries one of these, the finder's re-find
# is a regression candidate, not a status flip.
SCOT_OWNED_CLOSED = %w[verified-closed accepted-risk superseded].freeze
# The only status this script is ever allowed to assign.
ASSIGNABLE_STATUS = 'open'

opts = { ins: [], ref: nil, date: nil, summary: nil }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/audit-merge.rb --register F --sha S --in finder.json [...] --out F [--summary S]'
  o.on('--register FILE') { |v| opts[:register] = v }
  o.on('--sha SHA')       { |v| opts[:sha] = v }
  o.on('--ref REF')       { |v| opts[:ref] = v }
  o.on('--date DATE')     { |v| opts[:date] = v }
  o.on('--in FILE')       { |v| opts[:ins] << v }
  o.on('--out FILE')      { |v| opts[:out] = v }
  o.on('--summary FILE')  { |v| opts[:summary] = v }
end.parse!(ARGV)

def die(msg)
  warn "audit-merge: #{msg}"
  exit 1
end

die('missing --register') unless opts[:register]
die('missing --sha')      unless opts[:sha]
die('missing --out')      unless opts[:out]
die('no --in finder files given') if opts[:ins].empty?
die("register not found: #{opts[:register]}") unless File.file?(opts[:register])

run_date = opts[:date] || Date.today.to_s
run_sha  = opts[:sha]

register = JSON.parse(File.read(opts[:register]))
meta = register['meta'] || {}
findings = register['findings'] || []
by_id = {}
findings.each { |f| by_id[f['id']] = f }

def finding_id(rule_key, path)
  'LL-' + Digest::SHA256.hexdigest("#{rule_key}|#{path}")[0, 10]
end

# True if `snippet` (whitespace-normalized) appears in `file` at `sha`. Mirrors the matching
# scripts/citation-check.rb uses, so a finding this script accepts is one citation-check will
# pass. Used to refuse evidence that would redden the register on the next /audit-run.
def snippet_present?(file, snippet, sha)
  return false if file.to_s.empty? || snippet.to_s.strip.empty?
  out, _err, status =
    if sha.to_s.empty?
      File.file?(file) ? [File.read(file), nil, nil] : [nil, nil, nil]
    else
      Open3.capture3('git', 'show', "#{sha}:#{file}")
    end
  content = out
  content = nil if !sha.to_s.empty? && !(status && status.success?)
  return false if content.nil?
  norm = ->(s) { s.to_s.gsub(/\s+/, ' ').strip }
  norm.call(content).include?(norm.call(snippet))
end

CHECKABLE_TYPES = %w[code doc].freeze

summary = { 'auditedSha' => run_sha, 'auditedDate' => run_date,
            'new' => [], 'reseen' => [], 'regressions' => [],
            'severityChangeCandidates' => [], 'skipped' => [] }

opts[:ins].each do |path|
  die("input not found: #{path}") unless File.file?(path)
  # Finders are LLMs; truncated/garbled JSON is a when-not-if. Skip a bad input file and keep
  # the other finders' valid output rather than aborting the whole reconcile.
  doc =
    begin
      JSON.parse(File.read(path))
    rescue JSON::ParserError => e
      summary['skipped'] << { 'input' => path, 'reason' => "unparseable JSON: #{e.message[0, 120]}" }
      next
    end
  domain = doc.is_a?(Hash) ? (doc['domain'] || 'unknown') : 'unknown'
  incoming = doc.is_a?(Hash) ? (doc['findings'] || []) : Array(doc)

  incoming.each do |raw|
    rule_key = raw['ruleKey'].to_s
    ev = raw['evidence'] || {}
    file = ev['file'].to_s
    type = ev['type'] || (file.empty? ? 'runtime' : 'code')
    snippet = ev['snippet'].to_s
    if rule_key.empty?
      summary['skipped'] << { 'domain' => domain, 'reason' => 'missing ruleKey', 'title' => raw['title'] }
      next
    end
    # id anchor MUST match scripts/citation-check.rb#expected_id: the evidence file, or the
    # ruleKey itself when there is no file anchor. (Previously used "runtime:<source>", which
    # produced ids citation-check rejected as mismatched, reddening the register.)
    anchor = file.empty? ? rule_key : file
    id = finding_id(rule_key, anchor)

    # Severity/confidence: downcase before the enum check so a finder emitting "CRITICAL" is not
    # silently buried as "medium" (that would corrupt the open-Critical/High headline downward).
    sev = SEVERITY_ENUM.include?(raw['severity'].to_s.downcase) ? raw['severity'].to_s.downcase : 'medium'
    conf = %w[high medium low].include?(raw['confidence'].to_s.downcase) ? raw['confidence'].to_s.downcase : 'medium'
    frameworks = Array(raw['frameworks']).select { |x| FRAMEWORK_ENUM.include?(x) }

    # For a checkable (code/doc) finding with a file, the snippet MUST resolve at run_sha or it
    # would fail citation-check. Verify up front; used to gate evidence writes below.
    checkable = !file.empty? && CHECKABLE_TYPES.include?(type)
    snippet_ok = checkable ? snippet_present?(file, snippet, run_sha) : true

    if (existing = by_id[id])
      existing['lastSeen'] = run_date
      # severity: never downgrade; flag an UPWARD change for Scot but do not auto-apply.
      if SEVERITY_ENUM.index(sev) < SEVERITY_ENUM.index(existing['severity'] || 'low')
        summary['severityChangeCandidates'] << { 'id' => id, 'from' => existing['severity'], 'finderSays' => sev }
      end

      if SCOT_OWNED_CLOSED.include?(existing['status'])
        # Regression: a previously closed/accepted/superseded finding re-surfaced. Do NOT flip
        # the Scot-owned status and do NOT touch its (still-valid) evidence; flag it loudly.
        existing['regression'] = true
        note = "REGRESSION: re-surfaced by #{domain} finder on #{run_date} at #{run_sha} (status was #{existing['status']}). Needs adversary verification + Scot decision to reopen."
        existing['notes'] = [existing['notes'], note].compact.reject(&:empty?).join(' | ')
        summary['regressions'] << { 'id' => id, 'ruleKey' => rule_key, 'status' => existing['status'],
                                    'severity' => existing['severity'], 'domain' => domain, 'file' => anchor }
      else
        # Active finding still present. Re-anchor evidence to the new SHA ONLY if the new snippet
        # actually verifies there; otherwise keep the prior (valid) evidence so a stale or
        # hallucinated finder snippet cannot redden a finding that was green before this run.
        if checkable && snippet_ok
          existing['evidence'] = { 'type' => type, 'file' => file, 'line' => ev['line'],
                                   'snippet' => snippet, 'sha' => run_sha }
          summary['reseen'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => existing['severity'], 'domain' => domain }
        elsif checkable && !snippet_ok
          existing['notes'] = [existing['notes'],
            "#{domain} finder re-reported on #{run_date} but its snippet did not resolve at #{run_sha}; evidence left as prior."].compact.reject(&:empty?).join(' | ')
          summary['reseen'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => existing['severity'],
                                 'domain' => domain, 'snippetUnverified' => true }
        elsif file.empty? && ev['source']
          existing['evidence'] = { 'type' => type, 'source' => ev['source'], 'snippet' => snippet }
          summary['reseen'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => existing['severity'], 'domain' => domain }
        else
          summary['reseen'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => existing['severity'], 'domain' => domain }
        end
      end
    else
      # Brand new finding. Refuse a checkable one whose snippet does not resolve at run_sha (it
      # would redden citation-check); record it as skipped for re-run rather than poisoning the register.
      if checkable && !snippet_ok
        summary['skipped'] << { 'domain' => domain, 'ruleKey' => rule_key, 'file' => file,
                                'reason' => "snippet not found at #{run_sha}; finding not added" }
        next
      end
      evidence =
        if !file.empty?
          { 'type' => type, 'file' => file, 'line' => ev['line'], 'snippet' => snippet, 'sha' => run_sha }
        else
          { 'type' => type, 'source' => ev['source'].to_s, 'snippet' => snippet }
        end
      record = {
        'id' => id, 'ruleKey' => rule_key, 'title' => raw['title'].to_s,
        'severity' => sev, 'confidence' => conf,
        'frameworks' => frameworks, 'status' => ASSIGNABLE_STATUS, 'evidence' => evidence,
        'firstSeen' => run_date, 'lastSeen' => run_date, 'owner' => 'unassigned',
        'remediation' => (raw['remediation'] || { 'options' => '', 'timeframe' => '' }),
        'closureEvidence' => { 'sha' => '', 'verifierNote' => '', 'attestation' => '' },
        'notes' => "Surfaced by #{domain} finder on #{run_date}. #{raw['notes']}".strip
      }
      findings << record
      by_id[id] = record
      summary['new'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => sev, 'domain' => domain, 'file' => anchor }
    end
  end
end

# Invariant: this script must never have produced a closed/accepted/superseded status.
findings.each do |f|
  if f['status'] == ASSIGNABLE_STATUS && f['firstSeen'] == run_date && SCOT_OWNED_CLOSED.include?(f['status'])
    die("invariant violation: assigned a Scot-owned status to #{f['id']}")
  end
end

# Update register meta audit pointers; leave everything else in meta untouched.
meta['auditedSha'] = run_sha
meta['auditedRef'] = opts[:ref] if opts[:ref]
meta['auditedDate'] = run_date
register['meta'] = meta
register['findings'] = findings

File.write(opts[:out], JSON.pretty_generate(register) + "\n")
File.write(opts[:summary], JSON.pretty_generate(summary) + "\n") if opts[:summary]

puts "audit-merge: ok  new=#{summary['new'].size} reseen=#{summary['reseen'].size} " \
     "regressions=#{summary['regressions'].size} sevChangeCandidates=#{summary['severityChangeCandidates'].size} " \
     "skipped=#{summary['skipped'].size}  -> #{opts[:out]}"
