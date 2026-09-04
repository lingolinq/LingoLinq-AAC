# Fixture check for SpecialVocalizationScan. Plain Ruby, no Rails, no DB:
#   ruby scripts/lib/special_vocalization_scan_check.rb
#
# Every damage shape here is modelled on how the corresponding destroyer actually writes to
# disk, and each has a matching NEGATIVE case, because a scanner that reports zero is only
# meaningful if it is known to fire.
require_relative 'special_vocalization_scan'
S = SpecialVocalizationScan

$failures = 0
def check(name, actual, expected)
  if actual == expected
    puts "  ok    #{name}"
  else
    $failures += 1
    puts "  FAIL  #{name}\n          expected #{expected.inspect}\n          actual   #{actual.inspect}"
  end
end

def shapes(found)
  found.reject { |_, v| v.empty? }.map { |k, v| [k, v.map(&:first)] }.sort.to_h
end

KEY_Q     = { 'id' => 1, 'label' => 'q', 'vocalization' => '+q' }
KEY_SHIFT = { 'id' => 2, 'label' => 'shift', 'vocalization' => ':shift' }
PREDICT   = { 'id' => 3, 'label' => 'the', 'vocalization' => ':suggestion' }
WORD      = { 'id' => 4, 'label' => 'more', 'vocalization' => 'more' }
CONTENT   = [KEY_Q, KEY_SHIFT, PREDICT, WORD]

puts 'healthy board (negative control)'
check('nothing reported',
      shapes(S.classify(effective: CONTENT, base: CONTENT)), {})
check('no board-level fallback',
      S.board_level(effective: CONTENT), nil)

puts
puts 'override_nil — destroyers 1-4 on a content-backed board'
# track_differences turns a deleted key into content_overrides[id][key] = nil
# (board_content.rb:217), and load_content then drops the field.
eff = [KEY_Q.reject { |k, _| k == 'vocalization' }, KEY_SHIFT, PREDICT, WORD]
check('one button flagged, value read from content',
      S.classify(effective: eff, base: CONTENT,
                 overrides: { '1' => { 'vocalization' => nil } }),
      { 'override_nil' => [['1', '+q']] })
check('an override that nulls a NON-special is not flagged',
      shapes(S.classify(effective: [KEY_Q, KEY_SHIFT, PREDICT, WORD.reject { |k, _| k == 'vocalization' }],
                        base: CONTENT, overrides: { '4' => { 'vocalization' => nil } })), {})

puts
puts 'content_drop — translate_set deleted the key from the board OWN array'
# board.rb:2681 `button.delete('vocalization')`, persisted to settings['buttons'] (2700).
own = [KEY_Q.reject { |k, _| k == 'vocalization' }, KEY_SHIFT, PREDICT, WORD]
check('flagged, value read from the intact content row',
      S.classify(effective: own, base: CONTENT, own_buttons: own),
      { 'content_drop' => [['1', '+q']] })
check('same array with NO content row is not a content_drop',
      shapes(S.classify(effective: own, base: [], own_buttons: own)), {})

puts
puts 'label_swap — destroyer 1 before destroyer 2 deletes it'
# _localized_button_fields set vocalization = label, so '+q' reads back as 'q'.
swapped = [KEY_Q.merge('vocalization' => 'q'), KEY_SHIFT, PREDICT, WORD]
check('flagged from content',
      S.classify(effective: swapped, base: CONTENT),
      { 'label_swap' => [['1', '+q']] })
check('a word button whose vocalization equals its label is NOT flagged',
      shapes(S.classify(effective: CONTENT, base: CONTENT)), {})

puts
puts 'translations — relinking, the only shape with no content source'
# update_default_locale! records the original at relinking.rb:176 before overwriting.
trans = { '2' => { 'en' => { 'label' => 'shift', 'vocalization' => ':shift' },
                   'es' => { 'label' => 'mayus' } },
          'default' => 'en', 'board_name' => { 'en' => 'Keys' } }
lost = [KEY_Q, KEY_SHIFT.merge('label' => 'mayus').reject { |k, _| k == 'vocalization' }, PREDICT, WORD]
check('flagged, value read from the witness',
      S.classify(effective: lost, base: [], translations: trans),
      { 'translations' => [['2', ':shift']] })
check('reserved translation keys are not read as button ids',
      S.translation_witness({ 'default' => 'en', 'board_name' => { 'en' => ':x' } }, 'default'), nil)
check('a translations entry with no special is not a witness',
      S.translation_witness({ '2' => { 'es' => { 'vocalization' => 'mayus' } } }, '2'), nil)

puts
puts 'board-level fallbacks'
stripped = CONTENT.map { |b| b.reject { |k, _| k == 'vocalization' } }
check('baked_ancestor fires on PARTIAL loss, not just total',
      S.board_level(effective: [KEY_Q, WORD], ancestor_specials: 3, ancestor_key: 'a/b'),
      ['baked_ancestor', 2, 'ancestor a/b has 3, this has 1'])
check('no ancestor advantage => no baked_ancestor',
      S.board_level(effective: CONTENT, ancestor_specials: 3), nil)
keys = (1..20).map { |i| { 'id' => i, 'label' => ('a'.ord + i % 26).chr } }
check('keyboard_shape fires on a specials-free letter grid',
      S.board_level(effective: keys)&.first, 'keyboard_shape')
check('keyboard_shape does NOT fire on an ordinary word board',
      S.board_level(effective: [WORD, { 'id' => 9, 'label' => 'please' }]), nil)
check('5 letters plus a space button is enough',
      S.board_level(effective: (1..5).map { |i| { 'id' => i, 'label' => ('a'.ord + i).chr } } +
                               [{ 'id' => 9, 'label' => 'space' }])&.first, 'keyboard_shape')
check('stripped content with no ancestor and few letters stays silent',
      S.board_level(effective: stripped), nil)

puts
if $failures.zero?
  puts 'all checks passed'
else
  puts "#{$failures} FAILED"
  exit 1
end
