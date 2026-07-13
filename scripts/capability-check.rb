#!/usr/bin/env ruby
# frozen_string_literal: true
#
# capability-check.rb - validator + renderer for the Capability Ledger.
#
# The Capability Ledger (audit-reports/CAPABILITY-LEDGER.json) is a code-cited,
# PRESENT-TENSE record of what the product does today. This script is to that
# ledger what citation-check.rb is to the findings register -- with ONE critical
# difference:
#
#   citation-check pins finding evidence to a HISTORICAL sha (a finding is a
#   point-in-time observation). capability-check validates evidence at HEAD (the
#   current checkout), because a capability is a present-tense claim: if the code
#   that backs a "built" row is removed, this check MUST go red.
#
# WHAT IT VALIDATES (at HEAD)
#   - built / partial rows: currentEvidence {file,line,snippet} must resolve --
#     the file exists and the snippet appears at that line (or anywhere in the
#     file if no line is given). currentEvidence is REQUIRED for built/partial.
#   - planned rows: currentEvidence is validated IF present (it points at partial
#     / related code), but is not required.
#   - deliberately-not-done rows: negativeEvidence must hold. Two forms:
#       * content grep: grepScopes (globs) + patterns (regex, case-insensitive),
#         minus excludedPaths, must yield exactly expectedMatches (usually 0).
#         Use for code-absence (no E2EE identifier, no voiceprint path).
#       * absentFileGlobs: none of the globs may match a file (case-insensitive).
#         Use for artifact-absence (no executed model-provider BAA file), where a
#         content grep would false-positive on prose that discusses the absence.
#     negativeEvidence is REQUIRED for deliberately-not-done.
#
# MODES
#   ruby scripts/capability-check.rb            # validate at HEAD, then WRITE the .md render
#   ruby scripts/capability-check.rb --check    # validate at HEAD + assert .md matches; write nothing (CI)
#   ruby scripts/capability-check.rb --render    # write the .md render only
#
# EXIT 0 = all rows validate (and, in --check, the render is in sync); 1 = a failure.
#
require 'json'
require 'optparse'
require 'set'

LEDGER_JSON = 'audit-reports/CAPABILITY-LEDGER.json'
RENDER_MD   = 'docs/legal/CAPABILITY_LEDGER.md'

mode = :validate_and_write
OptionParser.new do |o|
  o.banner = 'Usage: ruby scripts/capability-check.rb [--check | --render]'
  o.on('--check', 'Validate at HEAD and assert the .md render matches; write nothing') { mode = :check }
  o.on('--render', 'Write the .md render (no drift assertion)') { mode = :render_only }
end.parse!

abort "capability-check: ledger not found: #{LEDGER_JSON}" unless File.file?(LEDGER_JSON)
ledger = JSON.parse(File.read(LEDGER_JSON))
caps = ledger['capabilities'] || []

failures = []

# --- currentEvidence: resolve file:line:snippet at HEAD -----------------------
def resolve_current_evidence(ev)
  return 'currentEvidence.file missing' unless ev && ev['file']
  file = ev['file']
  return "file not found at HEAD: #{file}" unless File.file?(file)
  lines = File.readlines(file).map { |l| l.chomp }
  line = ev['line']
  snippet = ev['snippet']
  if line
    return "line #{line} out of range in #{file} (#{lines.size} lines)" if line < 1 || line > lines.size
    actual = lines[line - 1]
    if snippet && !actual.include?(snippet)
      return "snippet not at #{file}:#{line}\n      expected line to contain: #{snippet.inspect}\n      actual line:              #{actual.strip.inspect}"
    end
  elsif snippet
    return "snippet not found anywhere in #{file}: #{snippet.inspect}" unless lines.any? { |l| l.include?(snippet) }
  end
  nil
end

# --- negativeEvidence: content grep OR absent-file globs ----------------------
def excluded?(path, excluded_globs)
  excluded_globs.any? do |ex|
    prefix = ex.sub(/\*+.*\z/, '').chomp('/')
    prefix.empty? ? false : (path == prefix || path.start_with?("#{prefix}/"))
  end
end

def check_negative_evidence(neg)
  return 'negativeEvidence missing' unless neg
  expected = neg['expectedMatches'] || 0

  if neg['absentFileGlobs']
    hits = neg['absentFileGlobs'].flat_map { |g| Dir.glob(g, File::FNM_CASEFOLD) }.uniq.select { |f| File.file?(f) }
    return "absentFileGlobs expected #{expected} file(s), found #{hits.size}:\n      #{hits.join("\n      ")}" if hits.size != expected
    return nil
  end

  scopes   = neg['grepScopes'] || []
  patterns = neg['patterns'] || []
  excluded = neg['excludedPaths'] || []
  return 'negativeEvidence has neither grepScopes/patterns nor absentFileGlobs' if scopes.empty? || patterns.empty?

  regexes = patterns.map { |p| Regexp.new(p, Regexp::IGNORECASE) }
  files = scopes.flat_map { |g| Dir.glob(g) }.uniq.select { |f| File.file?(f) }
  files.reject! { |f| excluded?(f, excluded) }

  matches = []
  files.each do |f|
    File.foreach(f).with_index(1) do |text, ln|
      if regexes.any? { |re| re.match?(text) }
        matches << "#{f}:#{ln}: #{text.strip[0, 100]}"
      end
    end
  end
  return "negativeEvidence expected #{expected} match(es), found #{matches.size}:\n      #{matches.first(12).join("\n      ")}" if matches.size != expected
  nil
end

# --- validate every row -------------------------------------------------------
caps.each do |cap|
  id = cap['id'] || '(no id)'
  status = cap['status']
  case status
  when 'built', 'partial'
    err = resolve_current_evidence(cap['currentEvidence'])
    failures << "[#{id}] (#{status}) #{err}" if err
  when 'planned'
    if cap['currentEvidence']
      err = resolve_current_evidence(cap['currentEvidence'])
      failures << "[#{id}] (planned) #{err}" if err
    end
  when 'deliberately-not-done'
    err = check_negative_evidence(cap['negativeEvidence'])
    failures << "[#{id}] (deliberately-not-done) #{err}" if err
  else
    failures << "[#{id}] unknown status: #{status.inspect}"
  end
end

# --- markdown render (deterministic; anchored to meta.generatedDate) ----------
def render_markdown(ledger, caps)
  meta = ledger['meta'] || {}
  gen  = meta['generatedDate'] || 'unspecified'
  by_status = ->(s) { caps.select { |c| c['status'] == s } }

  out = +""
  out << "# LingoLinq Capability Ledger\n\n"
  out << "> Generated from `audit-reports/CAPABILITY-LEDGER.json` by `scripts/capability-check.rb --render`.\n"
  out << "> Do not hand-edit; edit the JSON (the source of truth) and re-render.\n"
  out << ">\n"
  out << "> **Status: #{meta['status'] || 'unspecified'}.** `built`/`partial` rows' `currentEvidence` is\n"
  out << "> validated to resolve at HEAD, and `deliberately-not-done` rows' `negativeEvidence` is\n"
  out << "> enforced, by `scripts/capability-check.rb --check` in CI (audit-artifacts-integrity). A\n"
  out << "> capability is a present-tense claim: if the backing code is removed, the check goes red.\n"
  out << "> Verified against `#{meta['verifiedAgainstBranch'] || 'staging'}`; generated #{gen}.\n\n"

  section = lambda do |title, status, kind|
    rows = by_status.call(status)
    return if rows.empty?
    out << "## #{title} (#{rows.size})\n\n"
    if kind == :negative
      out << "| Capability | Negative-evidence scope | Expected |\n|---|---|---|\n"
      rows.each do |c|
        neg = c['negativeEvidence'] || {}
        scope = if neg['absentFileGlobs']
                  "absent files: #{neg['absentFileGlobs'].join(', ')}"
                else
                  "#{(neg['grepScopes'] || []).join(', ')} for #{(neg['patterns'] || []).join('/')}"
                end
        out << "| #{c['capability']} | #{scope} | #{neg['expectedMatches'] || 0} matches |\n"
      end
    else
      out << "| Capability | Evidence (HEAD) | Anti-claim / note |\n|---|---|---|\n"
      rows.each do |c|
        ev = c['currentEvidence'] || {}
        anchor = ev['file'] ? "`#{ev['file']}#{ev['line'] ? ":#{ev['line']}" : ''}`" : "(none)"
        note = c['antiClaim'] || c['notes'] || ''
        out << "| #{c['capability']} | #{anchor} | #{note} |\n"
      end
    end
    out << "\n"
  end

  section.call('Built', 'built', :positive)
  section.call('Partial', 'partial', :positive)
  section.call('Planned', 'planned', :positive)
  section.call('Deliberately not done -- out-of-scope by design', 'deliberately-not-done', :negative)

  out << "---\n\n"
  out << "*Framing: \"deliberately not done\" means out-of-scope by design, never a known gap shipped without. "
  out << "These rows exist to stop over-claims, mirroring the \"Deliberately not claimed\" section of `COMPLIANCE_PROGRAM_OVERVIEW.md`.*\n"
  out
end

rendered = render_markdown(ledger, caps)

# --- report validation --------------------------------------------------------
unless failures.empty?
  warn "capability-check: #{failures.size} FAILURE(S)\n"
  failures.each { |f| warn "  - #{f}" }
  warn "\nFix the ledger row or the code it cites, then re-run. Do not commit a red ledger."
  exit 1
end

case mode
when :check
  on_disk = File.file?(RENDER_MD) ? File.read(RENDER_MD) : nil
  if on_disk != rendered
    warn "capability-check: #{RENDER_MD} is out of sync with the JSON. Run `ruby scripts/capability-check.rb` to regenerate."
    exit 1
  end
  puts "capability-check: OK (#{caps.size} capabilities validated at HEAD; render in sync)"
when :render_only, :validate_and_write
  File.write(RENDER_MD, rendered)
  puts "capability-check: OK (#{caps.size} capabilities validated at HEAD; #{RENDER_MD} written)"
end
