# Writes a curated category layout onto a board (2026-10-05).
#
# A layout file in lib/category_layouts/ holds library-board content only: button ids, the
# label each id must carry (a check, not data), and the outlined category blocks. It is applied
# through Board#process, so it is cleaned by Board#sanitize_category_layout exactly like any
# other save, and recorded as a PaperTrail version under WHODUNNIT.
#
# Refuses, and writes nothing, unless every placed id is a button on the target board with the
# expected label. Board copies keep their button ids, so one file serves a library board and
# its copies.
#
# Rake does not write an AuditEvent (CLAUDE.md, finding LL-7f7372e3eb). In a deployed
# environment run it through the audited console instead:
#   bin/audit_console runner 'CategoryLayoutSeeder.run("lingolinq/vocal-flair-112", "lib/category_layouts/vocal_flair_112.json")'
class CategoryLayoutSeeder
  WHODUNNIT = 'seed:category_layout'

  def self.run(board_key, file_path)
    apply(board_key, JSON.parse(File.read(file_path)))
  end

  def self.apply(board_key, data)
    board = Board.find_by_path(board_key)
    return {ok: false, errors: ["board not found: #{board_key}"]} unless board
    errors = check(board, data)
    return {ok: false, errors: errors} if errors.any?
    layout = data.slice('rows', 'columns', 'order', 'cells', 'blocks')
    PaperTrail.request(whodunnit: WHODUNNIT) do
      board.process({'category_layout' => layout}, {:user => board.user})
    end
    # The save path refuses a size that is not the board's grid and drops ids it cannot place,
    # so confirm what was stored rather than assume it.
    stored = board.reload.settings['category_layout']
    placed = ->(order) { (order || []).flatten.compact.length }
    unless stored && stored['rows'] == data['rows'].to_i && stored['columns'] == data['columns'].to_i && placed.(stored['order']) == placed.(data['order'])
      return {ok: false, errors: ['the board refused the layout (size or contents)']}
    end
    {ok: true, errors: []}
  end

  def self.check(board, data)
    errors = []
    labels = {}
    board.buttons.each { |btn| labels[btn['id'].to_s] = btn['label'].to_s.strip }
    expected = data['labels'] || []
    (data['order'] || []).each_with_index do |row, r|
      (row || []).each_with_index do |id, c|
        next if id.nil?
        want = ((expected[r] || [])[c]).to_s.strip
        have = labels[id.to_s]
        if have.nil?
          errors << "#{r},#{c}: button #{id} is not on #{board.key}"
        elsif want.casecmp(have) != 0
          errors << "#{r},#{c}: button #{id} is #{have.inspect}, expected #{want.inspect}"
        end
      end
    end
    errors
  end
end
