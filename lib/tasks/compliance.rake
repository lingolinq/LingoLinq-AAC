# frozen_string_literal: true

namespace :compliance do
  desc 'EU AI Act Article 50(2) marking audit: verify AI-generated boards (and their copies) carry a valid signed marker'
  task article_50_marking_audit: :environment do
    require Rails.root.join('lib', 'art50_marking_audit').to_s
    stats = Art50MarkingAudit.run

    o = stats[:originals]
    c = stats[:copies]

    puts '== EU AI Act Article 50(2) marking audit =='
    puts "Originals: #{o[:total]} AI-marked, #{o[:valid]} valid, #{o[:invalid]} invalid (#{stats[:originals_coverage]}% valid)"
    puts "Copies:    #{c[:total]} from AI sources, #{c[:valid]} still marked, #{c[:stripped]} stripped (#{stats[:copies_coverage]}% valid)"
    puts "Unreadable boards (skipped): #{stats[:unreadable]}"

    if o[:invalid_ids].any?
      puts "Originals with invalid/unverifiable markers: #{o[:invalid_ids].join(', ')}"
    end
    if c[:stripped_ids].any?
      puts "Copies that lost their marker: #{c[:stripped_ids].join(', ')}"
    end

    if stats[:compliant]
      puts 'RESULT: COMPLIANT (every AI-generated original and copy carries a valid marker)'
    else
      puts 'RESULT: NON-COMPLIANT (see invalid/stripped ids above)'
      abort('article_50_marking_audit found unmarked AI content')
    end
  end
end
