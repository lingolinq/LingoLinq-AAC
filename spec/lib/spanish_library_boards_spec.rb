require 'spec_helper'

describe SpanishLibraryBoards do
  describe '.build_translation_map' do
    it 'does not pass action vocalizations to WordData' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Keyboard'
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'space', 'vocalization' => ':space'},
        {'id' => 2, 'label' => 'hat', 'vocalization' => 'I wear a hat'}
      ]
      b.save
      captured = nil
      expect(WordData).to receive(:translate_batch) do |batch, _src, _dest|
        captured = batch.map { |o| o[:text] }
        { translations: {} }
      end
      SpanishLibraryBoards.build_translation_map(b, [b.global_id])
      expect(captured).to include('Keyboard')
      expect(captured).to include('space')
      expect(captured).to include('hat')
      expect(captured).to include('I wear a hat')
      expect(captured).not_to include(':space')
    end

    it 'maps spelling-key letters to themselves and does not send them to Google' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['name'] = 'Keyboard'
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'e', 'vocalization' => '+e'}
      ]
      b.save
      captured = nil
      expect(WordData).to receive(:translate_batch) do |batch, _src, _dest|
        captured = batch.map { |o| o[:text] }
        { translations: { 'Keyboard' => 'Teclado' } }
      end
      map = SpanishLibraryBoards.build_translation_map(b, [b.global_id])
      expect(captured).not_to include('e')
      expect(map['e']).to eq('e')
    end
  end

  describe '.translation_board_ids' do
    it 'is the copy root only, even when downstream_board_ids lists English children' do
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
      root.settings['downstream_board_ids'] = [child.global_id]
      root.save
      expect(described_class.translation_board_ids(root)).to eq([root.global_id])
    end
  end

  describe '.provision_one!' do
    it 'does not overwrite English children of a root-only -es copy' do
      owner = User.create(user_name: 'lingolinq')
      child = Board.process_new({
        name: 'Me',
        public: true,
        locale: 'en',
        buttons: [{'id' => 1, 'label' => 'cat'}]
      }, {user: owner, key: 'core-60-me'})
      Board.process_new({
        name: 'Quick Core 60',
        public: true,
        locale: 'en',
        buttons: [
          {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => child.global_id, 'key' => child.key}}
        ]
      }, {user: owner, key: 'quick-core-60'})
      expect(WordData).to receive(:translate_batch).and_return({
        translations: {
          'Quick Core 60' => 'Nucleo rapido 60',
          'hat' => 'sombrero',
          'Me' => 'Yo',
          'cat' => 'gato'
        }
      })

      described_class.provision_one!(owner, source_slug: 'quick-core-60', dest_slug: 'quick-core-60-es')

      child.reload
      expect(child.settings['locale']).to eq('en')
      expect(child.buttons[0]['label']).to eq('cat')
      es = Board.find_by_path('lingolinq/quick-core-60-es')
      expect(es).to_not eq(nil)
      expect(es.global_id).not_to eq(child.global_id)
      expect(es.settings['locale']).to eq('es')
      expect(es.buttons[0]['label']).to eq('sombrero')
    end
  end
end
