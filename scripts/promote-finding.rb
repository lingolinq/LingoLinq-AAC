#!/usr/bin/env ruby
# frozen_string_literal: true

# promote-finding.rb - bridge PR-time review findings into the findings register.
#
# Part of the Audit/Compliance Modernization ("operationalize the review pipeline", from the
# 2026-06-14 PR-review-workflow evaluation, recommendation #4). Today the n8n PR Review Bot and
# the /review-pr + /adversary-review CLI passes post findings to a PR comment + Google Chat and
# then they evaporate: no register row, no triage, no owner. Only the periodic /audit-run feeds
# audit-reports/FINDINGS.json. This script closes that gap by promoting a *reviewed*
# Critical/High PR finding INTO the register as status "open", so it gets tracked and triaged
# rather than just logged.
#
# It is the deterministic, governed sibling of scripts/audit-merge.rb and obeys the SAME single
# governance rule that protects the single source of truth (plan section 5.6, checkpoint 1):
#
#   Only Scot closes a finding, downgrades severity, accepts risk, or sets a disposition.
#
# Therefore this script:
#   * NEVER writes status "verified-closed", "accepted-risk", or "superseded".
#   * NEVER downgrades an existing finding's severity (a reviewer cannot lower it).
#   * NEVER sets a disposition other than "untriaged" (triage is Scot's call).
#   * Promotes ONLY Critical/High findings (decision: keep promotion conservative so the register
#     does not fill with medium/low PR noise; medium/low are skipped + reported).
#   * Accepts CODE/PATH evidence ONLY. A finding must carry evidence.file + evidence.snippet that
#     resolves at evidence.sha (so scripts/citation-check.rb stays green), and must NOT carry any
#     PII or secret shape in any text field -- such a finding is REFUSED outright (skipped, never
#     redacted-in), because the register is code/path evidence only and is a Claude-only
#     compliance surface.
#   * Adds genuinely new findings as status "open", disposition "untriaged", with PR provenance.
#   * For a known id still "open"/"remediated-unverified": refreshes lastSeen, records the PR
#     provenance in notes, re-anchors evidence to the finding's sha only if it still verifies.
#   * For a known id previously closed/accepted/superseded that a reviewer re-surfaced: leaves the
#     Scot-owned status UNTOUCHED, sets regression:true with a loud note, lists it in the summary.
#
# WHY a manual command and not a hook / an n8n auto-promote step (the trigger decision):
#   1. The n8n PR bot runs a DeepSeek pass via OpenRouter (no BAA). FINDINGS.json is a Claude-only
#      compliance surface; auto-promoting from the bot would route DeepSeek-curated content into
#      the compliance SSOT AND require giving the n8n service write access to the repo register --
#      a governance and attack-surface violation. So promotion is operated from a trusted Claude
#      session, never by the bot.
#   2. AI reviewers carry a 5-15% false-positive rate. Auto-promoting every Critical/High would
#      flood the register with FPs. A human-in-the-loop deciding "yes, this one is real, track it"
#      IS the triage gate the evaluation says is the differentiator (attribution + ownership).
#   3. It mirrors the existing /audit-run model: user-invoked orchestrator (the /promote-finding
#      skill) + deterministic merge helper (this script) + only-Scot governance.
#
# Pure git-free stdlib (json, digest, date, open3). No network, no app boot. Safe in CI.
#
# Usage:
#   ruby scripts/promote-finding.rb --register audit-reports/FINDINGS.json \
#     --in /tmp/pr-review-findings.json [--in ...] \
#     --out audit-reports/FINDINGS.json [--summary OUT.json] [--owner NAME] [--date YYYY-MM-DD]
#
# Input file shape (one per reviewer pass; produced by the /promote-finding skill after a human
# selects which reviewed findings to promote -- code/path evidence only, no PII, no secrets):
#   {
#     "source": "pr-review",
#     "pr": 391,
#     "reviewer": "claude-senior-dev" | "adversary" | "claude-bot" | ...,
#     "findings": [
#       { "ruleKey": "...", "title": "...", "severity": "critical|high",
#         "confidence": "high|medium|low", "frameworks": ["FERPA", ...],
#         "evidence": { "type": "code", "file": "path", "line": N, "snippet": "...", "sha": "..." },
#         "remediation": { "options": "...", "timeframe": "..." }, "notes": "..." }
#     ]
#   }
#
# Exit codes: 0 = promoted OK (or nothing eligible); 1 = bad input / invariant violation.

require 'json'
require 'digest'
require 'date'
require 'optparse'
require 'open3'

SEVERITY_ENUM = %w[critical high medium low].freeze
# Promotion is deliberately conservative: only the two top severities cross into the register.
PROMOTABLE_SEVERITIES = %w[critical high].freeze
FRAMEWORK_ENUM = %w[FERPA COPPA HIPAA GDPR WCAG SOC2].freeze
# Statuses a reviewer may NOT change. A re-find of one of these is a regression, not a status flip.
SCOT_OWNED_CLOSED = %w[verified-closed accepted-risk superseded].freeze
# The only status this script is ever allowed to assign.
ASSIGNABLE_STATUS = 'open'
# The only disposition this script is ever allowed to assign (Scot owns every other value).
ASSIGNABLE_DISPOSITION = 'untriaged'
# Evidence types that carry a checkable file:line snippet (must match citation-check.rb).
CHECKABLE_TYPES = %w[code doc].freeze

# --- PII / secret detection (mirrors lib/pii_scrubber.rb patterns) -------------------------------
# The register is code/path evidence only and is shipped to no model without a BAA review. A PR
# finding whose text carries an identifier or a secret is REFUSED, not redacted: such evidence has
# no business in the SSOT at all. Patterns mirror lib/pii_scrubber.rb (kept in sync by hand; that
# module needs Rails/ActiveSupport so it cannot be required from a no-boot script). Conservative by
# design -- a false "looks like PII" only blocks one finding from promotion, which is the safe
# direction.
PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  phone: /\b(?:\+?1[-.\s])?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  ip: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  global_id: /\b\d+_\d+(?:_[a-zA-Z0-9]+)?\b/
}.freeze

# Secret shapes (gitleaks-style, abbreviated). A match refuses the finding outright.
SECRET_PATTERNS = {
  aws_access_key: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  private_key_block: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  github_token: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/,
  slack_token: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  openai_key: /\bsk-[A-Za-z0-9]{20,}\b/,
  google_api_key: /\bAIza[0-9A-Za-z\-_]{35}\b/,
  stripe_key: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/,
  jwt: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  db_url_with_credentials: %r{\b[a-z][a-z0-9+.\-]*://[^:@/\s]+:[^@/\s]+@},
  bearer_secret: /\b(?:bearer|token|secret|password|passwd|api[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9\/+_=\-]{12,}/i
}.freeze

opts = { ins: [], summary: nil, owner: 'unassigned', date: nil }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/promote-finding.rb --register F --in pr.json [...] --out F [--summary S] [--owner NAME] [--date YYYY-MM-DD]'
  o.on('--register FILE') { |v| opts[:register] = v }
  o.on('--in FILE')       { |v| opts[:ins] << v }
  o.on('--out FILE')      { |v| opts[:out] = v }
  o.on('--summary FILE')  { |v| opts[:summary] = v }
  o.on('--owner NAME')    { |v| opts[:owner] = v }
  o.on('--date DATE')     { |v| opts[:date] = v }
end.parse!(ARGV)

def die(msg)
  warn "promote-finding: #{msg}"
  exit 1
end

die('missing --register') unless opts[:register]
die('missing --out')      unless opts[:out]
die('no --in finding files given') if opts[:ins].empty?
die("register not found: #{opts[:register]}") unless File.file?(opts[:register])

run_date = opts[:date] || Date.today.to_s

register = JSON.parse(File.read(opts[:register]))
meta = register['meta'] || {}
findings = register['findings'] || []
by_id = {}
findings.each { |f| by_id[f['id']] = f }

# Deterministic id, identical to scripts/audit-merge.rb#finding_id and
# scripts/citation-check.rb#expected_id (the documented contract in meta.idAlgorithm): the id
# anchors on the evidence file, or on the ruleKey when there is no file anchor.
def finding_id(rule_key, path)
  'LL-' + Digest::SHA256.hexdigest("#{rule_key}|#{path}")[0, 10]
end

# True if `snippet` (whitespace-normalized) appears in `file` at `sha`. Mirrors the matching that
# scripts/citation-check.rb uses, so a finding this script accepts is one citation-check passes.
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
  needle = norm.call(snippet)
  return false if needle.empty?
  # Match citation-check.rb's per-LINE semantics exactly: it normalizes each source line and
  # checks include() on that line. A multi-line snippet would pass a whole-file include() here but
  # FAIL citation-check (no single line contains it), reddening the register. So gate per-line too.
  content.each_line.any? { |line| norm.call(line).include?(needle) }
end

# Scan all of a finding's free text for PII/secret shapes. Returns the list of matched categories
# (empty == clean). Checks title, snippet, notes, remediation, evidence.source, frameworks-free
# text. Refuses on ANY hit -- the register must never carry an identifier or a secret.
def sensitive_hits(raw)
  ev = raw['evidence'] || {}
  rem = raw['remediation'] || {}
  texts = [
    raw['title'], raw['notes'], raw['ruleKey'],
    ev['snippet'], ev['file'], ev['source'],
    rem['options'], rem['timeframe']
  ].compact.map(&:to_s)
  blob = texts.join("\n")
  hits = []
  SECRET_PATTERNS.each { |name, re| hits << "secret:#{name}" if blob.match?(re) }
  PII_PATTERNS.each { |name, re| hits << "pii:#{name}" if blob.match?(re) }
  hits
end

summary = { 'promotedDate' => run_date, 'new' => [], 'reseen' => [],
            'regressions' => [], 'skipped' => [] }

opts[:ins].each do |path|
  die("input not found: #{path}") unless File.file?(path)
  doc =
    begin
      JSON.parse(File.read(path))
    rescue JSON::ParserError => e
      summary['skipped'] << { 'input' => path, 'reason' => "unparseable JSON: #{e.message[0, 120]}" }
      next
    end
  source = doc.is_a?(Hash) ? (doc['source'] || 'pr-review') : 'pr-review'
  pr = doc.is_a?(Hash) ? doc['pr'] : nil
  reviewer = doc.is_a?(Hash) ? (doc['reviewer'] || 'unknown') : 'unknown'
  incoming = doc.is_a?(Hash) ? (doc['findings'] || []) : Array(doc)
  provenance = pr ? "Promoted from PR ##{pr} review (#{reviewer}) on #{run_date}." \
                  : "Promoted from #{reviewer} review on #{run_date}."

  incoming.each do |raw|
    rule_key = raw['ruleKey'].to_s
    title = raw['title'].to_s
    if rule_key.empty?
      summary['skipped'] << { 'reviewer' => reviewer, 'reason' => 'missing ruleKey', 'title' => title }
      next
    end

    sev = SEVERITY_ENUM.include?(raw['severity'].to_s.downcase) ? raw['severity'].to_s.downcase : 'medium'
    # Conservative gate: only Critical/High are promoted. Everything else is reported, not added.
    unless PROMOTABLE_SEVERITIES.include?(sev)
      summary['skipped'] << { 'reviewer' => reviewer, 'ruleKey' => rule_key, 'severity' => sev,
                              'reason' => "severity #{sev} below promotion threshold (critical/high only)" }
      next
    end

    # PII/secret refusal: a finding whose text carries an identifier or secret is never added.
    hits = sensitive_hits(raw)
    unless hits.empty?
      summary['skipped'] << { 'reviewer' => reviewer, 'ruleKey' => rule_key, 'severity' => sev,
                              'reason' => "refused: contains #{hits.join(', ')} (register is code/path evidence only)" }
      next
    end

    ev = raw['evidence'] || {}
    file = ev['file'].to_s
    type = ev['type'] || (file.empty? ? 'runtime' : 'code')
    snippet = ev['snippet'].to_s
    sha = ev['sha'].to_s

    # Code/path evidence only: PR findings are about diffed code, so they must carry a verifiable
    # file:line snippet. A finding with no checkable anchor cannot be citation-validated and is
    # refused (kept out of the SSOT) rather than added with weak evidence.
    checkable = !file.empty? && CHECKABLE_TYPES.include?(type)
    unless checkable
      summary['skipped'] << { 'reviewer' => reviewer, 'ruleKey' => rule_key, 'severity' => sev,
                              'reason' => 'no code/path evidence (need evidence.type code|doc with file + snippet)' }
      next
    end
    if snippet.empty?
      summary['skipped'] << { 'reviewer' => reviewer, 'ruleKey' => rule_key, 'severity' => sev,
                              'reason' => 'missing evidence.snippet' }
      next
    end
    if sha.empty?
      summary['skipped'] << { 'reviewer' => reviewer, 'ruleKey' => rule_key, 'severity' => sev,
                              'reason' => 'missing evidence.sha (snippet must anchor to a commit)' }
      next
    end
    unless snippet_present?(file, snippet, sha)
      summary['skipped'] << { 'reviewer' => reviewer, 'ruleKey' => rule_key, 'severity' => sev,
                              'reason' => "snippet not found at #{file}@#{sha}; not added (would redden citation-check)" }
      next
    end

    conf = %w[high medium low].include?(raw['confidence'].to_s.downcase) ? raw['confidence'].to_s.downcase : 'medium'
    frameworks = Array(raw['frameworks']).select { |x| FRAMEWORK_ENUM.include?(x) }
    # id anchor identical to audit-merge.rb / citation-check.rb: evidence file, or ruleKey if none.
    # (file is guaranteed non-empty by the checkable gate above; kept explicit for textual parity.)
    id = finding_id(rule_key, file.empty? ? rule_key : file)

    if (existing = by_id[id])
      existing['lastSeen'] = run_date
      if SCOT_OWNED_CLOSED.include?(existing['status'])
        # Regression: a previously closed/accepted/superseded finding re-surfaced in a PR review.
        # Do NOT flip the Scot-owned status; flag it loudly for adversary verification + Scot.
        existing['regression'] = true
        note = "REGRESSION: re-surfaced by #{reviewer} on PR ##{pr} (#{run_date}) at #{sha} (status was #{existing['status']}). Needs adversary verification + Scot decision to reopen."
        existing['notes'] = [existing['notes'], note].compact.reject(&:empty?).join(' | ')
        summary['regressions'] << { 'id' => id, 'ruleKey' => rule_key, 'status' => existing['status'],
                                    'severity' => existing['severity'], 'reviewer' => reviewer, 'pr' => pr }
      else
        # Active finding already tracked. Record that a PR reviewer re-found it (lastSeen + note),
        # but do NOT re-anchor evidence to the PR sha: a PR-branch sha can be unreachable when
        # citation-check later runs in CI (branch rebased/deleted), which would redden a finding
        # that was green before. The existing evidence already anchors to a durable validated sha;
        # leave it. (snippet_present? above already confirmed the issue is still live in the PR.)
        existing['notes'] = [existing['notes'], "Re-found by #{reviewer} on PR ##{pr} (#{run_date})."].compact.reject(&:empty?).join(' | ')
        summary['reseen'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => existing['severity'], 'reviewer' => reviewer, 'pr' => pr }
      end
      next
    end

    record = {
      'id' => id, 'ruleKey' => rule_key, 'title' => title,
      'severity' => sev, 'confidence' => conf,
      'frameworks' => frameworks, 'status' => ASSIGNABLE_STATUS,
      'evidence' => { 'type' => type, 'file' => file, 'line' => ev['line'], 'snippet' => snippet, 'sha' => sha },
      'firstSeen' => run_date, 'lastSeen' => run_date, 'owner' => opts[:owner],
      'remediation' => (raw['remediation'] || { 'options' => '', 'timeframe' => '' }),
      'closureEvidence' => { 'sha' => '', 'verifierNote' => '', 'attestation' => '' },
      'disposition' => { 'state' => ASSIGNABLE_DISPOSITION, 'decidedBy' => '', 'decidedDate' => '', 'rationale' => '' },
      'source' => { 'kind' => source, 'pr' => pr, 'reviewer' => reviewer, 'promotedDate' => run_date },
      'notes' => "#{provenance} #{raw['notes']}".strip
    }
    findings << record
    by_id[id] = record
    summary['new'] << { 'id' => id, 'ruleKey' => rule_key, 'severity' => sev, 'reviewer' => reviewer, 'pr' => pr, 'file' => file }
  end
end

# Invariant: this script must never have produced a Scot-owned status or a non-untriaged
# disposition on a finding it just created this run. Scope by source.promotedDate == run_date so
# the check covers everything THIS script created this run (source-value-agnostic) and never
# touches a pre-existing finding that happens to share today's firstSeen.
findings.each do |f|
  next unless f.dig('source', 'promotedDate') == run_date
  if SCOT_OWNED_CLOSED.include?(f['status'])
    die("invariant violation: assigned a Scot-owned status to #{f['id']}")
  end
  disp = f.dig('disposition', 'state')
  if disp && disp != ASSIGNABLE_DISPOSITION
    die("invariant violation: assigned disposition #{disp.inspect} to #{f['id']} (only Scot triages)")
  end
end

# Promotion does NOT change the register's audited pointer: these findings were verified against
# the PR's own sha (carried per-finding in evidence.sha), not the last /audit-run SHA. Leaving
# meta.auditedSha untouched keeps the "/audit-run audited the whole tree at this SHA" meaning
# honest; citation-check validates each finding against its own evidence.sha regardless.
register['meta'] = meta
register['findings'] = findings

File.write(opts[:out], JSON.pretty_generate(register) + "\n")
File.write(opts[:summary], JSON.pretty_generate(summary) + "\n") if opts[:summary]

puts "promote-finding: ok  new=#{summary['new'].size} reseen=#{summary['reseen'].size} " \
     "regressions=#{summary['regressions'].size} skipped=#{summary['skipped'].size}  -> #{opts[:out]}"
