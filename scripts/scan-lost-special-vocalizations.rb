# Find (and optionally repair) boards that have lost their SPECIAL vocalizations.
#
# A vocalization beginning ':' or '+' is an ACTION, not a word — ':suggestion' marks a
# word-prediction slot, '+q' appends a letter, ':shift' and ':space' do what they say, and
# '+n't' is an inflection modifier. Delete it and the button silently becomes an ordinary
# word button: the QWERTY keys stop typing, shift/space speak themselves aloud, and word
# prediction stops running. No error is raised anywhere.
#
# SIX CONFIRMED DESTROYERS (all now guarded in code; this script finds boards damaged
# BEFORE the guards landed — no code change brings the data back):
#
#   1. board-detail `_localized_button_fields`  — replaced a special with the LABEL
#   2. `edit_manager.process_for_saving`        — drops a vocalization equal to the label
#   3. board-detail non-default-locale branch   — nulled it after (2)
#   4. board/index.js (the CLASSIC editor)      — byte-for-byte twin of (3)
#   5. `Board#translate_set`                    — deleted anything it could not translate
#   6. `Relinking#update_default_locale!`       — overwrote it from a locale entry with none
#
# Those land on disk in DIFFERENT SHAPES, which is why detecting only one or two of them
# understates the damage. This script looks for all of them, per BUTTON rather than per
# board, and picks the best available repair source for each:
#
#   REPAIRABLE (a definite source value exists)
#     override_nil     the board shares a BoardContent and stores
#                      content_overrides['buttons'][id]['vocalization'] = nil, while the
#                      shared content still carries the special. Delete that one key.
#                      (What destroyers 1-4 leave on a content-backed board.)
#     content_drop     the board has its OWN settings['buttons'] which lost the key, while
#                      its BoardContent still has it. `load_content` prefers the board's own
#                      array, so the board is serving damaged buttons even though the
#                      content row is intact. (What destroyer 5 leaves when
#                      `track_differences` did not fold the array back into overrides.)
#     label_swap       the effective vocalization EQUALS the button label while the content
#                      or the translations map says it was special — the exact corruption
#                      signature destroyer 1 produces, caught before destroyer 2 deletes it.
#     translations     the content has no special either, but settings['translations']
#                      [id][locale]['vocalization'] still does. `update_default_locale!`
#                      records the original there BEFORE overwriting it
#                      (relinking.rb:176), so the witness IS the repair source. This is the
#                      only shape that works on a board with no BoardContent at all.
#
#   REPORT ONLY (no source value on this record)
#     baked_ancestor   the board's own content has FEWER specials than an ancestor's. This
#                      is what a damaged board turns into once COPIED: `apply_clone` ->
#                      `generate_from` snapshots the EFFECTIVE buttons (nulls included) into
#                      a fresh content row and clears the override map, so there is no
#                      override left to delete. Repair needs values from the ancestor and a
#                      human decision — never automated here.
#     keyboard_shape   no witness anywhere, but the board LOOKS like a keyboard (many
#                      single-character labels, or a 'space'/'shift'/'delete' button) and has
#                      no specials at all. Lowest confidence; listed separately so it never
#                      inflates the real count.
#
# Usage (read-only by default):
#   bundle exec rails runner scripts/scan-lost-special-vocalizations.rb
#   bundle exec rails runner scripts/scan-lost-special-vocalizations.rb -- --since 2026-06-01
#   bundle exec rails runner scripts/scan-lost-special-vocalizations.rb -- --user someuser
#   bundle exec rails runner scripts/scan-lost-special-vocalizations.rb -- --key user/board
#   bundle exec rails runner scripts/scan-lost-special-vocalizations.rb -- --verbose
#   bundle exec rails runner scripts/scan-lost-special-vocalizations.rb -- --repair
#
# `--repair` touches ONLY the four repairable shapes, and only the `vocalization` field of
# the specific buttons that lost one. Everything else on the board — the user's real edits —
# is left exactly as it is. `settings` is paper-trailed, so every write is revertible.
#
# The classification itself lives in `scripts/lib/special_vocalization_scan.rb` (pure, no
# Rails) and is exercised against fixtures by `special_vocalization_scan_check.rb` — run
# that first if you are about to trust a zero from this scan.
#
# NOTE ON SCALE: Board#settings is `secure_serialize`d (encrypted at rest), so there is no
# way to prefilter this in SQL — every board has to be loaded and decrypted. Batches are
# small and `load_content`'s thread-local cache is cleared between them, because that cache
# is never reaped inside a runner and would otherwise grow for the whole scan.

require_relative 'lib/special_vocalization_scan'
S = SpecialVocalizationScan

BATCH = 200
ANCESTOR_DEPTH = 8

since   = nil
limit   = nil
repair  = ARGV.include?('--repair')
verbose = ARGV.include?('--verbose')
since   = Time.parse(ARGV[ARGV.index('--since') + 1]) if ARGV.index('--since')
limit   = ARGV[ARGV.index('--limit') + 1].to_i        if ARGV.index('--limit')
only_user = ARGV[ARGV.index('--user') + 1]            if ARGV.index('--user')
only_key  = ARGV[ARGV.index('--key') + 1]             if ARGV.index('--key')

# Every board, including those with no BoardContent row — the previous version of this
# script scoped to `where.not(board_content_id: nil)` and so could see neither the
# `translations` shape nor `keyboard_shape` at all.
scope = Board.all
scope = scope.where('boards.updated_at >= ?', since) if since
scope = scope.where(key: only_key) if only_key
if only_user
  u = User.find_by_path(only_user)
  abort "no such user: #{only_user}" unless u
  scope = scope.where(user_id: u.id)
end
scope = scope.limit(limit) if limit

total = scope.count(:all)
puts "scanning #{total} boards" \
     "#{since ? " updated since #{since}" : ''}" \
     "#{only_user ? " for user #{only_user}" : ''}" \
     "#{only_key ? " with key #{only_key}" : ''}" \
     "#{repair ? ' (REPAIR MODE — will write)' : ' (read-only)'}"

hits = Hash.new { |h, k| h[k] = [] }   # shape => [[key, count, detail], ...]
repaired_boards = 0
repaired_buttons = 0
scanned = 0
errors = []

# Walk parent_board_id upward, with a cycle guard and a depth cap, for the most specials any
# ancestor still holds. Checking one level (what the previous version did) misses a board
# whose immediate parent was damaged by the same sweep.
ancestor_specials = lambda do |board|
  seen = {}
  cur = board
  best = [0, nil]
  ANCESTOR_DEPTH.times do
    pid = cur.parent_board_id
    break if pid.nil? || seen[pid]
    seen[pid] = true
    cur = Board.where(id: pid).first
    break unless cur
    btns = (cur.board_content && cur.board_content.settings['buttons']) || cur.settings['buttons'] || []
    n = btns.count { |b| S.special?(b['vocalization']) }
    best = [n, cur.key] if n > best[0]
  end
  best
end

scope.includes(:board_content).find_in_batches(batch_size: BATCH) do |group|
  # `load_content` memoises decrypted content per board_content_id in a thread local that
  # nothing clears inside a runner. Left alone it accumulates every content row in the scan.
  Thread.current[:board_content_cache] = {}

  group.each do |board|
    scanned += 1
    begin
      settings  = board.settings || {}
      own       = settings['buttons']
      overrides = ((settings['content_overrides'] || {})['buttons'] || {})
      content   = board.board_content
      base      = (content && content.settings['buttons']) || []

      effective = BoardContent.load_content(board, 'buttons') || []
      next if effective.empty?

      found = S.classify(
        effective: effective,
        base: base,
        overrides: overrides,
        own_buttons: own,
        translations: BoardContent.load_content(board, 'translations') || {}
      )

      if found.any?
        found.each { |shape, list| hits[shape] << [board.key, list.size, nil] }

        if repair
          wrote = 0
          # On a content-backed board with no array of its own, edit the override map: that
          # is how the shared value is meant to reappear, and it leaves `track_differences`
          # nothing to recompute (board.rb:627 only folds a board that has its OWN buttons).
          use_overrides = !content.nil? && own.blank?

          found['override_nil'].each do |id, _|
            board.settings['content_overrides']['buttons'][id].delete('vocalization')
            wrote += 1
          end

          (found['content_drop'] + found['label_swap'] + found['translations']).each do |id, val|
            next if val.blank?
            if use_overrides
              board.settings['content_overrides'] ||= {}
              board.settings['content_overrides']['buttons'] ||= {}
              board.settings['content_overrides']['buttons'][id] ||= {}
              board.settings['content_overrides']['buttons'][id]['vocalization'] = val
            else
              target = (board.settings['buttons'] || []).detect { |b| b['id'].to_s == id }
              next unless target
              target['vocalization'] = val
            end
            wrote += 1
          end

          if wrote > 0
            board.settings_will_change!
            board.save!
            repaired_boards += 1
            repaired_buttons += wrote
          end
        end
        next
      end

      anc_count, anc_key = ancestor_specials.call(board)
      shape, count, detail = S.board_level(effective: effective,
                                           ancestor_specials: anc_count,
                                           ancestor_key: anc_key)
      if shape
        # Every destroyer runs through a SAVE, so a board with no edit history cannot have
        # been damaged by one — it was authored this way. Cheap to attach here (these two
        # shapes are rare) and it is the first thing a human triaging the list needs: the
        # two `keyboard_shape` hits on the dev DB are both imported CommuniKate spelling
        # pages whose letters were never special, not damage.
        v = board.versions.count rescue nil
        detail = [detail, v.nil? ? nil : (v.zero? ? 'NEVER EDITED — authored this way' : "#{v} edits")].compact.join(', ')
        hits[shape] << [board.key, count, detail]
      end
    rescue => e
      errors << [board.key, e.class.to_s, e.message.to_s[0, 120]]
    end
  end

  $stderr.print "\r  #{scanned}/#{total}"
end
$stderr.puts "\r  #{scanned}/#{total} scanned"

def report(title, shapes, hits, verbose)
  puts
  puts title
  shapes.each do |shape|
    rows = hits[shape]
    buttons = rows.sum { |r| r[1] }
    puts format('  %-16s %d board%s, %d button%s',
                shape, rows.size, rows.size == 1 ? '' : 's',
                buttons, buttons == 1 ? '' : 's')
    (verbose ? rows : rows.sort_by { |r| -r[1] }.first(25)).each do |k, n, detail|
      puts format('      %-52s %3d %s', k, n, detail || '')
    end
    puts "      ... #{rows.size - 25} more (--verbose to list)" if !verbose && rows.size > 25
  end
end

report('REPAIRABLE (a definite source value exists on the record):', S::REPAIRABLE, hits, verbose)
report('REPORT ONLY (needs an ancestor and a human decision):', S::REPORT_ONLY, hits, verbose)

puts
repairable_boards = S::REPAIRABLE.flat_map { |s| hits[s].map(&:first) }.uniq.size
repairable_buttons = S::REPAIRABLE.sum { |s| hits[s].sum { |r| r[1] } }
puts "TOTAL repairable: #{repairable_buttons} buttons across #{repairable_boards} boards"
puts "TOTAL report-only: #{S::REPORT_ONLY.sum { |s| hits[s].size }} boards"

if errors.any?
  puts
  puts "ERRORS on #{errors.size} boards (not classified either way):"
  errors.first(20).each { |k, c, m| puts format('  %-52s %s: %s', k, c, m) }
end

puts
if repair
  puts "repaired #{repaired_buttons} buttons across #{repaired_boards} boards"
  puts 're-run read-only to confirm the repairable counts are now 0'
else
  puts 'read-only; re-run with --repair to fix the four repairable shapes'
end
