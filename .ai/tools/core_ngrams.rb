# USAGE: core_ngrams.rb [optional_word]
# Outputs a list of words that may come after the specified word
require 'json'
cores = JSON.parse(File.read('../coughdrop/lib/core_lists.json'))
commons = JSON.parse(File.read('../coughdrop_mobile/www/ngrams.arpa.json'))
ngrams = {}
cores.detect{|l| l['id'] == 'default' }['words'].each do |word|
  if commons[word]
    ngrams[word] = commons[word][0, ARGV[0] ? 100 : 10].map(&:first)
  end
end
puts ARGV[0].to_json
if ARGV[0] && ARGV[0].match(/\w+\*/)
  str = ARGV[0][0..-2]
  list = commons[""].select{|o| o[0].start_with?(str)}
  list = list.sort_by{|o| o[1] }.reverse.map(&:first)[0, 30]
  puts JSON.pretty_generate(list)
  list.each{|w| puts w }
elsif ARGV[0]
  puts JSON.pretty_generate(ngrams[ARGV[0]])
else
  puts JSON.pretty_generate(ngrams)
end