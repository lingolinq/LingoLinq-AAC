# Multilingual Language Layer -- Phase 2 (concept-id namespace + vocab-set migration), Plan 03.
#
# Loads the committed schema-2 vocab file (db/language/<locale>/vocab-en.json, produced by
# `rake vocab:schema2` in Plan 02) into Setting["vocab/<locale>"], mirroring the existing
# rules-ingest pattern at app/models/word_data.rb:106
# (`Setting.set("rules/#{locale}", ..., true)`). This is the runtime source
# `WordData.reconstruct_core_lists_from_vocab` / `reconstruct_fringe_lists_from_vocab` read from
# once `multilingual_grammar` is on.
#
# T-02.03-01 (DoS): the payload is validated and BOUNDED (byte size, set count, per-set
# ext_members length) against ceilings comfortably above the real EN sizes (62 sets, 2285
# concepts, largest set 646 members -- see 02-02-SUMMARY.md) before it is ever persisted, so a
# malformed or oversized file cannot exhaust memory or bloat the Setting record. Ingest is an
# operator-run rake task, not a client-facing endpoint, so the surface is already narrow.
namespace :vocab do
  # Comfortably above the real EN vocab-en.json (225KB, 62 sets, largest set 646 members).
  MAX_VOCAB_INGEST_BYTES = 5 * 1024 * 1024 # 5MB
  MAX_VOCAB_INGEST_SETS = 200
  MAX_VOCAB_INGEST_SET_MEMBERS = 5000

  desc 'Ingest db/language/<locale>/vocab-en.json into Setting["vocab/<locale>"] (default locale: en)'
  task :ingest, [:locale] => :environment do |_t, args|
    locale = (args[:locale].presence || 'en').to_s
    path = Rails.root.join('db', 'language', locale, 'vocab-en.json')
    raise "vocab:ingest aborted -- file not found: #{path}" unless File.exist?(path)

    raw = File.read(path)
    if raw.bytesize > MAX_VOCAB_INGEST_BYTES
      raise "vocab:ingest aborted -- #{path} is #{raw.bytesize} bytes, exceeds the " \
            "#{MAX_VOCAB_INGEST_BYTES}-byte ceiling (T-02.03-01)"
    end

    parsed = JSON.parse(raw)

    unless parsed.is_a?(Hash) && parsed['_type'] == 'vocab' && parsed['_schema'] == 2 && parsed['sets'].is_a?(Array)
      raise "vocab:ingest aborted -- #{path} failed validation " \
            "(_type=='vocab', _schema==2, and an array 'sets' key are all required)"
    end

    sets = parsed['sets']
    if sets.length > MAX_VOCAB_INGEST_SETS
      raise "vocab:ingest aborted -- #{sets.length} sets exceeds the " \
            "#{MAX_VOCAB_INGEST_SETS}-set ceiling (T-02.03-01)"
    end

    sets.each do |set|
      members = set['ext_members']
      next unless members.is_a?(Array)

      if members.length > MAX_VOCAB_INGEST_SET_MEMBERS
        raise "vocab:ingest aborted -- set '#{set['id']}' has #{members.length} ext_members, " \
              "exceeds the #{MAX_VOCAB_INGEST_SET_MEMBERS}-member ceiling (T-02.03-01)"
      end
    end

    Setting.set("vocab/#{locale}", parsed, true)

    concept_count = (parsed['concepts'] || []).length
    puts "vocab:ingest(#{locale}): stored #{sets.length} sets, #{concept_count} concepts " \
         "into Setting['vocab/#{locale}']"
  end
end
