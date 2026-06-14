#!/usr/bin/env ruby
# frozen_string_literal: true

# compliance-status-context.rb - safe run-context lines for /compliance-status SKILL.md.
#
# Replaces inline `!`ruby -rjson -e '...'` blocks that read FINDINGS.json at skill-load
# time. Output is limited to known-safe ASCII tokens so register content cannot inject
# shell metacharacters or prompt instructions into the skill preamble.

require 'json'
require 'open3'

def git_value(args)
  out, status = Open3.capture2('git', *args)
  return 'unavailable' unless status.success?

  out.strip.gsub(/[^\w.\/-]/, '')
end

proj = Dir.pwd
register_path = File.join(proj, 'audit-reports', 'FINDINGS.json')
calendar_path = File.join(proj, 'audit-reports', 'compliance-calendar.json')

register_present = File.file?(register_path) ? 'yes' : 'NO - run Phase 1 first'
calendar_present = File.file?(calendar_path) ? 'yes' : 'no (Phase 3 deliverable)'

counts = 'unavailable'
if File.file?(register_path)
  begin
    data = JSON.parse(File.read(register_path))
    openish = (data['findings'] || []).select do |f|
      %w[open remediated-unverified].include?(f['status'])
    end
    critical = openish.count { |f| f['severity'] == 'critical' }
    high = openish.count { |f| f['severity'] == 'high' }
    counts = "critical=#{critical} high=#{high}"
  rescue JSON::ParserError
    counts = 'unavailable'
  end
end

puts "- Audited commit: #{git_value(%w[rev-parse HEAD])}"
puts "- Audited ref: #{git_value(%w[rev-parse --abbrev-ref HEAD])}"
puts "- Register present? #{register_present}"
puts "- Open Critical/High (register): #{counts}"
puts "- Calendar present? #{calendar_present}"
