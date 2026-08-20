# frozen_string_literal: true

# Hand-written descriptions for OpenAAC Quick Core roots.
# The upstream OBZ copy links to app.mycoughdrop.com and says the layout
# strategy "isn't unique to CoughDrop". Do not find-and-replace that prose:
# sibling links must become LingoLinq library keys, and the product name in
# that sentence must be dropped rather than swapped.
module QuickCoreDescriptions
  SIZES = [24, 40, 60, 84, 112].freeze
  SLUGS = SIZES.map { |n| "quick-core-#{n}" }.freeze
  CHILD_DEFAULT = 'built with LingoLinq'
  COUGHDROP_CHILD_DEFAULT = /\A\s*built with CoughDrop\s*\z/i

  SIZE_META = {
    24 => {
      presses: 3,
      words: '600',
      grow: '1,000',
      extra_intro: <<~TEXT.chomp,
        This is our only Quick Core board without yes/no on the first screen. With only 24 spaces we had to prioritize, and most beginning AAC users have an alternative yes/no response that they can use while learning to find Yes and No on a sub-board. If you disagree we'd love to hear from you!
      TEXT
      categories: '("do" contains additional active words, "eat" contains food words, "it" contains objects). For most users it will be easier to learn the buttons over time rather than trying to memorize the categories all at once.'
    },
    40 => {
      presses: 3,
      words: '2,000',
      grow: '3,500',
      categories: '("do" contains additional active words, "know" contains learning and school words, "those" contains plants). For most users it will be easier to learn the buttons over time rather than trying to memorize the categories.'
    },
    60 => {
      presses: 3,
      words: '2,000',
      grow: '3,500',
      categories: '("do" contains additional active words, "know" contains learning and school words, "those" contains plants). For most users it will be easier to learn the buttons over time rather than trying to memorize the categories.'
    },
    84 => {
      presses: 2,
      words: '4,500',
      grow: '12,000',
      categories: '("do" contains additional active words, "know" contains learning and school words, "with" contains ingredients and condiments). For most users it will be easier to learn the buttons over time rather than trying to memorize the categories.'
    },
    112 => {
      presses: 2,
      words: '4,500',
      grow: '12,000',
      categories: '("do" contains additional active words, "know" contains learning and school words, "with" contains ingredients and condiments). For most users it will be easier to learn the buttons over time rather than trying to memorize the categories.'
    }
  }.freeze

  SOURCES = <<~TEXT.chomp
    The included vocabulary was originally collected from multiple sources, including:
    - DLM Core Maps (http://www.med.unc.edu/ahs/clds/files/corevocabpdf)
    - AAC RERC (http://aac.unl.edu/VLAACCU1.html)
    - PrAACtical AAC (http://praacticalaac.org/praactical/aac-vocabulary-lists/)
    - English Word Frequencies (https://www.wordfrequency.info/free.asp)
    - AACText.org (http://aactext.org/imagine/)
    - Core Compilation by Anderson/Bittner (https://www.dropbox.com/s/8j6u56nat47lo2r/2013%2002%2028%205%20Core%20Vocabulary%20List%20Comparison%20color%20coded%20horizontal.docx)

    Once collected, the vocabulary was weighted based on recurrence and ordered position, and additional fringe vocabulary is added based on real-word feedback. The main board layout is based on starter core word recommendations from Carole Zangari (http://praacticalaac.org/praactical/core-samples/), Kate Ahern (https://www.facebook.com/groups/aacresources/permalink/699006890189441/) and others, and is laid out according to common English sentence structure, with pronouns, then verbs, then adjectives, with supplements, questions, social at the bottom.
  TEXT

  class << self
    def slug_for_size(size)
      "quick-core-#{size}"
    end

    def root_description_for(slug)
      size = size_from_slug(slug)
      return nil unless size
      build_description(size)
    end

    def apply_to_root!(board, slug: nil)
      return false unless board
      slug = slug.presence || slug_from_key(board.key)
      description = root_description_for(slug)
      return false if description.blank?
      return false if board.settings['description'] == description

      board.settings['description'] = description
      board.save_without_post_processing
      true
    end

    def sanitize_child_description!(board)
      return false unless board
      current = board.settings['description'].to_s
      return false unless current.match?(COUGHDROP_CHILD_DEFAULT)

      board.settings['description'] = CHILD_DEFAULT
      board.save_without_post_processing
      true
    end

    # +boards+ is the from_obz/from_obf array (root first). No-op for non-Quick-Core files.
    def apply_to_imported_boards!(boards, filename: nil)
      slug = SystemBoardSources.quick_core_root_slug_for_filename(filename)
      return {root: false, children: 0} if slug.blank? || boards.blank?

      list = Array(boards)
      root_changed = apply_to_root!(list.first, slug: slug)
      child_count = list.drop(1).count { |board| sanitize_child_description!(board) }
      {root: root_changed, children: child_count, slug: slug}
    end

    # Stamp already-imported library roots (no OBZ re-download).
    def apply_existing_roots!(owner: nil)
      owner ||= SystemBoardSources.owner
      return [] unless owner

      SLUGS.filter_map do |slug|
        board = Board.find_by_path(SystemBoardSources.board_key(slug))
        next unless board && board.user_id == owner.id
        changed = apply_to_root!(board, slug: slug)
        {slug: slug, key: board.key, changed: changed}
      end
    end

    private

    def size_from_slug(slug)
      m = slug.to_s.match(/\Aquick-core-(\d+)\z/)
      size = m && m[1].to_i
      SIZE_META.key?(size) ? size : nil
    end

    def slug_from_key(key)
      key.to_s.split('/', 2).last
    end

    def build_description(size)
      meta = SIZE_META.fetch(size)
      parts = []
      parts << "Quick core is a large vocabulary set, with all buttons at most #{meta[:presses]} button-presses away. Currently Quick Core #{size} has about #{meta[:words]} words but can grow to up to #{meta[:grow]}. We are often working with therapists and experts to revise and improve our vocabulary sets."
      parts << 'The board levels are based loosely around themes, but the real value of the vocabulary set is in its consistent motor plan. The top level has many common core words, with additional core and fringe words available in the second level. With so many words available with so few button presses, the communicator can gradually discover and learn motor paths for what they want to say.'
      parts << meta[:extra_intro] if meta[:extra_intro].present?
      parts << sibling_paragraph(size)
      parts << SOURCES
      parts << "Additional vocabulary is organized loosely with some groups being more intuitive than others #{meta[:categories]} This strategy isn't unique (http://www.speakforyourself.org/uncategorized/vocabulary-organized-speak/) but it can be a little intimidating at first. If you're stuck, use \"Find a Button\" when you're first getting started!"
      parts << "If you're planning to add your own vocabulary, don't be afraid you're putting it in the \"wrong\" spot, just put it somewhere and help the communicator find and get used to the placement. Consistency is most important!"
      parts.join("\n\n")
    end

    def sibling_paragraph(size)
      lines = ['This board is part of a set. Additional grid sizes in the LingoLinq library:']
      SIZES.each do |other|
        next if other == size
        lines << "- Quick Core #{other} (lingolinq/#{slug_for_size(other)})"
      end
      lines.join("\n")
    end
  end
end
