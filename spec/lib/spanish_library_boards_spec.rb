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
  end
end
