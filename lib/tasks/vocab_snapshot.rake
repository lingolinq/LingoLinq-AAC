# Multilingual Language Layer -- Phase 2 (concept-id namespace + vocab-set migration), Plan 01.
#
# Freezes the migration's inputs and expected outputs BEFORE any transform is written:
#   - core_lists.snapshot.json / fringe_suggestions.snapshot.json  verbatim pinned copies of the
#                                                                    two live source files
#   - vocab-golden/*.reader-golden.json                             pre-migration WordData vocab
#                                                                    reader before-image (the
#                                                                    Plan 04 compatibility target)
#   - non-concept-classification.json (VOCAB-03)                    every non-concept entry in the
#                                                                    default list, by category
#   - duplicate-concepts.json (VOCAB-04)                            every surface occurring more
#                                                                    than once across/within the
#                                                                    4 core arrays
#
# See db/language/README-vocab.md for the full provenance/regeneration story.
namespace :vocab do
  # Recursively sort hash keys (arrays/scalars pass through unchanged, array ORDER is preserved --
  # it is load-bearing, see default_core_list) so JSON output is byte-stable across repeated runs
  # against unchanged inputs (deep_sort). Mirrors lib/tasks/language_snapshot.rake's helper.
  def vocab_snapshot_deep_sort(obj)
    case obj
    when Hash
      obj.keys.sort_by(&:to_s).each_with_object({}) { |k, sorted| sorted[k] = vocab_snapshot_deep_sort(obj[k]) }
    when Array
      obj.map { |v| vocab_snapshot_deep_sort(v) }
    else
      obj
    end
  end

  def vocab_snapshot_write_json(path, payload)
    File.write(path, JSON.pretty_generate(vocab_snapshot_deep_sort(payload)) + "\n")
  end

  # VOCAB-03: classify every entry in the 'default' core list that is NOT an ordinary vocabulary
  # concept, by explicit rule (never a hardcoded list -- derived from the real pinned data every
  # time this task runs, so a future edit to core_lists.json surfaces as a reviewable manifest
  # diff rather than a silent generator heuristic).
  def vocab_snapshot_classify_non_concepts(default_words)
    pos_label_set = %w[adjectives nouns determiners possessive].to_set
    morpheme_marker = []
    pos_label = []
    contraction = []
    slash_form = []

    default_words.each do |surface|
      if surface.start_with?('+') || surface.end_with?('+')
        morpheme_marker << surface
      elsif pos_label_set.include?(surface)
        pos_label << surface
      elsif surface.include?("'") || surface.include?("’")
        contraction << surface
      elsif surface.include?('/')
        slash_form << surface
      end
    end

    morpheme_marker = morpheme_marker.uniq
    pos_label = pos_label.uniq
    contraction = contraction.uniq
    slash_form = slash_form.uniq

    {
      '_rule' => {
        'morpheme_marker' => "surface begins with '+' OR ends with '+' (e.g. '+ed', 'to+') -- grammatical inflection markers, not concepts",
        'pos_label' => "surface is exactly one of: #{pos_label_set.to_a.sort.join(', ')} -- POS category labels used as literal entries, not concepts",
        'contraction' => "surface contains an apostrophe (straight ' or curly ’, e.g. don’t, i’m) -- contraction/possessive surface forms, not standalone concepts",
        'slash_form' => "surface contains a '/' and does not match the rules above (e.g. do/does) -- a combined-form entry, not a single concept"
      },
      'morpheme_marker' => morpheme_marker,
      'pos_label' => pos_label,
      'contraction' => contraction,
      'slash_form' => slash_form,
      'total' => morpheme_marker.length + pos_label.length + contraction.length + slash_form.length
    }
  end

  # VOCAB-04: every surface string occurring in more than one (list_id, index) position, across
  # AND within the 4 core arrays. Entries already classified as non-concept (VOCAB-03) are
  # excluded from the main duplicate-resolution set (a repeated POS label is not a concept
  # collision) but still recorded, separately, under non_concept_repeats for completeness.
  def vocab_snapshot_find_duplicates(core_lists_data, non_concept_surfaces)
    occurrences = Hash.new { |h, k| h[k] = [] }
    core_lists_data.each do |list|
      list_id = list['id']
      (list['words'] || []).each_with_index do |surface, idx|
        occurrences[surface] << { 'list_id' => list_id, 'index' => idx }
      end
    end

    duplicates = {}
    non_concept_repeats = {}
    occurrences.each do |surface, occs|
      next unless occs.length > 1

      entry = { 'occurrences' => occs, 'count' => occs.length }
      if non_concept_surfaces.include?(surface)
        non_concept_repeats[surface] = entry
      else
        duplicates[surface] = entry
      end
    end

    [duplicates, non_concept_repeats]
  end

  desc 'Snapshot the live EN vocab source files + WordData vocab reader golden + VOCAB-03/VOCAB-04 decision manifests into db/language/<locale>/ (default locale: en)'
  task :snapshot, [:locale] => :environment do |_t, args|
    locale = (args[:locale].presence || 'en').to_s
    dir = Rails.root.join('db', 'language', locale)
    golden_dir = dir.join('vocab-golden')
    FileUtils.mkdir_p(dir)
    FileUtils.mkdir_p(golden_dir)

    # --- 1. PIN SOURCES --------------------------------------------------------
    # Parse to confirm valid JSON (raises loudly if not), then write verbatim -- key-sorted for
    # determinism, array/list/category ORDER untouched (order is load-bearing: default_core_list
    # depends on default list positional order).
    core_lists_source_path = Rails.root.join('lib', 'core_lists.json')
    fringe_source_path = Rails.root.join('lib', 'fringe_suggestions.json')

    core_lists_json = JSON.parse(File.read(core_lists_source_path))
    fringe_json = JSON.parse(File.read(fringe_source_path))

    vocab_snapshot_write_json(dir.join('core_lists.snapshot.json'), core_lists_json)
    vocab_snapshot_write_json(dir.join('fringe_suggestions.snapshot.json'), fringe_json)

    # --- 2. CAPTURE READER GOLDEN ----------------------------------------------
    # clear_lists forces every reader below to do a fresh File.read of the (just-pinned) source
    # files rather than serve a stale in-process memoized value.
    WordData.clear_lists
    core_lists_reader = WordData.core_lists
    fringe_lists_reader = WordData.fringe_lists
    default_core_list_reader = WordData.default_core_list
    basic_core_list_reader = WordData.basic_core_list
    standardized_words_reader = WordData.standardized_words

    vocab_snapshot_write_json(
      golden_dir.join('core_lists.reader-golden.json'),
      {
        '_locale' => locale,
        '_type' => 'vocab_reader_golden',
        '_reader' => 'WordData.core_lists',
        'lists' => core_lists_reader
      }
    )

    vocab_snapshot_write_json(
      golden_dir.join('fringe_lists.reader-golden.json'),
      {
        '_locale' => locale,
        '_type' => 'vocab_reader_golden',
        '_reader' => 'WordData.fringe_lists',
        'lists' => fringe_lists_reader
      }
    )

    vocab_snapshot_write_json(
      golden_dir.join('derived-readers.reader-golden.json'),
      {
        '_locale' => locale,
        '_type' => 'vocab_reader_golden',
        '_reader' => %w[WordData.default_core_list WordData.basic_core_list WordData.standardized_words],
        'default_core_list' => default_core_list_reader,
        'basic_core_list' => basic_core_list_reader,
        'standardized_words_keys' => standardized_words_reader.keys.sort
      }
    )

    # --- 3. VOCAB-03 / VOCAB-04 DECISION MANIFESTS ------------------------------
    default_list = core_lists_json.detect { |l| l['id'] == 'default' } || {}
    default_words = default_list['words'] || []

    classification = vocab_snapshot_classify_non_concepts(default_words)
    non_concept_surfaces = (
      classification['morpheme_marker'] + classification['pos_label'] +
      classification['contraction'] + classification['slash_form']
    ).to_set

    vocab_snapshot_write_json(dir.join('non-concept-classification.json'), classification)

    duplicates, non_concept_repeats = vocab_snapshot_find_duplicates(core_lists_json, non_concept_surfaces)

    vocab_snapshot_write_json(
      dir.join('duplicate-concepts.json'),
      {
        '_rule' => 'every surface string occurring in more than one (list_id, index) position ' \
                   'across/within the 4 core arrays maps to occurrences + count; entries already ' \
                   'classified as non-concept in non-concept-classification.json are excluded from ' \
                   '"duplicates" and recorded separately under non_concept_repeats',
        'duplicates' => duplicates,
        'non_concept_repeats' => non_concept_repeats,
        'total_duplicate_surfaces' => duplicates.length,
        'total_non_concept_repeat_surfaces' => non_concept_repeats.length
      }
    )

    # --- 4. SUMMARY LINE ---------------------------------------------------------
    fringe_categories = (fringe_lists_reader.first || {})['categories'] || []
    fringe_word_count = fringe_categories.sum { |c| (c['words'] || []).length }
    core_word_counts = core_lists_reader.map { |l| "#{l['id']}=#{(l['words'] || []).length}" }.join(', ')

    puts "vocab:snapshot(#{locale}): core lists [#{core_word_counts}]; " \
         "fringe categories=#{fringe_categories.length}, fringe words=#{fringe_word_count}; " \
         "standardized_words union=#{standardized_words_reader.keys.length}; " \
         "non-concept total=#{classification['total']}; duplicate surfaces=#{duplicates.length}"
  end
end
