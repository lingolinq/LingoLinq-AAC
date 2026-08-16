#!/usr/bin/env ruby
# frozen_string_literal: true

# compliance-calendar-render.rb - render audit-reports/compliance-calendar.md from JSON.
#
# Usage:
#   ruby scripts/compliance-calendar-render.rb [JSON]           # write sibling .md
#   ruby scripts/compliance-calendar-render.rb --check [JSON]   # exit 1 if .md drifts
#
# The JSON file is the source of truth; this script keeps the markdown render in sync.

require 'json'
require 'optparse'
require 'time'

DEFAULT_JSON = 'audit-reports/compliance-calendar.json'

options = { mode: :render }
OptionParser.new do |o|
  o.on('--check', 'Exit 1 if the render on disk does not match JSON') { options[:mode] = :check }
end.parse!(ARGV)

json_path = ARGV[0] || DEFAULT_JSON
unless File.file?(json_path)
  warn "compliance-calendar-render: JSON not found: #{json_path}"
  exit 1
end

data = JSON.parse(File.read(json_path))
meta = data['meta'] || {}
owner = meta['owner'] || 'compliance-officer'

def framework_label(fw)
  case fw
  when 'EU_AI_Act' then 'EU AI Act'
  when 'EAA' then 'EAA'
  else fw.to_s
  end
end

def parse_date(s)
  return nil if s.nil? || s.to_s.strip.empty?

  Date.parse(s.to_s)
rescue ArgumentError
  nil
end

# Resolve the calendar's generation date ONCE and use it for BOTH the header and the "due within
# 90 days / overdue" window, so the render is a PURE function of the JSON (the render on disk
# changes only when the JSON changes). Anchoring the window to Date.today made it drift every day
# as items crossed the 90-day boundary, reddening `--check` on every PR built on a later date even
# when nobody touched the calendar. The .md is a dated snapshot ("Generated: <date>"); live "what
# is due right now" is surfaced by /compliance-status, not by this static render.
#
# A present-but-malformed generatedDate is a hand-edit mistake: fail loudly rather than silently
# falling back to the wall clock (which would reintroduce the very drift this guards against). Only
# a fully ABSENT generatedDate falls back to today, for an undated scratch JSON.
if meta.key?('generatedDate')
  generated_date = parse_date(meta['generatedDate']) ||
    abort("compliance-calendar-render: meta.generatedDate present but unparseable: #{meta['generatedDate'].inspect}")
else
  generated_date = Date.today
end
generated = generated_date.strftime('%Y-%m-%d')
window_anchor = generated_date
window_end = window_anchor + 90

recurring = data['recurringReviews'] || []
fixed = data['fixedRegulatoryDates'] || []

due_soon = []

recurring.each do |item|
  d = parse_date(item['nextDue'])
  next unless d && d <= window_end

  due_soon << {
    date: d,
    title: item['title'],
    framework: framework_label(item['framework']),
    cadence: item['cadence']
  }
end

fixed.each do |item|
  d = parse_date(item['date'])
  next unless d && d <= window_end && item['status'] != 'passed-enforceable'

  due_soon << {
    date: d,
    title: item['title'],
    framework: framework_label(item['framework']),
    cadence: 'fixed'
  }
end

due_soon.sort_by! { |row| row[:date] }

lines = []
lines << '# LingoLinq-AAC Compliance Calendar'
lines << ''
lines << '> Generated from `compliance-calendar.json` (the source of truth). Do not hand-edit this'
lines << '> render; regenerate it from the JSON via `ruby scripts/compliance-calendar-render.rb`.'
lines << '> A review is only "done" when Scot attests; `nextDue` is advisory scheduling, not a compliance claim.'
lines << '>'
lines << "> Generated: #{generated} | Owner: #{owner}"
lines << ''
lines << '## Due within 90 days or overdue (surface these first)'
lines << ''
lines << '| Date | Item | Framework | Cadence |'
lines << '|---|---|---|---|'

if due_soon.empty?
  lines << '| (none in window) | | | |'
else
  due_soon.each do |row|
    date_s = row[:date].strftime('%Y-%m-%d')
    date_s = "**#{date_s}**" if row[:cadence] == 'fixed'
    lines << "| #{date_s} | #{row[:title]} | #{row[:framework]} | #{row[:cadence]} |"
  end
end

lines << ''
lines << '## Recurring reviews (full set)'
lines << ''
lines << '| Framework | Review | Cadence | Last done | Next due |'
lines << '|---|---|---|---|---|'

recurring.each do |item|
  last = item['lastDone'] || '(none)'
  nxt = item['nextDue'] || '(none)'
  lines << "| #{framework_label(item['framework'])} | #{item['title']} | #{item['cadence']} | #{last} | #{nxt} |"
end

lines << ''
lines << '## Review instructions, regulatory watch, and basis'
lines << ''
lines << 'The following details are part of each recurring review record. They are rendered so missed-cycle'
lines << 'context, required work, and the source basis remain visible with the schedule.'

recurring.each do |item|
  lines << ''
  lines << "### #{item['title']}"
  lines << ''
  lines << "- **Drafts:** #{item['drafts'] || '(none recorded)'}"
  lines << "- **Watch:** #{item['watch'] || '(none recorded)'}"
  lines << "- **Basis:** #{item['basis'] || '(none recorded)'}"
end

lines << ''
lines << '## Fixed regulatory dates'
lines << ''
lines << '| Date | Status | Obligation | Framework |'
lines << '|---|---|---|---|'

fixed.each do |item|
  date_s = item['date'] || '(conditional)'
  date_s = "**#{date_s}**" if item['status'] == 'passed-enforceable'
  status = item['status'].to_s.tr('-', ' ')
  status = "**#{status}**" if item['status'] == 'passed-enforceable'
  obligation = item['obligation'].to_s
  obligation = obligation.length > 120 ? "#{obligation[0, 117]}..." : obligation
  lines << "| #{date_s} | #{status} | #{obligation} | #{framework_label(item['framework'])} |"
end

lines << ''
lines << '## How to read this'
lines << ''
lines << '- **Source of truth is `compliance-calendar.json`.** This file is a render.'
lines << '- Every cached regulatory date is "verify before relying." The `compliance-officer` runs a'
lines << '  fresh regulatory-watch lookup on a calendar cadence and writes dated delta notes.'
lines << '- Passed-enforceable fixed dates (e.g. COPPA 2026-04-22) stay visible for context; ongoing'
lines << '  compliance is tracked via linked recurring reviews (`nextDue` on the fixed entry when set).'
lines << '- Only Scot attests that a review was completed. `nextDue` is scheduling, not a claim.'
lines << ''

rendered = lines.join("\n")
md_path = json_path.sub(/\.json\z/, '.md')

if options[:mode] == :check
  unless File.file?(md_path)
    warn "compliance-calendar-render: missing render #{md_path}"
    exit 1
  end
  on_disk = File.read(md_path)
  if on_disk == rendered
    puts 'compliance-calendar-render: OK (render matches JSON)'
    exit 0
  end
  warn 'compliance-calendar-render: DRIFT - run `ruby scripts/compliance-calendar-render.rb` to refresh'
  exit 1
end

File.write(md_path, rendered)
puts "compliance-calendar-render: wrote #{md_path}"
