require 'spec_helper'

describe BoardButtonSound, :type => :model do
  let(:u) { User.create }
  describe "sounds_for_board" do
    it "should return all button_sounds connected to a specific board" do
      b = Board.create(:user => u)
      i = ButtonSound.create(:user => u)
      bi = BoardButtonSound.create(:board_id => b.id, :button_sound_id => i.id)
      expect(BoardButtonSound.sounds_for_board(b.id).to_a).to eq([i])
    end
  end

  describe "connect" do
    it "create connections for all found refs" do
      b = Board.create(:user => u)
      s = ButtonSound.create(:user => u)
      s2 = ButtonSound.create(:user => u)
      BoardButtonSound.connect(b.id, [{:id => s.global_id}, {:id => s2.id + 3}])
      expect(BoardButtonSound.count).to eq(1)
      bs = BoardButtonSound.last
      expect(bs.button_sound).to eq(s)
    end
  end
  
  describe "disconnect" do
    it "should delete connections for all found refs" do
      b = Board.create(:user => u)
      s = ButtonSound.create(:user => u)
      s2 = ButtonSound.create(:user => u)
      BoardButtonSound.connect(b.id, [{:id => s.global_id}, {:id => s2.global_id}])
      expect(BoardButtonSound.count).to eq(2)
      BoardButtonSound.disconnect(b.id, [{:id => s.global_id}, {:id => s2.id + 3}])
      expect(BoardButtonSound.count).to eq(1)
    end
  end
  
  describe "board.map_images" do
    it "should do nothing unless button has changed" do
      b = Board.new
      expect(b.map_images).to eq(nil)
    end
    
    it "should disconnect orphaned records and connect new buttons" do
      b = Board.create(:user => u)
      s = ButtonSound.create(:user => u)
      s2 = ButtonSound.create(:user => u)
      s3 = ButtonSound.create(:user => u)
      BoardButtonSound.create(:board_id => b.id, :button_sound_id => s.id)
      expect(BoardButtonSound.count).to eq(1)
      expect(BoardButtonSound.all.map(&:button_sound_id)).to eq([s.id])
      b.settings['buttons'] = [
        {'sound_id' => s2.global_id},
        {'sound_id' => s3.global_id}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.map_images
      expect(BoardButtonSound.count).to eq(2)
      expect(BoardButtonSound.all.map(&:button_sound_id).sort).to eq([s2.id, s3.id].sort)
    end
  end
end

