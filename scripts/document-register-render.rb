#!/usr/bin/env ruby
# frozen_string_literal: true

# document-register-render.rb - keep the compliance document register honest.
#
# The register (audit-reports/DOCUMENT-REGISTER.json) is the single source of truth for
# WHERE every compliance document lives across git, Google Drive, and Notion. This script
# is to that register what citation-check.rb is to the findings register: it normalizes the
# JSON, renders the human-readable DOCUMENT-REGISTER.md, and (in --check mode) fails CI when
# the register has drifted from reality.
#
# Two enhancements over a plain render, both deterministic and CI-safe (pure git + stdlib,
# no network):
#   1. contentHash - sha256 of the canonical content. For canonicalSystem=git rows the hash
#      is computed from the file bytes and VERIFIED in --check (a tracked doc edited without
#      updating its row fails). For drive/notion rows the hash is externally supplied and
#      only advisory here (CI is network-free and cannot reach those systems).
#   2. bundles - named compliance bundles (e.g. soc2-evidence). Each bundle in
#      meta.bundleDefinitions lists requiredTitles; --check fails if a bundle is missing a
#      required member, or if a doc references a bundle that is not defined.
#   3. retention - a DRAFT, legally inert retention block per row. Validation here is SHAPE
#      ONLY: required fields present, class resolves to meta.retentionSchedule, and the row's
#      denormalised rule/disposition agree with that schedule entry. No deletion behaviour is
#      wired anywhere, and dispositionEligibleAfter is forced to stay null until a rule is
#      explicitly approved, so a draft schedule can never produce a disposition date.
#   4. supersession - supersedes / supersededBy must form a reciprocal, resolvable, non-self-
#      referential chain, and a superseded-by row must carry status:superseded.
#   5. driveFileId - required on drive rows, forbidden elsewhere, and must be the id actually
#      embedded in canonicalLocation (IDs survive renames and moves; paths do not).
#   6. completeness - every tracked file under docs/legal/ must have a git row (hard failure);
#      unregistered .claude/agents/*.md is advisory only.
#   7. attestation integrity - attestation.attestedContentHash pins the bytes Scot attested. A git
#      row whose pinned hash no longer matches its contentHash fails: the attested revision is
#      gone and re-attestation is owed. Never backfilled by render (that would self-certify every
#      attestation); rows attested before the check sit on meta.attestationBackfillExemptions.
#
# Usage:
#   ruby scripts/document-register-render.rb [JSON]           # normalize JSON (id + git hash) and write .md
#   ruby scripts/document-register-render.rb --check [JSON]   # exit 1 on any drift; writes nothing
#
# Exit codes: 0 = clean; 1 = drift / missing file / bundle gap / bad reference.

require 'json'
require 'digest'
require 'date'
require 'optparse'
require 'set'

DEFAULT_REGISTER = 'audit-reports/DOCUMENT-REGISTER.json'

options = { mode: :render }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/document-register-render.rb [--check] [JSON]'
  o.on('--check', 'Exit 1 if the register or its render has drifted; write nothing') { options[:mode] = :check }
end.parse!(ARGV)

register_path = ARGV[0] || DEFAULT_REGISTER
unless File.file?(register_path)
  warn "document-register-render: register not found: #{register_path}"
  exit 1
end

register = JSON.parse(File.read(register_path))
meta = register['meta'] || {}
documents = register['documents'] || []
bundle_defs = meta['bundleDefinitions'] || {}

# The register file rewrites itself on render (id + hash backfill), so its own bytes can never
# settle to a stored hash. Exempt that one path from content-hashing.
SELF_PATH = File.expand_path(register_path)
# Repo root, anchored off the register's own location (audit-reports/DOCUMENT-REGISTER.json).
# Used to keep "canonicalSystem=git" honest: a git row must resolve to a real file INSIDE the
# repo, never a symlink or a traversal path pointing out of the working tree.
REPO_ROOT = File.realpath(File.expand_path(File.join(File.dirname(register_path), '..')))

# True if a repo-relative path resolves (following symlinks) to a real file inside the repo.
def in_repo_file?(loc)
  return false if loc.to_s.include?('..')
  return false if File.symlink?(loc)
  return false unless File.file?(loc)

  real = File.realpath(loc)
  real == REPO_ROOT || real.start_with?(REPO_ROOT + '/')
rescue Errno::ENOENT, Errno::ELOOP
  false
end

# Deterministic id, shared with the Notion sync: DOC- + sha256(canonicalLocation)[0,10].
def expected_id(doc)
  'DOC-' + Digest::SHA256.hexdigest(doc['canonicalLocation'].to_s)[0, 10]
end

def git_row?(doc)
  doc['canonicalSystem'].to_s == 'git'
end

def url_like?(s)
  s.to_s.match?(%r{\Ahttps?://}i)
end

def host_of(url)
  url.to_s[%r{\Ahttps?://([^/]+)}i, 1].to_s.downcase
end

# Positive per-system host allowlist for non-git rows. A tracked repo file must be a
# git row (so its bytes are content-hashed); a drive/notion URL must point at the real
# external system, never at a github.com/raw blob of an in-repo file (which would dodge
# hash verification while still resolving to the tracked content).
DRIVE_HOSTS  = %w[docs.google.com drive.google.com].freeze
NOTION_HOSTS = %w[notion.so www.notion.so app.notion.com].freeze

def allowed_external_host?(sys, host)
  case sys
  when 'drive'  then DRIVE_HOSTS.include?(host)
  when 'notion' then NOTION_HOSTS.include?(host) || host.end_with?('.notion.site')
  else true
  end
end

# A bundle requirement binds to a specific document by canonicalLocation (identity), not
# free-text title, so a doc retitled to a required string cannot satisfy it. Returns the
# matching member or nil.
def bundle_member_for(members, location)
  members.find { |m| m['canonicalLocation'].to_s == location.to_s }
end

def self_row?(doc)
  git_row?(doc) && File.expand_path(doc['canonicalLocation'].to_s) == SELF_PATH
end

# Compute the canonical content hash for a git row, or nil if the file is missing / exempt /
# not a real in-repo file (a symlink or out-of-tree path is rejected by collect_problems).
def git_content_hash(doc)
  return nil if self_row?(doc)

  path = doc['canonicalLocation'].to_s
  return nil unless in_repo_file?(path)

  Digest::SHA256.hexdigest(File.binread(path))
end

def parse_date(s)
  return nil if s.nil? || s.to_s.strip.empty?

  Date.parse(s.to_s)
rescue ArgumentError
  nil
end

# Anchor the "overdue for review" window to meta.generatedDate (not Date.today) so the render is
# a pure function of the JSON - the same drift-avoidance citation/calendar renders use. A present
# but malformed generatedDate is a hand-edit mistake: fail loudly. Only a fully absent one falls
# back to today (undated scratch JSON).
if meta.key?('generatedDate')
  generated_date = parse_date(meta['generatedDate']) ||
    abort("document-register-render: meta.generatedDate present but unparseable: #{meta['generatedDate'].inspect}")
else
  generated_date = Date.today
end
generated = generated_date.strftime('%Y-%m-%d')

# ---- integrity checks (used by both modes) ---------------------------------------

def attested?(doc)
  att = doc['attestation']
  att.is_a?(Hash) && !att['attestedBy'].to_s.empty?
end

DISPOSITIONS = %w[archive delete].freeze
RETENTION_STATUSES = %w[draft approved].freeze
SHA256_RE = /\A[0-9a-f]{64}\z/.freeze

# Attestation integrity.
#
# `contentHash` tracks a file as it is NOW. `attestation.attestedContentHash` records the bytes
# Scot actually signed off on. Without the second hash an attested document can be rewritten with
# CI green: the render simply recomputes contentHash and the row goes on asserting an attestation
# that covered a revision which no longer exists. That is not hypothetical - it happened twice
# before this check existed (#649/#652 rewrote the subprocessor, hosting, and COPPA-offboarding
# content of COMPLIANCE_PROGRAM_OVERVIEW.md after its 2026-07-09 external-release attestation;
# #656 moved two AI-log retention tiers in AI_DATA_FLOW_CLASSIFICATION.md after its 2026-07-09
# attestation) and both passed a green build. Both were caught by hand.
#
# Enforced for canonicalSystem=git ONLY. Those bytes are in the repo and hashable offline. Drive
# and Notion hashes are operator-supplied with no automated refresh, so pinning one there would
# assert an integrity guarantee this network-free check cannot make; carrying the field on a
# non-git row is itself an error.
#
# Backfill is deliberately NOT automatic, and render mode never writes this field. Populating it
# from current bytes would silently re-assert every existing attestation - precisely the failure
# the field exists to catch. Rows attested before the check landed sit on
# meta.attestationBackfillExemptions, each carrying the commits that modified the file after its
# attestation. An entry is removed only when Scot re-attests and the hash is pinned; the list is
# one-way and shrinks to zero. Only Scot attests.
#
# CLOSED_ATTESTATION_EXEMPTIONS is what makes "one-way" true rather than aspirational. Were the
# exemption list merely a JSON array the check honoured, any future unpinned attestation could be
# waved through by appending an id to it, and the gate would be optional. The set of rows that
# predate this check is finite, known, and can never grow, so it is frozen HERE, in code, outside
# the data the check reads. meta.attestationBackfillExemptions may only ever be a subset: an id
# outside this set is rejected no matter how well-formed its entry is. Removing an id from the JSON
# (because Scot re-attested and the hash is now pinned) is the only supported edit. Nothing is ever
# added to the constant - a new attestation pins its bytes at the moment it is recorded, which
# costs nothing, because the attester is looking at the file.
#
# EMPTY as of 2026-07-23. All seven rows that predated the check were re-attested against their
# current revisions and now pin their bytes, so the grandfather population is exhausted and every
# attested git row is verifiable. An empty set is the intended end state, not a gap: with nothing
# in it, no unpinned attestation can pass, which is exactly the invariant the field exists to hold.
# The seven ids it held were DOC-9b299a785b, DOC-4e3b7fb1fb, DOC-bff9acf51f, DOC-0387973005,
# DOC-407d2c2bf4, DOC-4e6c9253b9, DOC-5b14b08908 (git history has the entries and their evidence).
CLOSED_ATTESTATION_EXEMPTIONS = Set.new.freeze
def attestation_problems(documents, exemptions)
  exempt_ids = exemption_ids(exemptions)
  problems = []

  documents.each do |doc|
    title = doc['title'].to_s
    pinned = doc.dig('attestation', 'attestedContentHash').to_s

    unless git_row?(doc)
      unless pinned.empty?
        problems << "#{doc['canonicalSystem']} doc #{title.inspect} carries attestation.attestedContentHash; only git rows have bytes this check can verify (Drive/Notion hashes are operator-supplied)"
      end
      next
    end
    next if self_row?(doc)
    next unless attested?(doc)

    if pinned.empty?
      next if exempt_ids.include?(doc['id'].to_s) && CLOSED_ATTESTATION_EXEMPTIONS.include?(doc['id'].to_s)

      problems << "attested doc #{title.inspect} (#{doc['canonicalLocation']}) has no attestation.attestedContentHash; an attestation with no pinned bytes cannot be verified. Pin the sha256 of the attested bytes alongside attestedBy/attestedDate. This cannot be waived: meta.attestationBackfillExemptions is closed to the rows that predate this check (see CLOSED_ATTESTATION_EXEMPTIONS) and adding an entry for this row will not clear the failure"
      next
    end

    unless pinned.match?(SHA256_RE)
      problems << "attested doc #{title.inspect} has a malformed attestation.attestedContentHash #{pinned.inspect} (expected 64 lowercase hex characters)"
      next
    end

    current = doc['contentHash'].to_s
    if current.empty?
      problems << "attested doc #{title.inspect} pins attestedContentHash but carries no contentHash to compare it against (run render)"
    elsif current != pinned
      problems << "attested revision no longer exists for #{title.inspect} (#{doc['canonicalLocation']}): attestation of #{doc.dig('attestation', 'attestedDate')} covered #{pinned[0, 12]}, the file is now #{current[0, 12]}. Re-attestation is owed and only Scot attests - do not edit the pinned hash to make this pass"
    end
  end

  problems
end

def exemption_ids(exemptions)
  return Set.new unless exemptions.is_a?(Array)

  exemptions.filter_map { |e| e['id'].to_s if e.is_a?(Hash) }.to_set
end

# Hygiene for the grandfather list itself, so it cannot quietly become permanent cover: every
# entry must resolve to a real, attested, git row, must carry a reason and a date, and must
# disappear the moment that row pins a hash.
def attestation_exemption_problems(documents, exemptions)
  return [] if exemptions.nil?
  return ["meta.attestationBackfillExemptions must be an array, got #{exemptions.class}"] unless exemptions.is_a?(Array)

  problems = []
  by_id = documents.to_h { |d| [d['id'].to_s, d] }
  seen = Hash.new(0)

  exemptions.each do |ex|
    unless ex.is_a?(Hash)
      problems << "meta.attestationBackfillExemptions entries must be objects, got #{ex.class}"
      next
    end

    id = ex['id'].to_s
    seen[id] += 1
    doc = by_id[id]
    if doc.nil?
      problems << "attestation exemption #{id.inspect} does not resolve to a row in this register"
      next
    end

    label = doc['title'].to_s.inspect

    # The gate that keeps the list from becoming a waiver mechanism. Deliberately does NOT skip the
    # remaining checks: an operator adding an entry should see every reason it is wrong in one run,
    # not fix the shape and then discover the entry was never permitted in the first place.
    unless CLOSED_ATTESTATION_EXEMPTIONS.include?(id)
      problems << "attestation exemption for #{label} (#{id}) is not in the closed grandfather set; that set is frozen in scripts/document-register-render.rb and can only shrink. An attestation recorded after this check landed must pin attestedContentHash - it cannot be exempted"
    end

    %w[reason addedOn].each do |f|
      problems << "attestation exemption for #{label} is missing #{f.inspect}" if ex[f].to_s.empty?
    end
    if !ex['addedOn'].to_s.empty? && parse_date(ex['addedOn']).nil?
      problems << "attestation exemption for #{label} has an unparseable addedOn #{ex['addedOn'].inspect}"
    end
    if !ex['canonicalLocation'].to_s.empty? && ex['canonicalLocation'].to_s != doc['canonicalLocation'].to_s
      problems << "attestation exemption for #{label} records canonicalLocation #{ex['canonicalLocation'].inspect} but the row is #{doc['canonicalLocation'].inspect}"
    end
    problems << "attestation exemption for #{label} covers a #{doc['canonicalSystem']} row; only git rows are subject to the attestedContentHash check" unless git_row?(doc)
    problems << "attestation exemption for #{label} covers a row carrying no attestation; remove the exemption" unless attested?(doc)
    unless doc.dig('attestation', 'attestedContentHash').to_s.empty?
      problems << "stale attestation exemption: #{label} now pins attestedContentHash, so its exemption must be removed (this list only ever shrinks)"
    end
  end

  seen.select { |_, n| n > 1 }.each_key do |id|
    problems << "duplicate attestation exemption for #{id.inspect} (#{seen[id]} entries)"
  end

  problems
end

# The Drive file id embedded in a canonicalLocation, or nil if the URL carries none.
def drive_id_in(url)
  url.to_s[%r{/(?:document|file|spreadsheets|presentation)/d/([A-Za-z0-9_-]+)}, 1]
end

# Shape-only retention validation. Deliberately does NOT interpret the rule, compute a
# disposition date, or authorise anything: it checks that the block is well-formed and that the
# row's denormalised copy still agrees with meta.retentionSchedule.
def retention_problems(doc, schedule)
  title = doc['title'].to_s
  ret = doc['retention']
  return ["doc #{title.inspect} has no retention block (every row needs one; status must be draft)"] unless ret.is_a?(Hash)

  problems = []
  klass = ret['class'].to_s
  entry = schedule[klass]
  if entry.nil?
    problems << "doc #{title.inspect} has retention.class #{klass.inspect} which is not defined in meta.retentionSchedule"
    return problems
  end

  %w[class rule disposition status].each do |f|
    problems << "doc #{title.inspect} retention is missing required field #{f.inspect}" if ret[f].to_s.empty?
  end

  unless DISPOSITIONS.include?(ret['disposition'].to_s)
    problems << "doc #{title.inspect} has retention.disposition #{ret['disposition'].inspect} (expected #{DISPOSITIONS.join('|')})"
  end
  unless RETENTION_STATUSES.include?(ret['status'].to_s)
    problems << "doc #{title.inspect} has retention.status #{ret['status'].inspect} (expected #{RETENTION_STATUSES.join('|')})"
  end

  # The row carries a denormalised copy of the schedule so a row is self-describing. If the two
  # ever disagree, the register is lying about which rule applies - fail rather than pick one.
  if !ret['rule'].to_s.empty? && ret['rule'].to_s != entry['rule'].to_s
    problems << "doc #{title.inspect} retention.rule #{ret['rule'].inspect} does not match meta.retentionSchedule[#{klass.inspect}].rule #{entry['rule'].inspect}"
  end
  if !ret['disposition'].to_s.empty? && ret['disposition'].to_s != entry['disposition'].to_s
    problems << "doc #{title.inspect} retention.disposition #{ret['disposition'].inspect} does not match meta.retentionSchedule[#{klass.inspect}].disposition #{entry['disposition'].inspect}"
  end

  # The hard safety interlock: a draft schedule may never yield a disposition date.
  if ret['status'].to_s != 'approved' && !doc['dispositionEligibleAfter'].nil?
    problems << "doc #{title.inspect} has dispositionEligibleAfter set while retention.status is #{ret['status'].inspect}; only an approved rule may carry a disposition date"
  end

  unless [true, false].include?(doc['legalHold'])
    problems << "doc #{title.inspect} legalHold must be true or false, got #{doc['legalHold'].inspect}"
  end

  problems
end

# supersedes / supersededBy must resolve, must not self-reference, and must be reciprocal.
def supersession_problems(documents)
  problems = []
  by_id = documents.to_h { |d| [d['id'].to_s, d] }

  documents.each do |doc|
    title = doc['title'].to_s
    { 'supersedes' => 'supersededBy', 'supersededBy' => 'supersedes' }.each do |field, inverse|
      target_id = doc[field].to_s
      next if target_id.empty?

      if target_id == doc['id'].to_s
        problems << "doc #{title.inspect} #{field} points at itself (#{target_id})"
        next
      end
      target = by_id[target_id]
      if target.nil?
        problems << "doc #{title.inspect} #{field} references #{target_id.inspect}, which is not a row in this register"
        next
      end
      unless target[inverse].to_s == doc['id'].to_s
        problems << "supersession chain is one-sided: #{title.inspect} (#{doc['id']}) has #{field}=#{target_id} but #{target['title'].inspect} has #{inverse}=#{target[inverse].inspect} (expected #{doc['id'].inspect})"
      end
    end

    if !doc['supersededBy'].to_s.empty? && doc['status'].to_s != 'superseded'
      problems << "doc #{title.inspect} has supersededBy set but status is #{doc['status'].inspect} (expected \"superseded\")"
    end
  end

  problems
end

# Tracked files under a repo prefix, via git so untracked local scratch never trips CI.
# Falls back to a glob if git is unavailable (undated scratch runs outside a checkout).
def tracked_files(prefix)
  out = `git ls-files -z -- #{prefix} 2>/dev/null`
  return out.split("\x00").reject(&:empty?) if $?.success? && !out.empty?

  Dir.glob(File.join(prefix, '**', '*')).select { |p| File.file?(p) }
end

# Register/reality drift in the "present but unregistered" direction. docs/legal/ is
# unambiguously the compliance corpus, so a gap there is a hard failure; .claude/agents/ also
# holds non-compliance agents, so that sweep is advisory (see collect_advisories).
def completeness_problems(documents)
  registered = documents.select { |d| d['canonicalSystem'].to_s == 'git' }
                        .map { |d| d['canonicalLocation'].to_s }.to_set
  tracked_files('docs/legal').reject { |f| registered.include?(f) }.sort.map do |f|
    "unregistered compliance document #{f} (every tracked file under docs/legal/ needs a register row; add one and re-render)"
  end
end

def collect_problems(documents, bundle_defs, schedule = {}, exemptions = [])
  problems = []

  documents.each do |doc|
    loc = doc['canonicalLocation'].to_s
    title = doc['title'].to_s
    sys = doc['canonicalSystem'].to_s

    exp = expected_id(doc)
    if doc['id'].to_s != exp
      problems << "id mismatch for #{title.inspect}: stored #{doc['id'].inspect}, expected #{exp.inspect} (run render to fix)"
    end

    unless %w[git drive notion].include?(sys)
      problems << "doc #{title.inspect} has invalid canonicalSystem #{sys.inspect} (expected git|drive|notion)"
    end

    if sys == 'git'
      # A git row must be a repo path (so its bytes are hashed and CI-verified), never a URL.
      problems << "git doc #{title.inspect} canonicalLocation looks like a URL, expected a repo path: #{loc}" if url_like?(loc)
      if !self_row?(doc) && !url_like?(loc)
        if !in_repo_file?(loc)
          # Honest git label: a real, tracked-shaped file inside the repo. Rejects missing
          # files, '..' traversal, symlinks, and paths resolving outside the working tree.
          problems << "git doc #{title.inspect} canonicalLocation must be a real file inside the repo (no '..', no symlink): #{loc}"
        else
          computed = Digest::SHA256.hexdigest(File.binread(loc))
          stored = doc['contentHash'].to_s
          if stored.empty?
            problems << "git doc #{title.inspect} has no contentHash (run render to populate): #{loc}"
          elsif stored != computed
            # Which advice is correct here depends on the FILE, not on the stored hash.
            #
            #   file bytes != attested bytes -> a real edit to an attested document. Rendering
            #     bumps contentHash and re-fails as "attested revision no longer exists" with a
            #     mutated register in the diff (PR #721). Revert, or re-attest.
            #   file bytes == attested bytes -> only the register row is stale (e.g. someone
            #     rendered, then reverted the file). Nothing is owed; render reconciles it.
            #
            # Compare against the PIN, never against `stored`: in that second state `stored` is
            # the bumped hash, so reporting it would claim the attestation covers bytes it never
            # covered and would contradict the attestation message printed alongside it.
            pin = doc.dig('attestation', 'attestedContentHash').to_s
            if attested?(doc) && pin.match?(SHA256_RE) && computed != pin
              problems << "contentHash drift on the ATTESTED row #{title.inspect}: #{loc} no longer matches the bytes attested on #{doc.dig('attestation', 'attestedDate')} (attested #{pin[0, 12]}, file is now #{computed[0, 12]}). Do NOT run render to clear this - it will bump contentHash and re-fail as \"attested revision no longer exists\". Either revert your change to this file, or (Scot only) re-attest via /re-attest-record; per the \"Attestation freezes the artifact\" rule in docs/legal/README.md, supersession is the default for docs/legal/**"
            else
              problems << "contentHash drift for #{title.inspect}: #{loc} changed but its register row was not updated (run render)"
            end
          end
        end
      end
    elsif sys == 'drive' || sys == 'notion'
      # Close the mislabel dodge: a tracked repo doc cannot escape hash verification by
      # being relabeled drive/notion. Non-git rows must be URLs and must NOT resolve to a
      # tracked repo file.
      if !url_like?(loc)
        problems << "#{sys} doc #{title.inspect} canonicalLocation must be a URL, not #{loc.inspect} (a tracked repo path must be a git row so its contentHash is verified)"
        problems << "#{sys} doc #{title.inspect} resolves to a tracked repo file (#{loc}); set canonicalSystem=git so its contentHash is verified" if File.file?(loc)
      elsif !allowed_external_host?(sys, host_of(loc))
        # Closes the self-referential-URL dodge: a github.com/raw blob of an in-repo file
        # would pass the must-be-URL check while still pointing at tracked content.
        problems << "#{sys} doc #{title.inspect} URL host #{host_of(loc).inspect} is not a valid #{sys} host (a tracked repo file must be a git row; only #{sys == 'drive' ? DRIVE_HOSTS.join('/') : NOTION_HOSTS.join('/') + '/*.notion.site'} are allowed)"
      end
    end

    # driveFileId: stable id required on drive rows, forbidden elsewhere, and it must be the id
    # actually embedded in the URL so the two can never disagree.
    if sys == 'drive'
      stored = doc['driveFileId'].to_s
      embedded = drive_id_in(loc).to_s
      if stored.empty?
        problems << "drive doc #{title.inspect} has no driveFileId (Drive ids survive renames and moves; path-shaped URLs do not)"
      elsif embedded.empty?
        problems << "drive doc #{title.inspect} has driveFileId #{stored.inspect} but no id could be parsed from its canonicalLocation: #{loc}"
      elsif stored != embedded
        problems << "drive doc #{title.inspect} driveFileId #{stored.inspect} does not match the id in its canonicalLocation (#{embedded.inspect})"
      end
    elsif !doc['driveFileId'].to_s.empty?
      problems << "#{sys} doc #{title.inspect} carries a driveFileId (#{doc['driveFileId'].inspect}); only drive rows may have one"
    end

    problems.concat(retention_problems(doc, schedule))

    (doc['bundles'] || []).each do |b|
      problems << "doc #{title.inspect} references undefined bundle #{b.inspect}" unless bundle_defs.key?(b)
    end
  end

  problems.concat(supersession_problems(documents))
  problems.concat(completeness_problems(documents))
  problems.concat(attestation_problems(documents, exemptions))
  problems.concat(attestation_exemption_problems(documents, exemptions))

  # id + canonicalLocation must be unique: a duplicate canonicalLocation collides ids
  # (sha256 of the same string) and silently overwrites a row in the Notion upsert.
  %w[id canonicalLocation].each do |field|
    seen = Hash.new(0)
    documents.each { |d| seen[d[field].to_s] += 1 unless d[field].to_s.empty? }
    seen.select { |_, n| n > 1 }.each_key do |val|
      problems << "duplicate #{field} #{val.inspect} (#{seen[val]} rows) - each document must be a single row"
    end
  end

  bundle_defs.each do |name, defn|
    members = documents.select { |d| (d['bundles'] || []).include?(name) }

    # gaps name artifacts that do NOT exist yet. They are rendered, never satisfied, and never
    # fail the build - the whole point is that an honest hole beats an invented row. Only the
    # shape is enforced here.
    gaps = defn['gaps']
    if !gaps.nil?
      if !gaps.is_a?(Array)
        problems << "bundle #{name.inspect} gaps must be an array of strings, got #{gaps.class}"
      elsif gaps.any? { |g| !g.is_a?(String) || g.strip.empty? }
        problems << "bundle #{name.inspect} gaps must contain only non-empty strings"
      end
    end

    (defn['requiredDocs'] || []).each do |req|
      loc = req['location'].to_s
      member = bundle_member_for(members, loc)
      if member.nil?
        problems << "bundle #{name.inspect} is missing required member #{req['title'].inspect} (#{loc})"
      elsif req['title'] && !member['title'].to_s.casecmp?(req['title'].to_s)
        problems << "bundle #{name.inspect} requirement #{loc} expects title #{req['title'].inspect} but its member is titled #{member['title'].inspect} (register drift; reconcile)"
      end
    end
  end

  problems
end

# Advisory-only signals (never fail CI): drive/notion rows missing a supplied hash.
# Honest about the refresh path: Notion hashes auto-refresh in the sync run; Drive hashes
# have no automated refresh (the sync script carries no Google credentials) and must be
# supplied by the operator.
def collect_advisories(documents)
  documents.reject { |d| d['canonicalSystem'].to_s == 'git' }
           .select { |d| d['contentHash'].to_s.empty? }
           .map do |d|
             refresh = d['canonicalSystem'].to_s == 'notion' ? 'auto-refreshed by the Notion-sync run' : 'must be supplied by the operator (no automated Drive refresh)'
             "no supplied contentHash for #{d['canonicalSystem']} doc #{d['title'].inspect} (#{refresh})"
           end
end

# Soft signals: real, worth surfacing, never a CI failure.
#   - staleness: a review date that has passed (anchored to generatedDate, not Date.today)
#   - unregistered agent configs (.claude/agents also holds non-compliance agents)
#   - retention classes defined in the schedule with no rows using them (an intentional gap
#     today: no current record carries a delete disposition)
def collect_soft_signals(documents, schedule, generated_date, exemptions = [])
  out = []

  # The grandfather list is a debt register, not a clean bill of health: surface it every run so
  # it stays visible until it reaches zero.
  exempt_ids = exemption_ids(exemptions)
  unless exempt_ids.empty?
    titles = documents.select { |d| exempt_ids.include?(d['id'].to_s) }
                      .map { |d| d['title'].to_s }.sort
    out << "#{exempt_ids.size} attested row(s) are grandfathered on meta.attestationBackfillExemptions and pin no attested hash - re-attestation owed (only Scot attests): #{titles.join('; ')}"
  end

  overdue = documents.select do |d|
    due = (Date.parse(d['nextReviewDue'].to_s) rescue nil)
    due && due < generated_date && !%w[superseded archived].include?(d['status'].to_s)
  end
  overdue.sort_by { |d| d['nextReviewDue'].to_s }.each do |d|
    out << "review overdue: #{d['title'].inspect} was due #{d['nextReviewDue']}"
  end

  registered = documents.select { |d| d['canonicalSystem'].to_s == 'git' }
                        .map { |d| d['canonicalLocation'].to_s }.to_set
  tracked_files('.claude/agents').reject { |f| registered.include?(f) }.sort.each do |f|
    out << "unregistered agent config #{f} (advisory: .claude/agents also holds non-compliance agents)"
  end

  used = documents.map { |d| d.dig('retention', 'class').to_s }.to_set
  (schedule.keys - used.to_a).sort.each do |k|
    out << "retention class #{k.inspect} is defined in meta.retentionSchedule but no row uses it (gap, not an error)"
  end

  ambiguous = documents.select { |d| d.dig('retention', 'ambiguous') }
  unless ambiguous.empty?
    out << "#{ambiguous.size} row(s) have an inferred retention class flagged retention.ambiguous - review these with counsel first"
  end

  held = documents.select { |d| d['legalHold'] == true }
  out << "#{held.size} row(s) are under legal hold; all disposition is suspended for them" unless held.empty?

  out
end

# ---- markdown render -------------------------------------------------------------

TYPE_ORDER = %w[policy legal evidence audit-artifact runbook template agent-config].freeze
SYSTEM_LABEL = { 'git' => 'git', 'drive' => 'Drive', 'notion' => 'Notion' }.freeze

def loc_cell(doc)
  loc = doc['canonicalLocation'].to_s
  case doc['canonicalSystem'].to_s
  when 'git' then "`#{loc}`"
  else "[open](#{loc})"
  end
end

def hash_cell(doc)
  if doc['canonicalSystem'].to_s == 'git'
    h = doc['contentHash'].to_s
    h.empty? ? '(self)' : "`#{h[0, 12]}`"
  else
    doc['contentHash'].to_s.empty? ? '(supplied)' : "`#{doc['contentHash'].to_s[0, 12]}`"
  end
end

def esc(str)
  str.to_s.gsub('|', '\\|')
end

def render_markdown(register, generated, generated_date)
  meta = register['meta'] || {}
  documents = register['documents'] || []
  bundle_defs = meta['bundleDefinitions'] || {}

  by_system = documents.group_by { |d| d['canonicalSystem'].to_s }
  counts_sys = %w[git drive notion].map { |s| "#{s} #{(by_system[s] || []).size}" }.join(' / ')

  status_counts = Hash.new(0)
  documents.each { |d| status_counts[d['status'].to_s] += 1 }
  status_line = %w[draft approved published superseded archived]
                .select { |s| status_counts[s].positive? }
                .map { |s| "#{s} #{status_counts[s]}" }.join(', ')

  overdue = documents.select do |d|
    due = (Date.parse(d['nextReviewDue']) rescue nil)
    due && due < generated_date && d['status'].to_s != 'superseded' && d['status'].to_s != 'archived'
  end
  drafts = documents.select { |d| d['status'].to_s == 'draft' }

  out = +''
  out << "# LingoLinq-AAC Compliance Document Register\n\n"
  out << "> Generated from `audit-reports/DOCUMENT-REGISTER.json` by `scripts/document-register-render.rb`.\n"
  out << "> Do not hand-edit; edit the JSON (the source of truth) and re-render.\n"
  out << "> The codebase copy is canonical; the Notion board is a one-way mirror; Drive docs are linked, never copied.\n"
  out << ">\n"
  out << "> Generated: #{generated} | Documents: #{documents.size} (#{counts_sys})\n\n"

  out << "## Headline\n\n"
  out << "- **Status:** #{status_line}\n"
  if overdue.empty?
    out << "- **Overdue for review** (as of #{generated}): none\n"
  else
    out << "- **Overdue for review** (as of #{generated}): " +
           overdue.map { |d| "#{esc(d['title'])} (#{d['nextReviewDue']})" }.join('; ') + "\n"
  end
  if drafts.empty?
    out << "- **Drafts awaiting attestation:** none\n"
  else
    out << "- **Drafts awaiting attestation:** " + drafts.map { |d| esc(d['title']) }.join('; ') + "\n"
  end
  out << "\n"

  out << "## Documents by type\n\n"
  ordered_types = TYPE_ORDER + (documents.map { |d| d['type'].to_s }.uniq - TYPE_ORDER)
  ordered_types.each do |type|
    group = documents.select { |d| d['type'].to_s == type }
    next if group.empty?

    group = group.sort_by { |d| d['title'].to_s.downcase }
    out << "### #{type} (#{group.size})\n\n"
    out << "| Title | System | Canonical location | Status | Frameworks | Owner | Last reviewed | Next due | Attested | Hash | Bundles |\n"
    out << "|---|---|---|---|---|---|---|---|---|---|---|\n"
    group.each do |d|
      att = attested?(d) ? d['attestation']['attestedDate'].to_s : 'no'
      fw = (d['frameworks'] || []).join(', ')
      bundles = (d['bundles'] || []).join(', ')
      out << "| #{esc(d['title'])} | #{SYSTEM_LABEL[d['canonicalSystem'].to_s] || d['canonicalSystem']} | #{loc_cell(d)} | #{d['status']} | #{fw} | #{esc(d['owner'])} | #{d['lastReviewed']} | #{d['nextReviewDue']} | #{att} | #{hash_cell(d)} | #{esc(bundles)} |\n"
    end
    out << "\n"
  end

  out << "## Bundles\n\n"
  if bundle_defs.empty?
    out << "_No bundles defined._\n\n"
  else
    bundle_defs.each do |name, defn|
      members = documents.select { |d| (d['bundles'] || []).include?(name) }.sort_by { |d| d['title'].to_s.downcase }
      required = defn['requiredDocs'] || []
      missing = required.reject { |req| bundle_member_for(members, req['location']) }.map { |req| req['title'] }

      out << "### #{name}\n\n"
      out << "#{defn['description']}\n\n" if defn['description']
      out << "- **Members (#{members.size}):** " + (members.empty? ? '(none)' : members.map { |m| esc(m['title']) }.join('; ')) + "\n"
      # Tolerate a malformed gaps value here: collect_problems already reports the shape error,
      # and the render must not die before those problems reach the operator.
      gaps = defn['gaps'].is_a?(Array) ? defn['gaps'] : []

      # Deliberately NOT labelled "Completeness". Every requiredDoc resolving is a much weaker
      # claim than the bundle being complete, and a bundle can pass this check while recording
      # gaps immediately below. Conflating the two would let a reader take a bundle with six
      # missing artifacts as ready to send.
      required_state = if !missing.empty?
                         "FAILING - missing required member(s): #{missing.join('; ')}"
                       elsif gaps.empty?
                         'passing'
                       else
                         "passing, but #{gaps.size} known gap(s) recorded below - this bundle is NOT complete"
                       end
      out << "- **Required member check:** #{required_state}\n"
      if gaps.empty?
        out << "- **Known gaps:** none recorded\n\n"
      else
        out << "- **Known gaps (#{gaps.size}) - artifacts this bundle needs that do not exist yet:**\n"
        gaps.each { |g| out << "  - #{esc(g)}\n" }
        out << "\n"
      end
    end
  end

  # ---- retention (DRAFT, inert) ----------------------------------------------------
  schedule = meta['retentionSchedule'] || {}
  out << "## Retention (draft, inert)\n\n"
  out << "> Every rule below is `status: draft`. No deletion behaviour is wired anywhere in this repo,\n"
  out << "> and `dispositionEligibleAfter` is held at null until a rule is explicitly approved.\n"
  out << "> Only Scot moves a retention rule to approved, and only after counsel review.\n\n"
  if schedule.empty?
    out << "_No retention schedule defined._\n\n"
  else
    out << "| Class | Rule | Trigger | Disposition | Rows |\n"
    out << "|---|---|---|---|---|\n"
    schedule.each do |klass, entry|
      n = documents.count { |d| d.dig('retention', 'class').to_s == klass }
      out << "| `#{klass}` | #{esc(entry['rule'])} | #{esc(entry['trigger'])} | #{entry['disposition']} | #{n} |\n"
    end
    out << "\n"

    ambiguous = documents.select { |d| d.dig('retention', 'ambiguous') }
                         .sort_by { |d| d['title'].to_s.downcase }
    if ambiguous.empty?
      out << "**Inferred classes needing counsel review:** none\n\n"
    else
      out << "**Inferred classes needing counsel review (#{ambiguous.size}):** these were derived from type and\n"
      out << "status rather than read off the drafted schedule, and are the rows to look at first.\n\n"
      out << "| Title | Class | Why it is ambiguous |\n"
      out << "|---|---|---|\n"
      ambiguous.each do |d|
        out << "| #{esc(d['title'])} | `#{d.dig('retention', 'class')}` | #{esc(d.dig('retention', 'ambiguityNote'))} |\n"
      end
      out << "\n"
    end

    held = documents.select { |d| d['legalHold'] == true }
    out << "**Legal holds:** " +
           (held.empty? ? 'none active' : held.map { |d| esc(d['title']) }.join('; ')) + "\n\n"
  end

  # ---- attestation integrity -------------------------------------------------------
  exemptions = meta['attestationBackfillExemptions'] || []
  exempt_by_id = exemptions.is_a?(Array) ? exemptions.select { |e| e.is_a?(Hash) }.to_h { |e| [e['id'].to_s, e] } : {}
  attested_git = documents.select { |d| d['canonicalSystem'].to_s == 'git' && attested?(d) }
                          .sort_by { |d| d['title'].to_s.downcase }
  out << "## Attestation integrity\n\n"
  if attested_git.empty?
    out << "_No attested git records._\n\n"
  else
    out << "`attestation.attestedContentHash` pins the bytes Scot actually attested. `--check` fails when a\n"
    out << "pinned hash stops matching the file, so an attested document can no longer be rewritten with a\n"
    out << "green build. Verified for git rows only; Drive and Notion hashes are operator-supplied.\n\n"
    out << "| Record | Attested | Pinned bytes | State |\n"
    out << "|---|---|---|---|\n"
    attested_git.each do |d|
      pinned = d.dig('attestation', 'attestedContentHash').to_s
      state = if !pinned.empty?
                pinned == d['contentHash'].to_s ? 'verified' : 'MISMATCH - re-attestation owed'
              elsif exempt_by_id.key?(d['id'].to_s)
                'grandfathered - re-attestation owed'
              else
                'unpinned'
              end
      out << "| #{esc(d['title'])} | #{d.dig('attestation', 'attestedDate')} | #{pinned.empty? ? '(none)' : "`#{pinned[0, 12]}`"} | #{state} |\n"
    end
    out << "\n"

    if exempt_by_id.empty?
      out << "**Grandfathered rows:** none. Every attested git record pins the bytes it was attested against.\n\n"
    else
      out << "**Grandfathered rows (#{exempt_by_id.size}) - attested before this check existed, hash deliberately not\n"
      out << "backfilled.** Pinning the current bytes would silently re-assert an attestation that covered an\n"
      out << "earlier revision, which is the exact failure the field exists to catch. Each entry is removed when\n"
      out << "Scot re-attests; the list only shrinks.\n\n"
      out << "| Record | Why it is exempt | Added |\n"
      out << "|---|---|---|\n"
      exempt_by_id.each do |id, ex|
        d = documents.find { |x| x['id'].to_s == id }
        out << "| #{esc(d ? d['title'] : id)} | #{esc(ex['reason'])} | #{ex['addedOn']} |\n"
      end
      out << "\n"
    end
  end

  # ---- supersession chains ---------------------------------------------------------
  chains = documents.select { |d| !d['supersededBy'].to_s.empty? }
                    .sort_by { |d| d['title'].to_s.downcase }
  out << "## Supersession chains\n\n"
  if chains.empty?
    out << "_No superseded records._\n\n"
  else
    by_id = documents.to_h { |d| [d['id'].to_s, d] }
    out << "Attestation freezes bytes: a superseded record keeps its row, its title, and its membership in any\n"
    out << "frozen point-in-time binder. Only the pointer is added.\n\n"
    out << "| Superseded record | Replaced by | Still bundled in |\n"
    out << "|---|---|---|\n"
    chains.each do |d|
      succ = by_id[d['supersededBy'].to_s]
      bundles = (d['bundles'] || []).join(', ')
      out << "| #{esc(d['title'])} (`#{d['id']}`) | #{esc(succ ? succ['title'] : '(unresolved)')} (`#{d['supersededBy']}`) | #{esc(bundles.empty? ? '(none)' : bundles)} |\n"
    end
    out << "\n"
  end

  out << "---\n\n"
  out << "_#{documents.size} documents. Re-run `ruby scripts/document-register-render.rb --check` to validate ids, git content hashes, and bundle completeness._\n"
  out
end

# ---- modes -----------------------------------------------------------------------

# Derived from the register's own filename rather than hard-coded, so a scratch or test register
# renders beside itself instead of comparing against (and overwriting) the real DOCUMENT-REGISTER.md.
# For the default path this resolves to exactly audit-reports/DOCUMENT-REGISTER.md as before.
md_path = register_path.sub(/\.json\z/, '') + '.md'

schedule = meta['retentionSchedule'] || {}
exemptions = meta['attestationBackfillExemptions'] || []

if options[:mode] == :check
  problems = collect_problems(documents, bundle_defs, schedule, exemptions)
  advisories = collect_advisories(documents)
  soft = collect_soft_signals(documents, schedule, generated_date, exemptions)

  rendered = render_markdown(register, generated, generated_date)
  if !File.file?(md_path)
    problems << "missing render #{md_path} (run document-register-render.rb)"
  elsif File.read(md_path) != rendered
    problems << "render drift: #{md_path} does not match the JSON (run document-register-render.rb)"
  end

  unless advisories.empty?
    drive_n = documents.count { |d| d['canonicalSystem'].to_s == 'drive' && d['contentHash'].to_s.empty? }
    notion_n = advisories.size - drive_n
    warn "  [advisory] #{advisories.size} non-git rows have no supplied contentHash (#{notion_n} notion: auto-refreshable via --refresh-notion-hashes; #{drive_n} drive: operator-supplied, no automated refresh)"
  end
  soft.each { |s| warn "  [advisory] #{s}" }

  if problems.empty?
    puts "document-register-render: OK (#{documents.size} docs; ids, git hashes, render, bundles, retention shape, supersession chains, attested-byte pins, and docs/legal completeness all consistent)"
    exit 0
  end
  warn 'document-register-render: DRIFT'
  problems.each { |p| warn "  [FAIL] #{p}" }
  exit 1
end

# render mode: normalize the JSON (id + git contentHash) in place, then write the .md.
# Note what is deliberately absent: attestation.attestedContentHash is NEVER written here. Render
# recomputes contentHash from current bytes, so backfilling the attested hash in the same pass
# would make every attestation self-certifying and the check worthless. Pinning is a human act
# recorded alongside the attestation itself.
documents.each do |doc|
  doc['id'] = expected_id(doc)
  if git_row?(doc) && !self_row?(doc)
    h = git_content_hash(doc)
    doc['contentHash'] = h if h
  end
end

File.write(register_path, JSON.pretty_generate(register) + "\n")
File.write(md_path, render_markdown(register, generated, generated_date))
puts "document-register-render: normalized #{register_path} and wrote #{md_path} (#{documents.size} docs)"

advisories = collect_advisories(documents)
unless advisories.empty?
  drive_n = documents.count { |d| d['canonicalSystem'].to_s == 'drive' && d['contentHash'].to_s.empty? }
  notion_n = advisories.size - drive_n
  puts "  note: #{advisories.size} non-git rows have no supplied contentHash (#{notion_n} notion: auto-refreshable; #{drive_n} drive: operator-supplied, no automated refresh)"
end

collect_soft_signals(documents, schedule, generated_date, exemptions).each { |s| puts "  note: #{s}" }

# Surface hard problems even in render mode (e.g. a dangling git path render can't fix).
problems = collect_problems(documents, bundle_defs, schedule, exemptions)
unless problems.empty?
  warn 'document-register-render: remaining issues after render:'
  problems.each { |p| warn "  [FAIL] #{p}" }
  exit 1
end
