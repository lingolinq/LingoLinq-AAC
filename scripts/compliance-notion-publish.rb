#!/usr/bin/env ruby
# frozen_string_literal: true

# compliance-notion-publish.rb - regenerate the one-way "Compliance & Audit" Notion page body.
#
# Phase 4 "Cadence" deliverable (plan section 5.7, decision 5). After each /audit-run, the
# git findings register stays the single source of truth; this script renders a PII-free SUMMARY
# of it (the open Critical/High headline + the open-findings table), stamped with the audited
# SHA and run date and marked "generated, do not edit", into:
#
#     audit-reports/notion/compliance-audit-page.md
#
# That generated file is what a human pushes (one-way, in place) to the single Notion
# "Compliance & Audit" page in the Master Inbox. This script does NOT call Notion: outward sends
# from any audit/compliance surface stay human-initiated and human-gated (see notion/README.md).
#
# What it publishes and what it must NOT:
#   * Publishes: headline counts, and an open / remediated-unverified findings table with
#     id, legacyId, severity, frameworks, title, and the evidence file:line ANCHOR.
#   * Does NOT publish: evidence snippets, finding notes, closed/accepted/superseded findings,
#     remediation prose, or the Compliance Posture Report itself (CEO-attested; it is linked
#     from the Notes section, never embedded). No student/patient data ever - the register
#     carries code-only evidence, and this render drops even the code snippet.
#
# Pure stdlib (json, time). Safe in CI. Usage:
#   ruby scripts/compliance-notion-publish.rb [audit-reports/FINDINGS.json]
#   ruby scripts/compliance-notion-publish.rb --check [FINDINGS.json]   # exit 1 if render drifts

require 'json'
require 'time'
require 'optparse'

DEFAULT_REGISTER = 'audit-reports/FINDINGS.json'
SEVERITY_ORDER = { 'critical' => 0, 'high' => 1, 'medium' => 2, 'low' => 3 }.freeze
# Only currently-actionable statuses appear on the published summary.
PUBLISHED_STATUSES = %w[open remediated-unverified].freeze

options = { mode: :render }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/compliance-notion-publish.rb [--check] [FINDINGS.json]'
  o.on('--check', 'Exit 1 if the generated page on disk does not match the register') { options[:mode] = :check }
end.parse!(ARGV)

register_path = ARGV[0] || DEFAULT_REGISTER
unless File.file?(register_path)
  warn "compliance-notion-publish: register not found: #{register_path}"
  exit 1
end

register = JSON.parse(File.read(register_path))
meta = register['meta'] || {}
findings = register['findings'] || []

active = findings.select { |f| PUBLISHED_STATUSES.include?(f['status']) }
crit = active.count { |f| f['severity'] == 'critical' }
high = active.count { |f| f['severity'] == 'high' }
med  = active.count { |f| f['severity'] == 'medium' }
low  = active.count { |f| f['severity'] == 'low' }

active_sorted = active.sort_by { |f| [SEVERITY_ORDER[f['severity']] || 9, f['legacyId'].to_s, f['id'].to_s] }

out = +''
out << "# Compliance & Audit (generated)\n\n"
out << "> 🤖 **GENERATED - DO NOT EDIT.** This page is a one-way mirror of the git findings\n"
out << "> register (`audit-reports/FINDINGS.json`), regenerated after each `/audit-run`. Edits here\n"
out << "> are overwritten on the next publish and are not the source of truth. Do not auto-file this\n"
out << "> page out of the Master Inbox and do not delete it; regenerate in place.\n>\n"
out << "> Regenerate: `ruby scripts/compliance-notion-publish.rb`, then push this body to the single\n"
out << "> Notion \"Compliance & Audit\" page (see `audit-reports/notion/README.md`).\n\n"

out << "**Audited commit:** `#{meta['auditedSha']}`  \n"
out << "**Audited ref:** `#{meta['auditedRef']}`  \n"
out << "**Run date:** #{meta['auditedDate']}  \n"
out << "**Page generated:** #{Time.now.utc.iso8601}\n\n"

out << "## Headline - open findings\n\n"
out << "| Critical | High | Medium | Low |\n|---|---|---|---|\n"
out << "| **#{crit}** | **#{high}** | #{med} | #{low} |\n\n"
out << "_Headline is the count of `open` + `remediated-unverified` findings by severity "
out << "(plan decision 5.9.2: counts, not a synthetic score). Only Scot closes a finding, "
out << "downgrades severity, or accepts risk._\n\n"

out << "## Open findings (open + awaiting verification)\n\n"
if active_sorted.empty?
  out << "_No open findings._\n\n"
else
  out << "| ID | Legacy | Severity | Frameworks | Title | Evidence |\n"
  out << "|---|---|---|---|---|---|\n"
  active_sorted.each do |f|
    ev = f['evidence'] || {}
    anchor = ev['file'] ? "`#{ev['file']}`#{ev['line'] ? ":#{ev['line']}" : ''}" : '(attestation)'
    fw = (f['frameworks'] || []).join(', ')
    title = f['title'].to_s.gsub('|', '\\|')
    out << "| #{f['id']} | #{f['legacyId']} | #{f['severity']} | #{fw} | #{title} | #{anchor} |\n"
  end
  out << "\n"
end

out << "## Notes\n\n"
out << "- **Source of truth:** the git register. This page is a generated read-only summary; it\n"
out << "  carries no evidence snippets, no finding notes, and no student/patient data.\n"
out << "- **Filtered by STATUS, not disposition.** This page lists findings whose `status` is `open`\n"
out << "  or `remediated-unverified`; status `verified-closed`, `accepted-risk`, and `superseded` are\n"
out << "  intentionally omitted. Disposition is a separate, Scot-owned axis, so a row listed here may\n"
out << "  still carry a disposition of `accepted`, `wontfix`, or `dismissed-false-positive`. Presence\n"
out << "  on this page means the finding is not yet closed; it does NOT mean it is untriaged. See\n"
out << "  `audit-reports/FINDINGS.md` for the full lifecycle.\n"
out << "- **Compliance Posture Report** (`docs/legal/COMPLIANCE_POSTURE_REPORT.md`) is **CEO-attested**\n"
out << "  (Scot Wahlquist, 2026-06-19); it is linked from this summary, never embedded. External\n"
out << "  distribution remains the CEO's decision at attestation time.\n"

render_path = File.join('audit-reports', 'notion', 'compliance-audit-page.md')

if options[:mode] == :check
  unless File.file?(render_path)
    warn "compliance-notion-publish: missing render #{render_path}"
    exit 1
  end
  # Only the "Page generated:" line is volatile-by-design (wall-clock at render time), so it is
  # masked before comparing. The "Audited commit / ref / Run date" header lines come straight from
  # the register meta and ARE part of the compared body on purpose - a register/page SHA or date
  # mismatch is real drift and SHOULD fail --check.
  strip_ts = ->(s) { s.sub(/^\*\*Page generated:\*\* .*$/, '**Page generated:** <ts>') }
  if strip_ts.call(File.read(render_path)) == strip_ts.call(out)
    puts 'compliance-notion-publish: OK (page matches register, ignoring timestamp)'
    exit 0
  end
  warn 'compliance-notion-publish: DRIFT - run `ruby scripts/compliance-notion-publish.rb` to refresh'
  exit 1
end

require 'fileutils'
FileUtils.mkdir_p(File.dirname(render_path))
File.write(render_path, out)
puts "compliance-notion-publish: wrote #{render_path} (#{crit}C/#{high}H/#{med}M/#{low}L open) @ #{meta['auditedSha']}"
