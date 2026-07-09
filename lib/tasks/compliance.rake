# frozen_string_literal: true

namespace :compliance do
  desc 'EU AI Act Article 50(2) marking audit: verify AI-generated boards (and their copies) carry a valid signed marker'
  task article_50_marking_audit: :environment do
    require Rails.root.join('lib', 'art50_marking_audit').to_s
    stats = Art50MarkingAudit.run

    o = stats[:originals]
    c = stats[:copies]

    puts '== EU AI Act Article 50(2) marking audit =='
    puts 'Scope: verifies markers on inspectable boards. It CANNOT detect an AI board'
    puts 'whose marker is entirely absent (EU_AI_ACT_ARTICLE_50_PLAN.md Sec 8.4); AiApiLog'
    puts 'is the system of record for what was generated.'
    puts "Originals: #{o[:total]} AI-marked, #{o[:valid]} valid, #{o[:invalid]} invalid (#{stats[:originals_coverage]}% valid)"
    puts "Copies:    #{c[:total]} from AI sources, #{c[:valid]} still marked, #{c[:stripped]} stripped (#{stats[:copies_coverage]}% valid)"
    puts "Unreadable boards (could not decrypt): #{stats[:unreadable]}"

    if o[:invalid_ids].any?
      puts "Originals with invalid/unverifiable markers: #{o[:invalid_ids].join(', ')}"
    end
    if c[:stripped_ids].any?
      puts "Copies that lost their marker: #{c[:stripped_ids].join(', ')}"
    end

    case stats[:status]
    when :clean
      puts 'RESULT: CLEAN (no marking violation among inspectable boards; see scope note above)'
    when :indeterminate
      puts "RESULT: INDETERMINATE (#{stats[:unreadable]} board(s) could not be inspected)"
      abort('article_50_marking_audit could not inspect every board (indeterminate)')
    when :violations
      puts 'RESULT: VIOLATIONS (see invalid/stripped ids above)'
      abort('article_50_marking_audit found invalid or stripped AI markers')
    end
  end
end
