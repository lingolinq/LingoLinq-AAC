# frozen_string_literal: true

# Multilingual Language Layer -- Phase 2 (concept-id namespace + vocab-set migration), Plan 02.
#
# Pure Ruby transform: Plan 01's committed vocab snapshot + VOCAB-03/VOCAB-04 decision manifests
# -> concept-keyed vocab-en.json, per docs/architecture/MULTILINGUAL_LANGUAGE_LAYER_SCHEMA.md
# Section 4.6. No ActiveRecord, no network, no file writes -- reads only committed snapshot/
# manifest JSON (via JSON.parse only) and returns plain hashes. lib/tasks/vocab_schema2.rake is
# the only writer.
#
# CRITICAL DESIGN INVARIANT (see 02-02-PLAN.md objective): the concept-id layer is ADDITIVE, not a
# lossy replacement. Each set carries BOTH `concepts` (the clean, deduped, non-concept-excluded
# view -- the forward-looking concept namespace) AND `ext_members` (the exact original ordered
# source array, verbatim, including duplicates and non-concept entries). `ext_members` is the
# parity anchor Plan 03 reconstructs the legacy readers from and Plan 04 diffs against the golden.
# Never drop, reorder, or normalize `ext_members`.
module Language
  module VocabGenerator
    # VOCAB-03 manifest category keys (db/language/en/non-concept-classification.json). '_rule'
    # and 'total' are metadata, not surface lists.
    NON_CONCEPT_CATEGORIES = %w[morpheme_marker pos_label contraction slash_form].freeze

    module_function

    def snapshot_dir(locale)
      Rails.root.join('db', 'language', locale.to_s)
    end

    def load_json(filename, dir)
      JSON.parse(File.read(dir.join(filename)))
    end

    # Builds the NON_CONCEPT lookup as the union of every VOCAB-03 category list. Matching is
    # both exact-string (the manifest already carries curly-apostrophe forms as they appear in
    # the source) AND case-insensitive, since the classification manifest mixes case-sensitive
    # surface forms (e.g. POS labels are lowercase, but a future source edit could introduce a
    # differently-cased duplicate) -- belt-and-suspenders so no non-concept surface slips through
    # as a concept due to a case mismatch.
    def non_concept_lookup(classification)
      exact = Set.new
      downcased = Set.new

      NON_CONCEPT_CATEGORIES.each do |category|
        (classification[category] || []).each do |surface|
          exact << surface
          downcased << surface.downcase
        end
      end

      { exact: exact, downcased: downcased }
    end

    def non_concept?(surface, lookup)
      lookup[:exact].include?(surface) || lookup[:downcased].include?(surface.downcase)
    end

    # words -> [concepts (deduped, non-concepts excluded, order preserved), ext_members (verbatim)]
    def split_members(words, lookup)
      ext_members = words.dup
      seen = Set.new
      concepts = []

      words.each do |surface|
        next if non_concept?(surface, lookup)
        next if seen.include?(surface)

        seen << surface
        concepts << surface
      end

      [concepts, ext_members]
    end

    def core_sets(core_lists_data, lookup)
      core_lists_data.map do |list|
        concepts, ext_members = split_members(list['words'] || [], lookup)

        {
          'id' => list['id'],
          'name' => list['name'],
          'url' => list['url'],
          'category' => 'core',
          'concepts' => concepts,
          'ext_members' => ext_members
        }
      end
    end

    def fringe_sets(fringe_data, lookup)
      categories = (fringe_data.first || {})['categories'] || []

      categories.map do |category|
        concepts, ext_members = split_members(category['words'] || [], lookup)

        {
          'id' => category['id'],
          'name' => category['name'],
          'category' => 'fringe',
          'concepts' => concepts,
          'ext_members' => ext_members
        }
      end
    end

    # Iterates every set's `concepts` in source order; the first time a concept id is seen it is
    # added to the registry. Cross-set AND intra-set duplicates (VOCAB-04) collapse naturally to
    # a single registry key by construction -- a duplicate surface is, by definition, the SAME
    # concept id string, so no separate merge step is needed. `external_refs` is left `{}`
    # (CONCEPT-02: present but optional, never populated in this plan, never a runtime dependency).
    def build_registry(sets)
      registry = {}

      sets.each do |set|
        set['concepts'].each do |concept_id|
          registry[concept_id] ||= { 'external_refs' => {} }
        end
      end

      registry
    end

    # Fail-closed accounting (per set): every surface in `ext_members` must be either a classified
    # non-concept OR present in that set's `concepts` array. Defends against a future refactor
    # silently dropping a surface instead of explicitly excluding or including it.
    def verify_accounting!(sets, lookup)
      sets.each do |set|
        concept_set = set['concepts'].to_set

        set['ext_members'].each do |surface|
          next if non_concept?(surface, lookup)
          next if concept_set.include?(surface)

          raise "VocabGenerator: surface #{surface.inspect} in set #{set['id'].inspect} is " \
                'neither a registry concept nor a classified non-concept -- every source entry ' \
                'must be explicitly accounted for (fail closed).'
        end
      end
    end

    def vocab_for(locale = 'en', dir = snapshot_dir(locale))
      core_lists_data = load_json('core_lists.snapshot.json', dir)
      fringe_data = load_json('fringe_suggestions.snapshot.json', dir)
      classification = load_json('non-concept-classification.json', dir)
      # Loaded per the plan's stated inputs; VOCAB-04 collapse happens naturally via
      # build_registry's dedup-by-surface, so this manifest is not re-consulted for merge logic
      # (a duplicate surface is definitionally the same concept id string).
      load_json('duplicate-concepts.json', dir)

      lookup = non_concept_lookup(classification)

      sets = core_sets(core_lists_data, lookup) + fringe_sets(fringe_data, lookup)

      verify_accounting!(sets, lookup)

      {
        '_locale' => locale.to_s,
        '_schema' => 2,
        '_type' => 'vocab',
        'sets' => sets,
        'concepts' => build_registry(sets)
      }
    end
  end
end
