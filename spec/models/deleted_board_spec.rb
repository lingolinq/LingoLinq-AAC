require 'spec_helper'

describe DeletedBoard, :type => :model do
  it "should create a record whenever a board is deleted" do
    u = User.create
    b = Board.create(:user => u)
    expect(DeletedBoard.find_by_path(b.key)).to eq(nil)
    expect(DeletedBoard.find_by_path(b.global_id)).to eq(nil)
    b.destroy
    expect(DeletedBoard.find_by_path(b.key)).not_to eq(nil)
    expect(DeletedBoard.find_by_path(b.global_id)).not_to eq(nil)
  end
  
  describe "generate_defaults" do
    it "should generate default values" do
      u = User.create
      db = DeletedBoard.create(:user => u)
      expect(db.cleared).to eq(false)
    end
  end
  
  describe "board_global_id" do
    it "should return the board_id for the related board" do
      u = User.create
      b = Board.create(:user => u)
      db = DeletedBoard.create(:board_id => b.id)
      expect(db.board_global_id).to eq(b.global_id)
    end
  end
  
  describe "find_by_path" do
    it "should find by key" do
      u = User.create
      b = Board.create(:user => u)
      b.destroy
      db = DeletedBoard.find_by_path(b.key)
      expect(db).not_to eq(nil)
      expect(db.board_id).to eq(b.id)
    end
    
    it "should find by id" do
      u = User.create
      b = Board.create(:user => u)
      b.destroy
      db = DeletedBoard.find_by_path(b.global_id)
      expect(db).not_to eq(nil)
      expect(db.board_id).to eq(b.id)
    end
    
    it "should find the newest result when finding by key in case of duplicates" do
      u = User.create
      b = Board.create(:user => u)
      b.destroy
      b2 = Board.create(:user => u, :key => b.key)
      b2.destroy
      db = DeletedBoard.find_by_path(b.key)
      expect(db).not_to eq(nil)
      expect(db.board_id).to eq(b2.id)
    end
  end
  
  describe "process" do
    it "should pull basic information from the board before deleting" do
      u = User.create
      b = Board.create(:user => u)
      db = DeletedBoard.process(b)
      expect(db).not_to eq(nil)
      expect(db.key).to eq(b.key)
      expect(db.board_id).to eq(b.id)
      expect(db.cleared).to eq(false)
      expect(db.settings['stats']).to eq(b.settings['stats'])
      expect(db.id).not_to eq(nil)
    end
  end
  
  describe "flush_old_records" do
    it "should delete old entries" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      db = DeletedBoard.process(b)
      DeletedBoard.where(:id => db.id).update_all(:created_at => 60.months.ago)
      db = DeletedBoard.process(b2)
      expect(Flusher).to receive(:flush_board_by_db_id).with(b.id, b.key)
      expect(Flusher).not_to receive(:flush_board_by_db_id).with(b2.id, b2.key)
      DeletedBoard.flush_old_records
    end
    
    it "should return the number of records deleted" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      db = DeletedBoard.process(b)
      DeletedBoard.where(:id => db.id).update_all(:created_at => 60.months.ago)
      db = DeletedBoard.process(b2)
      expect(Flusher).to receive(:flush_board_by_db_id).with(b.id, b.key)
      expect(Flusher).not_to receive(:flush_board_by_db_id).with(b2.id, b2.key)
      res = DeletedBoard.flush_old_records
      expect(res).to eq(1)
    end
  end
  
  describe "restore!" do
    it 'should restore the deleted board' do
      u = User.create
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b = Board.create(user: u)
      b = Board.find(b.id)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'hat'}
        ]
      })
      b = Board.find_by(id: b.id)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'hat'},
          {'id' => 2, 'label' => 'freedom'}
        ]
      })
      b = Board.find_by(id: b.id)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'hat'},
          {'id' => 2, 'label' => 'freedom'},
          {'id' => 3, 'label' => 'polygon'}
        ]
      })
      key = b.key
      expect(Board.find_by(id: b.id)).to_not eq(nil)
      b.destroy
      expect(Board.find_by(id: b.id)).to eq(nil)
      db = DeletedBoard.find_by(board_id: b.id)
      expect(DeletedBoard.find_by(key: key)).to eq(db)
      res = db.restore!
      expect(res).to eq(b)
      expect(Board.find_by_path(key)).to_not eq(nil)
      expect(Board.find_by(id: b.id)).to_not eq(nil)
      
      b = Board.find_by_path(key)
      expect(b.settings['buttons'].map { |btn| btn.slice('id', 'label') }).to eq([
          {'id' => 1, 'label' => 'hat'},
          {'id' => 2, 'label' => 'freedom'},
          {'id' => 3, 'label' => 'polygon'}
      ])
    end

    it "should restore correctly if the board has board_content and content_overrides" do
      u = User.create
      PaperTrail.request.whodunnit = "admin:somebody@example.com"
      b = Board.create(user: u)
      b = Board.find(b.id)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'hat'}
        ]
      })
      b = Board.find_by(id: b.id)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'hat'},
          {'id' => 2, 'label' => 'freedom'}
        ]
      })
      b = Board.find_by(id: b.id)
      b.process({
        'buttons' => [
          {'id' => 1, 'label' => 'hat'},
          {'id' => 2, 'label' => 'freedom'},
          {'id' => 3, 'label' => 'polygon'}
        ]
      })
      BoardContent.generate_from(b)
      key = b.key
      expect(Board.find_by(id: b.id)).to_not eq(nil)
      b.destroy
      expect(Board.find_by(id: b.id)).to eq(nil)
      db = DeletedBoard.find_by(board_id: b.id)
      expect(DeletedBoard.find_by(key: key)).to eq(db)
      res = db.restore!
      expect(res).to eq(b)
      expect(Board.find_by_path(key)).to_not eq(nil)
      expect(Board.find_by(id: b.id)).to_not eq(nil)
      
      b = Board.find_by_path(key)
      expect(b.settings['buttons']).to eq([])
      expect(b.buttons.map { |btn| btn.slice('id', 'label') }).to eq([
          {'id' => 1, 'label' => 'hat'},
          {'id' => 2, 'label' => 'freedom'},
          {'id' => 3, 'label' => 'polygon'}
      ])
    end
  end
end
