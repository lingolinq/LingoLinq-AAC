#!/usr/bin/env ruby
# frozen_string_literal: true
#
# document-register-notion-sync.rb
# One-way sync: the compliance document register (audit-reports/DOCUMENT-REGISTER.json, the
# SSOT) -> a Notion database that mirrors it for board-style viewing by the team. The register
# is authoritative; this script never reads decisions back FROM Notion. Run it after any
# register change (or on a cron) so the Notion board never drifts from git.
#
# It is the document-level sibling of compliance-findings-notion-sync.rb. Idempotent: each row
# is keyed by its DOC-id (the Notion "Doc ID" title). Existing rows are PATCHed, missing rows
# created, and rows whose document has vanished from the register are archived (with --prune).
#
# Setup (one-time, done by Scot):
#   1. Reuse the "COMPLIANCE API" Notion integration secret (NOTION_TOKEN; in 1Password).
#   2. Create a Notion database "LingoLinq Compliance Documents (LL)" with the schema below and
#      share it with that integration. Export its 32-char id from the URL.
#   3. Set NOTION_DOCS_DB_ID to that id.
#
# Usage:
#   NOTION_TOKEN=secret_xxx NOTION_DOCS_DB_ID=<dbid> ruby scripts/document-register-notion-sync.rb [--prune] [--dry-run]
#   ruby scripts/document-register-notion-sync.rb --refresh-notion-hashes   # update notion-row contentHash in the JSON (token required), no DB write
#
# Schema expected on the Notion DB (created once via MCP or by hand):
#   Doc ID (title), Title (rich_text), Type (select), System (select), Owner (rich_text),
#   Canonical location (rich_text), Status (select), Frameworks (multi_select),
#   Bundles (multi_select), Last reviewed (date), Next due (date), Attested (rich_text),
#   Content hash (rich_text), Readable copy (rich_text; renamed from "Mirrors" 2026-06-21
#   for non-dev clarity - holds the human-readable Drive/Notion copy of a git-canonical doc).
#
# Select-property note: Type/System/Status (select) and Frameworks/Bundles (multi_select) are
# sent as plain option names; Notion auto-creates a missing option on write. Leave option
# creation ENABLED on those properties (the default). If a DB owner locks options, a new
# type/framework/bundle value will 400 the create/PATCH and abort the run mid-loop (the prune
# step is gated after the loop, so a partial run never false-archives).
#
# Split ownership (so non-devs can use the board without the sync clobbering them): this script
# ONLY writes the register-owned columns above. Columns reserved for humans - "Program notes",
# "Needs Scot decision" (and any future ones) - are never sent, so the team can annotate the
# board directly. Do NOT add human-owned columns to properties_for.
#
# Compliance content: Tier 2 (PII-free register: titles, paths/URLs, hashes only), so nothing
# identifiable reaches Notion or any approved reviewer.
#
# contentHash refresh: CI is network-free and cannot hash Drive/Notion docs, so that happens
# here. --refresh-notion-hashes fetches each notion-canonical page's text via the Notion API,
# writes sha256 back into the JSON, and you re-render + commit. Drive-doc hashing needs Google
# creds this script does not carry; those hashes are supplied by the main session's Drive MCP.

require 'json'
require 'digest'
require 'net/http'
require 'uri'
require_relative 'notion_rich_text'

TOKEN   = ENV['NOTION_TOKEN']
DB_ID   = ENV['NOTION_DOCS_DB_ID']
PRUNE   = ARGV.include?('--prune')
DRY_RUN = ARGV.include?('--dry-run')
REFRESH_NOTION_HASHES = ARGV.include?('--refresh-notion-hashes')
NOTION_VERSION = '2022-06-28'

REGISTER_PATH = File.join(__dir__, '..', 'audit-reports', 'DOCUMENT-REGISTER.json')
register = JSON.parse(File.read(REGISTER_PATH))
documents = register['documents'] || []

def rich(text)
  NotionRichText.rich(text)
end

# Like rich, but when the value is an http(s) URL (e.g. a Drive or Notion
# canonicalLocation) it attaches a Notion link annotation so the cell is
# clickable in the board. Non-URL values (git repo paths) stay plain text.
def rich_link(text)
  t = text.to_s
  return [] if t.empty?
  return rich(t) unless t.start_with?('http://', 'https://')

  [{ 'text' => { 'content' => t[0, 1900], 'link' => { 'url' => t } } }]
end

def cap(s)
  s = s.to_s
  s.empty? ? s : s[0].upcase + s[1..].to_s
end

# The mirror must not read cleaner than the register. An attested git row only means "these bytes
# were attested" when attestation.attestedContentHash pins them and still matches contentHash;
# otherwise the file has moved since and re-attestation is owed (see meta.attestationHashNote).
def attested_str(doc)
  att = doc['attestation']
  return '' unless att.is_a?(Hash) && !att['attestedBy'].to_s.empty?

  base = "#{att['attestedBy']} #{att['attestedDate']}".strip
  return base unless doc['canonicalSystem'].to_s == 'git'

  pinned = att['attestedContentHash'].to_s
  return base if !pinned.empty? && pinned == doc['contentHash'].to_s

  "#{base} (re-attestation owed: attested bytes not pinned or no longer current)"
end

def mirrors_str(doc)
  (doc['mirrors'] || []).map { |m| "#{m['system']}: #{m['location']}" }.join("\n")
end

def date_prop(value)
  v = value.to_s
  v.empty? ? { 'date' => nil } : { 'date' => { 'start' => v } }
end

def properties_for(doc)
  {
    'Doc ID'             => { 'title' => [{ 'text' => { 'content' => doc['id'].to_s } }] },
    'Title'              => { 'rich_text' => rich(doc['title']) },
    'Type'               => { 'select' => { 'name' => doc['type'].to_s } },
    'System'             => { 'select' => { 'name' => cap(doc['canonicalSystem']) } },
    'Owner'              => { 'rich_text' => rich(doc['owner']) },
    'Canonical location' => { 'rich_text' => rich_link(doc['canonicalLocation']) },
    'Status'             => { 'select' => { 'name' => doc['status'].to_s } },
    'Frameworks'         => { 'multi_select' => (doc['frameworks'] || []).map { |x| { 'name' => x } } },
    'Bundles'            => { 'multi_select' => (doc['bundles'] || []).map { |x| { 'name' => x } } },
    'Last reviewed'      => date_prop(doc['lastReviewed']),
    'Next due'           => date_prop(doc['nextReviewDue']),
    'Attested'           => { 'rich_text' => rich(attested_str(doc)) },
    'Content hash'       => { 'rich_text' => rich(doc['contentHash'].to_s[0, 16]) },
    'Readable copy'      => { 'rich_text' => rich(mirrors_str(doc)) }
  }
end

def http
  @http ||= begin
    h = Net::HTTP.new('api.notion.com', 443)
    h.use_ssl = true
    h
  end
end

def api(method, path, body = nil)
  req = case method
        when :post  then Net::HTTP::Post.new(path)
        when :patch then Net::HTTP::Patch.new(path)
        else Net::HTTP::Get.new(path)
        end
  req['Authorization'] = "Bearer #{TOKEN}"
  req['Notion-Version'] = NOTION_VERSION
  req['Content-Type'] = 'application/json'
  req.body = JSON.generate(body) if body
  res = http.request(req)
  raise "Notion API #{res.code}: #{res.body}" unless res.code.to_i.between?(200, 299)

  JSON.parse(res.body)
end

# --- optional: refresh notion-canonical rows' contentHash from live page text ---------------
# Fetch a page's block children and concatenate their plain text, then sha256 it. This is a
# stable-enough fingerprint to detect "the page changed" without storing any content.
def notion_page_text(page_id)
  text = +''
  cursor = nil
  loop do
    path = "/v1/blocks/#{page_id}/children?page_size=100"
    path += "&start_cursor=#{cursor}" if cursor
    data = api(:get, path)
    (data['results'] || []).each do |b|
      type = b['type']
      rt = b.dig(type, 'rich_text')
      text << rt.map { |t| t['plain_text'] }.join if rt.is_a?(Array)
      text << "\n"
    end
    break unless data['has_more']

    cursor = data['next_cursor']
  end
  text
end

def page_id_from_url(url)
  # Notion page ids are the trailing 32 hex chars of the URL (with or without dashes).
  m = url.to_s.gsub('-', '').scan(/[0-9a-fA-F]{32}/).last
  m
end

if REFRESH_NOTION_HASHES
  abort 'Set NOTION_TOKEN to refresh notion hashes.' if TOKEN.nil? || TOKEN.empty?

  changed = 0
  documents.each do |doc|
    next unless doc['canonicalSystem'].to_s == 'notion'

    pid = page_id_from_url(doc['canonicalLocation'])
    next unless pid

    begin
      h = Digest::SHA256.hexdigest(notion_page_text(pid))
    rescue StandardError => e
      warn "  skip #{doc['id']} (#{doc['title']}): #{e.message}"
      next
    end
    if doc['contentHash'].to_s != h
      doc['contentHash'] = h
      changed += 1
    end
  end
  File.write(REGISTER_PATH, JSON.pretty_generate(register) + "\n")
  puts "Refreshed notion contentHashes: #{changed} updated. Re-run document-register-render.rb and commit."
  exit 0
end

abort 'Set NOTION_TOKEN (Notion internal integration secret).' if !DRY_RUN && (TOKEN.nil? || TOKEN.empty?)
abort 'Set NOTION_DOCS_DB_ID (the documents mirror database id).' if !DRY_RUN && (DB_ID.nil? || DB_ID.empty?)

# Guard: an unrendered register (missing ids) would create rows with empty titles.
missing_ids = documents.count { |d| d['id'].to_s.empty? }
abort "#{missing_ids} documents have no id - run scripts/document-register-render.rb first." if missing_ids.positive?

def existing_rows
  rows = {}
  cursor = nil
  loop do
    body = { 'page_size' => 100 }
    body['start_cursor'] = cursor if cursor
    data = api(:post, "/v1/databases/#{DB_ID}/query", body)
    (data['results'] || []).each do |p|
      title = (p.dig('properties', 'Doc ID', 'title') || []).map { |t| t['plain_text'] }.join
      rows[title] = p['id'] unless title.empty?
    end
    break unless data['has_more']

    cursor = data['next_cursor']
  end
  rows
end

if DRY_RUN
  puts "[dry-run] would sync #{documents.size} documents to Notion DB #{DB_ID || '(unset)'}"
  documents.first(3).each { |d| puts "  e.g. #{d['id']} #{d['canonicalSystem']}/#{d['status']} - #{d['title']}" }
  exit 0
end

existing = existing_rows
created = updated = 0
seen = []

documents.each do |doc|
  props = properties_for(doc)
  seen << doc['id']
  if (page_id = existing[doc['id']])
    api(:patch, "/v1/pages/#{page_id}", { 'properties' => props })
    updated += 1
  else
    api(:post, '/v1/pages', { 'parent' => { 'database_id' => DB_ID }, 'properties' => props })
    created += 1
  end
end

pruned = 0
if PRUNE
  (existing.keys - seen).each do |stale_id|
    api(:patch, "/v1/pages/#{existing[stale_id]}", { 'archived' => true })
    pruned += 1
  end
end

puts "Synced #{documents.size} documents -> Notion: #{created} created, #{updated} updated#{PRUNE ? ", #{pruned} archived" : ''}."
