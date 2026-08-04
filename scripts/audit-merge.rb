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
#     re-anchors evidence to the verification SHA (so citation-check stays green), keeps the
#     Scot-owned fields (status, severity, owner, firstSeen, closureEvidence).
#   * For a known id that was previously closed/accepted/superseded but a finder re-surfaced:
#     leaves the Scot-owned status UNTOUCHED, sets regression:true with a loud note, and lists
#     it in the summary so the adversary verifies and Scot decides whether to reopen.
#   * Leaves register findings NOT seen this run completely unchanged (different scan scope).
#
# Pure git-free stdlib (json, digest, date). No network, no app boot. Safe in CI.
#
# THE TWO MEANINGS OF --sha (and why --no-restamp exists)
#   --sha carries two jobs that coincide during a real /audit-run but are unrelated outside one:
#     (1) the VERIFICATION sha -- the commit each incoming snippet is proven to exist at, written
#         into every touched finding's evidence.sha; and
#     (2) the AUDIT POINTER -- meta.auditedSha/auditedRef/auditedDate, whose meaning is the much
#         stronger claim "/audit-run audited the WHOLE tree at this SHA". Restamping it is a
#         governance act requiring Scot's sign-off plus an analysis of the intervening commits
#         (see meta.auditedShaPriorNote in the register).
#   Adding a finding OUTSIDE an /audit-run (a single hand-filed finding, a targeted re-anchor)
#   used to force a choice between two wrong answers: pass the true commit and falsely assert the
#   whole tree was re-audited, or pass the register's existing auditedSha to dodge the restamp and
#   silently anchor the new evidence to a commit it was never verified against. The second is the
#   dangerous one -- when the snippet happens to sit on the same line in both commits it passes
#   citation-check GREEN with a wrong anchor.
#   --no-restamp separates them: evidence anchors at the true --sha, meta is left byte-identical.
#   This mirrors scripts/promote-finding.rb, which never touches the audit pointer for exactly the
#   same reason (see its closing comment).
#
# Usage:
#   ruby scripts/audit-merge.rb --register audit-reports/FINDINGS.json \
#     --sha <verificationSha> [--ref <ref>] [--date YYYY-MM-DD] [--no-restamp] \
#     --in finder1.json [--in finder2.json ...] \
#     --out audit-reports/FINDINGS.json [--summary OUT.json]
#
#   /audit-run (whole-tree scan)    : --sha <auditedSha> --ref <auditedRef>   (restamps meta)
#   single finding outside a run    : --sha <trueCommit> --no-restamp         (meta untouched)
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
# Dispositions only Scot sets (schema 1.1, every value except untriaged). Disposition is a SEPARATE
# Scot-owned axis from status: a finding can be status "open" yet disposition "dismissed-false-positive"
# or "wontfix". A finder re-finding such a finding is re-raising something Scot already decided, so it
# must be flagged like a regression, not silently re-anchored as a routine reseen. (Mirrors
# scripts/promote-finding.rb; kept in lockstep by hand.)
SCOT_OWNED_DISPOSITIONS = %w[accepted fixed dismissed-false-positive wontfix].freeze
# The only status this script is ever allowed to assign.
ASSIGNABLE_STATUS = 'open'

# --- PII / secret detection (mirrors scripts/promote-finding.rb + lib/pii_scrubber.rb) -----------
# The register is code/path evidence only (PII-free, Tier 2 content). A finder finding
# whose text carries an identifier or a secret is REFUSED, not redacted: such evidence has no business
# in the SSOT. Finders are read-only and code-scoped by contract, so this is defense-in-depth -- but
# the register is git-tracked, so a single mis-shaped finder snippet must never be able to commit a
# student email or a credential. Patterns are kept in lockstep with promote-finding.rb by hand.
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
  # Assignment form: `password = "..."`, `token: ...`, `api_key=...`.
  bearer_secret: /\b(?:bearer|token|secret|password|passwd|api[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9\/+_=\-]{12,}/i,
  # HTTP Authorization header form: `Authorization: Bearer <token>` (space-separated, no [:=]).
  http_bearer: %r{\bBearer\s+[A-Za-z0-9._~+/\-]{20,}=*},
  # Google OAuth 2.0 access token.
  google_oauth_token: /\bya29\.[0-9A-Za-z_-]{20,}/
}.freeze

opts = { ins: [], ref: nil, date: nil, summary: nil, no_restamp: false }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/audit-merge.rb --register F --sha S --in finder.json [...] --out F [--summary S] [--no-restamp]'
  o.on('--register FILE') { |v| opts[:register] = v }
  o.on('--sha SHA', 'Verification sha: the commit incoming snippets are proven at (-> evidence.sha)') { |v| opts[:sha] = v }
  o.on('--ref REF')       { |v| opts[:ref] = v }
  o.on('--date DATE')     { |v| opts[:date] = v }
  o.on('--in FILE')       { |v| opts[:ins] << v }
  o.on('--out FILE')      { |v| opts[:out] = v }
  o.on('--summary FILE')  { |v| opts[:summary] = v }
  o.on('--no-restamp', 'Anchor evidence at --sha but leave meta.auditedSha/Ref/Date untouched ' \
                       '(use for any addition that is NOT a whole-tree /audit-run)') { opts[:no_restamp] = true }
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
# --ref writes ONLY meta.auditedRef, which --no-restamp suppresses. Passing both means the caller
# misunderstood one of the two flags, so fail closed rather than silently discarding --ref.
die('--ref is meaningless with --no-restamp (--ref only writes meta.auditedRef, which --no-restamp leaves untouched)') if opts[:no_restamp] && opts[:ref]

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

# True if `snippet` (whitespace-normalized) appears on a single line of `file` at `sha`. Mirrors the
# per-LINE matching scripts/citation-check.rb uses, so a finding this script accepts is one
# citation-check will pass. Used to refuse evidence that would redden the register on the next
# /audit-run.
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
  # Per-LINE, identical to scripts/citation-check.rb and scripts/promote-finding.rb: a multi-line
  # snippet matches no single source line, so reject it here instead of accepting it via a
  # whole-file include() that citation-check would then FAIL (reddening the register).
  content.each_line.any? { |line| norm.call(line).include?(needle) }
end

# Every string (keys AND values) anywhere in a finding, walked recursively. A named-field allowlist is
# unsafe: the WHOLE finding is copied into the register (remediation et al. pass through verbatim), so
# PII hiding in a nested object or an arbitrary key would slip past a field-by-field scan. Mirrors
# scripts/promote-finding.rb#deep_strings.
def deep_strings(node, acc = [])
  case node
  when String then acc << node
  when Hash   then node.each { |k, v| acc << k.to_s; deep_strings(v, acc) }
  when Array  then node.each { |v| deep_strings(v, acc) }
  end
  acc
end

# Scan a finding's ENTIRE text (every nested string) for PII/secret shapes. Returns the matched
# categories (empty == clean). Refuses on ANY hit -- the register is code/path evidence only and must
# never carry an identifier or a secret, no matter which field it rode in on.
def sensitive_hits(raw)
  blob = deep_strings(raw).join("\n")
  hits = []
  SECRET_PATTERNS.each { |name, re| hits << "secret:#{name}" if blob.match?(re) }
  PII_PATTERNS.each { |name, re| hits << "pii:#{name}" if blob.match?(re) }
  hits
end

CHECKABLE_TYPES = %w[code doc].freeze

# auditedSha/auditedDate name the VERIFICATION commit for this run (kept under these keys so
# existing summary readers do not break). restampedMeta records whether that commit was also
# written into the register's audit pointer, so the summary never implies a whole-tree re-audit
# that did not happen.
summary = { 'auditedSha' => run_sha, 'auditedDate' => run_date,
            'restampedMeta' => !opts[:no_restamp],
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
    # PII/secret refusal: a finder finding whose text (any nested field) carries an identifier or a
    # secret is never added and never re-anchored. Refused, not redacted -- the register is code/path
    # evidence only. Skipping the whole incoming record also prevents a PII snippet from being written
    # into an existing finding's evidence on the reseen path below.
    hits = sensitive_hits(raw)
    unless hits.empty?
      summary['skipped'] << { 'domain' => domain, 'ruleKey' => rule_key,
                              'reason' => "refused: contains #{hits.join(', ')} (register is code/path evidence only)" }
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

      existing_disp = existing.dig('disposition', 'state')
      scot_owned_status = SCOT_OWNED_CLOSED.include?(existing['status'])
      scot_owned_disp = SCOT_OWNED_DISPOSITIONS.include?(existing_disp)
      if scot_owned_status || scot_owned_disp
        # Regression: a finding Scot already decided on re-surfaced. Fires on EITHER axis -- a
        # Scot-owned closed/accepted/superseded status, OR a Scot-set disposition (accepted / fixed /
        # dismissed-false-positive / wontfix) even while status is still "open". Do NOT flip the status,
        # do NOT touch the disposition or the (still-valid) evidence; flag it loudly.
        existing['regression'] = true
        reason = scot_owned_status ? "status was #{existing['status']}" : "disposition was #{existing_disp}"
        note = "REGRESSION: re-surfaced by #{domain} finder on #{run_date} at #{run_sha} (#{reason}). Needs adversary verification + Scot decision."
        existing['notes'] = [existing['notes'], note].compact.reject(&:empty?).join(' | ')
        summary['regressions'] << { 'id' => id, 'ruleKey' => rule_key, 'status' => existing['status'],
                                    'disposition' => existing_disp,
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

# Update the register's audit pointer; leave everything else in meta untouched. Under
# --no-restamp meta is left byte-identical: the pointer asserts "/audit-run audited the WHOLE tree
# at this SHA", which a targeted addition has not earned. Per-finding evidence.sha still anchors at
# run_sha either way, and citation-check validates each finding against its own evidence.sha, so
# skipping the restamp costs nothing in verifiability.
if opts[:no_restamp]
  warn "audit-merge: --no-restamp: evidence anchored at #{run_sha}; meta.auditedSha left at " \
       "#{meta['auditedSha'].inspect} (restamping is a governance act requiring Scot's sign-off)"
else
  meta['auditedSha'] = run_sha
  meta['auditedRef'] = opts[:ref] if opts[:ref]
  meta['auditedDate'] = run_date
end
register['meta'] = meta
register['findings'] = findings

File.write(opts[:out], JSON.pretty_generate(register) + "\n")
File.write(opts[:summary], JSON.pretty_generate(summary) + "\n") if opts[:summary]

puts "audit-merge: ok  new=#{summary['new'].size} reseen=#{summary['reseen'].size} " \
     "regressions=#{summary['regressions'].size} sevChangeCandidates=#{summary['severityChangeCandidates'].size} " \
     "skipped=#{summary['skipped'].size} restampedMeta=#{summary['restampedMeta']}  -> #{opts[:out]}"
