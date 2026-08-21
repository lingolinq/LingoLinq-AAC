#!/usr/bin/env ruby
# frozen_string_literal: true
#
# render-domain-reports.rb - renders 6 per-finder-domain markdown audit reports from the
# findings register (audit-reports/FINDINGS.json). One report per /audit-run finder domain:
# privacy, infra, api, dependency, accessibility, code-hygiene. Code/path evidence only (the
# register is already PII-free); these are DRAFT views of the SSOT, not a separate source of truth.
#
# Usage: ruby scripts/render-domain-reports.rb [--outdir DIR]
#   Defaults to audit-reports/domain-reports/<auditedDate>/.

require 'json'
require 'fileutils'

register = JSON.parse(File.read('audit-reports/FINDINGS.json'))
meta = register['meta'] || {}
findings = register['findings'] || []

outdir = if (i = ARGV.index('--outdir')) then ARGV[i + 1]
         else "audit-reports/domain-reports/#{meta['auditedDate']}" end
FileUtils.mkdir_p(outdir)

DOMAINS = %w[privacy infra api dependency accessibility code-hygiene].freeze
DOMAIN_TITLES = {
  'privacy'       => 'Privacy & Data Protection (GDPR / FERPA / COPPA / HIPAA)',
  'infra'         => 'Infrastructure & Security (SOC2-style)',
  'api'           => 'API Contract (Ember <-> Rails)',
  'dependency'    => 'Dependency Freshness & CVEs',
  'accessibility' => 'Accessibility (WCAG 2.1 AA / EN 301 549)',
  'code-hygiene'  => 'Dead Code & AI-Slop'
}.freeze
FINDER = {
  'privacy' => 'privacy-auditor', 'infra' => 'infra-auditor', 'api' => 'api-auditor',
  'dependency' => 'dependency-auditor', 'accessibility' => 'accessibility-auditor',
  'code-hygiene' => 'code-hygiene-auditor'
}.freeze

# Explicit classification for the 15 pre-attribution (2026-04-09 seed + early-June) findings
# whose notes predate the "Surfaced by <domain> finder" convention. Eyeballed individually so a
# HIPAA-tagged infra item (redis-no-tls) is not mis-bucketed into privacy by framework alone.
MANUAL = {
  'LL-6619cc1811' => 'infra',   'LL-991d259b2a' => 'privacy', 'LL-a97357136e' => 'infra',
  'LL-ce00c8d3ad' => 'api',     'LL-55baae6d40' => 'privacy', 'LL-1890f6a922' => 'privacy',
  'LL-56f0f19fca' => 'infra',   'LL-d35cbdb313' => 'privacy', 'LL-310b464be4' => 'privacy',
  'LL-97f9001bb4' => 'infra',   'LL-b5c30235d3' => 'infra',   'LL-3483c28f3c' => 'infra',
  'LL-a2b45c2bcb' => 'infra',   'LL-5f0f4f52f8' => 'infra',   'LL-11db0dc848' => 'privacy'
}.freeze

def domain_of(f)
  return MANUAL[f['id']] if MANUAL.key?(f['id'])
  n = f['notes'].to_s
  if n =~ /Surfaced by (privacy|infra|api|dependency|accessibility|code-hygiene) finder/ then return $1 end
  if n =~ /(privacy|infra|api|dependency|accessibility|code-hygiene) (?:auditor|finder)/ then return $1 end
  fw = f['frameworks'] || []
  return 'accessibility' if fw.include?('WCAG')
  return 'infra' if fw.include?('SOC2')
  return 'privacy' if (fw & %w[FERPA COPPA HIPAA GDPR]).any?
  'infra'
end

SEV_ORDER = { 'critical' => 0, 'high' => 1, 'medium' => 2, 'low' => 3 }.freeze
SEV_LABEL = { 'critical' => 'CRITICAL', 'high' => 'HIGH', 'medium' => 'MEDIUM', 'low' => 'LOW' }.freeze

open = findings.select { |f| f['status'] == 'open' }
buckets = Hash.new { |h, k| h[k] = [] }
open.each { |f| buckets[domain_of(f)] << f }

# LL-6af580a23a (2026-08-16 dual-review): a finding moved out of 'open' via a hand-edit that
# fixes the forward path but leaves a real residual (see closureEvidence.verifierNote) is easy
# to lose track of if the domain view just drops it -- the reader has no way to learn it. Render
# these as their own section so a status move away from 'open' is visible, not silent.
remediated_unverified = findings.select { |f| f['status'] == 'remediated-unverified' }
remediated_buckets = Hash.new { |h, k| h[k] = [] }
remediated_unverified.each { |f| remediated_buckets[domain_of(f)] << f }

def loc(f)
  ev = f['evidence'] || {}
  if ev['file'].to_s != '' then "`#{ev['file']}`#{ev['line'] ? ":#{ev['line']}" : ''}"
  elsif ev['source'].to_s != '' then "runtime: `#{ev['source']}`"
  else '(no anchor)' end
end

def disposition(f)
  d = f.dig('disposition', 'state')
  d && d != 'untriaged' ? d : 'untriaged'
end

def adversary_note(f)
  n = f['notes'].to_s
  m = n.match(/adversary: (confirmed[^|]*|refuted[^|]*|uncertain[^|]*)/)
  m ? m[1].strip : nil
end

DOMAINS.each do |dom|
  fs = buckets[dom].sort_by { |f| [SEV_ORDER[f['severity']] || 9, f['id']] }
  counts = Hash.new(0)
  fs.each { |f| counts[f['severity']] += 1 }
  headline = %w[critical high medium low].map { |s| "#{counts[s]} #{SEV_LABEL[s]}" }.join(' · ')

  out = +""
  out << "# LingoLinq-AAC #{DOMAIN_TITLES[dom]} Audit\n\n"
  out << "**Run date:** #{meta['auditedDate']}  |  **Finder:** `#{FINDER[dom]}`  |  "
  out << "**Audited commit:** `#{meta['auditedSha'][0, 12]}` (`#{meta['auditedRef']}`)\n\n"
  out << "**Open findings in this domain:** #{fs.size}  (#{headline})\n\n"
  out << "> DRAFT view of the findings register (`audit-reports/FINDINGS.json`), the single source of truth. "
  out << "Statuses are verified against live code at the audited commit. Only Scot closes a finding, "
  out << "downgrades severity, or accepts risk. Evidence is code/path only; no student or patient data appears here.\n\n"

  if fs.empty?
    out << "No open findings in this domain at the audited commit.\n"
  else
    %w[critical high medium low].each do |sev|
      sub = fs.select { |f| f['severity'] == sev }
      next if sub.empty?
      out << "## #{SEV_LABEL[sev]} (#{sub.size})\n\n"
      sub.each do |f|
        out << "### #{f['title']}\n\n"
        out << "- **ID:** `#{f['id']}`  |  **ruleKey:** `#{f['ruleKey']}`  |  **confidence:** #{f['confidence']}\n"
        out << "- **Location:** #{loc(f)}\n"
        fw = (f['frameworks'] || [])
        out << "- **Frameworks:** #{fw.empty? ? '—' : fw.join(', ')}\n"
        out << "- **First seen:** #{f['firstSeen']}  |  **Last seen:** #{f['lastSeen']}  |  **Disposition:** #{disposition(f)}\n"
        adv = adversary_note(f)
        out << "- **Adversary:** #{adv}\n" if adv
        rem = (f['remediation'] || {})['options'].to_s
        unless rem.empty?
          out << "- **Remediation:** #{rem}\n"
        end
        out << "\n"
      end
    end
  end
  remfs = remediated_buckets[dom].sort_by { |f| [SEV_ORDER[f['severity']] || 9, f['id']] }
  unless remfs.empty?
    out << "\n## Remediated (awaiting verification) (#{remfs.size})\n\n"
    out << "Forward-fix applied and independently re-inspected, but not yet independently "
    out << "verified/closed -- still requires Scot's sign-off to close. If a residual is "
    out << "recorded in `closureEvidence.verifierNote`, this finding is NOT fully resolved.\n\n"
    remfs.each do |f|
      out << "### #{f['title']}\n\n"
      out << "- **ID:** `#{f['id']}`  |  **ruleKey:** `#{f['ruleKey']}`  |  **severity:** #{f['severity']}\n"
      out << "- **Location:** #{loc(f)}\n"
      note = f.dig('closureEvidence', 'verifierNote').to_s
      out << "- **Residual:** #{note}\n" unless note.empty?
      out << "\n"
    end
  end

  out << "\n---\n_Generated from the register at `#{meta['auditedSha']}`. Regenerate with "
  out << "`ruby scripts/render-domain-reports.rb`. Do not edit by hand._\n"

  path = File.join(outdir, "#{dom}-audit-#{meta['auditedDate']}.md")
  File.write(path, out)
  puts "wrote #{path}  (#{fs.size} findings: #{headline})"
end
