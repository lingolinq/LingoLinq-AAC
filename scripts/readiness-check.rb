#!/usr/bin/env ruby
# frozen_string_literal: true
#
# readiness-check.rb - validator + generator for the Compliance & Launch
# Readiness dashboard strategy layer (audit-reports/strategy/).
#
# The strategy layer is a READINESS/PROGRESS overlay on top of the canonical
# findings register. audit-reports/FINDINGS.json remains authoritative for
# finding lifecycle (id, status, severity, disposition, evidence, closure);
# this script reads it and NEVER writes it. The strategy layer independently
# describes milestone applicability, launch-profile decisions, requirement
# readiness, work/PR provenance, and source freshness.
#
# WHAT IT VALIDATES (hard failures, exit 1)
#   - every strategy JSON parses and carries meta.schemaVersion
#   - no duplicate requirement/work/identity IDs; no snapshot identity collision
#   - enums: requirement type/humanStatus/verification/area, work kind/
#     workstream/inclusionReason, launch-profile decision values
#   - derived-only statuses (done, done-awaiting-verification,
#     done-awaiting-reconciliation, decision-needed) are REJECTED if stored as
#     humanStatus; invariants must not store any completion status
#   - accountableOwner / contributors resolve to kind=human identities;
#     implementationTools / reviewTools resolve to kind=ai-tool identities.
#     An AI tool or unknown identity as accountableOwner is a hard failure.
#     The identity list is extensible DATA (WORK-LEDGER meta.identities):
#     adding a person is a JSON edit, never a script change.
#   - no dangling refs: requirement->finding, work->finding, work->requirement,
#     appliesWhen.decisions->launch-profile keys, snapshot openFindingIds
#   - FINDINGS.json sanity: unique finding ids; every status/severity in enum
#   - snapshots: generatedAt strictly increasing and unique; each record's
#     stored findingFlowSincePrior must equal the flow recomputed from the
#     adjacent openFindingIds sets; openFindingSeverities must agree with
#     openFindingIds and the stored openBySeverity counts; each record after
#     the first pins its predecessor's exact bytes via priorSnapshotSha
#     (an INTERNAL CONSISTENCY control - it makes a quiet one-record edit
#     detectable, but a determined editor who rewrites every subsequent
#     record's flow and chain sha in step can still produce a file that is
#     internally self-consistent). The actual append-only ENFORCEMENT
#     boundary is separate: in --check, every snapshot already present on the
#     PR's base branch must appear as a byte-identical, same-order prefix of
#     the current file (verify_base_append_only!). That comparison is what
#     makes a full coordinated history rewrite fail CI, not the hash chain.
#     Base-history comparison requires a resolvable base ref/sha
#     (READINESS_BASE_REF or READINESS_BASE_SHA env, wired by CI from the
#     PR's base sha) or an explicit READINESS_BASE_SNAPSHOTS_FILE; outside
#     --check (local dev, no base ref available) this degrades to a WARNING,
#     never a silent pass presented as protection.
#   - in --check: the committed dashboard render must match byte-for-byte
#
# UNMAPPED CRITICAL/HIGH FINDINGS
#   Open findings with no requirement link are informational (a Medium/Low
#   audit item was never meant to become a milestone requirement on its own -
#   blocking status belongs to a linked, ratified requirement, never to
#   severity alone). An open Critical/High with no link is different: it is
#   rendered in its own "governance exception" section, ahead of every other
#   content block including the finding baseline table and the milestone
#   cards, plus a header stat, so it cannot be missed by reading only the top
#   of the document or a single milestone card. It stays listed there,
#   canonical-register truth intact (open, reconciliation owed, independent of
#   any engineering work already merged against it), until a human links it to
#   an applicable requirement or Scot explicitly assesses it as not
#   launch-relevant - this layer never makes that call itself.
#
# WARNINGS (printed, exit stays 0)
#   - claimed-done deliverable with a linked finding still open (renders as
#     done-awaiting-reconciliation; deliberately NOT a CI failure)
#   - near-duplicate cluster slugs (never auto-merged)
#   - undecided launch-profile decision gating requirement applicability
#   - inclusionReason advances-readiness-requirement with no requirement link
#
# DETERMINISM
#   The render is a pure function of the five committed JSONs. It never reads
#   the wall clock (see the bug class documented in
#   scripts/compliance-calendar-render.rb): all dates come from stored
#   meta.generatedDate fields and snapshot records, and freshness ages are
#   computed relative to the latest snapshot date (or the launch-profile
#   generatedDate when no snapshot exists). --snapshot is the ONLY mode that
#   reads the clock, and it only stamps the record it appends.
#
# MODES
#   ruby scripts/readiness-check.rb              # validate, then WRITE the dashboard render
#   ruby scripts/readiness-check.rb --check      # validate + assert render matches; write nothing (CI)
#   ruby scripts/readiness-check.rb --render     # write the render only (no drift assertion)
#   ruby scripts/readiness-check.rb --snapshot   # append one snapshot from live FINDINGS, then re-render
#
# EXIT 0 = valid (and, in --check, render in sync); 1 = any hard failure.
#
require 'json'
require 'optparse'
require 'digest'
require 'set'
require 'date'
require 'time'
require 'open3'

# Env overrides exist for the test harness only (scripts/tests/readiness-check-test.sh
# works on a COPY of the live strategy dir); CI and normal use leave them unset.
STRATEGY_DIR    = ENV['READINESS_STRATEGY_DIR'] || 'audit-reports/strategy'
FINDINGS_JSON   = ENV['READINESS_FINDINGS_JSON'] || 'audit-reports/FINDINGS.json'
MILESTONES_JSON = File.join(STRATEGY_DIR, 'READINESS-MILESTONES.json')
PROFILE_JSON    = File.join(STRATEGY_DIR, 'LAUNCH-PROFILE.json')
LEDGER_JSON     = File.join(STRATEGY_DIR, 'WORK-LEDGER.json')
SNAPSHOTS_JSON  = File.join(STRATEGY_DIR, 'SNAPSHOTS.json')
RENDER_MD       = File.join(STRATEGY_DIR, 'READINESS-DASHBOARD.md')

FINDING_STATUS_ENUM = %w[open remediated-unverified verified-closed accepted-risk superseded].freeze
SEVERITY_ENUM       = %w[critical high medium low].freeze
DERIVED_ONLY        = %w[done done-awaiting-verification done-awaiting-reconciliation decision-needed].freeze

mode = :validate_and_write
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/readiness-check.rb [--check | --render | --snapshot]'
  o.on('--check', 'Validate + assert the dashboard render matches; write nothing') { mode = :check }
  o.on('--render', 'Write the dashboard render only') { mode = :render_only }
  o.on('--snapshot', 'Append one snapshot from live FINDINGS.json, then re-render') { mode = :snapshot }
end.parse!

def load_json(path)
  abort "readiness-check: file not found: #{path}" unless File.file?(path)
  JSON.parse(File.read(path))
rescue JSON::ParserError => e
  abort "readiness-check: #{path} is not valid JSON: #{e.message}"
end

findings_doc = load_json(FINDINGS_JSON)
milestones   = load_json(MILESTONES_JSON)
profile      = load_json(PROFILE_JSON)
ledger       = load_json(LEDGER_JSON)
snapshots_doc = load_json(SNAPSHOTS_JSON)

failures = []
warnings = []

# --- FINDINGS.json sanity (read-only; canonical lifecycle stays untouched) ----
findings = findings_doc['findings'] || []
findings_by_id = {}
findings.each do |f|
  failures << "[findings] duplicate finding id: #{f['id']} (lookup would silently collapse; refuse to proceed)" if findings_by_id.key?(f['id'])
  findings_by_id[f['id']] = f
  unless FINDING_STATUS_ENUM.include?(f['status'])
    failures << "[findings] #{f['id']}: status #{f['status'].inspect} not in #{FINDING_STATUS_ENUM.join('/')}"
  end
  unless SEVERITY_ENUM.include?(f['severity'])
    failures << "[findings] #{f['id']}: severity #{f['severity'].inspect} not in #{SEVERITY_ENUM.join('/')}"
  end
end
status_counts = Hash.new(0)
findings.each { |f| status_counts[f['status']] += 1 }
open_findings = findings.select { |f| f['status'] == 'open' }
open_by_sev = Hash.new(0)
open_findings.each { |f| open_by_sev[f['severity']] += 1 }
metrics = {
  'total' => findings.size,
  'open' => open_findings.size,
  'openBySeverity' => SEVERITY_ENUM.to_h { |s| [s, open_by_sev[s]] },
  'remediatedUnverified' => status_counts['remediated-unverified'],
  'acceptedRisk' => status_counts['accepted-risk'],
  'superseded' => status_counts['superseded'],
  'verifiedClosed' => status_counts['verified-closed'],
  'verifiedClosedCritical' => findings.count { |f| f['status'] == 'verified-closed' && f['severity'] == 'critical' }
}

# --- strategy meta basics -----------------------------------------------------
{ MILESTONES_JSON => milestones, PROFILE_JSON => profile,
  LEDGER_JSON => ledger, SNAPSHOTS_JSON => snapshots_doc }.each do |path, doc|
  meta = doc['meta'] || {}
  failures << "[#{path}] meta.schemaVersion missing" unless meta['schemaVersion']
end

# --- LAUNCH-PROFILE validation ------------------------------------------------
decisions = profile['decisions'] || {}
failures << "[#{PROFILE_JSON}] profile name missing" unless profile['profile']
decisions.each do |key, val|
  unless [true, false, 'undecided'].include?(val)
    failures << "[#{PROFILE_JSON}] decision #{key}: value #{val.inspect} must be true, false, or \"undecided\""
  end
end
pmeta = profile['meta'] || {}
begin
  Date.iso8601(pmeta['generatedDate'].to_s)
rescue ArgumentError, TypeError
  failures << "[#{PROFILE_JSON}] meta.generatedDate #{pmeta['generatedDate'].inspect} is not an ISO date"
end
(pmeta['sources'] || []).each do |src|
  lod = src['lastObservedDate']
  next if lod.nil?
  begin
    Date.iso8601(lod.to_s)
  rescue ArgumentError, TypeError
    failures << "[#{PROFILE_JSON}] source #{src['id']}: lastObservedDate #{lod.inspect} is not an ISO date (Date.parse fallbacks would borrow the system clock)"
  end
end

# --- appliesWhen condition trees ----------------------------------------------
# A condition is a tri-state boolean tree over launch-profile decisions: a leaf
# is a decision key string; interior nodes are {'allOf' => [...]} or
# {'anyOf' => [...]}. Kleene evaluation keeps undecided propagation
# conservative: an unresolved operand yields :undecided unless the operator is
# already decided without it (anyOf with a true operand; allOf with a false one).

def validate_condition(node, decisions, path)
  errs = []
  case node
  when String
    errs << "#{path}: unknown launch-profile key: #{node}" unless decisions.key?(node)
  when Hash
    ops = node.keys & %w[allOf anyOf]
    if ops.size != 1 || node.keys.size != 1
      errs << "#{path}: condition node must have exactly one key, allOf or anyOf"
    elsif !node[ops.first].is_a?(Array) || node[ops.first].empty?
      errs << "#{path}: #{ops.first} must be a non-empty array"
    else
      node[ops.first].each_with_index do |child, i|
        errs.concat(validate_condition(child, decisions, "#{path}.#{ops.first}[#{i}]"))
      end
    end
  else
    errs << "#{path}: condition must be a decision-key string or an allOf/anyOf node"
  end
  errs
end

# Total function: malformed or unknown nodes evaluate :undecided (conservative -
# a broken condition must surface as decision-needed, never silently hide a
# requirement). validate_condition still hard-fails such nodes; this is the
# fail-safe direction if one ever reaches evaluation anyway.
def eval_condition(node, decisions)
  case node
  when String
    v = decisions[node]
    v == true ? :true : (v == false ? :false : :undecided)
  when Hash
    if (list = node['allOf']).is_a?(Array) && !list.empty?
      vals = list.map { |n| eval_condition(n, decisions) }
      return :false if vals.include?(:false)
      vals.all?(:true) ? :true : :undecided
    elsif (list = node['anyOf']).is_a?(Array) && !list.empty?
      vals = list.map { |n| eval_condition(n, decisions) }
      return :true if vals.include?(:true)
      vals.all?(:false) ? :false : :undecided
    else
      :undecided
    end
  else
    :undecided
  end
end

def condition_keys(node)
  case node
  when String then [node]
  when Hash then (node['allOf'] || node['anyOf'] || []).flat_map { |n| condition_keys(n) }.uniq
  else []
  end
end

# --- READINESS-MILESTONES validation ------------------------------------------
mmeta = milestones['meta'] || {}
requirements = milestones['requirements'] || []
milestone_ids = (mmeta['milestones'] || []).map { |m| m['id'] }
type_enum = mmeta['typeEnum'] || []
human_enum = mmeta['humanStatusEnum'] || []
verif_enum = mmeta['verificationEnum'] || []
area_enum = mmeta['areaEnum'] || []
card_status_enum = mmeta['readinessCardStatusEnum'] || []

req_ids = Set.new
requirements.each do |r|
  rid = r['id'] || '(no id)'
  failures << "[requirements] duplicate id: #{rid}" unless req_ids.add?(rid)
  failures << "[#{rid}] unknown milestone: #{r['milestone'].inspect}" unless milestone_ids.include?(r['milestone'])
  failures << "[#{rid}] type #{r['type'].inspect} not in #{type_enum.join('/')}" unless type_enum.include?(r['type'])
  failures << "[#{rid}] area #{r['area'].inspect} not in areaEnum" unless area_enum.include?(r['area'])
  failures << "[#{rid}] verificationRequired #{r['verificationRequired'].inspect} not in #{verif_enum.join('/')}" unless verif_enum.include?(r['verificationRequired'])
  failures << "[#{rid}] blocking must be boolean" unless [true, false].include?(r['blocking'])
  hs = r['humanStatus']
  if r['type'] == 'invariant'
    failures << "[#{rid}] invariant must not store humanStatus (found #{hs.inspect}); invariants are computed each generation" if hs
  else
    if DERIVED_ONLY.include?(hs)
      failures << "[#{rid}] humanStatus #{hs.inspect} is derived-only and must never be stored"
    elsif !human_enum.include?(hs)
      failures << "[#{rid}] humanStatus #{hs.inspect} not in #{human_enum.join('/')}"
    end
  end
  (r['findingIds'] || []).each do |fid|
    failures << "[#{rid}] dangling finding ref: #{fid}" unless findings_by_id.key?(fid)
  end
  aw = r['appliesWhen'] || {}
  if aw.key?('decisions')
    failures << "[#{rid}] appliesWhen.decisions is the retired flat any-of form; encode appliesWhen.condition (allOf/anyOf tree)"
  end
  if aw.key?('condition')
    failures.concat(validate_condition(aw['condition'], decisions, "[#{rid}] appliesWhen.condition"))
  end
  # Per-row ratification: absent = proposed. Present means Scot ratified this
  # row; it must say so completely (who + parseable date), and no other status
  # value is legal - a script never marks a row anything else.
  if (rat = r['ratification'])
    if rat['status'] != 'ratified'
      failures << "[#{rid}] ratification.status must be \"ratified\" when the object is present (absent = proposed)"
    else
      failures << "[#{rid}] ratification requires ratifiedBy" if rat['ratifiedBy'].to_s.strip.empty?
      begin
        Date.iso8601(rat['ratifiedDate'].to_s)
      rescue ArgumentError, TypeError
        failures << "[#{rid}] ratification.ratifiedDate #{rat['ratifiedDate'].inspect} is not an ISO date"
      end
    end
  end
end
declared = mmeta['directRequirementCount']
if declared && declared != requirements.size
  failures << "[requirements] meta.directRequirementCount=#{declared} but #{requirements.size} requirements are encoded"
end
# Matrix-level ratification is only as true as the rows underneath it: "ratified"
# is legal ONLY when every row carries a complete ratification object, and must
# itself say who and when. Anything else lets a one-line meta edit suppress the
# PROPOSED banner and present 30 proposals as canonical strategy.
mrat = mmeta['ratification'] || {}
unless %w[proposed ratified].include?(mrat['status'])
  failures << "[meta.ratification] status #{mrat['status'].inspect} must be proposed or ratified"
end
if mrat['status'] == 'ratified'
  unratified = requirements.reject { |r| (r['ratification'] || {})['status'] == 'ratified' }.map { |r| r['id'] }
  if unratified.any?
    failures << "[meta.ratification] status is ratified but #{unratified.size} row(s) carry no ratification: #{unratified.first(5).join(', ')}#{unratified.size > 5 ? ', ...' : ''}"
  end
  failures << '[meta.ratification] ratified requires ratifiedBy' if mrat['ratifiedBy'].to_s.strip.empty?
  begin
    Date.iso8601(mrat['ratifiedDate'].to_s)
  rescue ArgumentError, TypeError
    failures << "[meta.ratification] ratifiedDate #{mrat['ratifiedDate'].inspect} is not an ISO date"
  end
end
cards = milestones['readinessCards'] || []
cards.each do |c|
  unless card_status_enum.include?(c['status'])
    failures << "[readinessCards] #{c['id']}: status #{c['status'].inspect} not in readinessCardStatusEnum"
  end
end

# --- WORK-LEDGER validation ---------------------------------------------------
lmeta = ledger['meta'] || {}
work = ledger['work'] || []
identities = lmeta['identities'] || []
id_kinds = {}
identities.each do |ident|
  key = ident['id']
  failures << "[identities] duplicate identity id: #{key}" if id_kinds.key?(key)
  unless %w[human ai-tool].include?(ident['kind'])
    failures << "[identities] #{key}: kind #{ident['kind'].inspect} must be human or ai-tool"
  end
  id_kinds[key] = ident['kind']
end
kind_enum = lmeta['kindEnum'] || []
workstream_enum = lmeta['workstreamEnum'] || []
inclusion_enum = lmeta['inclusionReasonEnum'] || []
lverif_enum = lmeta['verificationEnum'] || []

work_ids = Set.new
work.each do |w|
  wid = w['id'] || '(no id)'
  failures << "[work] duplicate id: #{wid}" unless work_ids.add?(wid)
  failures << "[#{wid}] kind #{w['kind'].inspect} not in kindEnum" unless kind_enum.include?(w['kind'])
  failures << "[#{wid}] workstream #{w['workstream'].inspect} not in workstreamEnum" unless workstream_enum.include?(w['workstream'])
  if w['inclusionReason'] && !inclusion_enum.include?(w['inclusionReason'])
    failures << "[#{wid}] inclusionReason #{w['inclusionReason'].inspect} not in inclusionReasonEnum"
  end
  if w['verification'] && !lverif_enum.include?(w['verification'])
    failures << "[#{wid}] verification #{w['verification'].inspect} not in verificationEnum"
  end
  owner = w['accountableOwner']
  case id_kinds[owner]
  when 'human' then nil
  when 'ai-tool'
    failures << "[#{wid}] accountableOwner #{owner.inspect} is an AI tool; accountable owners must be human"
  else
    failures << "[#{wid}] accountableOwner #{owner.inspect} is not a declared identity (add a kind=human row to meta.identities)"
  end
  people = w['people'] || {}
  (people['contributors'] || []).each do |p|
    failures << "[#{wid}] contributor #{p.inspect} must resolve to a kind=human identity" unless id_kinds[p] == 'human'
  end
  %w[implementationTools reviewTools].each do |tool_key|
    (people[tool_key] || []).each do |t|
      failures << "[#{wid}] #{tool_key} entry #{t.inspect} must resolve to a kind=ai-tool identity" unless id_kinds[t] == 'ai-tool'
    end
  end
  begin
    Date.iso8601(w['date'].to_s)
  rescue ArgumentError, TypeError
    failures << "[#{wid}] date #{w['date'].inspect} is not an ISO date"
  end
  src = w['source'] || {}
  if src['type'] == 'github-pr'
    failures << "[#{wid}] github-pr source needs repository + number" unless src['repository'] && src['number'].is_a?(Integer)
  elsif src['type'].nil?
    failures << "[#{wid}] source.type missing"
  end
  (w['findings'] || []).each do |fid|
    failures << "[#{wid}] dangling finding ref: #{fid}" unless findings_by_id.key?(fid)
  end
  (w['requirements'] || []).each do |rid|
    failures << "[#{wid}] dangling requirement ref: #{rid}" unless req_ids.include?(rid)
  end
  if w['inclusionReason'] == 'advances-readiness-requirement' && (w['requirements'] || []).empty?
    warnings << "[#{wid}] inclusionReason is advances-readiness-requirement but no requirements are linked"
  end
  outcome_enum = lmeta['outcomeStateEnum'] || []
  if w['outcomeState'] && !outcome_enum.include?(w['outcomeState'])
    failures << "[#{wid}] outcomeState #{w['outcomeState'].inspect} not in outcomeStateEnum"
  end
  if w['outcomeState'] == 'superseded-evidence' && !w['correctedBy']
    failures << "[#{wid}] outcomeState superseded-evidence requires correctedBy referencing the corrective work record"
  end
end
work.each do |w|
  next unless w['correctedBy']
  wid = w['id'] || '(no id)'
  unless work_ids.include?(w['correctedBy'])
    failures << "[#{wid}] correctedBy #{w['correctedBy'].inspect} does not resolve to a work record"
  end
  failures << "[#{wid}] correctedBy must reference a different record" if w['correctedBy'] == w['id']
end

# near-duplicate cluster slugs (warn only, never merge)
def levenshtein(a, b)
  return b.length if a.empty?
  return a.length if b.empty?
  prev = (0..b.length).to_a
  a.each_char.with_index(1) do |ca, i|
    row = [i]
    b.each_char.with_index(1) do |cb, j|
      row << [prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (ca == cb ? 0 : 1)].min
    end
    prev = row
  end
  prev.last
end
clusters = work.map { |w| w['cluster'] }.compact.uniq.sort
clusters.combination(2) do |a, b|
  next if a == b
  if levenshtein(a, b) <= 2 || a.split('-').sort == b.split('-').sort
    warnings << "[clusters] near-duplicate cluster slugs: #{a.inspect} vs #{b.inspect} (review; never auto-merged)"
  end
end

# --- SNAPSHOTS validation -----------------------------------------------------
snapshots = snapshots_doc['snapshots'] || []

def recompute_flow(prior_snaps, snap)
  cur = (snap['openFindingIds'] || []).to_set
  prior = prior_snaps.last
  return { 'new' => [], 'movedOutOfOpen' => [], 'reopened' => [], 'severityChanged' => [] } if prior.nil?
  prior_open = (prior['openFindingIds'] || []).to_set
  ever_open = prior_snaps.flat_map { |s| s['openFindingIds'] || [] }.to_set
  newly_open = cur - prior_open
  reopened = newly_open.select { |id| ever_open.include?(id) }.sort
  new_ids = (newly_open - reopened).sort
  moved = (prior_open - cur).sort
  cur_sev = snap['openFindingSeverities'] || {}
  prior_sev = prior['openFindingSeverities'] || {}
  sev_changed = (cur & prior_open).select { |id| cur_sev[id] != prior_sev[id] }.sort
  { 'new' => new_ids, 'movedOutOfOpen' => moved, 'reopened' => reopened, 'severityChanged' => sev_changed }
end

seen_ts = Set.new
prev_time = nil
snapshots.each_with_index do |snap, i|
  label = "[snapshots ##{i}]"
  ts = snap['generatedAt']
  t = begin
    Time.iso8601(ts.to_s)
  rescue ArgumentError, TypeError
    failures << "#{label} generatedAt #{ts.inspect} is not an ISO 8601 timestamp"
    nil
  end
  failures << "#{label} duplicate snapshot identity: #{ts}" unless seen_ts.add?(ts)
  if t && prev_time && t <= prev_time
    failures << "#{label} generatedAt #{ts} does not advance past prior snapshot (append-only order violated)"
  end
  prev_time = t if t
  ids = snap['openFindingIds']
  unless ids.is_a?(Array) && ids.all? { |x| x.is_a?(String) }
    failures << "#{label} openFindingIds must be an array of finding IDs"
    next
  end
  failures << "#{label} openFindingIds contains duplicates" if ids.size != ids.uniq.size
  ids.each do |fid|
    failures << "#{label} openFindingIds references unknown finding: #{fid}" unless findings_by_id.key?(fid)
  end
  counts = snap['findings'] || {}
  if counts['open'] && counts['open'] != ids.size
    failures << "#{label} findings.open=#{counts['open']} disagrees with openFindingIds size #{ids.size}"
  end
  stored_flow = snap['findingFlowSincePrior'] || {}
  expected_flow = recompute_flow(snapshots[0...i], snap)
  if stored_flow != expected_flow
    failures << "#{label} findingFlowSincePrior disagrees with flow recomputed from adjacent openFindingIds sets (prior snapshots are immutable; regenerate via --snapshot only)"
  end
  sev_map = snap['openFindingSeverities']
  if sev_map.is_a?(Hash)
    if sev_map.keys.sort != ids.sort
      failures << "#{label} openFindingSeverities keys disagree with openFindingIds"
    end
    sev_map.each_value do |s|
      failures << "#{label} openFindingSeverities carries unknown severity #{s.inspect}" unless SEVERITY_ENUM.include?(s)
    end
    by_sev = snap.dig('findings', 'openBySeverity')
    if by_sev.is_a?(Hash)
      SEVERITY_ENUM.each do |s|
        counted = sev_map.values.count(s)
        if by_sev[s] && by_sev[s] != counted
          failures << "#{label} findings.openBySeverity.#{s}=#{by_sev[s]} disagrees with openFindingSeverities (#{counted})"
        end
      end
    end
  else
    failures << "#{label} openFindingSeverities must be a map of finding id -> severity"
  end
  # Hash chain: each record after the first pins the exact bytes of its
  # predecessor, so rewriting snapshot k breaks the sha stored in k+1 (and a
  # colluding rewrite must cascade through every later record - visible in
  # review as a diff touching the whole history, never a quiet one-record edit).
  if i.positive?
    expected_sha = Digest::SHA256.hexdigest(JSON.generate(snapshots[i - 1]))
    if snap['priorSnapshotSha'] != expected_sha
      failures << "#{label} priorSnapshotSha does not match the prior snapshot record (history rewrite, reorder, or missing chain field)"
    end
  end
end

# --- append-only ENFORCEMENT: compare against the PR base branch --------------
# priorSnapshotSha (above) is an internal-consistency control only: a rewrite
# that regenerates every subsequent record's flow and chain sha in lockstep
# stays internally valid. The actual boundary is this comparison - every
# snapshot already committed on the base branch must survive as a byte-
# identical, same-order prefix of the current file. Two ways to supply the
# base version (first present wins), so this is testable without real git
# plumbing:
#   READINESS_BASE_SNAPSHOTS_FILE - a local file path (tests; also usable in
#     CI if the base ref was checked out to a sibling path)
#   READINESS_BASE_REF / READINESS_BASE_SHA - a git ref or sha; read via
#     `git cat-file`/`git show <ref>:audit-reports/strategy/SNAPSHOTS.json`
# Returns [:ok], [:no_base] (nothing to compare against - legitimate, e.g. the
# file is new on this branch), or [:unresolvable, reason] (base could not be
# obtained at all - in --check this is a HARD FAILURE, never a silent skip).
def load_base_snapshots
  if (path = ENV['READINESS_BASE_SNAPSHOTS_FILE'])
    return [:no_base, nil] unless File.file?(path)
    return [:ok, (JSON.parse(File.read(path))['snapshots'] || [])]
  end
  ref = ENV['READINESS_BASE_SHA'] || ENV['READINESS_BASE_REF']
  return [:unresolvable, 'no base ref supplied (READINESS_BASE_REF/READINESS_BASE_SHA/READINESS_BASE_SNAPSHOTS_FILE all unset)'] unless ref

  path_in_ref = "#{ref}:#{SNAPSHOTS_JSON}"
  file_at_ref_ok = system('git', 'cat-file', '-e', path_in_ref, err: File::NULL, out: File::NULL)
  unless file_at_ref_ok
    # Distinguish "ref doesn't resolve at all" from "ref resolves but the file
    # doesn't exist there yet" - only the latter is a legitimate no-base case.
    ref_ok = system('git', 'cat-file', '-e', ref, err: File::NULL, out: File::NULL)
    return ref_ok ? [:no_base, nil] : [:unresolvable, "base ref #{ref.inspect} does not resolve locally (fetch it before running --check)"]
  end
  raw, status = Open3.capture2('git', 'show', path_in_ref)
  return [:unresolvable, "git show #{path_in_ref} failed"] unless status.success?

  [:ok, (JSON.parse(raw)['snapshots'] || [])]
rescue JSON::ParserError => e
  [:unresolvable, "base SNAPSHOTS.json did not parse: #{e.message}"]
end

def verify_base_append_only!(current_snapshots, failures, warnings, mode)
  outcome, payload = load_base_snapshots
  case outcome
  when :no_base
    return
  when :unresolvable
    if mode == :check
      failures << "[snapshots vs base] append-only enforcement could not run: #{payload}. Refusing to pass --check without it (base comparison, not the hash chain, is the append-only boundary)."
    else
      warnings << "[snapshots vs base] base-history comparison skipped (#{payload}); this is a LOCAL run with no enforcement, not append-only protection."
    end
    return
  when :ok
    base_snapshots = payload
  end
  base_snapshots.each_with_index do |base_snap, i|
    cur = current_snapshots[i]
    if cur.nil?
      failures << "[snapshots vs base] base snapshot ##{i} (#{base_snap['generatedAt']}) is missing from this branch - snapshots may only be appended, never removed"
    elsif cur != base_snap
      failures << "[snapshots vs base] base snapshot ##{i} (#{base_snap['generatedAt']}) does not match this branch's record at the same position - historical snapshots must stay byte-identical and in order"
    end
  end
end

# --- derived requirement status -----------------------------------------------
def applicability(req, decisions)
  cond = (req['appliesWhen'] || {})['condition']
  return :applies if cond.nil?
  case eval_condition(cond, decisions)
  when :true then :applies
  when :false then :not_applicable
  else :decision_needed
  end
end

profile_evidence = profile['evidence'] || {}
open_status = ->(fid) { findings_by_id[fid] && findings_by_id[fid]['status'] == 'open' }

# For a claimed-done deliverable, the evidence state beneath the claim:
# reconciliation owed (linked finding still open in the register) beats
# verification owed (required verification with no recorded evidence) as the
# more conservative headline; both reasons are surfaced when both apply.
def claimed_done_substate(req, open_status, profile_evidence)
  open_linked = (req['findingIds'] || []).select { |fid| open_status.call(fid) }
  return ['done-awaiting-reconciliation', "linked finding(s) still open: #{open_linked.join(', ')}"] if open_linked.any?
  if req['verificationRequired'] != 'code-only' && !profile_evidence[req['id']]
    return ['done-awaiting-verification', "#{req['verificationRequired']} verification required; no evidence recorded in LAUNCH-PROFILE evidence"]
  end
  ['done', nil]
end

derived = {}
requirements.each do |r|
  next if r['type'] == 'invariant'
  state = nil
  reasons = []
  hs = r['humanStatus']
  case applicability(r, decisions)
  when :decision_needed
    state = 'decision-needed'
    undecided = condition_keys((r['appliesWhen'] || {})['condition']).select { |k| decisions[k] == 'undecided' }
    reasons << "gated by undecided decision(s): #{undecided.join(', ')}"
    if hs == 'claimed-done'
      sub, why = claimed_done_substate(r, open_status, profile_evidence)
      reasons << "underlying evidence state if enabled: #{sub}#{why ? " (#{why})" : ''}"
    end
  when :not_applicable
    state = 'not-required'
    reasons << 'excluded by launch-profile decisions'
  else
    if hs == 'claimed-done'
      state, why = claimed_done_substate(r, open_status, profile_evidence)
      reasons << why if why
      if state == 'done-awaiting-reconciliation'
        warnings << "[#{r['id']}] claimed-done but linked finding(s) still open - rendered done-awaiting-reconciliation, not done"
      end
    else
      state = hs
    end
  end
  derived[r['id']] = { 'state' => state, 'reasons' => reasons }
end

# invariants are computed each generation; each invariant id must be wired here
invariant_results = {}
requirements.select { |r| r['type'] == 'invariant' }.each do |r|
  case r['id']
  when 'adult-beta-no-critical'
    n = metrics['openBySeverity']['critical']
    invariant_results[r['id']] = { 'pass' => n.zero?, 'detail' => "#{n} open Critical finding(s)" }
  when 'public-mvp-high-verification'
    unverified_highs = findings.select { |f| f['status'] == 'remediated-unverified' && f['severity'] == 'high' }
    invariant_results[r['id']] = {
      'pass' => unverified_highs.empty?,
      'detail' => "#{unverified_highs.size} High remediated-unverified finding(s) awaiting verification" +
                  (unverified_highs.empty? ? '' : ": #{unverified_highs.map { |f| f['id'] }.sort.join(', ')}")
    }
  else
    failures << "[#{r['id']}] invariant has no computation wired in readiness-check.rb; wire it before encoding"
  end
end

# Only requirements whose CURRENT derived state is decision-needed are "gated":
# a condition can reference an undecided key yet already be resolved (anyOf with
# a true operand, allOf with a false one) - listing those would be misleading.
decisions.select { |_, v| v == 'undecided' }.each_key do |k|
  affected = requirements.select do |r|
    derived.dig(r['id'], 'state') == 'decision-needed' &&
      condition_keys((r['appliesWhen'] || {})['condition']).include?(k)
  end.map { |r| r['id'] }
  warnings << "[launch-profile] #{k} is undecided; #{affected.size} requirement(s) render decision-needed: #{affected.join(', ')}" if affected.any?
end

# --- milestone rollups + inheritance ------------------------------------------
UNRESOLVED_STATES = %w[blocked in-progress decision-needed done-awaiting-verification done-awaiting-reconciliation claimed-done].freeze

def unresolved_blocker?(req, derived, invariant_results)
  return false unless req['blocking']
  if req['type'] == 'invariant'
    inv = invariant_results[req['id']]
    inv ? !inv['pass'] : false
  else
    UNRESOLVED_STATES.include?(derived.dig(req['id'], 'state'))
  end
end

by_milestone = requirements.group_by { |r| r['milestone'] }
rollups = {}
(mmeta['milestones'] || []).each do |m|
  mid = m['id']
  direct = by_milestone[mid] || []
  counts = Hash.new(0)
  direct.each do |r|
    if r['type'] == 'invariant'
      inv = invariant_results[r['id']]
      counts[inv && inv['pass'] ? 'invariant-holding' : 'invariant-failing'] += 1
    else
      counts[derived.dig(r['id'], 'state')] += 1
    end
  end
  inherited = []
  inherited_conditional = []
  case mid
  when 'school-beta'
    inherited = (by_milestone['adult-beta'] || []).select { |r| unresolved_blocker?(r, derived, invariant_results) }
  when 'public-mvp'
    inherited = (by_milestone['adult-beta'] || []).select { |r| unresolved_blocker?(r, derived, invariant_results) }
    school_unresolved = (by_milestone['school-beta'] || []).select { |r| unresolved_blocker?(r, derived, invariant_results) }
    if decisions['mvpIncludesMinors'] == false
      inherited_conditional = []
    elsif decisions['mvpIncludesMinors'] == true
      inherited += school_unresolved
    else
      inherited_conditional = school_unresolved
    end
  end
  top_blockers = direct.select { |r| unresolved_blocker?(r, derived, invariant_results) }
                       .sort_by { |r| [derived.dig(r['id'], 'state') == 'blocked' ? 0 : 1, r['id']] }
                       .first(5)
  rollups[mid] = {
    'title' => m['title'],
    'direct' => direct.size,
    'ratified' => direct.count { |r| (r['ratification'] || {})['status'] == 'ratified' },
    'counts' => counts,
    'inherited' => inherited.map { |r| r['id'] },
    'inheritedConditional' => inherited_conditional.map { |r| r['id'] },
    'topBlockers' => top_blockers
  }
end

# --- source freshness (deterministic: ages relative to reference date) --------
def freshness(src, ref_date)
  return ['red', 'numeric contradiction with canonical state (overrides age)'] if src['contradictsCanonical']
  return ['red', 'canonical copy marked SUPERSEDED; successor still draft (overrides age)'] if src['superseded']
  # Repo-kind rows are the local files this render just read - they are live by
  # construction, not fixtures, and never age.
  return ['green', 'read live from the repository at every render'] if src['kind'] == 'repo'
  lod = src['lastObservedDate']
  if lod.nil?
    return src['kind'] == 'production' ? ['yellow', 'no explicit observation recorded; never inferred'] : ['yellow', 'no observation recorded']
  end
  age = (ref_date - Date.iso8601(lod)).to_i
  age = 0 if age.negative?
  thresholds = case src['kind']
               when 'repo' then [1, 3]
               when 'notion' then [1, 3]
               when 'drive' then [7, 14]
               when 'production' then [1, 3]
               else [1, 3]
               end
  color = if age <= thresholds[0] then 'green'
          elsif age <= thresholds[1] then 'yellow'
          else 'red'
          end
  [color, "last observed #{lod} (#{age}d before reference date)"]
end

# --- render -------------------------------------------------------------------
LIGHT = { 'green' => "\u{1F7E2}", 'yellow' => "\u{1F7E1}", 'orange' => "\u{1F7E0}", 'red' => "\u{1F534}", 'future' => "⚪" }.freeze

STATE_LABELS = {
  'blocked' => 'Blocked', 'in-progress' => 'In progress', 'claimed-done' => 'Claimed done',
  'decision-needed' => 'Decision needed', 'done' => 'Done',
  'done-awaiting-verification' => 'Done, awaiting verification',
  'done-awaiting-reconciliation' => 'Done, awaiting reconciliation',
  'accepted-for-milestone' => 'Accepted for milestone', 'not-required' => 'Not required',
  'future' => 'Future', 'invariant-holding' => 'Invariant holding', 'invariant-failing' => 'Invariant failing'
}.freeze

def render_dashboard(ctx)
  mmeta = ctx[:milestones]['meta']
  ratif = mmeta['ratification'] || {}
  proposed = ratif['status'] != 'ratified'
  m = ctx[:metrics]
  out = +''
  out << "# LingoLinq - Beta & Compliance Readiness\n\n"
  out << "> **GENERATED - DO NOT HAND EDIT.**\n"
  out << "> Generated from `audit-reports/strategy/*.json` + `audit-reports/FINDINGS.json` by `scripts/readiness-check.rb`.\n"
  out << "> Edit the JSON sources and re-render; `--check` enforces sync in CI (audit-artifacts-integrity).\n"
  out << ">\n"
  out << "> Findings baseline: live from `FINDINGS.json` at render | Risk movement since snapshot: #{ctx[:as_of]} | Strategy generated: #{mmeta['generatedDate']}\n\n"
  if proposed
    ratified_count = ctx[:requirements].count { |r| (r['ratification'] || {})['status'] == 'ratified' }
    if ratified_count.positive?
      out << "> ⚠️ **PARTIALLY RATIFIED - #{ratified_count} of #{ctx[:requirements].size} requirements ratified by Scot** (per-row\n"
      out << "> `ratification` objects; milestone-by-milestone review). Every row without one remains a\n"
      out << "> proposal. `meta.ratification.status` flips to `ratified` only when Scot has ratified all rows.\n\n"
    else
      out << "> ⚠️ **PROPOSED - requires Scot ratification.** Every requirement status, blocker flag, and\n"
      out << "> applicability interpretation below is a proposal (proposed #{ratif['proposedDate']}). Nothing here is\n"
      out << "> canonical strategy until `meta.ratification.status` is flipped to `ratified` by Scot.\n\n"
    end
  end

  pending = ctx[:decisions].select { |_, v| v == 'undecided' }.keys
  no_crit = ctx[:invariants].dig('adult-beta-no-critical', 'pass')
  unmapped_ch = ctx[:unmapped_critical_high]
  out << "**Launch profile:** `#{ctx[:profile]['profile']}`  \n"
  out << "**Open Critical:** #{m['openBySeverity']['critical']}  \n"
  out << "**Verified Critical closures:** #{m['verifiedClosedCritical']}  \n"
  # <br>, not a trailing double-space hard-break like its sibling lines: this
  # is a newly-introduced line, and `git diff --check` flags trailing
  # whitespace on genuinely new/changed lines even though the same
  # double-space convention is already pervasive (and un-flagged, because
  # unchanged) throughout the rest of this generated file.
  out << "**Unmapped Critical/High:** #{unmapped_ch.size}#{unmapped_ch.any? ? " #{LIGHT['red']} (see governance exception section below)" : ' - none'}<br>\n"
  out << "**Overall posture:** #{no_crit ? LIGHT['yellow'] : LIGHT['red']} #{no_crit ? 'Moving toward controlled beta' : 'Open Critical blocks beta'}  \n"
  out << "**Pending launch decisions:** #{pending.empty? ? 'none' : pending.join('; ')}\n\n"

  # Positioned before every other content block, including the finding
  # baseline table and the milestone cards, so a reader who reads only the top
  # of the document - or only a single milestone card - still cannot miss a
  # material open Critical/High that no requirement currently covers. This is
  # a governance EXCEPTION list, distinct from the larger Medium/Low
  # informational one below: presence here means "someone must decide", not
  # "here is more context."
  out << "## ⚠️ Unmapped Critical/High findings (governance exception)\n\n"
  if unmapped_ch.empty?
    out << "None - every open Critical/High finding is linked to at least one requirement row.\n\n"
  else
    out << "#{unmapped_ch.size} open Critical/High finding(s) are linked to **no** requirement and therefore drive\n"
    out << "**no** milestone card, blocker list, or inherited-blocker count above or below. Each remains open in\n"
    out << "the canonical register with reconciliation owed, regardless of any engineering work already merged\n"
    out << "against it, until it is either linked to an applicable requirement or Scot explicitly assesses it as\n"
    out << "not launch-relevant (a governance decision this layer never makes on its own).\n\n"
    out << "| Finding | Severity | Disposition | Title |\n|---|---|---|---|\n"
    unmapped_ch.each do |f|
      disp = f.dig('disposition', 'state') || 'untriaged'
      out << "| `#{f['id']}` | #{f['severity']} | #{disp} | #{f['title'].to_s[0, 100]} |\n"
    end
    out << "\n"
  end

  out << "## Current finding baseline\n\n"
  out << "| Metric | Count |\n|---|---:|\n"
  out << "| Total findings | #{m['total']} |\n"
  out << "| Open | #{m['open']} |\n"
  SEVERITY_ENUM.each { |s| out << "| Open #{s.capitalize} | #{m['openBySeverity'][s]} |\n" }
  out << "| Remediated, unverified | #{m['remediatedUnverified']} |\n"
  out << "| Accepted risk | #{m['acceptedRisk']} |\n"
  out << "| Superseded | #{m['superseded']} |\n"
  out << "| Verified closed | #{m['verifiedClosed']} |\n"
  out << "| Verified-closed Critical | #{m['verifiedClosedCritical']} |\n\n"

  unlinked = ctx[:unlinked_open]
  out << "### Open findings not linked to any requirement (informational)\n\n"
  if unlinked.empty?
    out << "None - every open finding is linked to at least one requirement row.\n\n"
  else
    by_sev = Hash.new(0)
    unlinked.each { |f| by_sev[f['severity']] += 1 }
    out << "#{unlinked.size} of #{m['open']} open findings are linked to no requirement row (#{SEVERITY_ENUM.map { |s| "#{by_sev[s]} #{s}" }.join(' / ')}).\n"
    out << "The milestone cards are a readiness lens, never a complete risk inventory - `FINDINGS.md` remains the\n"
    out << "full register. Critical/High items in this count are the same ones called out as a governance\n"
    out << "exception above; Medium/Low items are informational only and **never** automatically become a\n"
    out << "milestone blocker - blocking status is a property of a linked, ratified requirement, not of a\n"
    out << "finding's severity by itself.\n\n"
  end

  out << "## Milestones\n\n"
  out << "| Milestone | Direct reqs | Ratified | Inherited blockers | Blocked | Decision needed | In progress | Awaiting verification | Awaiting reconciliation | Done | Other |\n"
  out << "|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---|\n"
  (mmeta['milestones'] || []).each do |mm|
    r = ctx[:rollups][mm['id']]
    c = r['counts']
    inherited_cell = r['inherited'].size.to_s
    inherited_cell += " (+#{r['inheritedConditional'].size} decision-dependent)" if r['inheritedConditional'].any?
    # Every state gets a column so the row always sums to Direct reqs - states
    # with no dedicated column would otherwise vanish from the table entirely.
    other_parts = %w[future not-required accepted-for-milestone invariant-holding invariant-failing]
                  .select { |s| c[s].positive? }.map { |s| "#{c[s]} #{s}" }
    out << "| #{r['title']} | #{r['direct']} | #{r['ratified']} | #{inherited_cell} | #{c['blocked']} | #{c['decision-needed']} | #{c['in-progress']} | #{c['done-awaiting-verification']} | #{c['done-awaiting-reconciliation']} | #{c['done']} | #{other_parts.empty? ? '0' : other_parts.join('; ')} |\n"
  end
  out << "\nDirect requirement total: **#{ctx[:requirements].size}**\n\n"
  out << "Inheritance (computed, never duplicated as rows): school-beta inherits applicable unresolved adult-beta\n"
  out << "blockers; public-mvp inherits unresolved adult-beta and school-beta blockers (school-beta portion is\n"
  out << "decision-dependent while `mvpIncludesMinors` is undecided).\n\n"

  ctx[:rollups].each do |mid, r|
    next if r['topBlockers'].empty?
    out << "### Top blockers - #{r['title']}\n\n"
    r['topBlockers'].each do |req|
      if req['type'] == 'invariant'
        inv = ctx[:invariants][req['id']]
        out << "- #{LIGHT['red']} `#{req['id']}` (invariant) - #{inv['detail']}\n"
      else
        d = ctx[:derived][req['id']]
        light = d['state'] == 'blocked' ? LIGHT['red'] : LIGHT['yellow']
        line = "- #{light} `#{req['id']}` (#{STATE_LABELS[d['state']] || d['state']}) - #{req['text']}"
        line += " [#{(req['findingIds'] || []).join(', ')}]" if (req['findingIds'] || []).any?
        out << line << "\n"
        d['reasons'].each { |reason| out << "  - #{reason}\n" }
      end
    end
    out << "\n"
  end

  out << "## Invariants (computed this generation)\n\n"
  ctx[:requirements].select { |r| r['type'] == 'invariant' }.each do |r|
    inv = ctx[:invariants][r['id']]
    next unless inv
    out << "- #{inv['pass'] ? "✅" : "❌"} `#{r['id']}` - #{inv['detail']}\n"
  end
  out << "\n"

  out << "## Pending launch-profile decisions\n\n"
  if pending.empty?
    out << "None - all launch-profile decisions are made.\n\n"
  else
    out << "| Decision | Current value | Requirements gated |\n|---|---|---|\n"
    pending.each do |k|
      gated = ctx[:requirements].select do |r|
        ctx[:derived].dig(r['id'], 'state') == 'decision-needed' &&
          condition_keys((r['appliesWhen'] || {})['condition']).include?(k)
      end.map { |r| "`#{r['id']}`" }
      if k == 'mvpIncludesMinors'
        n = ctx[:rollups].dig('public-mvp', 'inheritedConditional')&.size.to_i
        gated << "controls public-mvp inheritance of #{n} unresolved school-beta blocker(s)"
      end
      out << "| #{k} | undecided | #{gated.empty? ? '-' : gated.join(', ')} |\n"
    end
    out << "\nUndecided applicability renders **⚪ Decision needed**, never silently blocked or not-required.\n\n"
  end

  out << "## Risk movement\n\n"
  if ctx[:snapshots].size < 2
    out << "#{ctx[:snapshots].empty? ? 'No snapshots recorded yet.' : 'First snapshot recorded; no prior snapshot to diff against.'}\n"
    out << "Run `ruby scripts/readiness-check.rb --snapshot` after register changes to build the movement series.\n\n"
  else
    flow = ctx[:snapshots].last['findingFlowSincePrior'] || {}
    prior_open = (ctx[:snapshots][-2]['openFindingIds'] || []).size
    cur_open = (ctx[:snapshots].last['openFindingIds'] || []).size
    out << "| Signal | Since prior snapshot |\n|---|---|\n"
    out << "| New known risks | #{(flow['new'] || []).size}#{(flow['new'] || []).any? ? " (#{flow['new'].join(', ')})" : ''} |\n"
    out << "| Findings moved out of open | #{(flow['movedOutOfOpen'] || []).size}#{(flow['movedOutOfOpen'] || []).any? ? " (#{flow['movedOutOfOpen'].join(', ')})" : ''} |\n"
    out << "| Reopened | #{(flow['reopened'] || []).size} |\n"
    out << "| Severity changes | #{(flow['severityChanged'] || []).size} |\n"
    out << "| Net open movement (supporting metric only) | #{prior_open} -> #{cur_open} |\n\n"
    out << "A rising known-risk count is not automatically negative; it may reflect improved discovery coverage.\n\n"
  end

  wm = ctx[:work_metrics]
  out << "## Work delivered (seeded ledger - representative, not exhaustive)\n\n"
  out << "| Metric | Count |\n|---|---:|\n"
  out << "| Ledger records | #{wm['records']} |\n"
  out << "| Distinct control/capability clusters | #{wm['distinctClusters']} |\n"
  out << "| Preventive controls added | #{wm['preventiveControls']} |\n"
  out << "| Findings moved out of open (latest snapshot) | #{wm['movedOutOfOpen'] || 'n/a (needs 2+ snapshots)'} |\n"
  out << "| Superseded-evidence records (claim later disproved; correction linked) | #{wm['supersededEvidence']} |\n\n"
  out << "Release duplicates and smoke PRs never inflate distinct-cluster counts; records sharing a cluster count once.\n"
  superseded_records = ctx[:work].select { |w| w['outcomeState'] == 'superseded-evidence' }
  superseded_records.each do |w|
    corr = ctx[:work].find { |c| c['id'] == w['correctedBy'] }
    out << "Superseded evidence preserved, never laundered: `#{w['id']}` (#{w['title']}) was corrected by `#{w['correctedBy']}`#{corr ? " (#{corr['title']})" : ''}.\n"
  end
  out << "\n"

  out << "## Six readiness cards (curated)\n\n"
  out << "These cards are hand-authored judgment maintained in `READINESS-MILESTONES.json` - their traffic\n"
  out << "lights are NOT computed from the data above. For computed state, read the milestone table and\n"
  out << "invariants sections; where they disagree, the computed sections govern.\n\n"
  (ctx[:milestones]['readinessCards'] || []).each do |c|
    out << "### #{c['title']} - #{LIGHT[c['status']]}\n"
    out << "**Strengths:** #{c['strengths'].join('; ')}  \n"
    out << "**Gaps:** #{c['gaps'].join('; ')}  \n"
    out << "**Next:** #{c['next']}\n\n"
  end

  out << "## Workstreams\n\n"
  out << "No developer ranking or leaderboard; owners listed for accountability only.\n\n"
  out << "| Workstream | Accountable humans | Clusters advanced |\n|---|---|---|\n"
  display = ctx[:identities].to_h { |i| [i['id'], i['display'] || i['id']] }
  ctx[:work].group_by { |w| w['workstream'] }.sort.each do |ws, records|
    owners = records.map { |w| display[w['accountableOwner']] }.uniq.sort.join(', ')
    ws_clusters = records.map { |w| w['cluster'] }.compact.uniq.sort.map { |cl| "`#{cl}`" }.join(', ')
    out << "| #{ws} | #{owners} | #{ws_clusters} |\n"
  end
  out << "\nAI tools are implementation/review tools, never accountable owners.\n\n"

  out << "## Source freshness\n\n"
  out << "Ages are relative to the data-as-of reference date (#{ctx[:reference_date]}); external sources are\n"
  out << "last-observed historical fixtures in v0.2 (no live Notion/Drive connectors; live checks are never faked).\n\n"
  out << "| Source | State | Detail |\n|---|---|---|\n"
  ctx[:sources].each do |src|
    color, detail = freshness(src, ctx[:reference_date])
    out << "| #{src['name']} | #{LIGHT[color]} | #{detail}. #{src['note']} |\n"
  end
  out << "\n---\nGenerated output must not be hand-edited.\n"
  out
end

# --- snapshot append (--snapshot only; the one clock-reading mode) ------------
if mode == :snapshot
  now = Time.now.utc.iso8601
  if snapshots.any? { |s| s['generatedAt'] == now }
    # Second-granularity identity collision: the prior snapshot was taken within
    # this same clock second. Wait it out once rather than aborting - the retaken
    # timestamp is still the real clock, never a fabricated increment.
    sleep 1
    now = Time.now.utc.iso8601
    abort "readiness-check: snapshot identity #{now} still collides; re-run" if snapshots.any? { |s| s['generatedAt'] == now }
  end
  last = snapshots.last
  if last
    last_t = begin
      Time.iso8601(last['generatedAt'])
    rescue ArgumentError, TypeError
      nil
    end
    if last_t && Time.iso8601(now) <= last_t
      abort "readiness-check: current clock #{now} does not advance past the latest snapshot #{last['generatedAt']}; refusing to append a non-monotonic record (future-dated prior or clock step)"
    end
  end
  open_ids = open_findings.map { |f| f['id'] }.sort
  new_snap = {
    'generatedAt' => now,
    'priorSnapshotSha' => last ? Digest::SHA256.hexdigest(JSON.generate(last)) : nil,
    'sources' => {
      'findingsSha' => Digest::SHA256.hexdigest(File.read(FINDINGS_JSON))[0, 12],
      'workLedgerSha' => Digest::SHA256.hexdigest(File.read(LEDGER_JSON))[0, 12],
      'readinessSha' => Digest::SHA256.hexdigest(File.read(MILESTONES_JSON))[0, 12],
      'launchProfileSha' => Digest::SHA256.hexdigest(File.read(PROFILE_JSON))[0, 12]
    },
    'findings' => {
      'total' => metrics['total'],
      'open' => metrics['open'],
      'openBySeverity' => metrics['openBySeverity'],
      'remediatedUnverified' => metrics['remediatedUnverified'],
      'acceptedRisk' => metrics['acceptedRisk'],
      'superseded' => metrics['superseded'],
      'verifiedClosed' => metrics['verifiedClosed']
    },
    'openFindingIds' => open_ids,
    'openFindingSeverities' => open_findings.sort_by { |f| f['id'] }.to_h { |f| [f['id'], f['severity']] }
  }
  new_snap['findingFlowSincePrior'] = recompute_flow(snapshots, new_snap)
  snapshots << new_snap
  snapshots_doc['snapshots'] = snapshots
end

# Runs after any --snapshot append so the final state (what will actually be
# committed) is what gets compared to base, not a pre-append snapshot list.
verify_base_append_only!(snapshots, failures, warnings, mode)

# --- report + write -----------------------------------------------------------
warnings.each { |w| warn "readiness-check WARNING: #{w}" }

unless failures.empty?
  warn "readiness-check: #{failures.size} FAILURE(S)\n"
  failures.each { |f| warn "  - #{f}" }
  warn "\nFix the strategy JSON (or the reference it cites), then re-run. Do not commit a red strategy layer."
  exit 1
end

# Everything snapshot-dependent is computed HERE, after any --snapshot append,
# so the render written by --snapshot is byte-identical to a fresh render.
latest_snap = snapshots.last
work_metrics = {
  'records' => work.size,
  'distinctClusters' => clusters.size,
  'preventiveControls' => work.count { |w| w['inclusionReason'] == 'adds-preventive-control' },
  'movedOutOfOpen' => latest_snap ? (latest_snap.dig('findingFlowSincePrior', 'movedOutOfOpen') || []).size : nil,
  'supersededEvidence' => work.count { |w| w['outcomeState'] == 'superseded-evidence' }
}
reference_date = if latest_snap
                   Date.iso8601(Time.iso8601(latest_snap['generatedAt']).strftime('%F'))
                 else
                   Date.iso8601((profile['meta'] || {})['generatedDate'] || '1970-01-01')
                 end

linked_ids = requirements.flat_map { |r| r['findingIds'] || [] }.to_set
unlinked_open = open_findings.reject { |f| linked_ids.include?(f['id']) }.sort_by { |f| f['id'] }
unmapped_critical_high = unlinked_open.select { |f| %w[critical high].include?(f['severity']) }
                                       .sort_by { |f| [f['severity'] == 'critical' ? 0 : 1, f['id']] }

ctx = {
  milestones: milestones, requirements: requirements, derived: derived,
  invariants: invariant_results, rollups: rollups, metrics: metrics,
  profile: profile, decisions: decisions, snapshots: snapshots,
  work: work, work_metrics: work_metrics, identities: identities,
  sources: (profile['meta'] || {})['sources'] || [],
  unlinked_open: unlinked_open,
  unmapped_critical_high: unmapped_critical_high,
  reference_date: reference_date,
  as_of: snapshots.last ? snapshots.last['generatedAt'] : "#{(profile['meta'] || {})['generatedDate']} (no snapshot yet)"
}
rendered = render_dashboard(ctx)

case mode
when :check
  on_disk = File.file?(RENDER_MD) ? File.read(RENDER_MD) : nil
  if on_disk != rendered
    warn "readiness-check: #{RENDER_MD} is out of sync with the strategy JSONs. Run `ruby scripts/readiness-check.rb` to regenerate."
    exit 1
  end
  puts "readiness-check: OK (#{requirements.size} requirements, #{work.size} work records, #{snapshots.size} snapshot(s); render in sync; #{warnings.size} warning(s))"
when :snapshot
  File.write(SNAPSHOTS_JSON, JSON.pretty_generate(snapshots_doc) + "\n")
  File.write(RENDER_MD, rendered)
  puts "readiness-check: snapshot #{snapshots.last['generatedAt']} appended (#{snapshots.size} total); #{RENDER_MD} written"
when :render_only, :validate_and_write
  File.write(RENDER_MD, rendered)
  puts "readiness-check: OK (#{requirements.size} requirements, #{work.size} work records validated; #{RENDER_MD} written; #{warnings.size} warning(s))"
end
