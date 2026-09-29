require 'spec_helper'
require 'tmpdir'

describe Language::Schema2Generator do
  let(:gen) { Language::Schema2Generator }
  let(:vendor_dir) { gen::VENDOR_DIR }
  let(:output_dir) { gen::OUTPUT_DIR }

  def upstream(name)
    JSON.parse(File.read(File.join(gen::VENDOR_DIR, name)))
  end

  def copy_vendor(tmp)
    dir = File.join(tmp, 'vendor')
    FileUtils.mkdir_p(dir)
    gen::INPUTS.keys.each { |name| FileUtils.cp(File.join(gen::VENDOR_DIR, name), dir) }
    dir
  end

  # A pin table for synthetic inputs written by the spec itself.
  def pins_for(dir, names)
    names.to_h do |name|
      [name, {'path' => "spec/#{name}", 'sha256' => Digest::SHA256.file(File.join(dir, name)).hexdigest}]
    end
  end

  def words_json(entries, meta = {})
    {'_locale' => 'en', '_version' => '0.1', '_license' => 'test', '_type' => 'words'}.merge(meta).merge(entries)
  end

  def rules_json(overrides = {})
    {
      '_locale' => 'en', '_version' => '0.1', '_license' => 'test', '_type' => 'rules',
      'rules' => [{'id' => 'r1', 'type' => 'override', 'lookback' => [{'words' => ['i']}], 'overrides' => {'is' => 'am'}}],
      'inflection_locations' => {'noun' => [{'location' => 'n', 'inflection' => 'plural'}]},
      'substitutions' => {'contractions' => {'i am' => "i'm"}, 'default_contractions' => {}},
      'tests' => [['i', 'is', 'i am', {'rule_id' => 'r1'}], ['you', 'does', 'you do']]
    }.merge(overrides)
  end

  let(:pin) { {'path' => 'spec/x.json', 'sha256' => 'f' * 64} }

  describe 'pinned inputs' do
    it 'match their recorded SHA-256 byte for byte' do
      gen::INPUTS.each do |name, input|
        actual = Digest::SHA256.file(File.join(vendor_dir, name)).hexdigest
        expect(actual).to eq(input['sha256']), "#{name} was edited; vendored inputs must stay byte-identical to upstream"
      end
    end

    it 'are recorded in the attribution file with the same commit, paths and hashes' do
      notice = File.read(File.join(vendor_dir, 'NOTICE.md'))
      expect(notice).to include(gen::UPSTREAM['commit'])
      expect(notice).to include("https://github.com/#{gen::UPSTREAM['repo']}")
      expect(notice).to include('CC BY 4.0')
      expect(notice).to include(gen::ATTRIBUTION['license_url'])
      expect(notice).not_to include('MIT License')
      gen::INPUTS.each do |name, input|
        expect(notice).to include(input['path'])
        expect(notice).to include("#{name}: #{input['sha256']}")
      end
    end
  end

  describe 'committed output' do
    it 'is byte-identical to a fresh build from the pinned inputs' do
      gen.build.each do |name, body|
        committed = File.binread(File.join(output_dir, name))
        expect(committed == body).to eq(true),
          "db/language/en/#{name} drifted from the generator; run `bundle exec rake language:schema2` and commit the result"
      end
    end

    it 'builds the same bytes every time' do
      Dir.mktmpdir do |tmp|
        first = File.join(tmp, 'a')
        second = File.join(tmp, 'b')
        FileUtils.mkdir_p([first, second])
        gen.generate!(out_dir: first)
        gen.generate!(out_dir: second)
        expect(Dir.children(first).sort).to eq(%w[rules-en.json words-en.json])
        Dir.children(first).each do |name|
          expect(File.binread(File.join(first, name))).to eq(File.binread(File.join(second, name)))
        end
      end
    end
  end

  describe '.generate! output pairing' do
    def seed_out(tmp)
      out = File.join(tmp, 'out')
      FileUtils.mkdir_p(out)
      File.write(File.join(out, 'rules-en.json'), 'old rules')
      out
    end

    it 'leaves the rules file unchanged and no .tmp behind when the words path is a directory' do
      Dir.mktmpdir do |tmp|
        out = seed_out(tmp)
        FileUtils.mkdir_p(File.join(out, 'words-en.json'))
        expect { gen.generate!(out_dir: out) }.to raise_error(gen::Error, /words-en\.json: exists and is not a regular file/)
        expect(File.read(File.join(out, 'rules-en.json'))).to eq('old rules')
        expect(Dir.children(out).sort).to eq(%w[rules-en.json words-en.json])
      end
    end

    it 'removes its .tmp files and leaves the rules file unchanged when staging a write fails' do
      Dir.mktmpdir do |tmp|
        out = seed_out(tmp)
        FileUtils.mkdir_p(File.join(out, 'words-en.json.tmp'))
        expect { gen.generate!(out_dir: out) }.to raise_error(SystemCallError)
        expect(File.read(File.join(out, 'rules-en.json'))).to eq('old rules')
        expect(Dir.children(out).sort).to eq(%w[rules-en.json words-en.json.tmp])
      end
    end
  end

  describe 'fail-closed input checks' do
    it 'refuses a tampered input and writes nothing' do
      Dir.mktmpdir do |tmp|
        dir = copy_vendor(tmp)
        path = File.join(dir, 'words-en.json')
        bytes = File.binread(path)
        idx = bytes.index('"go"')
        bytes[idx + 1] = 'G'
        File.binwrite(path, bytes)
        out = File.join(tmp, 'out')
        FileUtils.mkdir_p(out)
        expect { gen.generate!(vendor_dir: dir, out_dir: out) }.to raise_error(gen::Error, /words-en\.json: SHA-256 \h{64} does not match the pinned/)
        expect(Dir.children(out)).to eq([])
      end
    end

    it 'refuses a missing input' do
      Dir.mktmpdir do |tmp|
        dir = copy_vendor(tmp)
        File.delete(File.join(dir, 'rules-en.json'))
        expect { gen.build(vendor_dir: dir) }.to raise_error(gen::Error, /rules-en\.json: missing input/)
      end
    end

    it 'refuses an input with no recorded pin' do
      expect { gen.build(inputs: gen::INPUTS.except('rules-en.json')) }.to raise_error(gen::Error, /rules-en\.json: no pin recorded/)
    end

    it 'refuses malformed JSON even when its hash is pinned' do
      Dir.mktmpdir do |tmp|
        File.write(File.join(tmp, 'words-en.json'), '{"_locale": "en", ')
        File.write(File.join(tmp, 'rules-en.json'), JSON.generate(rules_json))
        pins = pins_for(tmp, %w[words-en.json rules-en.json])
        expect { gen.build(vendor_dir: tmp, inputs: pins) }.to raise_error(gen::Error, /words-en\.json: not valid JSON/)
      end
    end

    it 'refuses a duplicate key rather than keeping the last one' do
      Dir.mktmpdir do |tmp|
        File.write(File.join(tmp, 'words-en.json'), '{"_locale":"en","_version":"0.1","_license":"t","_type":"words","go":{"types":["verb"],"inflections":{}},"go":{"types":["noun"],"inflections":{}}}')
        File.write(File.join(tmp, 'rules-en.json'), JSON.generate(rules_json))
        pins = pins_for(tmp, %w[words-en.json rules-en.json])
        expect { gen.build(vendor_dir: tmp, inputs: pins) }.to raise_error(gen::Error, /not valid JSON.*duplicate key/)
      end
    end

    it 'accepts well-formed synthetic inputs through the same path' do
      Dir.mktmpdir do |tmp|
        File.write(File.join(tmp, 'words-en.json'), JSON.generate(words_json('go' => {'types' => ['verb'], 'inflections' => {'base' => 'go'}})))
        File.write(File.join(tmp, 'rules-en.json'), JSON.generate(rules_json))
        pins = pins_for(tmp, %w[words-en.json rules-en.json])
        files = gen.build(vendor_dir: tmp, inputs: pins)
        expect(JSON.parse(files['words-en.json'])['words'].map { |w| w['lemma'] }).to eq(['go'])
      end
    end
  end

  describe '.build_words' do
    it 'wraps the lexicon in the schema-2 envelope with its source recorded' do
      out = gen.build_words(words_json('go' => {'types' => ['verb'], 'inflections' => {'base' => 'go'}}), pin)
      expect(out.keys).to eq(%w[_license _locale _schema _source _type _version words])
      expect(out['_schema']).to eq(2)
      expect(out['_license']).to eq('CC-BY-4.0')
      expect(out['_source']).to eq(gen::UPSTREAM.merge(
        'attribution' => 'OpenAAC',
        'license_url' => 'https://creativecommons.org/licenses/by/4.0/',
        'modified' => 'Transformed by LingoLinq from the pinned upstream files',
        'path' => 'spec/x.json', 'sha256' => 'f' * 64,
        'upstream_license' => 'test', 'upstream_version' => '0.1'
      ))
    end

    it 'sorts lexemes by surface form' do
      out = gen.build_words(words_json('b' => {'types' => ['noun'], 'inflections' => {}}, 'a' => {'types' => ['noun'], 'inflections' => {}}), pin)
      expect(out['words'].map { |w| w['lemma'] }).to eq(%w[a b])
    end

    it 'rejects an unknown metadata key' do
      expect { gen.build_words(words_json({}, '_schema' => 2), pin) }.to raise_error(gen::Error, /metadata keys/)
    end

    it 'rejects a locale other than en' do
      expect { gen.build_words(words_json({}, '_locale' => 'es'), pin) }.to raise_error(gen::Error, /_locale is "es"/)
    end

    it 'rejects a rules file passed as words' do
      expect { gen.build_words(words_json({}, '_type' => 'rules'), pin) }.to raise_error(gen::Error, /_type is "rules"/)
    end

    it 'rejects a top level that is not an object' do
      expect { gen.build_words([], pin) }.to raise_error(gen::Error, /top level is not an object/)
    end

    it 'rejects a _version that is not a string' do
      expect { gen.build_words(words_json({}, '_version' => 1), pin) }.to raise_error(gen::Error, /_version is not a string/)
    end

    it 'rejects a _license that is not a string' do
      expect { gen.build_words(words_json({}, '_license' => nil), pin) }.to raise_error(gen::Error, /_license is not a string/)
    end
  end

  describe '.lexeme' do
    it 'keeps every part of speech, in upstream order' do
      lex = gen.lexeme('go', 'types' => ['verb', 'noun'], 'inflections' => {'base' => 'go'})
      expect(lex['pos']).to eq(['verb', 'noun'])
    end

    it 'uses base as the lemma and keeps the surface when they differ' do
      lex = gen.lexeme('acting', 'types' => ['verb'], 'inflections' => {'base' => 'act', 'past' => 'acted'})
      expect(lex['lemma']).to eq('act')
      expect(lex['ext_surface']).to eq('acting')
      expect(lex['forms']).to eq('base' => 'act', 'past' => 'acted')
    end

    it 'omits ext_surface when the surface is the lemma' do
      lex = gen.lexeme('go', 'types' => ['verb'], 'inflections' => {'base' => 'go'})
      expect(lex).not_to have_key('ext_surface')
    end

    it 'falls back to the surface when base is absent or N/A' do
      expect(gen.lexeme('add', 'types' => ['verb'], 'inflections' => {})['lemma']).to eq('add')
      lex = gen.lexeme('odd', 'types' => ['noun'], 'inflections' => {'base' => 'N/A'})
      expect(lex['lemma']).to eq('odd')
      expect(lex['forms']).to eq({})
    end

    it 'drops every value the runtime treats as no form' do
      lex = gen.lexeme('x', 'types' => ['noun'], 'inflections' => {'base' => 'x', 'plural' => 'na', 'possessive' => 'N/A', 'negation' => 'n/a', 'comparative' => 'NA'})
      expect(lex['forms']).to eq('base' => 'x')
    end

    it 'keeps past and simple_past apart when upstream gives them different values' do
      lex = gen.lexeme('is', 'types' => ['verb'], 'inflections' => {'base' => 'be', 'past' => 'was', 'simple_past' => 'were'})
      expect(lex['forms']).to include('past' => 'was', 'simple_past' => 'were')
    end

    it 'carries compass overrides, extras and regulars verbatim' do
      lex = gen.lexeme('again', 'types' => ['adverb'], 'inflections' => {
        'base' => 'again', 'N' => 'try again', 'SW' => 'N/A', 'extra_!' => 'againer',
        'regulars' => ['base', 'plural']
      })
      expect(lex['ext_slot_overrides']).to eq('N' => 'try again')
      expect(lex['ext_extra']).to eq('extra_!' => 'againer')
      expect(lex['ext_regulars']).to eq(['base', 'plural'])
      expect(lex['forms']).to eq('base' => 'again')
    end

    it 'defaults antonyms to an empty list and keeps given ones in order' do
      expect(gen.lexeme('go', 'types' => ['verb'], 'inflections' => {})['antonyms']).to eq([])
      expect(gen.lexeme('go', 'types' => ['verb'], 'inflections' => {}, 'antonyms' => ['stop', 'come'])['antonyms']).to eq(['stop', 'come'])
    end

    it 'emits keys in sorted order' do
      lex = gen.lexeme('acting', 'types' => ['verb'], 'inflections' => {'base' => 'act', 'N' => 'x', 'extra_1' => 'y', 'regulars' => []}, 'antonyms' => [])
      expect(lex.keys).to eq(lex.keys.sort)
    end

    it 'rejects an unknown entry field' do
      expect { gen.lexeme('go', 'types' => ['verb'], 'inflections' => {}, 'translations' => {}) }.to raise_error(gen::Error, /unknown fields \["translations"\]/)
    end

    it 'rejects an unknown inflection name' do
      expect { gen.lexeme('go', 'types' => ['verb'], 'inflections' => {'dual' => 'goes'}) }.to raise_error(gen::Error, /unknown inflection "dual"/)
    end

    it 'rejects an unknown or missing part of speech' do
      expect { gen.lexeme('go', 'types' => ['verbish'], 'inflections' => {}) }.to raise_error(gen::Error, /known parts of speech/)
      expect { gen.lexeme('go', 'types' => [], 'inflections' => {}) }.to raise_error(gen::Error, /known parts of speech/)
      expect { gen.lexeme('go', 'inflections' => {}) }.to raise_error(gen::Error, /known parts of speech/)
    end

    it 'rejects non-string values' do
      expect { gen.lexeme('go', 'types' => ['verb'], 'inflections' => {'past' => ['went']}) }.to raise_error(gen::Error, /"past" is not a string/)
      expect { gen.lexeme('go', 'types' => ['verb'], 'inflections' => {'regulars' => 'base'}) }.to raise_error(gen::Error, /regulars must be a list/)
      expect { gen.lexeme('go', 'types' => ['verb'], 'inflections' => {}, 'antonyms' => 'stop') }.to raise_error(gen::Error, /antonyms must be a list/)
      expect { gen.lexeme('go', 'types' => ['verb'], 'inflections' => []) }.to raise_error(gen::Error, /inflections must be an object/)
      expect { gen.lexeme('go', ['verb']) }.to raise_error(gen::Error, /entry is not an object/)
    end

    it 'rejects a blank or padded surface form' do
      expect { gen.lexeme(' go', 'types' => ['verb'], 'inflections' => {}) }.to raise_error(gen::Error, /blank or padded/)
      expect { gen.lexeme('', 'types' => ['verb'], 'inflections' => {}) }.to raise_error(gen::Error, /blank or padded/)
    end
  end

  describe '.build_rules' do
    it 'passes the upstream sections through and adds the profile' do
      input = rules_json
      out = gen.build_rules(input, pin)
      expect(out.keys).to eq(%w[_license _locale _schema _source _type _version inflection_locations profile rules substitutions tests])
      %w[rules inflection_locations substitutions tests].each { |key| expect(out[key]).to eq(input[key]) }
      expect(out['profile']).to eq(gen::PROFILE)
    end

    it 'rejects an unknown top-level section' do
      expect { gen.build_rules(rules_json('paradigms' => {}), pin) }.to raise_error(gen::Error, /top-level keys/)
    end

    it 'rejects a missing section' do
      expect { gen.build_rules(rules_json.except('tests'), pin) }.to raise_error(gen::Error, /top-level keys/)
    end

    it 'rejects duplicate rule ids' do
      rule = rules_json['rules'][0]
      expect { gen.build_rules(rules_json('rules' => [rule, rule]), pin) }.to raise_error(gen::Error, /duplicate rule ids \["r1"\]/)
    end

    it 'rejects unknown rule and lookback keys' do
      expect { gen.build_rules(rules_json('rules' => [{'id' => 'r', 'lookback' => [], 'weight' => 1}]), pin) }.to raise_error(gen::Error, /unknown keys \["weight"\]/)
      expect { gen.build_rules(rules_json('rules' => [{'id' => 'r', 'lookback' => [{'lemma' => 'x'}]}]), pin) }.to raise_error(gen::Error, /unrecognised lookback/)
    end

    it 'rejects an unrecognised slot location' do
      expect { gen.build_rules(rules_json('inflection_locations' => {'noun' => [{'slot' => 'n'}]}), pin) }.to raise_error(gen::Error, /inflection_locations\["noun"\]/)
    end

    it 'rejects substitutions that are not the two contraction maps' do
      expect { gen.build_rules(rules_json('substitutions' => {'contractions' => {}}), pin) }.to raise_error(gen::Error, /substitutions must hold/)
      expect { gen.build_rules(rules_json('substitutions' => {'contractions' => {'a' => 1}, 'default_contractions' => {}}), pin) }.to raise_error(gen::Error, /map strings to strings/)
    end

    it 'rejects a malformed test row' do
      expect { gen.build_rules(rules_json('tests' => [['i', 'is']]), pin) }.to raise_error(gen::Error, /tests\[0\]/)
      expect { gen.build_rules(rules_json('tests' => [['i', 'is', 'i am', 'r1']]), pin) }.to raise_error(gen::Error, /tests\[0\]/)
    end

    context 'value checks' do
      let(:pos_rule) { {'id' => 'r2', 'type' => 'verb', 'inflection' => 'infinitive', 'location' => 'e', 'lookback' => [{'words' => ['want']}]} }
      let(:location) { {'location' => 'n', 'inflection' => 'plural'} }

      def with_rule(changes)
        rules_json('rules' => [pos_rule.merge(changes)])
      end

      def with_location(changes)
        rules_json('inflection_locations' => {'noun' => [location.merge(changes)]})
      end

      it 'accepts a part-of-speech rule with a known inflection and location' do
        expect(gen.build_rules(rules_json('rules' => [pos_rule]), pin)['rules']).to eq([pos_rule])
      end

      it 'rejects rules that are not a list' do
        expect { gen.build_rules(rules_json('rules' => {'id' => 'r1'}), pin) }.to raise_error(gen::Error, /rules is not a list/)
      end

      it 'rejects an empty rules list' do
        expect { gen.build_rules(rules_json('rules' => []), pin) }.to raise_error(gen::Error, /rules is empty/)
      end

      it 'rejects a rule id that is not a string' do
        expect { gen.build_rules(rules_json('rules' => [pos_rule.merge('id' => 7)]), pin) }.to raise_error(gen::Error, /a rule has no string id/)
      end

      it 'rejects a rule type that is neither a known part of speech nor override' do
        expect { gen.build_rules(with_rule('type' => 'verbish'), pin) }.to raise_error(gen::Error, /type "verbish" is not a known part of speech or "override"/)
      end

      it 'rejects a rule inflection that is not a known inflection name' do
        expect { gen.build_rules(with_rule('inflection' => 'dual'), pin) }.to raise_error(gen::Error, /rule "r2": unknown inflection "dual"/)
      end

      it 'rejects override values that are not strings' do
        rule = {'id' => 'r1', 'type' => 'override', 'lookback' => [], 'overrides' => {'is' => 1}}
        expect { gen.build_rules(rules_json('rules' => [rule]), pin) }.to raise_error(gen::Error, /rule "r1": overrides must be a non-empty object of strings/)
      end

      it 'rejects a rule location that is not a grid direction' do
        expect { gen.build_rules(with_rule('location' => 'up'), pin) }.to raise_error(gen::Error, /rule "r2": location "up" is not one of/)
      end

      it 'rejects inflection_locations that are not an object' do
        expect { gen.build_rules(rules_json('inflection_locations' => [location]), pin) }.to raise_error(gen::Error, /inflection_locations is not an object/)
      end

      it 'rejects empty inflection_locations' do
        expect { gen.build_rules(rules_json('inflection_locations' => {}), pin) }.to raise_error(gen::Error, /inflection_locations is empty/)
        expect { gen.build_rules(rules_json('inflection_locations' => {'noun' => []}), pin) }.to raise_error(gen::Error, /inflection_locations\["noun"\] is empty/)
      end

      it 'rejects an unknown part of speech in inflection_locations' do
        expect { gen.build_rules(rules_json('inflection_locations' => {'nouns' => [location]}), pin) }.to raise_error(gen::Error, /inflection_locations\["nouns"\]: unknown part of speech/)
        expect { gen.build_rules(with_location('type' => 'nouns'), pin) }.to raise_error(gen::Error, /inflection_locations\["noun"\]: type "nouns" is not a known part of speech/)
      end

      it 'rejects a location or override_if_same that is not a grid direction' do
        expect { gen.build_rules(with_location('location' => 'north'), pin) }.to raise_error(gen::Error, /inflection_locations\["noun"\]: location "north" is not one of/)
        expect { gen.build_rules(with_location('override_if_same' => 'x'), pin) }.to raise_error(gen::Error, /inflection_locations\["noun"\]: override_if_same "x" is not one of/)
      end

      it 'rejects an unknown inflection name in inflection_locations' do
        expect { gen.build_rules(with_location('inflection' => 'dual'), pin) }.to raise_error(gen::Error, /inflection_locations\["noun"\]: unknown inflection "dual"/)
      end

      it 'rejects tests that are not a list' do
        expect { gen.build_rules(rules_json('tests' => {'t' => ['i', 'is', 'i am']}), pin) }.to raise_error(gen::Error, /tests is not a list/)
      end

      it 'rejects an empty tests list' do
        expect { gen.build_rules(rules_json('tests' => []), pin) }.to raise_error(gen::Error, /tests is empty/)
      end

      it 'rejects test options with an unknown key or a non-string value' do
        expect { gen.build_rules(rules_json('tests' => [['i', 'is', 'i am', {'rule_id' => 1}]]), pin) }.to raise_error(gen::Error, /tests\[0\]: option "rule_id" must be a string/)
        expect { gen.build_rules(rules_json('tests' => [['i', 'is', 'i am', {'inflection' => ['past']}]]), pin) }.to raise_error(gen::Error, /tests\[0\]: option "inflection" must be a string/)
        expect { gen.build_rules(rules_json('tests' => [['i', 'is', 'i am', {'weight' => 'x'}]]), pin) }.to raise_error(gen::Error, /tests\[0\]: unknown options \["weight"\]/)
      end
    end
  end

  describe 'fidelity to the pinned upstream files' do
    let(:words_in) { upstream('words-en.json').reject { |key, _| key.start_with?('_') } }
    let(:words_out) { JSON.parse(File.read(File.join(output_dir, 'words-en.json'))) }
    let(:rules_in) { upstream('rules-en.json') }
    let(:rules_out) { JSON.parse(File.read(File.join(output_dir, 'rules-en.json'))) }

    it 'emits exactly one lexeme per upstream entry' do
      surfaces = words_out['words'].map { |w| w['ext_surface'] || w['lemma'] }
      expect(surfaces.sort).to eq(words_in.keys.sort)
    end

    it 'loses no form, override, extra, regulars list, part of speech or antonym' do
      by_surface = words_out['words'].to_h { |w| [w['ext_surface'] || w['lemma'], w] }
      words_in.each do |surface, entry|
        lex = by_surface[surface]
        expected = entry['inflections'].reject { |name, value| name == 'regulars' || gen::ABSENT_VALUES.include?(value) }
        rebuilt = lex['forms'].merge(lex['ext_slot_overrides'] || {}).merge(lex['ext_extra'] || {})
        expect(rebuilt).to eq(expected), "#{surface}: forms differ"
        expect(lex['ext_regulars']).to eq(entry['inflections']['regulars'])
        expect(lex['pos']).to eq(entry['types'])
        expect(lex['antonyms']).to eq(entry['antonyms'] || [])
      end
    end

    it 'passes every rules section through unchanged' do
      %w[rules inflection_locations substitutions tests].each do |key|
        expect(rules_out[key]).to eq(rules_in[key]), "#{key} changed"
      end
      expect(rules_out['tests'].length).to eq(195)
    end

    it 'keeps the upstream license marker and credits OpenAAC under CC BY 4.0' do
      [[words_out, upstream('words-en.json')], [rules_out, rules_in]].each do |out, input|
        expect(out['_license']).to eq('CC-BY-4.0')
        expect(out['_source']['upstream_license']).to eq(input['_license'])
        expect(out['_source']['attribution']).to eq('OpenAAC')
        expect(out['_source']['license_url']).to eq('https://creativecommons.org/licenses/by/4.0/')
      end
      expect(rules_in['_license']).to eq('CC By, OpenAAC')
    end
  end

  describe 'json gem entry points' do
    # The generator calls these directly because Oj.mimic_JSON replaces JSON.parse
    # under Rails. They are only defined when json loads before Oj.mimic_JSON runs;
    # see the Oj entry in docs/task-management/learnings-archive/2026-09.md.
    it 'are still defined with Oj loaded' do
      expect(JSON::Ext::Parser.respond_to?(:parse)).to eq(true)
    end
  end

  describe 'db/language contents' do
    # A closed list: anything else under db/language (a stray dump, a leftover .tmp
    # from an interrupted run, a new locale added by hand) fails here until it is
    # added deliberately, with its provenance recorded.
    let(:allowed) do
      [
        'README.md',
        'en/rules-en.json',
        'en/words-en.json',
        'vendor/openaac-demo-tools-0977e83f/NOTICE.md',
        'vendor/openaac-demo-tools-0977e83f/rules-en.json',
        'vendor/openaac-demo-tools-0977e83f/words-en.json'
      ]
    end

    it 'holds only the listed files' do
      root = Pathname.new(gen::ROOT)
      present = Dir.glob(root.join('**', '*').to_s, File::FNM_DOTMATCH)
                   .select { |path| File.file?(path) }
                   .map { |path| Pathname.new(path).relative_path_from(root).to_s }
      expect(present.sort).to eq(allowed.sort)
    end

    it 'lists every pinned input and every generated output' do
      vendored = gen::INPUTS.keys.map { |name| "vendor/openaac-demo-tools-0977e83f/#{name}" }
      generated = gen.build.keys.map { |name| "en/#{name}" }
      expect(allowed).to include(*vendored, *generated)
    end
  end
end
