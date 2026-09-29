require 'digest'
require 'fileutils'
require 'json'

module Language
  # Builds the English schema-2 language files (db/language/en/*.json) from the
  # pinned upstream OpenAAC inputs vendored under db/language/vendor/. Pure Ruby:
  # no network, no database, no clock, so the same input bytes always produce the
  # same output bytes. spec/lib/language/schema2_generator_spec.rb regenerates the
  # output and byte-compares it with the committed files.
  #
  # Fails closed: each of these raises Language::Schema2Generator::Error before
  # anything is written:
  # - an input whose SHA-256 differs from its pin, a missing input, unparseable JSON
  #   or a duplicate key;
  # - words: an unknown metadata key, entry field, part of speech or inflection name,
  #   or a non-string value;
  # - rules: an unknown section or key, an empty rules, inflection_locations or tests
  #   list, a rule type that is not a known part of speech or "override", an unknown
  #   inflection name, a non-string override value, a location that is not a grid
  #   direction, an unknown part of speech in inflection_locations, or a test option
  #   that is unknown or not a string.
  # Lookback item values and the required and if_empty values in
  # inflection_locations are checked for their key names only.
  #
  # Nothing at runtime reads the output yet. The multilingual_grammar flag
  # (lib/feature_flags.rb) is reserved for the first reader.
  #
  # Regenerate with: bundle exec rake language:schema2
  class Schema2Generator
    class Error < StandardError; end

    ROOT = File.expand_path('../../db/language', __dir__)
    VENDOR_DIR = File.join(ROOT, 'vendor', 'openaac-demo-tools-0977e83f')
    OUTPUT_DIR = File.join(ROOT, 'en')

    UPSTREAM = {
      'commit' => '0977e83f9a773fc215d4edbdec8bdd821a99bc24',
      'name' => 'OpenAAC',
      'repo' => 'open-aac/demo-tools'
    }.freeze

    # The pins. Keep in sync with the attribution file in VENDOR_DIR (NOTICE.md);
    # the spec checks that they agree.
    INPUTS = {
      'rules-en.json' => {
        'path' => 'public/inflections/rules-en.json',
        'sha256' => 'df71e0c893fac417bf7aea12742642d7a1b5cddd924532cdd2bb2c1803bfcf0b'
      }.freeze,
      'words-en.json' => {
        'path' => 'public/inflections/words-en.json',
        'sha256' => 'e042e8b2ce9dda264ca567cbdbb914bd5ea243fa13a9a56e82337efaeb7747d0'
      }.freeze
    }.freeze

    # config/initializers/oj.rb swaps JSON.parse and JSON.generate for Oj once Rails
    # boots, and the rake task runs without booting it. Calling the json gem's own
    # parser and generator keeps the bytes (and the duplicate-key check, which Oj's
    # JSON.parse ignores) the same in both places.
    PRETTY = {indent: '  ', space: ' ', object_nl: "\n", array_nl: "\n"}.freeze

    SCHEMA = 2
    VERSION = '2.0.0-en.1'
    # The data files are CC BY (upstream marker "CC By, OpenAAC", carried in _source as
    # upstream_license); the version, 4.0, is per OpenAAC's maintainer. See NOTICE.md
    # in VENDOR_DIR.
    LICENSE = 'CC-BY-4.0'
    ATTRIBUTION = {
      'attribution' => 'OpenAAC',
      'license_url' => 'https://creativecommons.org/licenses/by/4.0/',
      'modified' => 'Transformed by LingoLinq from the pinned upstream files'
    }.freeze

    META_KEYS = %w[_license _locale _type _version].freeze

    # Words file: every recognised entry field, part of speech and inflection name.
    # An unlisted one raises, so a new upstream pin is reviewed rather than
    # silently carried.
    ENTRY_KEYS = %w[antonyms inflections types].freeze
    KNOWN_POS = ['adjective', 'adverb', 'article', 'conjunction', 'determiner',
                 'interjection', 'intransitive verb', 'negation', 'noun', 'numeral',
                 'preposition', 'pronoun', 'question', 'social', 'transitive verb',
                 'usu participle verb', 'verb'].freeze
    FORM_NAMES = %w[base comparative infinitive negation negative_comparative objective
                    past past_participle plural plural_present possessive
                    possessive_adjective present present_participle reflexive
                    simple_past simple_present superlative].freeze
    # Per-word compass overrides, carried verbatim as ext_slot_overrides.
    SLOT_OVERRIDE_KEYS = %w[E N NE NW S SE SW W].freeze
    EXTRA_KEYS = ['extra_1', 'extra_2', 'extra_!'].freeze
    # The values WordData.inflection_locations_for already treats as "no form".
    ABSENT_VALUES = ['N/A', 'na', 'NA', 'n/a'].freeze

    # Rules file: passed through verbatim once its shape is checked.
    RULES_KEYS = %w[inflection_locations rules substitutions tests].freeze
    RULE_KEYS = %w[id inflection location lookback overrides type].freeze
    LOOKBACK_KEYS = %w[condense match non_match optional type words].freeze
    LOCATION_KEYS = %w[if_empty inflection location override_if_same required type].freeze
    SUBSTITUTION_KEYS = %w[contractions default_contractions].freeze
    TEST_OPTION_KEYS = %w[inflection rule_id].freeze
    # FORM_NAMES plus the names the upstream slot grid places but no words entry
    # carries.
    RULE_INFLECTION_NAMES = (FORM_NAMES + %w[antonym personal_present subjective]).sort.freeze
    # The button grid: the eight compass points plus the centre.
    GRID_LOCATIONS = %w[c e n ne nw s se sw w].freeze

    # Facts about how English is handled today, not reviewed linguistic choices.
    # Morphology, feature inventories, feature-bundle aliases and slot layouts are
    # left for a reviewed follow-up.
    PROFILE = {
      'locale' => 'en',
      'script' => {'code' => 'Latn', 'rtl' => false, 'spaces' => true},
      'utterance' => {'contractions_apply' => true, 'tokenizer' => 'space'}
    }.freeze

    # Builds both files, stages both as .tmp, then renames both into place. An input
    # check failure, an output path that exists but is not a regular file, or a failed
    # staging write leaves the existing output unchanged, and no .tmp file is left
    # behind. The two renames are separate steps, not one atomic swap.
    def self.generate!(vendor_dir: VENDOR_DIR, out_dir: OUTPUT_DIR, inputs: INPUTS)
      files = build(vendor_dir: vendor_dir, inputs: inputs)
      paths = files.keys.map { |name| File.join(out_dir, name) }
      paths.each do |path|
        raise Error, "#{path}: exists and is not a regular file" if File.exist?(path) && !File.file?(path)
      end
      begin
        files.values.zip(paths) { |body, path| File.binwrite("#{path}.tmp", body) }
        paths.each { |path| File.rename("#{path}.tmp", path) }
      ensure
        paths.each { |path| FileUtils.rm_f("#{path}.tmp") }
      end
      paths
    end

    # Returns {output file name => exact bytes}.
    def self.build(vendor_dir: VENDOR_DIR, inputs: INPUTS)
      words = read_pinned(vendor_dir, 'words-en.json', inputs)
      rules = read_pinned(vendor_dir, 'rules-en.json', inputs)
      {
        'rules-en.json' => serialize(build_rules(rules, inputs['rules-en.json'])),
        'words-en.json' => serialize(build_words(words, inputs['words-en.json']))
      }
    end

    def self.read_pinned(vendor_dir, name, inputs)
      pin = inputs[name] or raise Error, "#{name}: no pin recorded"
      path = File.join(vendor_dir, name)
      raise Error, "#{name}: missing input at #{path}" unless File.file?(path)
      bytes = File.binread(path)
      actual = Digest::SHA256.hexdigest(bytes)
      if actual != pin['sha256']
        raise Error, "#{name}: SHA-256 #{actual} does not match the pinned #{pin['sha256']}"
      end
      begin
        JSON::Ext::Parser.parse(bytes.force_encoding('UTF-8'), allow_duplicate_key: false)
      rescue JSON::ParserError => e
        raise Error, "#{name}: not valid JSON (#{e.message})"
      end
    end

    def self.serialize(obj)
      JSON::Ext::Generator::State.new(PRETTY).generate(obj) + "\n"
    end

    def self.build_words(json, pin)
      check_meta!(json, 'words', 'words')
      entries = json.reject { |key, _| key.start_with?('_') }
      {
        '_license' => LICENSE,
        '_locale' => 'en',
        '_schema' => SCHEMA,
        '_source' => source(pin, json),
        '_type' => 'words',
        '_version' => VERSION,
        'words' => entries.keys.sort.map { |surface| lexeme(surface, entries[surface]) }
      }
    end

    # One upstream entry (keyed by surface form) becomes one lexeme. Nothing is
    # merged: two surfaces with the same base stay two lexemes, as do surfaces
    # that differ only in case.
    def self.lexeme(surface, entry)
      where = "words-en.json[#{surface.inspect}]"
      raise Error, "#{where}: blank or padded key" if surface.strip.empty? || surface != surface.strip
      raise Error, "#{where}: entry is not an object" unless entry.is_a?(Hash)
      unknown = entry.keys - ENTRY_KEYS
      raise Error, "#{where}: unknown fields #{unknown.inspect}" if unknown.any?

      types = entry['types']
      unless types.is_a?(Array) && types.any? && types.all? { |t| KNOWN_POS.include?(t) }
        raise Error, "#{where}: types must be a non-empty list of known parts of speech, got #{types.inspect}"
      end
      antonyms = entry['antonyms'] || []
      raise Error, "#{where}: antonyms must be a list of strings" unless string_list?(antonyms)
      inflections = entry['inflections']
      raise Error, "#{where}: inflections must be an object" unless inflections.is_a?(Hash)

      forms = {}
      slots = {}
      extra = {}
      inflections.each do |name, value|
        next if name == 'regulars'
        raise Error, "#{where}: inflection #{name.inspect} is not a string" unless value.is_a?(String)
        target = if FORM_NAMES.include?(name) then forms
                 elsif SLOT_OVERRIDE_KEYS.include?(name) then slots
                 elsif EXTRA_KEYS.include?(name) then extra
                 else raise Error, "#{where}: unknown inflection #{name.inspect}"
                 end
        target[name] = value unless ABSENT_VALUES.include?(value)
      end
      if inflections.key?('regulars') && !string_list?(inflections['regulars'])
        raise Error, "#{where}: regulars must be a list of strings"
      end

      lemma = forms['base'] || surface
      lex = {
        'antonyms' => antonyms,
        'forms' => forms.sort.to_h,
        'lemma' => lemma,
        'pos' => types
      }
      lex['ext_extra'] = extra.sort.to_h if extra.any?
      lex['ext_regulars'] = inflections['regulars'] if inflections.key?('regulars')
      lex['ext_slot_overrides'] = slots.sort.to_h if slots.any?
      lex['ext_surface'] = surface if surface != lemma
      lex.sort.to_h
    end

    def self.build_rules(json, pin)
      check_meta!(json, 'rules', 'rules', RULES_KEYS)
      check_rules!(json['rules'])
      check_locations!(json['inflection_locations'])
      check_substitutions!(json['substitutions'])
      check_tests!(json['tests'])
      {
        '_license' => LICENSE,
        '_locale' => 'en',
        '_schema' => SCHEMA,
        '_source' => source(pin, json),
        '_type' => 'rules',
        '_version' => VERSION,
        'inflection_locations' => json['inflection_locations'],
        'profile' => PROFILE,
        'rules' => json['rules'],
        'substitutions' => json['substitutions'],
        'tests' => json['tests']
      }
    end

    # The upstream Spanish files declare "_locale": "en", so the locale check alone
    # cannot prove a file is English; the SHA-256 pin is what does that.
    def self.check_meta!(json, type, label, body_keys = nil)
      raise Error, "#{label}: top level is not an object" unless json.is_a?(Hash)
      meta = json.keys.select { |key| key.start_with?('_') }
      if meta.sort != META_KEYS
        raise Error, "#{label}: metadata keys #{meta.sort.inspect}, expected #{META_KEYS.inspect}"
      end
      raise Error, "#{label}: _locale is #{json['_locale'].inspect}, expected \"en\"" if json['_locale'] != 'en'
      raise Error, "#{label}: _type is #{json['_type'].inspect}, expected #{type.inspect}" if json['_type'] != type
      raise Error, "#{label}: _version is not a string" unless json['_version'].is_a?(String)
      raise Error, "#{label}: _license is not a string" unless json['_license'].is_a?(String)
      return unless body_keys
      body = json.keys - meta
      raise Error, "#{label}: top-level keys #{body.sort.inspect}, expected #{body_keys.inspect}" if body.sort != body_keys
    end

    def self.check_rules!(rules)
      raise Error, 'rules: rules is not a list' unless rules.is_a?(Array)
      raise Error, 'rules: rules is empty' if rules.empty?
      ids = rules.map do |rule|
        raise Error, 'rules: a rule is not an object' unless rule.is_a?(Hash)
        unknown = rule.keys - RULE_KEYS
        raise Error, "rules: rule #{rule['id'].inspect} has unknown keys #{unknown.inspect}" if unknown.any?
        raise Error, 'rules: a rule has no string id' unless rule['id'].is_a?(String)
        lookback = rule['lookback']
        unless lookback.is_a?(Array) && lookback.all? { |item| item.is_a?(Hash) && (item.keys - LOOKBACK_KEYS).empty? }
          raise Error, "rules: rule #{rule['id'].inspect} has an unrecognised lookback"
        end
        check_rule_values!(rule)
        rule['id']
      end
      dupes = ids.tally.select { |_, count| count > 1 }.keys
      raise Error, "rules: duplicate rule ids #{dupes.inspect}" if dupes.any?
    end

    # An "override" rule replaces words with its overrides; any other rule is a part
    # of speech and places an inflection at a grid location.
    def self.check_rule_values!(rule)
      where = "rules: rule #{rule['id'].inspect}"
      type = rule['type']
      unless type == 'override' || KNOWN_POS.include?(type)
        raise Error, "#{where}: type #{type.inspect} is not a known part of speech or \"override\""
      end
      if type == 'override' || rule.key?('overrides')
        overrides = rule['overrides']
        unless overrides.is_a?(Hash) && overrides.any? && overrides.values.all? { |value| value.is_a?(String) }
          raise Error, "#{where}: overrides must be a non-empty object of strings"
        end
      end
      if type != 'override' || rule.key?('inflection')
        check_inflection_name!(where, rule['inflection'])
      end
      if type != 'override' || rule.key?('location')
        check_grid_location!(where, 'location', rule['location'])
      end
    end

    def self.check_locations!(locations)
      raise Error, 'rules: inflection_locations is not an object' unless locations.is_a?(Hash)
      raise Error, 'rules: inflection_locations is empty' if locations.empty?
      locations.each do |pos, list|
        where = "rules: inflection_locations[#{pos.inspect}]"
        unless list.is_a?(Array) && list.all? { |item| item.is_a?(Hash) && (item.keys - LOCATION_KEYS).empty? }
          raise Error, "#{where} has an unrecognised shape"
        end
        raise Error, "#{where} is empty" if list.empty?
        raise Error, "#{where}: unknown part of speech" unless KNOWN_POS.include?(pos)
        list.each do |item|
          check_inflection_name!(where, item['inflection']) if item.key?('inflection')
          %w[location override_if_same].each do |key|
            check_grid_location!(where, key, item[key]) if item.key?(key)
          end
          if item.key?('type') && !KNOWN_POS.include?(item['type'])
            raise Error, "#{where}: type #{item['type'].inspect} is not a known part of speech"
          end
        end
      end
    end

    def self.check_inflection_name!(where, name)
      raise Error, "#{where}: unknown inflection #{name.inspect}" unless RULE_INFLECTION_NAMES.include?(name)
    end

    def self.check_grid_location!(where, key, value)
      return if GRID_LOCATIONS.include?(value)
      raise Error, "#{where}: #{key} #{value.inspect} is not one of #{GRID_LOCATIONS.inspect}"
    end

    def self.check_substitutions!(subs)
      unless subs.is_a?(Hash) && subs.keys.sort == SUBSTITUTION_KEYS
        raise Error, "rules: substitutions must hold exactly #{SUBSTITUTION_KEYS.inspect}"
      end
      subs.each do |name, map|
        unless map.is_a?(Hash) && map.all? { |k, v| k.is_a?(String) && v.is_a?(String) }
          raise Error, "rules: substitutions[#{name.inspect}] must map strings to strings"
        end
      end
    end

    def self.check_tests!(tests)
      raise Error, 'rules: tests is not a list' unless tests.is_a?(Array)
      raise Error, 'rules: tests is empty' if tests.empty?
      tests.each_with_index do |test, idx|
        ok = test.is_a?(Array) && [3, 4].include?(test.length) &&
             test[0, 3].all? { |part| part.is_a?(String) } &&
             (test.length == 3 || test[3].is_a?(Hash))
        raise Error, "rules: tests[#{idx}] is not [prior, word, expected, {options}]" unless ok
        next if test.length == 3
        unknown = test[3].keys - TEST_OPTION_KEYS
        raise Error, "rules: tests[#{idx}]: unknown options #{unknown.inspect}" if unknown.any?
        test[3].each do |key, value|
          raise Error, "rules: tests[#{idx}]: option #{key.inspect} must be a string" unless value.is_a?(String)
        end
      end
    end

    def self.source(pin, upstream)
      UPSTREAM.merge(ATTRIBUTION).merge(
        'path' => pin['path'],
        'sha256' => pin['sha256'],
        'upstream_license' => upstream['_license'],
        'upstream_version' => upstream['_version']
      ).sort.to_h
    end

    def self.string_list?(value)
      value.is_a?(Array) && value.all? { |item| item.is_a?(String) }
    end
    private_class_method :string_list?
  end
end
