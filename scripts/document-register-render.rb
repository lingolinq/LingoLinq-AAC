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

# Compute the canonical content hash for a git row, or nil if the file is missing / exempt.
def git_content_hash(doc)
  return nil if self_row?(doc)

  path = doc['canonicalLocation'].to_s
  return nil unless File.file?(path)

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

def collect_problems(documents, bundle_defs)
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
        if !File.file?(loc)
          problems << "git doc #{title.inspect} points at a missing file: #{loc}"
        else
          computed = Digest::SHA256.hexdigest(File.binread(loc))
          stored = doc['contentHash'].to_s
          if stored.empty?
            problems << "git doc #{title.inspect} has no contentHash (run render to populate): #{loc}"
          elsif stored != computed
            problems << "contentHash drift for #{title.inspect}: #{loc} changed but its register row was not updated (run render)"
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

    (doc['bundles'] || []).each do |b|
      problems << "doc #{title.inspect} references undefined bundle #{b.inspect}" unless bundle_defs.key?(b)
    end
  end

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
      out << "- **Completeness:** " + (missing.empty? ? 'complete' : "MISSING required member(s): #{missing.join('; ')}") + "\n\n"
    end
  end

  out << "---\n\n"
  out << "_#{documents.size} documents. Re-run `ruby scripts/document-register-render.rb --check` to validate ids, git content hashes, and bundle completeness._\n"
  out
end

# ---- modes -----------------------------------------------------------------------

md_path = File.join(File.dirname(register_path), 'DOCUMENT-REGISTER.md')

if options[:mode] == :check
  problems = collect_problems(documents, bundle_defs)
  advisories = collect_advisories(documents)

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

  if problems.empty?
    puts "document-register-render: OK (#{documents.size} docs; ids, git hashes, render, and bundles all consistent)"
    exit 0
  end
  warn 'document-register-render: DRIFT'
  problems.each { |p| warn "  [FAIL] #{p}" }
  exit 1
end

# render mode: normalize the JSON (id + git contentHash) in place, then write the .md.
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

# Surface hard problems even in render mode (e.g. a dangling git path render can't fix).
problems = collect_problems(documents, bundle_defs)
unless problems.empty?
  warn 'document-register-render: remaining issues after render:'
  problems.each { |p| warn "  [FAIL] #{p}" }
  exit 1
end
