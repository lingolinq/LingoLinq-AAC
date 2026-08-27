require 'spec_helper'

describe BoardTranslationWords do
  describe '.collect_words' do
    it 'includes board name, labels, and non-action vocalizations' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Keyboard'
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'space', 'vocalization' => ':space'},
        {'id' => 2, 'label' => 'hat', 'vocalization' => 'I wear a hat'}
      ]
      b.save
      words = described_class.collect_words([b.global_id])
      expect(words).to include('Keyboard')
      expect(words).to include('space')
      expect(words).to include('hat')
      expect(words).to include('I wear a hat')
      expect(words).not_to include(':space')
    end

    it 'does not send spelling-key letters to Google' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Keyboard'
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'e', 'vocalization' => '+e'},
        {'id' => 2, 'label' => 'space', 'vocalization' => ':space'}
      ]
      b.save
      words = described_class.collect_words([b.global_id])
      expect(words).to include('space')
      expect(words).not_to include('e')
    end
  end

  describe '.board_ids' do
    it 'walks load_board children when downstream_board_ids is empty' do
      u = User.create
      child = Board.create(:user => u)
      child.settings['name'] = 'Child'
      child.settings['buttons'] = [{'id' => 1, 'label' => 'cat'}]
      child.save
      root = Board.create(:user => u)
      root.settings['name'] = 'Root'
      root.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => child.global_id, 'key' => child.key}}
      ]
      root.settings['downstream_board_ids'] = []
      root.settings['immediately_downstream_board_ids'] = []
      root.save
      root.settings['downstream_board_ids'] = []
      root.settings['immediately_downstream_board_ids'] = []

      ids = described_class.board_ids(root)
      expect(ids).to include(root.global_id)
      expect(ids).to include(child.global_id)
    end

    it 'does not follow load_board links owned by another user' do
      owner = User.create
      other = User.create
      foreign = Board.create(:user => other)
      foreign.settings['name'] = 'Foreign'
      foreign.settings['buttons'] = [{'id' => 1, 'label' => 'secret'}]
      foreign.save
      root = Board.create(:user => owner)
      root.settings['name'] = 'Root'
      root.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => foreign.global_id, 'key' => foreign.key}}
      ]
      root.save
      ids = described_class.board_ids(root)
      expect(ids).to include(root.global_id)
      expect(ids).not_to include(foreign.global_id)
    end
  end
end

describe LibraryBoardTranslator do
  describe '.parse_dest_lang' do
    it 'defaults blank and shell locales to es' do
      expect(described_class.parse_dest_lang(nil)).to eq('es')
      expect(described_class.parse_dest_lang('')).to eq('es')
      expect(described_class.parse_dest_lang('en_US.UTF-8')).to eq('es')
    end

    it 'accepts language tags' do
      expect(described_class.parse_dest_lang('es')).to eq('es')
      expect(described_class.parse_dest_lang('fr')).to eq('fr')
      expect(described_class.parse_dest_lang('es-US')).to eq('es-US')
    end
  end

  describe '.google_translate_token_injected?' do
    it 'is false for blank and unresolved op:// refs' do
      previous = ENV['GOOGLE_TRANSLATE_TOKEN']
      begin
        ENV['GOOGLE_TRANSLATE_TOKEN'] = nil
        expect(described_class.google_translate_token_injected?).to eq(false)
        ENV['GOOGLE_TRANSLATE_TOKEN'] = 'op://vault/item/field'
        expect(described_class.google_translate_token_injected?).to eq(false)
        ENV['GOOGLE_TRANSLATE_TOKEN'] = 'real-token'
        expect(described_class.google_translate_token_injected?).to eq(true)
      ensure
        ENV['GOOGLE_TRANSLATE_TOKEN'] = previous
      end
    end
  end

  describe '.translate_one!' do
    it 'stores dest translations without changing English labels or locale' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'My Board'
      b.settings['locale'] = 'en'
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'vocalization' => 'hat'},
        {'id' => 2, 'label' => 'space', 'vocalization' => ':space'}
      ]
      b.public = true
      b.save

      expect(WordData).to receive(:translate_batch) do |batch, src, dest|
        texts = batch.map { |o| o[:text] }
        expect(src).to eq('en')
        expect(dest).to eq('es')
        expect(texts).to include('My Board')
        expect(texts).to include('hat')
        expect(texts).to include('space')
        expect(texts).not_to include(':space')
        {
          translations: { 'My Board' => 'Mi tablero', 'hat' => 'sombrero', 'space' => 'espacio' },
          origins: { 'My Board' => 'google', 'hat' => 'cache', 'space' => 'google' }
        }
      end

      result = described_class.translate_one!(b, dest_lang: 'es')
      b.reload
      expect(b.settings['locale']).to eq('en')
      by_id = b.settings['buttons'].index_by { |btn| btn['id'] }
      expect(by_id[1]['label']).to eq('hat')
      expect(by_id[1]['vocalization']).to eq('hat')
      expect(by_id[2]['label']).to eq('space')
      expect(by_id[2]['vocalization']).to eq(':space')
      trans = BoardContent.load_content(b, 'translations') || b.settings['translations']
      expect(trans['1']['es']['label']).to eq('sombrero')
      expect(trans['2']['es']['label']).to eq('espacio')
      expect(trans['2']['es']['vocalization']).not_to eq('espacio')
      expect(result[:origins]['hat']).to eq('cache')
    end

    it 'does not call Google when the owner org has disabled external AI processing' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'My Board'
      b.settings['locale'] = 'en'
      b.settings['buttons'] = [{'id' => 1, 'label' => 'hat'}]
      b.save
      expect(Organization).to receive(:external_ai_processing_allowed_for_user?).with(u).and_return(false)
      expect(WordData).to_not receive(:translate_batch)
      expect { described_class.translate_one!(b, dest_lang: 'es') }.to raise_error(/external AI processing disabled/)
    end

    it 'keeps spelling-key letters as themselves and overwrites Google abbreviations' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Keyboard'
      b.settings['locale'] = 'en'
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'e', 'vocalization' => '+e'}
      ]
      b.settings['translations'] = {
        '1' => { 'en' => { 'label' => 'e' }, 'es' => { 'label' => 'mi' } }
      }
      b.public = true
      b.save

      expect(WordData).to receive(:translate_batch) do |batch, _src, _dest|
        expect(batch.map { |o| o[:text] }).not_to include('e')
        { translations: { 'Keyboard' => 'Teclado' }, origins: { 'Keyboard' => 'google' } }
      end

      described_class.translate_one!(b, dest_lang: 'es')
      b.reload
      expect(b.settings['buttons'][0]['label']).to eq('e')
      expect(b.settings['buttons'][0]['vocalization']).to eq('+e')
      trans = BoardContent.load_content(b, 'translations') || b.settings['translations']
      expect(trans['1']['es']['label']).to eq('e')
    end

    it 'translates linked boards even when downstream_board_ids is empty' do
      u = User.create
      child = Board.create(:user => u)
      child.settings['name'] = 'Child'
      child.settings['locale'] = 'en'
      child.settings['buttons'] = [{'id' => 1, 'label' => 'cat'}]
      child.save
      root = Board.create(:user => u)
      root.settings['name'] = 'Root'
      root.settings['locale'] = 'en'
      root.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => child.global_id, 'key' => child.key}}
      ]
      root.public = true
      root.save
      root.settings['downstream_board_ids'] = []

      expect(WordData).to receive(:translate_batch) do |batch, _src, _dest|
        texts = batch.map { |o| o[:text] }
        expect(texts).to include('hat')
        expect(texts).to include('cat')
        {
          translations: { 'Root' => 'Raiz', 'hat' => 'sombrero', 'Child' => 'Nino', 'cat' => 'gato' },
          origins: { 'hat' => 'google', 'cat' => 'google' }
        }
      end

      result = described_class.translate_one!(root, dest_lang: 'es')
      expect(result[:board_ids]).to include(child.global_id)
      child.reload
      trans = BoardContent.load_content(child, 'translations') || child.settings['translations']
      expect(trans['1']['es']['label']).to eq('gato')
      expect(child.settings['buttons'][0]['label']).to eq('cat')
    end

    it 'does not send non-English child labels to Google' do
      u = User.create
      child = Board.create(:user => u)
      child.settings['name'] = 'Nino'
      child.settings['locale'] = 'es'
      child.settings['buttons'] = [{'id' => 1, 'label' => 'gato'}]
      child.save
      root = Board.create(:user => u)
      root.settings['name'] = 'Root'
      root.settings['locale'] = 'en'
      root.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => child.global_id, 'key' => child.key}}
      ]
      root.public = true
      root.save
      expect(WordData).to receive(:translate_batch) do |batch, _src, _dest|
        texts = batch.map { |o| o[:text] }
        expect(texts).to include('hat')
        expect(texts).not_to include('gato')
        expect(texts).not_to include('Nino')
        { translations: { 'Root' => 'Raiz', 'hat' => 'sombrero' }, origins: { 'hat' => 'google' } }
      end
      described_class.translate_one!(root, dest_lang: 'es')
      child.reload
      expect(child.settings['buttons'][0]['label']).to eq('gato')
      expect(child.settings['locale']).to eq('es')
    end

    it 'skips save when Google and cache return nothing' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Empty'
      b.settings['locale'] = 'en'
      b.settings['buttons'] = [{'id' => 1, 'label' => 'hat'}]
      b.save
      expect(WordData).to receive(:translate_batch).and_return({ translations: {}, origins: {} })
      described_class.translate_one!(b, dest_lang: 'es')
      b.reload
      trans = BoardContent.load_content(b, 'translations') || b.settings['translations'] || {}
      expect((trans['1'] || {})['es']).to eq(nil)
      expect(b.settings['buttons'][0]['label']).to eq('hat')
    end
  end

  describe '.translate_library!' do
    it 'translates configured slugs and writes a CSV with origins' do
      source = User.create(user_name: 'lingolinq')
      b = Board.process_new({name: 'Quick Core 60', public: true}, {user: source, key: 'quick-core-60'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'want'}
      ]
      b.save

      expect(WordData).to receive(:translate_batch).and_return({
        translations: { 'Quick Core 60' => 'Nucleo rapido 60', 'want' => 'querer' },
        origins: { 'Quick Core 60' => 'google', 'want' => 'google' }
      })

      report = Rails.root.join('tmp', 'library-board-translations-spec.csv').to_s
      FileUtils.rm_f(report)
      described_class.translate_library!(dest_lang: 'es', slugs: ['quick-core-60'], report_path: report)

      b.reload
      expect(b.settings['locale']).to eq('en')
      expect(b.settings['buttons'][0]['label']).to eq('want')
      trans = BoardContent.load_content(b, 'translations') || b.settings['translations']
      expect(trans['1']['es']['label']).to eq('querer')

      rows = csv_rows(report)
      want = rows.find { |r| r['field'] == 'label' && r['en'] == 'want' }
      expect(want).to_not eq(nil)
      expect(want['dest']).to eq('querer')
      expect(want['origin']).to eq('google')
      expect(want['board_key']).to eq(b.key)
    end

    it 'SCOPE=seed discovers listed public roots and skips unlisted, -es, and non-English locales' do
      source = User.create(user_name: 'lingolinq')
      listed = Board.process_new({name: 'Sequoia 15', public: true}, {user: source, key: 'sequoia-15'})
      listed.settings['locale'] = 'en_US'
      listed.settings['unlisted'] = false
      listed.settings['buttons'] = [{'id' => 1, 'label' => 'tree'}]
      listed.save
      child = Board.process_new({name: 'Sequoia child', public: true}, {user: source, key: 'sequoia-15-food'})
      child.settings['unlisted'] = true
      child.save
      spanish = Board.process_new({name: 'QC60 ES', public: true}, {user: source, key: 'quick-core-60-es'})
      spanish.settings['locale'] = 'en'
      spanish.save
      already_es = Board.process_new({name: 'Núcleo rápido 24', public: true}, {user: source, key: 'quick-core-24'})
      already_es.settings['locale'] = 'es'
      already_es.save

      expect(WordData).to receive(:translate_batch).and_return({
        translations: { 'Sequoia 15' => 'Secuoya 15', 'tree' => 'arbol' },
        origins: { 'Sequoia 15' => 'google', 'tree' => 'google' }
      })

      result = described_class.translate_library!(dest_lang: 'es', scope: 'seed', report_path: Rails.root.join('tmp', 'library-board-translations-seed-spec.csv').to_s)
      expect(result[:slugs]).to include(listed.key)
      expect(result[:slugs]).not_to include(child.key)
      expect(result[:slugs]).not_to include(spanish.key)
      expect(result[:slugs]).not_to include(already_es.key)
      expect(result[:skipped].map(&:first)).to include(spanish.key, already_es.key)

      listed.reload
      expect(listed.settings['buttons'][0]['label']).to eq('tree')
      trans = BoardContent.load_content(listed, 'translations') || listed.settings['translations']
      expect(trans['1']['es']['label']).to eq('arbol')
    end

    it 'DRY_RUN lists seed roots without calling Google' do
      source = User.create(user_name: 'lingolinq')
      b = Board.process_new({name: 'Yes/No', public: true}, {user: source, key: 'yesno'})
      b.settings['locale'] = 'en'
      b.save
      expect(WordData).to_not receive(:translate_batch)
      result = described_class.translate_library!(dest_lang: 'es', scope: 'seed', dry_run: true)
      expect(result[:dry_run]).to eq(true)
      expect(result[:slugs]).to include(b.key)
      expect(result[:report_path]).to eq(nil)
    end

    it 'does not re-apply translate_set on a child already visited by another root' do
      source = User.create(user_name: 'lingolinq')
      child = Board.process_new({name: 'Shared', public: true, locale: 'en'}, {user: source, key: 'shared-child'})
      child.settings['buttons'] = [{'id' => 1, 'label' => 'cat'}]
      child.save
      a = Board.process_new({name: 'Root A', public: true, locale: 'en'}, {user: source, key: 'root-a'})
      a.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => child.global_id, 'key' => child.key}}
      ]
      a.save
      b = Board.process_new({name: 'Root B', public: true, locale: 'en'}, {user: source, key: 'root-b'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'dog', 'load_board' => {'id' => child.global_id, 'key' => child.key}}
      ]
      b.save
      allow(WordData).to receive(:translate_batch).and_return({
        translations: {
          'Root A' => 'Raiz A', 'hat' => 'sombrero', 'Shared' => 'Compartido', 'cat' => 'gato',
          'Root B' => 'Raiz B', 'dog' => 'perro'
        },
        origins: {
          'Root A' => 'google', 'hat' => 'google', 'Shared' => 'google', 'cat' => 'google',
          'Root B' => 'google', 'dog' => 'google'
        }
      })
      described_class.translate_library!(
        dest_lang: 'es',
        slugs: ['root-a', 'root-b'],
        report_path: Rails.root.join('tmp', 'library-board-translations-visited-spec.csv').to_s
      )
      child.reload
      trans = BoardContent.load_content(child, 'translations') || child.settings['translations']
      expect(trans['1']['es']['label']).to eq('gato')
      expect(child.settings['buttons'][0]['label']).to eq('cat')
    end

    it 'marks strings Google did not return as missing' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Solo'
      b.settings['buttons'] = [{'id' => 1, 'label' => 'hat'}]
      b.save
      expect(WordData).to receive(:translate_batch).and_return({
        translations: { 'hat' => 'sombrero' },
        origins: { 'hat' => 'google' }
      })
      report = Rails.root.join('tmp', 'library-board-translations-missing.csv').to_s
      result = described_class.translate_one!(b, dest_lang: 'es')
      described_class.write_report(
        dest_lang: 'es',
        entries: result[:entries],
        translations: result[:translations],
        origins: result[:origins],
        report_path: report
      )
      rows = csv_rows(report)
      name_row = rows.find { |r| r['field'] == 'name' }
      expect(name_row['dest']).to eq('')
      expect(name_row['origin']).to eq('missing')
    end
  end

  def csv_rows(path)
    lines = File.readlines(path).map(&:chomp)
    headers = parse_csv_line(lines.shift)
    lines.map { |line| headers.zip(parse_csv_line(line)).to_h }
  end

  def parse_csv_line(line)
    line.scan(/"((?:[^"]|"")*)"/).flatten.map { |s| s.gsub('""', '"') }
  end
end
