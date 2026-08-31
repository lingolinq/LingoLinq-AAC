#!/usr/bin/env ruby
# frozen_string_literal: true
#
# compliance-findings-notion-sync.rb
# One-way sync: the findings register (audit-reports/FINDINGS.json, the SSOT) -> a Notion
# database that mirrors it for board-style viewing. The register is authoritative; this
# script never reads decisions back FROM Notion. Run it after any register change (or on a
# cron) so the Notion board never drifts from code.
#
# It is idempotent: each finding row is keyed by its LL-id (the Notion "ID" title). Existing
# rows are PATCHed, missing rows are created, and rows whose finding has vanished from the
# register are archived (with --prune).
#
# Setup (one-time, done by Scot):
#   1. Create a Notion internal integration (https://www.notion.so/my-integrations),
#      copy its secret. Store it in 1Password (do NOT commit it).
#   2. Share the "LingoLinq Compliance Findings (LL)" database with that integration.
#   3. Export the DB's id (the 32-char id from its URL).
#      The seeded mirror is at https://app.notion.com/p/1f8451c4a17b4f5b868878ac4386b805
#      so NOTION_FINDINGS_DB_ID=1f8451c4a17b4f5b868878ac4386b805 (data-source collection
#      id a52a3fd5-168c-4208-8270-26dc7de0f9f8). The title property is "Finding ID".
#
# Usage:
#   NOTION_TOKEN=secret_xxx NOTION_FINDINGS_DB_ID=<dbid> ruby scripts/compliance-findings-notion-sync.rb [--prune] [--dry-run]
#
# Schema expected on the Notion DB (created once via MCP or by hand):
#   Finding ID (title), Severity (select), Status (select), Disposition (select), Title (rich_text),
#   Frameworks (multi_select), Rule key (rich_text), First seen (date), Last seen (date),
#   Closed/decided by (rich_text), PRs (rich_text), Closure SHA (rich_text),
#   Evidence (rich_text), Remediation (rich_text).
#   Remediation can exceed Notion's 2000-char-per-object cap; `rich` chunks via
#   scripts/notion_rich_text.rb. Do not revert to a single `t[0, 1900]` slice.
#
# Split ownership (so non-devs can use the board without the sync clobbering them):
# this script ONLY writes the register-owned columns listed below; it sends a fixed property
# set on every PATCH and never touches any other column. Columns reserved for humans -
# "Owner", "Target date", "Program notes", "Needs Scot decision" (and any future ones) - are
# left untouched, so a non-dev can assign owners, set dates, take notes, and flag items for
# Scot directly in Notion. The register stays authoritative ONLY for the finding facts +
# status (code-verified, governance-gated); program-management lives in Notion. Do NOT add
# any of the human-owned columns to properties_for.
#
# This is compliance content: Tier 2 (PII-free register, code/path evidence only), so nothing
# identifiable reaches Notion or any approved reviewer.

require 'json'
require 'net/http'
require 'uri'
require_relative 'notion_rich_text'

TOKEN   = ENV['NOTION_TOKEN']
DB_ID   = ENV['NOTION_FINDINGS_DB_ID']
PRUNE   = ARGV.include?('--prune')
DRY_RUN = ARGV.include?('--dry-run')
NOTION_VERSION = '2022-06-28'

abort 'Set NOTION_TOKEN (Notion internal integration secret).' if !DRY_RUN && (TOKEN.nil? || TOKEN.empty?)
abort 'Set NOTION_FINDINGS_DB_ID (the mirror database id).'     if !DRY_RUN && (DB_ID.nil? || DB_ID.empty?)

register = JSON.parse(File.read(File.join(__dir__, '..', 'audit-reports', 'FINDINGS.json')))
findings = register['findings'] || []

SEV  = { 'critical' => 'Critical', 'high' => 'High', 'medium' => 'Medium', 'low' => 'Low' }.freeze

def closed_by(f)
  # This column is named "Closed/decided by" and legitimately carries BOTH halves: who
  # ATTESTED a closure, and who DECIDED a disposition on a row that is not closed. The
  # two must be distinguishable, because they were not: on 2026-08-30 the retracted
  # closure of LL-f150e0e828 (live COPPA High) still published "Scot Wahlquist
  # 2026-08-30" here, because clearing closureEvidence.attestation left
  # disposition.decidedBy to fall through and read as the closer.
  #
  # A `return '' unless status == 'verified-closed'` guard was tried and rejected: it
  # blanks 41 rows that carry a legitimate decided-by (26 open+accepted, 5
  # accepted-risk+accepted, 4 open+wontfix, 2 open+dismissed-false-positive, 2
  # remediated-unverified+fixed, 1 remediated-unverified+accepted, 1
  # superseded+dismissed-false-positive) while changing none of the 58 verified-closed
  # rows. properties_for writes this property on every row every run, so that would
  # OVERWRITE the record of who accepted each risk with empty -- a wider blast radius
  # than the single mislabeled row it was meant to fix.
  #
  # Label the second half instead. Only a verified-closed row may render a bare
  # "<name> <date>"; every other row is prefixed so it cannot be read as a closure.
  # Paired with Status and an empty Closure SHA, the row now reads correctly.
  closed = f['status'].to_s == 'verified-closed'
  att = (f['closureEvidence'] || {})['attestation'].to_s
  if closed && (m = att.match(/Scot Wahlquist \d{4}-\d{2}-\d{2}/))
    m[0]
  else
    d = f['disposition'] || {}
    return '' if d['decidedBy'].to_s.empty?

    "decided (not a closure): #{d['decidedBy']} #{d['decidedDate']}".strip
  end
end

def prs(f)
  # Scan every register field a PR number is recorded in. PRs land in the closure
  # note/attestation (closures), in disposition.rationale (accepted/decided risks),
  # and in the top-level `notes` field (enabler/tracking PRs on still-open findings).
  src = [(f['closureEvidence'] || {})['verifierNote'], (f['closureEvidence'] || {})['attestation'],
         (f['remediation'] || {})['options'], (f['disposition'] || {})['rationale'], f['notes']].join(' ')
  src.scan(/#\d{3,4}/).uniq.join(' ')
end

def rich(text)
  NotionRichText.rich(text)
end

def properties_for(f)
  ev = f['evidence'] || {}
  loc = ev['file'].to_s.empty? ? ev['source'].to_s : "#{ev['file']}#{ev['line'] ? ":#{ev['line']}" : ''}"
  disp = (f['disposition'] || {})['state'] || 'untriaged'
  {
    'Finding ID'        => { 'title' => [{ 'text' => { 'content' => f['id'] } }] },
    'Severity'          => { 'select' => { 'name' => SEV[f['severity']] || f['severity'].to_s } },
    'Status'            => { 'select' => { 'name' => f['status'].to_s } },
    'Disposition'       => { 'select' => { 'name' => disp } },
    'Title'             => { 'rich_text' => rich(f['title']) },
    'Frameworks'        => { 'multi_select' => (f['frameworks'] || []).map { |x| { 'name' => x } } },
    'Rule key'          => { 'rich_text' => rich(f['ruleKey']) },
    'First seen'        => f['firstSeen'] ? { 'date' => { 'start' => f['firstSeen'] } } : { 'date' => nil },
    'Last seen'         => f['lastSeen']  ? { 'date' => { 'start' => f['lastSeen'] } }  : { 'date' => nil },
    'Closed/decided by' => { 'rich_text' => rich(closed_by(f)) },
    'PRs'               => { 'rich_text' => rich(prs(f)) },
    'Closure SHA'       => { 'rich_text' => rich(((f['closureEvidence'] || {})['sha'] || '')[0, 12]) },
    'Evidence'          => { 'rich_text' => rich(loc) },
    'Remediation'       => { 'rich_text' => rich((f['remediation'] || {})['options']) }
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

# Fetch all existing rows once: map LL-id -> {page_id, archived}.
def existing_rows
  rows = {}
  cursor = nil
  loop do
    body = { 'page_size' => 100 }
    body['start_cursor'] = cursor if cursor
    data = api(:post, "/v1/databases/#{DB_ID}/query", body)
    (data['results'] || []).each do |p|
      title = (p.dig('properties', 'Finding ID', 'title') || []).map { |t| t['plain_text'] }.join
      rows[title] = p['id'] unless title.empty?
    end
    break unless data['has_more']
    cursor = data['next_cursor']
  end
  rows
end

if DRY_RUN
  puts "[dry-run] would sync #{findings.size} findings to Notion DB #{DB_ID || '(unset)'}"
  findings.first(3).each { |f| puts "  e.g. #{f['id']} #{f['severity']}/#{f['status']}" }
  exit 0
end

existing = existing_rows
created = updated = 0
seen = []

findings.each do |f|
  props = properties_for(f)
  seen << f['id']
  if (page_id = existing[f['id']])
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

puts "Synced #{findings.size} findings -> Notion: #{created} created, #{updated} updated#{PRUNE ? ", #{pruned} archived" : ''}."
