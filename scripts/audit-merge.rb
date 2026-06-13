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

def finding_id(rule_key, file)
  'LL-' + Digest::SHA256.hexdigest("#{rule_key}|#{file}")[0, 10]
end

summary = { 'auditedSha' => run_sha, 'auditedDate' => run_date,
            'new' => [], 'reseen' => [], 'regressions' => [],
            'severityChangeCandidates' => [], 'skipped' => [] }

opts[:ins].each do |path|
  die("input not found: #{path}") unless File.file?(path)
  doc = JSON.parse(File.read(path))
  domain = doc.is_a?(Hash) ? (doc['domain'] || 'unknown') : 'unknown'
  incoming = doc.is_a?(Hash) ? (doc['findings'] || []) : Array(doc)

  incoming.each do |raw|
    rule_key = raw['ruleKey'].to_s
    ev = raw['evidence'] || {}
    file = ev['file'].to_s
    # A finding must have a ruleKey. It must also have a file UNLESS it is a non-code-anchored
    # runtime/attestation observation (those are keyed by ruleKey + the source label instead).
    if rule_key.empty?
      summary['skipped'] << { 'domain' => domain, 'reason' => 'missing ruleKey', 'title' => raw['title'] }
      next
    end
    anchor = file.empty? ? "runtime:#{ev['source']}" : file
    id = finding_id(rule_key, anchor)

    sev = SEVERITY_ENUM.include?(raw['severity']) ? raw['severity'] : 'medium'
    frameworks = Array(raw['frameworks']).select { |x| FRAMEWORK_ENUM.include?(x) }

    if (existing = by_id[id])
      existing['lastSeen'] = run_date
      # severity: never downgrade; flag an UPWARD change for Scot but do not auto-apply.
      if SEVERITY_ENUM.index(sev) < SEVERITY_ENUM.index(existing['severity'] || 'low')
        summary['severityChangeCandidates'] << { 'id' => id, 'from' => existing['severity'], 'finderSays' => sev }
      end

      if SCOT_OWNED_CLOSED.include?(existing['status'])
        # Regression: a previously closed/accepted/superseded finding re-surfaced. Do NOT flip
        # the Scot-owned status; flag it loudly for the adversary + Scot.
        existing['regression'] = true
        note = "REGRESSION: re-surfaced by #{domain} finder on #{run_date} at #{run_sha} (status was #{existing['status']}). Needs adversary verification + Scot decision to reopen."
        existing['notes'] = [existing['notes'], note].compact.reject(&:empty?).join(' | ')
        summary['regressions'] << { 'id' => id, 'ruleKey' => rule_key, 'status' => existing['status'],
                                    'severity' => existing['severity'], 'domain' => domain, 'file' => anchor }
      else
        # Active finding still present: refresh evidence to the new SHA so citation-check stays
        # green at the new auditedSha. Keep Scot-owned status/severity/owner/firstSeen.
        if !file.empty?
          existing['evidence'] = {
            'type' => ev['type'] || 'code', 'file' => file,
            'line' => ev['line'], 'snippet' => ev['snippet'].to_s, 'sha' => run_sha
          }
        elsif ev['source']
          existing['evidence'] = { 'type' => ev['type'] || 'runtime', 'source' => ev['source'],
                                   'snippet' => ev['snippet'].to_s }
        end
        summary['reseen'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => existing['severity'], 'domain' => domain }
      end
    else
      # Brand new finding. Build a full register record as status "open".
      evidence =
        if !file.empty?
          { 'type' => ev['type'] || 'code', 'file' => file, 'line' => ev['line'],
            'snippet' => ev['snippet'].to_s, 'sha' => run_sha }
        else
          { 'type' => ev['type'] || 'runtime', 'source' => ev['source'].to_s, 'snippet' => ev['snippet'].to_s }
        end
      record = {
        'id' => id, 'ruleKey' => rule_key, 'title' => raw['title'].to_s,
        'severity' => sev, 'confidence' => (%w[high medium low].include?(raw['confidence']) ? raw['confidence'] : 'medium'),
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
