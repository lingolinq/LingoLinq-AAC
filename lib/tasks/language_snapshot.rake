# Multilingual Language Layer -- Phase 1 (EN schema-2 migration).
#
# Snapshots the live English language dataset into deterministic, versioned repo files under
# db/language/<locale>/:
#   - words-<locale>.snapshot.json           every WordData row for the locale (PII-free)
#   - rules-<locale>.snapshot.json            live Setting rules/inflection_locations merged with
#                                              the pinned upstream substitutions/tests/_license
#   - inflection-locations-golden.json        pre-migration WordData.inflection_locations_for
#                                              output over the full word corpus (before-baseline)
#
# `rules` + `inflection_locations` come from the LIVE `Setting.get("rules/<locale>")` record --
# this is what the runtime (WordData.inflection_locations_for, Api::WordsController#lang) actually
# reads. `substitutions` (nesting contractions/default_contractions), `tests[]`, and `_license`
# come ONLY from the pinned raw upstream OpenAAC file (default locale 'en' ->
# db/language/en/rules-en.upstream.json, SHA-256-recorded in db/language/README.md): the
# `WordData.ingest` write path (app/models/word_data.rb:106) slices only
# `rules`/`inflection_locations`/`contractions`/`default_contractions` into the Setting, and the
# upstream file has NO top-level `contractions`/`default_contractions` (they live nested under
# `substitutions`), so the Setting never carries `substitutions`, `tests`, or `_license`. Do NOT
# read those three from the Setting -- they are not there. See db/language/README.md for the full
# provenance story.
namespace :language do
  # Recursively sort hash keys (arrays/scalars pass through unchanged) so the JSON output is
  # byte-stable across repeated runs against unchanged inputs (deep_sort).
  def language_snapshot_deep_sort(obj)
    case obj
    when Hash
      obj.keys.sort_by(&:to_s).each_with_object({}) { |k, sorted| sorted[k] = language_snapshot_deep_sort(obj[k]) }
    when Array
      obj.map { |v| language_snapshot_deep_sort(v) }
    else
      obj
    end
  end

  def language_snapshot_write_json(path, payload)
    File.write(path, JSON.pretty_generate(language_snapshot_deep_sort(payload)) + "\n")
  end

  desc 'Snapshot live WordData + rules/<locale> Setting + pinned upstream substitutions/tests into db/language/<locale>/ (default locale: en)'
  task :snapshot, [:locale] => :environment do |_t, args|
    locale = (args[:locale].presence || 'en').to_s
    base_locale = locale.split(/-|_/)[0]
    dir = Rails.root.join('db', 'language', base_locale)
    FileUtils.mkdir_p(dir)

    # --- 1. WORDS -------------------------------------------------------------
    # Mirrors WordData.extract's field shape (types/inflection_overrides/antonyms) but does NOT
    # reuse its S3 upload path or its `reviews.length > 0` filter -- every row for the locale is
    # included here, deterministically ordered. `reviews` and reviewer identifiers (keyed by
    # reviewer USER global_id -- identifying internal account data, threat T-01-01) are never
    # written to the snapshot.
    words = {}
    WordData.where(locale: [locale, base_locale].uniq).order(:word).find_each(batch_size: 500) do |wd|
      data = wd.data || {}
      words[wd.word] = {
        'types' => data['types'] || [],
        'inflection_overrides' => data['inflection_overrides'] || {},
        'antonyms' => data['antonyms'] || []
      }
    end
    language_snapshot_write_json(
      dir.join("words-#{base_locale}.snapshot.json"),
      {
        '_locale' => base_locale,
        '_type' => 'words',
        '_schema' => 1,
        'words' => words
      }
    )

    # --- 2. RULES ---------------------------------------------------------------
    # Default locale 'en' -> db/language/en/rules-en.upstream.json (the pinned upstream file).
    # Aborts loudly rather than silently emitting a rules snapshot with missing/empty
    # substitutions or tests -- the whole Phase 1 parity gate depends on these being real.
    upstream_path = dir.join("rules-#{base_locale}.upstream.json")
    unless File.exist?(upstream_path)
      raise "language:snapshot aborted: #{upstream_path} is missing. Pin the raw upstream " \
            "OpenAAC rules-#{base_locale} file first (see db/language/README.md) -- refusing to " \
            "emit a rules snapshot with empty/missing substitutions or tests."
    end
    upstream = JSON.parse(File.read(upstream_path))

    # Setting.get (NOT the upstream file) is the ONLY source for these two fields -- they reflect
    # whatever is actually live for the running app today.
    setting = Setting.get("rules/#{base_locale}") || {}
    language_snapshot_write_json(
      dir.join("rules-#{base_locale}.snapshot.json"),
      {
        '_locale' => base_locale,
        '_type' => 'rules',
        '_schema' => 1,
        'rules' => setting['rules'],
        'inflection_locations' => setting['inflection_locations'],
        # substitutions/tests/_license: verbatim from the pinned upstream file ONLY -- never from
        # the Setting (it never carries them; see header note above).
        'substitutions' => upstream['substitutions'],
        'tests' => upstream['tests'],
        '_license' => upstream['_license']
      }
    )

    # --- 3. GOLDEN ----------------------------------------------------------------
    # Captures the CURRENT (pre-migration) WordData.inflection_locations_for output over the full
    # word corpus, verbatim, as the before-baseline for flag-off regression (Plan 03/05) and the
    # compass-slot ground truth for schema-2 parity (Plan 05). Runs against the unmodified method
    # (Plan 03 has not touched it yet), so this is a true pre-migration capture. Empty results are
    # recorded exactly as returned -- nothing is filtered out.
    corpus = words.keys.sort
    golden = {}
    corpus.each_slice(500) do |batch|
      golden.merge!(WordData.inflection_locations_for(batch, base_locale))
    end
    language_snapshot_write_json(
      dir.join('inflection-locations-golden.json'),
      {
        '_locale' => base_locale,
        '_type' => 'golden_inflection_locations',
        '_corpus_word_count' => corpus.length,
        'words' => golden
      }
    )

    puts "language:snapshot(#{base_locale}): #{words.length} WordData rows, " \
         "#{(upstream['tests'] || []).length} tests[] fixtures, #{corpus.length} golden corpus words."
  end
end
