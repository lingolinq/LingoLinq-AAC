# frozen_string_literal: true

# Vocal Flair 84 w/ Keyboard is a single-board curated OBZ. Its folder
# buttons were exported with dangling Render-staging load_board URLs and
# no key, so Converters::LingoLinq.from_external drops the links
# (lib/converters/lingo_linq.rb:496-510). The tiles then speak their
# labels. This remapper writes the matching VF84 category keys onto those
# buttons when the target board exists.
module VocalFlairKeyboardFolderRelinker
  ROOT_SLUG_RE = /(^|\/)vocal-flair-84-w-keyboard(_\d+)?\z/.freeze

  # Labels on the keyboard-variant root, mapped to the VF84 category
  # slugs confirmed on lingolinq/vocal-flair-84. places is places2.
  FOLDER_SLUGS_BY_LABEL = {
    'questions' => 'vocal-flair-84-questions',
    'people' => 'vocal-flair-84-people',
    'actions' => 'vocal-flair-84-actions',
    'social' => 'vocal-flair-84-social',
    'places' => 'vocal-flair-84-places2',
    'time' => 'vocal-flair-84-time',
    'categories' => 'vocal-flair-84-categories',
    'feelings' => 'vocal-flair-84-feelings',
    'describe' => 'vocal-flair-84-describe',
    'color/visual' => 'vocal-flair-84-colors',
    'small words' => 'vocal-flair-84-small-words',
    'keyboard' => 'vocal-flair-84-keyboard'
  }.freeze

  def self.keyboard_variant?(board)
    board && ROOT_SLUG_RE.match?(board.key.to_s)
  end

  def self.preview(board)
    return [] unless keyboard_variant?(board)
    Array(board.buttons).filter_map do |button|
      slug = FOLDER_SLUGS_BY_LABEL[button['label'].to_s]
      next unless slug
      next unless needs_relink?(button)
      next unless resolve_target(board, slug)
      button['label']
    end
  end

  def self.relink!(board)
    return {changed: false, linked: []} unless keyboard_variant?(board)

    buttons = Array(board.buttons).map { |b| b.dup }
    linked = []
    buttons.each do |button|
      slug = FOLDER_SLUGS_BY_LABEL[button['label'].to_s]
      next unless slug
      next unless needs_relink?(button)

      target = resolve_target(board, slug)
      next unless target

      button['load_board'] = {
        'id' => target.global_id,
        'key' => target.key
      }
      linked << button['label']
    end

    return {changed: false, linked: []} if linked.empty?

    board.settings['buttons'] = buttons
    board.instance_variable_set(:@buttons_changed, 'vf84 w-keyboard folder relink')
    board.generate_stats
    board.save!
    {changed: true, linked: linked, key: board.key}
  end

  def self.repair_existing!
    boards = Board.where("key ~ ?", '(^|/)vocal-flair-84-w-keyboard(_[0-9]+)?$')
    boards.filter_map { |board| relink!(board) }
  end

  def self.needs_relink?(button)
    lb = button['load_board']
    return true unless lb.is_a?(Hash)
    return true if lb['id'].blank? && lb['key'].blank?

    target = nil
    target = Board.find_by_path(lb['key']) if lb['key'].present?
    target ||= Board.find_by_global_id(lb['id']) if lb['id'].present?
    target.nil?
  end

  def self.resolve_target(board, slug)
    owner = board.key.to_s.split('/', 2).first
    paths = ["#{owner}/#{slug}"]
    paths << "lingolinq/#{slug}" unless owner == 'lingolinq'
    if slug == 'vocal-flair-84-places2'
      paths << "#{owner}/vocal-flair-84-places"
      paths << 'lingolinq/vocal-flair-84-places' unless owner == 'lingolinq'
    end
    paths.each do |path|
      found = Board.find_by_path(path)
      return found if found
    end
    nil
  end
  private_class_method :needs_relink?, :resolve_target
end
