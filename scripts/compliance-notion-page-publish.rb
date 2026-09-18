#!/usr/bin/env ruby
# frozen_string_literal: true

# compliance-notion-page-publish.rb - push the generated compliance posture page to Notion.
#
# The second half of the one-way publish that scripts/compliance-notion-publish.rb starts:
#   1. compliance-notion-publish.rb renders audit-reports/notion/compliance-audit-page.md from the
#      register (pure stdlib, no network, CI-checked for drift).
#   2. THIS script converts that body to Notion blocks and rewrites ONE existing page in place.
#
# It replaces the hand-run converter that the 2026-09-17 Q3 publish needed. Nothing here is
# automatic: it runs only when a person runs it with a token in the environment, and no workflow
# calls it. That keeps the "human-initiated, one-way" rule in audit-reports/notion/README.md.
#
# What it does, in order, so a failure is recoverable:
#   a. Refuses to publish a body that has drifted from the register
#      (`compliance-notion-publish.rb --check` must pass; skipped in --dry-run).
#   b. Reads the page and records every existing top-level block id.
#   c. Writes a JSON backup of the existing blocks (default: the system temp dir).
#   d. Appends the new blocks (tables with >100 rows are split: 100 rows at create, the rest
#      appended to the table block, because Notion caps children per request at 100).
#   e. Deletes the old blocks recorded in (b), and only those.
#   f. Retitles the page "Compliance & Audit Posture (GENERATED <today>, SHA <short>)".
#   g. Re-reads the page and checks the child count equals what was appended.
# If it aborts between (d) and (e) the page carries both copies; rerun to converge (the rerun
# records BOTH copies as old and removes them after appending a fresh one).
#
# Usage:
#   NOTION_TOKEN=... ruby scripts/compliance-notion-page-publish.rb            # publish
#   ruby scripts/compliance-notion-page-publish.rb --dry-run                  # convert only, no network
#   ruby scripts/compliance-notion-page-publish.rb --dry-run --blocks-out FILE
#   ruby scripts/compliance-notion-page-publish.rb --page-id <uuid> --input FILE
#
# Environment:
#   NOTION_TOKEN            internal-integration secret; 1Password item NOTION_COMPLIANCE_API
#                           (vault "LingoLinq Prod"). Never committed, never printed.
#   NOTION_POSTURE_PAGE_ID  overrides the default page id below.
#
# Tier 2 content only: the body is the PII-free register summary (ids, severities, titles,
# file:line anchors). No evidence snippets, no notes, no student or patient data.

require 'json'
require 'net/http'
require 'uri'
require 'optparse'
require 'tmpdir'
require 'date'
require_relative 'notion_markdown_blocks'

DEFAULT_PAGE_ID = '37f5fe82-15c2-814c-9904-feb6c2a8c13e'
DEFAULT_INPUT = File.join('audit-reports', 'notion', 'compliance-audit-page.md')
NOTION_VERSION = '2022-06-28'
APPEND_SLICE = 20      # top-level blocks per append request (payload size, not the 100 cap)
TABLE_ROW_CAP = 100    # Notion: max children per create/append request
RETRIES = 3

options = {
  dry_run: false,
  input: DEFAULT_INPUT,
  page_id: ENV['NOTION_POSTURE_PAGE_ID'].to_s.empty? ? DEFAULT_PAGE_ID : ENV['NOTION_POSTURE_PAGE_ID'],
  blocks_out: nil,
  backup_dir: Dir.tmpdir,
  title: nil
}
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/compliance-notion-page-publish.rb [--dry-run] [--input FILE] [--page-id ID] [--blocks-out FILE] [--backup-dir DIR] [--title TEXT]'
  o.on('--dry-run', 'Convert and summarize only; no network, no token needed') { options[:dry_run] = true }
  o.on('--input FILE', 'Markdown body to publish (default: the committed generated page)') { |v| options[:input] = v }
  o.on('--page-id ID', 'Notion page to rewrite in place (default: the posture page)') { |v| options[:page_id] = v }
  o.on('--blocks-out FILE', 'Write the converted blocks JSON here') { |v| options[:blocks_out] = v }
  o.on('--backup-dir DIR', 'Where to write the pre-publish block backup (default: system temp dir)') { |v| options[:backup_dir] = v }
  o.on('--title TEXT', 'Page title override (default: GENERATED <today>, SHA <short>)') { |v| options[:title] = v }
end.parse!(ARGV)

unless File.file?(options[:input])
  warn "compliance-notion-page-publish: input not found: #{options[:input]}"
  exit 1
end

body = File.read(options[:input])
blocks = NotionMarkdownBlocks.convert(body)
summary = NotionMarkdownBlocks.summary(blocks)

if blocks.empty?
  warn 'compliance-notion-page-publish: refusing to publish an empty page'
  exit 1
end

sha = body[/^\*\*Audited commit:\*\* `([0-9a-f]{7,40})`/, 1]
run_date = body[/^\*\*Run date:\*\* (\S+)/, 1]
title = options[:title] || "Compliance & Audit Posture (GENERATED #{Date.today.iso8601}, SHA #{sha.to_s[0, 9].empty? ? 'unknown' : sha[0, 9]})"

if options[:blocks_out]
  File.write(options[:blocks_out], JSON.pretty_generate(blocks))
end

puts "compliance-notion-page-publish: #{summary['blocks']} top-level blocks " \
     "(#{summary['types'].map { |k, v| "#{k}=#{v}" }.join(', ')}); tables #{summary['tables'].join(', ')}"
puts "compliance-notion-page-publish: audited sha #{sha || '(none found)'}, run date #{run_date || '(none found)'}"
puts "compliance-notion-page-publish: title => #{title.inspect}"

if options[:dry_run]
  puts 'compliance-notion-page-publish: dry-run, nothing sent'
  exit 0
end

token = ENV['NOTION_TOKEN'].to_s
if token.empty?
  warn 'compliance-notion-page-publish: set NOTION_TOKEN (Notion internal integration secret; 1Password item NOTION_COMPLIANCE_API). Nothing sent.'
  exit 1
end

if options[:input] == DEFAULT_INPUT
  ok = system('ruby', 'scripts/compliance-notion-publish.rb', '--check')
  unless ok
    warn 'compliance-notion-page-publish: the generated page has drifted from the register; run `ruby scripts/compliance-notion-publish.rb` first. Nothing sent.'
    exit 1
  end
end

def api(token, method, path, body = nil)
  uri = URI("https://api.notion.com/v1#{path}")
  attempt = 0
  loop do
    attempt += 1
    req = case method
          when :get then Net::HTTP::Get.new(uri)
          when :patch then Net::HTTP::Patch.new(uri)
          when :delete then Net::HTTP::Delete.new(uri)
          end
    req['Authorization'] = "Bearer #{token}"
    req['Notion-Version'] = NOTION_VERSION
    req['Content-Type'] = 'application/json'
    req.body = JSON.generate(body) if body
    res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, read_timeout: 60) { |h| h.request(req) }
    json = begin
      JSON.parse(res.body)
    rescue JSON::ParserError
      {}
    end
    if res.code.to_i == 429 || res.code.to_i >= 500
      raise "API #{method} #{path} -> HTTP #{res.code} after #{RETRIES} attempts" if attempt >= RETRIES

      sleep((res['Retry-After'] || 2).to_f)
      next
    end
    if json['object'] == 'error' || res.code.to_i >= 400
      raise "API #{method} #{path} -> #{json['code'] || res.code}: #{json['message'].to_s[0, 300]}"
    end

    return json
  end
end

def list_children(token, block_id)
  ids = []
  results = []
  cursor = nil
  loop do
    q = cursor ? "?page_size=100&start_cursor=#{cursor}" : '?page_size=100'
    r = api(token, :get, "/blocks/#{block_id}/children#{q}")
    results.concat(r['results'])
    ids.concat(r['results'].map { |b| b['id'] })
    break unless r['has_more']

    cursor = r['next_cursor']
  end
  [ids, results]
end

page_id = options[:page_id]
begin
  page = api(token, :get, "/pages/#{page_id}")
  parent = page['parent'] || {}
  puts "compliance-notion-page-publish: page #{page_id} parent=#{parent['type']} #{parent['page_id'] || parent['database_id'] || ''} archived=#{page['archived']}"
  if page['archived']
    warn 'compliance-notion-page-publish: page is archived; restore it in Notion first. Nothing sent.'
    exit 1
  end

  old_ids, old_blocks = list_children(token, page_id)
  backup = File.join(options[:backup_dir], "notion-posture-page-#{page_id}-#{Time.now.utc.strftime('%Y%m%dT%H%M%SZ')}.json")
  File.write(backup, JSON.pretty_generate({ 'page_id' => page_id, 'title' => title, 'blocks' => old_blocks }))
  puts "compliance-notion-page-publish: #{old_ids.length} existing blocks backed up to #{backup}"

  pending_rows = {}
  payload = blocks.each_with_index.map do |b, n|
    next b unless b['type'] == 'table' && b['table']['children'].length > TABLE_ROW_CAP

    rows = b['table']['children']
    pending_rows[n] = rows[TABLE_ROW_CAP..]
    nb = JSON.parse(JSON.generate(b))
    nb['table']['children'] = rows[0, TABLE_ROW_CAP]
    nb
  end

  appended = []
  payload.each_slice(APPEND_SLICE).with_index do |slice, s|
    r = api(token, :patch, "/blocks/#{page_id}/children", { 'children' => slice })
    r['results'].each_with_index { |blk, k| appended << [blk['id'], (s * APPEND_SLICE) + k] }
  end
  puts "compliance-notion-page-publish: appended #{appended.length} top-level blocks"

  appended.each do |blk_id, n|
    next unless pending_rows[n]

    pending_rows[n].each_slice(TABLE_ROW_CAP) do |chunk|
      api(token, :patch, "/blocks/#{blk_id}/children", { 'children' => chunk })
    end
    puts "compliance-notion-page-publish: table block #{blk_id} +#{pending_rows[n].length} rows"
  end

  old_ids.each { |id| api(token, :delete, "/blocks/#{id}") }
  puts "compliance-notion-page-publish: removed #{old_ids.length} old blocks"

  title_prop = page['properties'].find { |_, v| v['type'] == 'title' }&.first
  if title_prop
    api(token, :patch, "/pages/#{page_id}",
        { 'properties' => { title_prop => { 'title' => [{ 'type' => 'text', 'text' => { 'content' => title } }] } } })
    puts "compliance-notion-page-publish: retitled via #{title_prop.inspect}"
  end

  after_ids, = list_children(token, page_id)
  unless after_ids.length == blocks.length
    warn "compliance-notion-page-publish: VERIFY FAILED: page has #{after_ids.length} top-level blocks, expected #{blocks.length}. Backup: #{backup}"
    exit 1
  end
  puts "compliance-notion-page-publish: verified #{after_ids.length} top-level blocks on the page"
  puts "compliance-notion-page-publish: DONE https://www.notion.so/#{page_id.delete('-')}"
rescue StandardError => e
  warn "compliance-notion-page-publish: #{e.message}"
  exit 1
end
