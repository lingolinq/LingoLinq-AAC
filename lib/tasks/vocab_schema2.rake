# frozen_string_literal: true

# Multilingual Language Layer -- Phase 2 (concept-id namespace + vocab-set migration), Plan 02.
#
# Emits db/language/<locale>/vocab-en.json from Language::VocabGenerator.vocab_for, per
# docs/architecture/MULTILINGUAL_LANGUAGE_LAYER_SCHEMA.md Section 4.6. Pure transform + write --
# no live DB reads, no network. Reuses lib/tasks/vocab_snapshot.rake's deterministic
# deep_sort/JSON.pretty_generate helpers so re-running on unchanged inputs produces a zero-byte
# git diff.
namespace :vocab do
  def vocab_schema2_deep_sort(obj)
    case obj
    when Hash
      obj.keys.sort_by(&:to_s).each_with_object({}) { |k, sorted| sorted[k] = vocab_schema2_deep_sort(obj[k]) }
    when Array
      obj.map { |v| vocab_schema2_deep_sort(v) }
    else
      obj
    end
  end

  def vocab_schema2_write_json(path, payload)
    File.write(path, JSON.pretty_generate(vocab_schema2_deep_sort(payload)) + "\n")
  end

  desc 'Generate the concept-keyed db/language/<locale>/vocab-en.json from the Plan 01 snapshot + manifests (default locale: en)'
  task :schema2, [:locale] => :environment do |_t, args|
    locale = (args[:locale].presence || 'en').to_s
    dir = Rails.root.join('db', 'language', locale)

    vocab = Language::VocabGenerator.vocab_for(locale, dir)

    vocab_schema2_write_json(dir.join('vocab-en.json'), vocab)

    core_count = vocab['sets'].count { |s| s['category'] == 'core' }
    fringe_count = vocab['sets'].count { |s| s['category'] == 'fringe' }
    concept_count = vocab['concepts'].length

    classification = JSON.parse(File.read(dir.join('non-concept-classification.json')))
    excluded_count = classification['total']

    duplicate_manifest = JSON.parse(File.read(dir.join('duplicate-concepts.json')))
    collapsed_count = duplicate_manifest['total_duplicate_surfaces']

    puts "vocab:schema2(#{locale}): core sets=#{core_count}, fringe sets=#{fringe_count}, " \
         "distinct concepts=#{concept_count}, excluded non-concepts=#{excluded_count}, " \
         "collapsed duplicates=#{collapsed_count}"
  end
end
