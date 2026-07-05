# Multilingual Language Layer -- Phase 1 (EN schema-2 migration), Plan 02.
#
# Generates the schema-2 dataset pair from Plan 01's committed schema-1 snapshot:
#   - db/language/<locale>/rules-<locale>.json   (_schema:2 -- profile, aliases, slot_layouts,
#                                                  plus verbatim rules/inflection_locations/
#                                                  substitutions/tests/_license)
#   - db/language/<locale>/words-<locale>.json   (_schema:2 -- lemma-keyed lexemes, forms keyed
#                                                  by UD feature bundle)
#
# Pure file transform via Language::Schema2Generator -- no live DB read, no network. Re-running
# on an unchanged snapshot yields a zero-byte git diff (same deep_sort + JSON.pretty_generate
# determinism pattern as lib/tasks/language_snapshot.rake).
namespace :language do
  def language_schema2_deep_sort(obj)
    case obj
    when Hash
      obj.keys.sort_by(&:to_s).each_with_object({}) { |k, sorted| sorted[k] = language_schema2_deep_sort(obj[k]) }
    when Array
      obj.map { |v| language_schema2_deep_sort(v) }
    else
      obj
    end
  end

  def language_schema2_write_json(path, payload)
    File.write(path, JSON.pretty_generate(language_schema2_deep_sort(payload)) + "\n")
  end

  desc 'Generate schema-2 rules-<locale>.json / words-<locale>.json from the committed Plan 01 snapshot (default locale: en)'
  task :schema2, [:locale] => :environment do |_t, args|
    locale = (args[:locale].presence || 'en').to_s
    dir = Rails.root.join('db', 'language', locale)

    rules = Language::Schema2Generator.rules_for(locale)
    words = Language::Schema2Generator.words_for(locale)

    language_schema2_write_json(dir.join("rules-#{locale}.json"), rules)
    language_schema2_write_json(dir.join("words-#{locale}.json"), words)

    puts "language:schema2(#{locale}): #{rules['aliases'].length} aliases, " \
         "#{rules['slot_layouts'].length} slot_layouts pos entries, " \
         "#{words['words'].length} lexemes."
  end
end
