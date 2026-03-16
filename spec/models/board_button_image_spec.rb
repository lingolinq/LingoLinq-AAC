require 'spec_helper'

describe BoardButtonImage, :type => :model do
  let(:u) { User.create }

  describe "images_for_board" do
    it "should return all button_images connected to a specific board" do
      i = ButtonImage.create(:user => u)
      b = Board.create(:user => u)
      bi = BoardButtonImage.create(:board_id => b.id, :button_image_id => i.id)
      expect(BoardButtonImage.images_for_board(b.id).to_a).to eq([i])
    end
  end
  
  describe "connect" do
    it "create connections for all found refs" do
      b = Board.create(:user => u)
      i = ButtonImage.create(:user => u)
      i2 = ButtonImage.create(:user => u)
      BoardButtonImage.connect(b.id, [{:id => i.global_id}, {:id => i2.id + 3}])
      expect(BoardButtonImage.count).to eq(1)
      bi = BoardButtonImage.last
      expect(bi.button_image).to eq(i)
    end
    
    it "should not track use for images even if user_id is provided" do
      b = Board.create(:user => u)
      i = ButtonImage.create(:user => u)
      expect(ButtonImage).to_not receive(:track_image_use).with({
        'label' => "hat",
        'external_id' => nil,
        'locale' => 'en',
        'user_id' => 1234
      })
      BoardButtonImage.connect(b.id, [{:id => i.global_id, :label => "hat"}], :user_id => 1234)
      Worker.process_queues      
      expect(BoardButtonImage.count).to eq(1)
      bi = BoardButtonImage.last
      expect(bi.button_image).to eq(i)
    end
  end
  
  describe "disconnect" do
    it "should delete connections for all found refs" do
      b = Board.create(:user => u)
      i = ButtonImage.create(:user => u)
      i2 = ButtonImage.create(:user => u)
      BoardButtonImage.connect(b.id, [{:id => i.global_id}, {:id => i2.global_id}])
      expect(BoardButtonImage.count).to eq(2)
      BoardButtonImage.disconnect(b.id, [{:id => i.global_id}, {:id => i2.id + 3}])
      expect(BoardButtonImage.count).to eq(1)
    end
  end
  
  describe "board.map_images" do
    it "should do nothing unless button has changed" do
      b = Board.new
      expect(b.map_images).to eq(nil)
    end
    
    it "should disconnect orphaned records and connect new buttons" do
      b = Board.create(:user => u)
      i = ButtonImage.create(:user => u)
      i2 = ButtonImage.create(:user => u)
      i3 = ButtonImage.create(:user => u)
      BoardButtonImage.create(:board_id => b.id, :button_image_id => i.id)
      expect(BoardButtonImage.count).to eq(1)
      expect(BoardButtonImage.all.map(&:button_image_id)).to eq([i.id])
      b.settings['buttons'] = [
        {'image_id' => i2.global_id},
        {'image_id' => i3.global_id}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.map_images
      # TODO: this was disabled as an optimization
      # expect(BoardButtonImage.count).to eq(2)
      # expect(BoardButtonImage.all.map(&:button_image_id).sort).to eq([i2.id, i3.id].sort)
    end
  end
end
