#!/usr/bin/env ruby
# frozen_string_literal: true

# compliance-publication-status.rb - render the compliance publication queue.
#
# The findings register and document register are the source-of-truth inputs. This report
# answers "what updates automatically, and what still needs a human or agent publish step?"
# It is intentionally network-free and deterministic so CI can block when the committed
# markdown drifts from the registers.
#
# Usage:
#   ruby scripts/compliance-publication-status.rb
#   ruby scripts/compliance-publication-status.rb --check

require 'json'
require 'date'
require 'optparse'

FINDINGS_PATH = 'audit-reports/FINDINGS.json'
DOCS_PATH = 'audit-reports/DOCUMENT-REGISTER.json'
REPORT_PATH = 'audit-reports/COMPLIANCE-PUBLICATION-STATUS.md'

options = { mode: :render }
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/compliance-publication-status.rb [--check]'
  o.on('--check', 'Exit 1 if the committed publication report is stale') { options[:mode] = :check }
end.parse!(ARGV)

def read_json(path)
  abort "compliance-publication-status: missing #{path}" unless File.file?(path)

  JSON.parse(File.read(path))
end

def parse_date(value)
  return nil if value.nil? || value.to_s.strip.empty?

  Date.parse(value.to_s)
rescue ArgumentError
  nil
end

def esc(value)
  value.to_s.gsub('|', '\\|')
end

def link_for(doc)
  loc = doc['canonicalLocation'].to_s
  doc['canonicalSystem'].to_s == 'git' ? "`#{loc}`" : "[open](#{loc})"
end

def workflow_state(path)
  File.file?(path) ? 'configured' : 'missing'
end

findings = read_json(FINDINGS_PATH)
doc_register = read_json(DOCS_PATH)

finding_meta = findings['meta'] || {}
doc_meta = doc_register['meta'] || {}
docs = doc_register['documents'] || []

generated_date = parse_date(doc_meta['generatedDate']) ||
                 parse_date(finding_meta['auditedDate']) ||
                 Date.today
generated = generated_date.strftime('%Y-%m-%d')

finding_date = parse_date(finding_meta['auditedDate'])
doc_date = parse_date(doc_meta['generatedDate'])
latest_source_date = [finding_date, doc_date].compact.max || generated_date
latest_source = latest_source_date.strftime('%Y-%m-%d')

findings_auto = workflow_state('.github/workflows/sync-findings-to-notion.yml')
docs_auto = workflow_state('.github/workflows/sync-document-register-to-notion.yml')

drive_docs = docs.select { |d| d['canonicalSystem'].to_s == 'drive' }
notion_docs = docs.select { |d| d['canonicalSystem'].to_s == 'notion' }

review_stale = docs.select do |d|
  last = parse_date(d['lastReviewed'])
  status = d['status'].to_s
  next false if %w[superseded archived].include?(status)
  next true if last.nil?

  last < latest_source_date
end

missing_external_hash = docs.select do |d|
  %w[drive notion].include?(d['canonicalSystem'].to_s) && d['contentHash'].to_s.empty?
end

drive_needs_refresh = drive_docs.select do |d|
  last = parse_date(d['lastReviewed'])
  status = d['status'].to_s
  next false if %w[superseded archived].include?(status)
  next true if last.nil?

  last < latest_source_date
end

notion_needs_hash = notion_docs.select do |d|
  d['contentHash'].to_s.empty?
end

retention_schedule = doc_meta['retentionSchedule'] || {}
missing_retention = docs.reject { |d| d['retention'].is_a?(Hash) }
ambiguous_retention = docs.select { |d| d.dig('retention', 'ambiguous') }
approved_retention = docs.select { |d| d.dig('retention', 'status').to_s == 'approved' }
legal_holds = docs.select { |d| d['legalHold'] == true }

# Attestation integrity. attestedContentHash pins the bytes Scot attested; contentHash tracks the
# file now. A git row where the two disagree is asserting an attestation of a revision that no
# longer exists. Rows attested before the check landed are grandfathered with evidence rather than
# backfilled, so they read here as owed work, not as clean.
attestation_exemptions = doc_meta['attestationBackfillExemptions'] || []
exempt_by_id = attestation_exemptions.select { |e| e.is_a?(Hash) }.to_h { |e| [e['id'].to_s, e] }
attested_git = docs.select do |d|
  d['canonicalSystem'].to_s == 'git' && !d.dig('attestation', 'attestedBy').to_s.empty?
end
attestation_mismatched = attested_git.select do |d|
  pin = d.dig('attestation', 'attestedContentHash').to_s
  !pin.empty? && pin != d['contentHash'].to_s
end
attestation_unpinned = attested_git.select { |d| d.dig('attestation', 'attestedContentHash').to_s.empty? }
superseded_rows = docs.select { |d| !d['supersededBy'].to_s.empty? }
docs_by_id = docs.to_h { |d| [d['id'].to_s, d] }

# A bundle gap is an artifact the bundle needs that does not exist yet. It is deliberately not a
# failure anywhere; it is a work queue.
bundle_gaps = (doc_meta['bundleDefinitions'] || {}).filter_map do |name, defn|
  gaps = defn['gaps']
  next unless gaps.is_a?(Array) && !gaps.empty?

  [name, gaps]
end

out = +''
out << "# Compliance Publication Status\n\n"
out << "> Generated from `#{FINDINGS_PATH}` and `#{DOCS_PATH}` by `scripts/compliance-publication-status.rb`.\n"
out << "> Do not hand-edit; update the registers and re-render.\n\n"

out << "**Generated:** #{generated}\n\n"
out << "**Latest source date:** #{latest_source}\n\n"
out << "**Findings audited date:** #{finding_meta['auditedDate']}\n\n"
out << "**Document register generated date:** #{doc_meta['generatedDate']}\n\n"

out << "## What Updates Automatically\n\n"
out << "| Surface | Source | Automation | Scope |\n"
out << "|---|---|---|---|\n"
out << "| Notion findings board | `audit-reports/FINDINGS.json` | #{findings_auto} | Register-owned finding facts only. Human-owned Notion columns are preserved. |\n"
out << "| Notion documents board | `audit-reports/DOCUMENT-REGISTER.json` | #{docs_auto} | Register-owned document-index facts only. Human-owned Notion columns are preserved. |\n\n"

out << "## What Does Not Auto-Update\n\n"
out << "- Google Docs bodies are not rewritten by the current repo workflows. Drive rows are tracked by URL, review date, and optional content hash only.\n"
out << "- Frozen branded records can stay point-in-time, but living Drive docs must be refreshed by an operator or a future Google Docs publisher.\n"
out << "- Notion page content is not rewritten here. The document board can be synced; individual Notion pages need either canonical git sources or an explicit publisher.\n\n"

out << "## Stale Review Queue\n\n"
if review_stale.empty?
  out << "_No active documents have a `lastReviewed` date older than the latest register source date._\n\n"
else
  out << "| Title | System | Location | Last reviewed | Status | Why |\n"
  out << "|---|---|---|---|---|---|\n"
  review_stale.sort_by { |d| [d['canonicalSystem'].to_s, d['title'].to_s] }.each do |d|
    out << "| #{esc(d['title'])} | #{d['canonicalSystem']} | #{link_for(d)} | #{d['lastReviewed']} | #{d['status']} | Review date is older than #{latest_source}. |\n"
  end
  out << "\n"
end

out << "## Drive Refresh Queue\n\n"
if drive_needs_refresh.empty?
  out << "_No Drive-canonical documents are stale against the latest register source date._\n\n"
else
  out << "| Title | Location | Last reviewed | Status | Action |\n"
  out << "|---|---|---|---|---|\n"
  drive_needs_refresh.sort_by { |d| d['title'].to_s }.each do |d|
    out << "| #{esc(d['title'])} | #{link_for(d)} | #{d['lastReviewed']} | #{d['status']} | Refresh or explicitly mark frozen/point-in-time, then update `lastReviewed` and `contentHash` if available. |\n"
  end
  out << "\n"
end

out << "## External Hash Gaps\n\n"
if missing_external_hash.empty?
  out << "_All Drive/Notion canonical rows have supplied content hashes._\n\n"
else
  out << "| Title | System | Location | Action |\n"
  out << "|---|---|---|---|\n"
  missing_external_hash.sort_by { |d| [d['canonicalSystem'].to_s, d['title'].to_s] }.each do |d|
    action = d['canonicalSystem'].to_s == 'notion' ? 'Run `ruby scripts/document-register-notion-sync.rb --refresh-notion-hashes` with `NOTION_TOKEN`.' : 'Supply hash during Drive review; the repo has no Google Docs body fetch/write workflow yet.'
    out << "| #{esc(d['title'])} | #{d['canonicalSystem']} | #{link_for(d)} | #{esc(action)} |\n"
  end
  out << "\n"
end

out << "## Retention Draft Coverage\n\n"
if retention_schedule.empty?
  out << "_No retention schedule is defined in the document register._\n\n"
else
  out << "Every rule is `status: draft` and legally inert. No deletion behaviour is wired anywhere in this repo. "
  out << "Only Scot moves a rule to `approved`, and only after counsel review.\n\n"
  out << "| Class | Rule | Disposition | Rows | Status |\n"
  out << "|---|---|---|---|---|\n"
  retention_schedule.each do |klass, entry|
    rows = docs.count { |d| d.dig('retention', 'class').to_s == klass }
    state = rows.zero? ? 'unused (no record of this class exists yet)' : 'draft'
    out << "| `#{klass}` | #{esc(entry['rule'])} | #{entry['disposition']} | #{rows} | #{state} |\n"
  end
  out << "\n"

  if missing_retention.empty?
    out << "All #{docs.size} rows carry a retention block.\n\n"
  else
    out << "**#{missing_retention.size} row(s) have NO retention block:** "
    out << missing_retention.map { |d| esc(d['title']) }.join('; ') << "\n\n"
  end

  if approved_retention.empty?
    out << "No retention rule has been approved. Nothing in this register is eligible for disposition.\n\n"
  else
    out << "**#{approved_retention.size} row(s) carry an APPROVED retention rule.** Verify Scot signed each one.\n\n"
  end

  if ambiguous_retention.empty?
    out << "No retention class was inferred; every class was read off the drafted schedule.\n\n"
  else
    out << "### Inferred retention classes (counsel review these first)\n\n"
    out << "| Title | System | Class | Why it is ambiguous |\n"
    out << "|---|---|---|---|\n"
    ambiguous_retention.sort_by { |d| [d['canonicalSystem'].to_s, d['title'].to_s] }.each do |d|
      out << "| #{esc(d['title'])} | #{d['canonicalSystem']} | `#{d.dig('retention', 'class')}` | #{esc(d.dig('retention', 'ambiguityNote'))} |\n"
    end
    out << "\n"
  end
end

out << "## Legal Holds\n\n"
if legal_holds.empty?
  out << "_No record is under legal hold. A hold suspends all disposition for the rows it covers, and only Scot flips it._\n\n"
else
  out << "| Title | System | Location | Status |\n"
  out << "|---|---|---|---|\n"
  legal_holds.sort_by { |d| d['title'].to_s }.each do |d|
    out << "| #{esc(d['title'])} | #{d['canonicalSystem']} | #{link_for(d)} | #{d['status']} |\n"
  end
  out << "\nDisposition is suspended for every row above until the hold is released, and the release must be dated and recorded.\n\n"
end

out << "## Attestation Integrity\n\n"
if attested_git.empty?
  out << "_No attested git records._\n\n"
else
  out << "#{attested_git.size} attested git record(s). `attestation.attestedContentHash` pins the bytes that were "
  out << "attested; `ruby scripts/document-register-render.rb --check` fails when a pinned hash stops matching the "
  out << "file. Drive and Notion rows are out of scope: their hashes are operator-supplied, so there is nothing CI "
  out << "can verify.\n\n"

  if attestation_mismatched.empty?
    out << "**No pinned attestation has drifted.** Every record that pins a hash still matches the attested bytes.\n\n"
  else
    out << "**#{attestation_mismatched.size} record(s) have drifted from their attested bytes.** Only Scot re-attests; "
    out << "never edit the pinned hash to clear this.\n\n"
    out << "| Title | Location | Attested | Pinned | Current |\n"
    out << "|---|---|---|---|---|\n"
    attestation_mismatched.sort_by { |d| d['title'].to_s }.each do |d|
      out << "| #{esc(d['title'])} | #{link_for(d)} | #{d.dig('attestation', 'attestedDate')} | `#{d.dig('attestation', 'attestedContentHash').to_s[0, 12]}` | `#{d['contentHash'].to_s[0, 12]}` |\n"
    end
    out << "\n"
  end

  if attestation_unpinned.empty?
    out << "Every attested git record pins the bytes it was attested against.\n\n"
  else
    out << "### Re-attestation queue (#{attestation_unpinned.size})\n\n"
    out << "Attested before the check existed and modified afterwards, so the attested revision no longer exists. "
    out << "The hash is deliberately not backfilled: pinning current bytes would re-assert an attestation Scot never "
    out << "gave. Each row clears when Scot re-attests the current revision.\n\n"
    out << "| Title | Location | Attested | Why it is unpinned |\n"
    out << "|---|---|---|---|\n"
    attestation_unpinned.sort_by { |d| d['title'].to_s }.each do |d|
      ex = exempt_by_id[d['id'].to_s]
      why = ex ? ex['reason'] : 'no exemption recorded (this fails `--check`)'
      out << "| #{esc(d['title'])} | #{link_for(d)} | #{d.dig('attestation', 'attestedDate')} | #{esc(why)} |\n"
    end
    out << "\n"
  end
end

out << "## Supersession Chains\n\n"
if superseded_rows.empty?
  out << "_No superseded records._\n\n"
else
  out << "A superseded record is never edited, renamed, or moved. It keeps its row and its membership in any frozen "
  out << "point-in-time binder; only the pointer is added.\n\n"
  out << "| Superseded | Location | Replaced by | Still bundled in |\n"
  out << "|---|---|---|---|\n"
  superseded_rows.sort_by { |d| d['title'].to_s }.each do |d|
    succ = docs_by_id[d['supersededBy'].to_s]
    bundles = (d['bundles'] || []).join(', ')
    out << "| #{esc(d['title'])} | #{link_for(d)} | #{esc(succ ? succ['title'] : '(unresolved)')} | #{esc(bundles.empty? ? '(none)' : bundles)} |\n"
  end
  out << "\n"
end

out << "## Bundle Gaps\n\n"
if bundle_gaps.empty?
  out << "_No bundle records a missing artifact._\n\n"
else
  out << "Artifacts a bundle needs that do not exist yet. These are never satisfied by inventing a register row; "
  out << "they are closed by creating the real document and promoting it into `requiredDocs`.\n\n"
  bundle_gaps.each do |name, gaps|
    out << "**#{name}** (#{gaps.size})\n\n"
    gaps.each { |g| out << "- #{esc(g)}\n" }
    out << "\n"
  end
end

out << "## Next Automation Gap\n\n"
out << "The missing layer is a Google Docs publisher/refresh workflow. Until that exists, the compliance agent should use this report as its work queue: update canonical registers, sync Notion boards, then refresh or explicitly freeze affected Drive documents.\n\n"

out << "---\n\n"
out << "_#{docs.size} documents tracked. #{review_stale.size} stale review item(s). #{drive_needs_refresh.size} Drive refresh item(s). "
out << "#{notion_needs_hash.size} Notion hash item(s). #{ambiguous_retention.size} inferred retention class(es). "
out << "#{legal_holds.size} legal hold(s). #{superseded_rows.size} superseded record(s). "
# Both sets are the signature queue, and the footer must not contradict the detail sections above.
# `attestation_mismatched` = pinned bytes no longer match the file. `attestation_unpinned` = attested
# rows carrying no pinned hash, which render under a heading literally titled "Re-attestation queue".
# Two footer bugs have now been fixed here in sequence: first it labelled ONLY the unpinned set
# "awaiting re-attestation", so "2 drifted, 0 awaiting" implied an empty queue while two records
# awaited Scot; then keying the phrase to mismatched alone produced the converse, claiming "none
# awaiting" while the Re-attestation queue section listed a record. Count both, and let the detail
# sections break out which kind each record is.
awaiting_reattestation = attestation_mismatched.size + attestation_unpinned.size
out << "#{attestation_mismatched.size} drifted attestation(s), "
out << "#{attestation_unpinned.size} attested record(s) with no pinned hash, "
out << if awaiting_reattestation.zero?
         'none awaiting re-attestation. '
       else
         "#{awaiting_reattestation} record(s) AWAITING RE-ATTESTATION. "
       end
out << "#{bundle_gaps.sum { |_, g| g.size }} bundle gap(s) across #{bundle_gaps.size} bundle(s)._\n"

if options[:mode] == :check
  unless File.file?(REPORT_PATH)
    warn "compliance-publication-status: missing #{REPORT_PATH}"
    exit 1
  end

  if File.read(REPORT_PATH) == out
    puts 'compliance-publication-status: OK'
    exit 0
  end

  warn 'compliance-publication-status: DRIFT - run `ruby scripts/compliance-publication-status.rb`'
  exit 1
end

File.write(REPORT_PATH, out)
puts "compliance-publication-status: wrote #{REPORT_PATH} (#{review_stale.size} stale, #{drive_needs_refresh.size} Drive refresh)"
