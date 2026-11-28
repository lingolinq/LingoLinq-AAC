#!/usr/bin/env ruby
# frozen_string_literal: true

# audit-fanout-gate.rb - decide whether a finder fan-out may reach the register (LL-c667ec15e3).
#
# /audit-run and /ember-audit-run run this after their finders return and before audit-merge.rb. A
# refusal stops the runbook; audit-merge.rb does not read this result, so the stop is the runbook's.
# For each output it needs:
#   1. An examination-log line from this run: agent and full SHA match, ts at or after --since, and
#      one distinct agent_id per output. --since stops an earlier attempt at the same SHA passing for
#      this one; the id count stops one spawn standing behind several slices.
#   2. An output file written after --since, with a findings array and the finder's own domain.
#   3. The checklistToken from the finder's own skill. The token is named only in that skill, so
#      returning it shows the checklist reached the finder.
#   4. guardCanary "denied", and no logged `mktemp`. The guard denies mktemp and a denied call never
#      reaches the PostToolUse logger, so a logged one means the guard let it run.
#   5. An agent definition that wires the read-only guard on Bash and a logger naming this agent.
#
# Limits: this catches a finder that lost its wiring, not an orchestrator forging evidence. Output is
# counted against log ids, not tied to one, because a finder does not know its own id. A canary hidden
# behind another command (`cd x && mktemp`) logs as `cd`, so that part rests on the finder's report.
#
# Usage:
#   ruby scripts/audit-fanout-gate.rb --sha <auditedSha> --since <ISO8601> [--mode full|light] \
#     --finder privacy-auditor=/tmp/finder-privacy.json --finder infra-auditor=/tmp/finder-infra.json ...
#   ruby scripts/audit-fanout-gate.rb --sha <auditedSha> --since <ISO8601> --mode partial --expect 7 \
#     --finder ember-upgrade-auditor=/tmp/ember-finder-components.json ...
#
# Modes: full (default) needs exactly the six /audit-run finders, one output each. light may omit only
# accessibility and code-hygiene. partial is for ember slices and single re-emits: any finders, and the
# number of outputs must equal --expect. --root defaults to the git toplevel.
#
# Exit codes: 0 = every finder passed; 1 = refused; 2 = usage error (also a refusal: do not merge).

require 'json'
require 'optparse'
require 'time'
require 'yaml'

FULL_RUN_FINDERS = %w[
  privacy-auditor infra-auditor api-auditor dependency-auditor accessibility-auditor code-hygiene-auditor
].freeze
LIGHT_RUN_OPTIONAL = %w[accessibility-auditor code-hygiene-auditor].freeze
MODES = %w[full light partial].freeze
TOKEN_LINE = /^- `"checklistToken": "([a-z0-9-]+)"`/
READ_UTF8 = { encoding: 'UTF-8' }.freeze # Not the locale default: a C locale cannot read these files.

def usage_error(message)
  warn "audit-fanout-gate: #{message}"
  exit 2
end

def frontmatter_of(root, agent)
  agent_file = File.join(root, '.claude', 'agents', "#{agent}.md")
  return nil unless File.file?(agent_file)

  YAML.safe_load(File.read(agent_file, **READ_UTF8)[/\A---\n(.*?)\n---/m, 1].to_s) || {}
end

# The skill comes from the agent definition, so this table cannot drift from the agent files.
def expected_token(root, frontmatter)
  skill = frontmatter['skills']&.first
  return [nil, 'agent definition names no skill'] unless skill

  skill_file = File.join(root, '.claude', 'skills', skill, 'SKILL.md')
  return [nil, "no skill file for #{skill}"] unless File.file?(skill_file)

  token = File.read(skill_file, **READ_UTF8)[TOKEN_LINE, 1]
  token ? [token, nil] : [nil, "skill #{skill} carries no checklistToken line"]
end

# Hook commands from one event whose matcher covers Bash.
def bash_hook_commands(frontmatter, event)
  entries = Array(frontmatter.dig('hooks', event))
  entries.select { |entry| entry['matcher'].to_s.split('|').include?('Bash') }
         .flat_map { |entry| Array(entry['hooks']).map { |hook| hook['command'].to_s } }
end

def wiring_problems(frontmatter, agent)
  problems = []
  guard = bash_hook_commands(frontmatter, 'PreToolUse').any? { |cmd| cmd.include?('audit-readonly-guard.sh') }
  problems << 'agent definition wires no read-only guard on Bash' unless guard
  logger = /audit-run-logger\.sh"?\s+#{Regexp.escape(agent)}\s*\z/
  problems << 'agent definition wires no logger naming this agent' unless
    bash_hook_commands(frontmatter, 'PostToolUse').any? { |cmd| cmd.match?(logger) }
  problems
end

def domain_ok?(agent, domain)
  return domain.to_s.start_with?('ember-') if agent == 'ember-upgrade-auditor'

  domain == agent.delete_suffix('-auditor')
end

# One finder output file. Returns the problems found; an empty list passes.
def output_problems(path, agent, sha, since, token)
  doc = JSON.parse(File.read(path, **READ_UTF8))
  return ['output is not a JSON object'] unless doc.is_a?(Hash)

  problems = []
  problems << "output #{path} is older than --since: left over from an earlier run, or --since was taken after the finder ran" if File.mtime(path) < since
  problems << "output auditedSha is #{doc['auditedSha'].inspect}" unless doc['auditedSha'] == sha
  problems << "output domain is #{doc['domain'].inspect}" unless domain_ok?(agent, doc['domain'])
  problems << 'output findings is not an array' unless doc['findings'].is_a?(Array)
  problems << 'checklistToken missing or wrong: checklist not loaded, or the finder skipped its receipt' unless token && doc['checklistToken'] == token
  problems << "guardCanary is #{doc['guardCanary'].inspect}, expected \"denied\"" unless doc['guardCanary'] == 'denied'
  problems
rescue Errno::ENOENT
  ["no output file at #{path} for #{agent}"]
rescue JSON::ParserError
  ["output file #{path} is not valid JSON"]
end

# Log lines belonging to this run. A line that does not parse cannot count as evidence.
def run_log_lines(root, sha, since)
  file = File.join(root, 'audit-reports', 'run-log', "examined-#{sha[0, 8]}.jsonl")
  return [] unless File.file?(file)

  File.readlines(file, **READ_UTF8).filter_map do |line|
    rec = JSON.parse(line)
    rec if rec['sha'] == sha && Time.iso8601(rec['ts'].to_s) >= since
  rescue JSON::ParserError, ArgumentError
    nil
  end
end

sha = nil
since = nil
mode = 'full'
expected_count = nil
root = nil
finders = []
begin
  OptionParser.new do |o|
    o.on('--sha SHA', 'Full audited commit SHA') { |v| sha = v }
    o.on('--since TIME', 'ISO8601 time, recorded just before the fan-out') { |v| since = v }
    o.on('--mode MODE', 'full (default), light or partial') { |v| mode = v }
    o.on('--expect N', Integer, 'partial mode: how many outputs this run must list') { |v| expected_count = v }
    o.on('--root DIR', 'Repo root (default: git toplevel)') { |v| root = v }
    o.on('--finder AGENT=JSON', 'A finder and its output file; repeatable') do |v|
      agent, path = v.split('=', 2)
      usage_error("--finder needs AGENT=JSON, got #{v.inspect}") if agent.to_s.empty? || path.to_s.empty?
      finders << [agent, path]
    end
  end.parse!(ARGV)
rescue OptionParser::ParseError => e
  usage_error(e.message)
end

usage_error('--sha must be a full 40-character commit SHA') unless sha.to_s.match?(/\A\h{40}\z/)
usage_error('at least one --finder is required') if finders.empty?
usage_error("--mode must be one of #{MODES.join(', ')}") unless MODES.include?(mode)
usage_error('--mode partial needs --expect N') if mode == 'partial' && expected_count.nil?
usage_error('--expect only applies to --mode partial') if mode != 'partial' && expected_count
begin
  since = Time.iso8601(since.to_s)
rescue ArgumentError
  usage_error('--since must be an ISO8601 time, for example 2026-10-30T18:00:00Z')
end
root ||= `git rev-parse --show-toplevel`.strip
usage_error('could not resolve the repo root; pass --root') if root.empty?

lines = run_log_lines(root, sha, since)
results = Hash.new { |h, k| h[k] = [] }
listed = finders.map(&:first)

finders.each do |agent, path|
  frontmatter = frontmatter_of(root, agent)
  if frontmatter
    token, token_problem = expected_token(root, frontmatter)
    results[agent] << token_problem if token_problem
    results[agent].concat(wiring_problems(frontmatter, agent))
  else
    token = nil
    results[agent] << "no agent definition at .claude/agents/#{agent}.md"
  end
  results[agent].concat(output_problems(path, agent, sha, since, token))
end

finders.group_by { |_agent, path| File.exist?(path) ? File.realpath(path) : File.expand_path(path) }.each_value do |same|
  next if same.size == 1

  same.each { |agent, path| results[agent] << "output #{path} is listed more than once" }
end

listed.uniq.each do |agent|
  mine = lines.select { |rec| rec['agent'] == agent }
  outputs = listed.count(agent)
  ids = mine.filter_map { |rec| rec['agent_id'] }.reject(&:empty?).uniq
  if mine.empty?
    results[agent] << 'no examination-log line from this run: logger did not run, or the finder ran at another HEAD'
  elsif ids.size < outputs
    results[agent] << "#{ids.size} spawn id(s) in the log for #{outputs} output(s): logger did not run for every spawn"
  end
  results[agent] << 'logged a mktemp call: read-only guard did not deny it' if mine.any? { |rec| rec['cmd'].to_s.start_with?('mktemp') }
end

if mode == 'partial'
  results[listed.first] << "--expect #{expected_count} but #{listed.size} output(s) listed" unless listed.size == expected_count
else
  required = mode == 'light' ? FULL_RUN_FINDERS - LIGHT_RUN_OPTIONAL : FULL_RUN_FINDERS
  (required - listed).each { |agent| results[agent] << "not listed, but mode #{mode} requires it" }
  (listed - FULL_RUN_FINDERS).uniq.each { |agent| results[agent] << 'not one of the six /audit-run finders; use --mode partial' }
  listed.tally.each { |agent, count| results[agent] << "#{count} outputs listed, mode #{mode} takes one output per finder" if count > 1 }
end

results.each do |agent, problems|
  log_count = lines.count { |rec| rec['agent'] == agent }
  puts format('%-24s %-7s log lines: %d', agent, problems.empty? ? 'PASS' : 'REFUSED', log_count)
  problems.uniq.each { |problem| puts "    - #{problem}" }
end

if results.values.all?(&:empty?)
  puts "audit-fanout-gate: PASS (#{results.size} finder(s) at #{sha[0, 8]}, mode #{mode})"
else
  puts 'audit-fanout-gate: REFUSED. Do not run audit-merge.rb; do not restamp meta.auditedSha.'
  exit 1
end
