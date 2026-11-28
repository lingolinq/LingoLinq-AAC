#!/usr/bin/env ruby
# Second opinion on the generated package, using the same `obf` gem LingoLinq imports with.
#   ruby scripts/periodic_table/check_with_obf_gem.rb output/periodic_table/periodic-table.obz
# 1. OBF::External.from_obz is the first step of LingoLinq's own import (Converters::LingoLinq.from_obz).
# 2. OBF::Validator is the Open Board Format reference validator.
require 'obf'
require 'json'
# The gem's validator predates Ruby 3.2, which removed Fixnum.
Fixnum = Integer unless defined?(Fixnum)
path = ARGV[0] or abort("usage: check_with_obf_gem.rb path/to/file.obz")

content = OBF::External.from_obz(path, {})
boards = content['boards']
elements = boards.flat_map { |b| b['buttons'].map { |x| x['ext_lingolinq_external_id'] } }.compact.uniq
puts "from_obz: #{boards.length} boards, #{content['images'].length} images, #{content['sounds'].length} sounds"
puts "from_obz: #{boards.sum { |b| b['buttons'].length }} buttons, #{elements.length} distinct elements"
ids = boards.map { |b| b['id'] }
dangling = boards.flat_map { |b| b['buttons'].select { |x| x['load_board'] && !ids.include?(x['load_board']['id']) } }
puts "from_obz: #{dangling.length} links that do not resolve"
no_data = content['images'].reject { |i| i['data'].to_s.start_with?('data:image/svg+xml;base64,') }
puts "from_obz: #{no_data.length} images without embedded data"

# 3. Replay what Converters::LingoLinq.from_external does to pictures. It gives every board the
#    package-wide picture list, looks pictures up by id, and then overwrites the id of each
#    picture it used with the new record's id. A picture id shared by two boards is therefore
#    gone by the time the second board looks for it, and that button imports with no picture.
unresolved = 0
serial = 0
boards.each do |b|
  by_id = {}
  content['images'].each { |i| by_id[i['id']] = i }
  wanted = b['buttons'].map { |x| x['image_id'] }.compact
  unresolved += wanted.count { |id| !by_id.key?(id) }
  wanted.uniq.each { |id| by_id[id]['id'] = "record-#{serial += 1}" if by_id[id] }
end
puts "importer replay: #{unresolved} buttons would lose their picture on import"

content = OBF::External.from_obz(path, {})
res = OBF::Validator.validate_obz(path)
flat = []
walk = lambda do |r, where|
  (r[:results] || []).each { |c| flat << [where, c] unless c['valid'] && (c['warnings'] || []).empty? }
  (r[:sub_results] || []).each { |s| walk.call(s, s[:filename]) }
end
walk.call(res, res[:filename])
puts "validator: valid=#{res[:valid]} errors=#{res[:errors]} warnings=#{res[:warnings]}"
flat.group_by { |_w, c| (c['error'] || (c['warnings'] || []).first).to_s }.each do |msg, list|
  puts "  #{list.length}x #{msg}"
end
exit(dangling.empty? && no_data.empty? && unresolved == 0 && res[:errors].to_i == 0 && elements.length == 118 ? 0 : 1)
