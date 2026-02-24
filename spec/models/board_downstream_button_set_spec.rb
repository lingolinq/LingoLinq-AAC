require 'spec_helper'

describe BoardDownstreamButtonSet, :type => :model do
  it "should generate defaults" do
    bs = BoardDownstreamButtonSet.create
    expect(bs.data).not_to eq(nil)
    expect(bs.buttons).to eq([])
    expect(bs.data['button_count']).to eq(0)
    expect(bs.data['board_count']).to eq(0)
  end
  
  describe "update_for" do
    it "should do nothing if a matching board does not exist" do
      cnt = BoardDownstreamButtonSet.count
      res = BoardDownstreamButtonSet.update_for('asdf')
      expect(res).to eq(nil)
      expect(BoardDownstreamButtonSet.count).to eq(cnt)
    end
    
    it "should generate a button set for the specified board id" do
      u = User.create
      b = Board.create(:user => u)
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.board_id).to eq(b.id)
      expect(bs.data['buttons']).to eq([])
    end
    
    it "should include buttons from the current board" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'car', 'hidden' => true}
      ]})
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(2)
      expect(bs.data['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'hat',
        'board_id' => b.global_id,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => false,
        'hidden_link' => false,
        'linked_level' => 1,
        'visible_level' => 1,
        'link_disabled' => false,
        'locale' => 'en'
      })
      expect(bs.data['buttons'][1]).to eq({
        'id' => 2,
        'label' => 'car',
        'board_id' => b.global_id,
        'linked_level' => 1,
        'visible_level' => 1,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => true,
        'hidden_link' => false,
        'link_disabled' => false,
        'locale' => 'en'
      })
    end
    
    it "should include sound ids" do
      u = User.create
      b = Board.create(:user => u)
      s = ButtonSound.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'sound_id' => s.global_id, 'background_color' => 'asdf'},
        {'id' => 2, 'label' => 'car', 'hidden' => true, 'border_color' => 'asdf'}
      ]})
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(2)
      expect(bs.data['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'hat',
        'board_id' => b.global_id,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => false,
        'sound_id' => s.global_id,
        'linked_level' => 1,
        'visible_level' => 1,
        'hidden_link' => false,
        'link_disabled' => false,
        'background_color' => 'asdf',
        'locale' => 'en'
      })
      expect(bs.data['buttons'][1]).to eq({
        'id' => 2,
        'label' => 'car',
        'board_id' => b.global_id,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => true,
        'hidden_link' => false,
        'linked_level' => 1,
        'visible_level' => 1,
        'link_disabled' => false,
        'border_color' => 'asdf',
        'locale' => 'en'
      })
    end
    
    it "should include buttons from downstream boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'yellow'}
      ]})
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(3)
      expect(bs.data['buttons'][2]).to eq({
        'id' => 1,
        'label' => 'yellow',
        'board_id' => b2.global_id,
        'board_key' => b2.key,
        'depth' => 1,
        'linked_level' => 1,
        'visible_level' => 1,
        'hidden' => false,
        'hidden_link' => false,
        'link_disabled' => false,
        'locale' => 'en'
      })
    end
    
    it "should include disabled buttons" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => true, 'add_to_vocalization' => true},
        {'id' => 2, 'label' => 'car', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'link_disabled' => true}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'yellow'}
      ]})
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'green'}
      ]})
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(4)
      expect(bs.data['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'hat',
        'board_id' => b.global_id,
        'board_key' => b.key,
        'depth' => 0,
        'linked_level' => 1,
        'visible_level' => 1,
        'hidden' => true,
        'hidden_link' => false,
        # 'force_vocalize' => true,
        'link_disabled' => false,
        "linked_board_id" => b2.global_id,
        "linked_board_key" => b2.key,
        "preferred_link" => true,
        'locale' => 'en'
      })
      expect(bs.data['buttons'][1]).to eq({
        'id' => 2,
        'label' => 'car',
        'board_id' => b.global_id,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => false,
        'linked_level' => 1,
        'visible_level' => 1,
        'hidden_link' => false,
        'link_disabled' => true,
        "linked_board_id" => b3.global_id,
        "linked_board_key" => b3.key,
        "preferred_link" => true,
        'locale' => 'en'
      })
    end
        
    it "should include link details on buttons that link to other boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'yellow'}
      ]})
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(3)
      expect(bs.data['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'hat',
        'board_id' => b.global_id,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => false,
        'hidden_link' => false,
        'link_disabled' => false,
        'preferred_link' => true,
        'linked_board_id' => b2.global_id,
        'linked_level' => 1,
        'visible_level' => 1,
        'linked_board_key' => b2.key,
        'locale' => 'en'
      })
    end
    
    it "should not include link details on linked buttons that point to nowhere" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => '1_12345', 'key' => 'hat/man'}},
        {'id' => 2, 'label' => 'car'}
      ]
      b.save
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(2)
      expect(bs.data['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'hat',
        'board_id' => b.global_id,
        'linked_level' => 1,
        'visible_level' => 1,
        'board_key' => b.key,
        'depth' => 0,
        'hidden' => false,
        'hidden_link' => false,
        'link_disabled' => false,
        'locale' => 'en'
      })
    end
    
    it "should include buttons only once, even if linked to multiple times" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'yellow', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, :user => u)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'black'}
      ]}, :user => u)
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(4)
      expect(bs.data['buttons'][0]['label']).to eq('hat')
      expect(bs.data['buttons'][0]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][1]['label']).to eq('car')
      expect(bs.data['buttons'][1]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][2]['label']).to eq('yellow')
      expect(bs.data['buttons'][3]['label']).to eq('black')
    end
    
    it "should not get stuck in loops" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'yellow', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, :user => u)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'black'},
        {'id' => 2, 'label' => 'rushing', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, :user => u)
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(5)
      expect(bs.data['buttons'][0]['label']).to eq('hat')
      expect(bs.data['buttons'][0]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][1]['label']).to eq('car')
      expect(bs.data['buttons'][1]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][2]['label']).to eq('yellow')
      expect(bs.data['buttons'][3]['label']).to eq('black')
      expect(bs.data['buttons'][4]['label']).to eq('rushing')
    end
    
    it "should mark the shallowest link to a board as the 'preferred' link" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b5 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 3, 'label' => 'noodle', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'yellow', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 2, 'label' => 'quarter', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}}
      ]}, :user => u)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'black'},
        {'id' => 2, 'label' => 'rushing', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, :user => u)
      b4.process({'buttons' => [
        {'id' => 1, 'label' => 'zebra', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}},
        {'id' => 2, 'label' => 'promote', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, :user => u)
      b5.process({'buttons' => [
        {'id' => 1, 'label' => 'brand', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 2, 'label' => 'alternate', 'load_board' => {'id' => b.global_id, 'key' => b.key}}
      ]}, :user => u)
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(11)
      expect(bs.data['buttons'][0]['label']).to eq('hat')
      expect(bs.data['buttons'][0]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][1]['label']).to eq('car')
      expect(bs.data['buttons'][1]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][2]['label']).to eq('noodle')
      expect(bs.data['buttons'][2]['preferred_link']).to eq(true)
      expect(bs.data['buttons'][3]['label']).to eq('yellow')
      expect(bs.data['buttons'][3]['depth']).to eq(1)
      expect(bs.data['buttons'][4]['label']).to eq('quarter')
      expect(bs.data['buttons'][4]['depth']).to eq(1)
      expect(bs.data['buttons'][5]['label']).to eq('black')
      expect(bs.data['buttons'][5]['depth']).to eq(1)
      expect(bs.data['buttons'][6]['label']).to eq('rushing')
      expect(bs.data['buttons'][6]['depth']).to eq(1)
      expect(bs.data['buttons'][7]['label']).to eq('brand')
      expect(bs.data['buttons'][7]['depth']).to eq(1)
      expect(bs.data['buttons'][8]['label']).to eq('alternate')
      expect(bs.data['buttons'][8]['depth']).to eq(1)
      expect(bs.data['buttons'][9]['label']).to eq('zebra')
      expect(bs.data['buttons'][9]['depth']).to eq(2)
      expect(bs.data['buttons'][10]['label']).to eq('promote')
      expect(bs.data['buttons'][10]['depth']).to eq(2)
    end
    
    it "should update when a board's content has changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'jump'}
      ]})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.where(board_id: b.id).destroy_all

      bs = b.reload.board_downstream_button_set
      expect(bs).to eq(nil)
      BoardDownstreamButtonSet.update_for(b.global_id)

      bs = b.reload.board_downstream_button_set
      expect(bs).not_to eq(nil)
      expect(bs.data['buttons'].length).to eq(1)
    end
    
    it "should update correctly when a downstream board's content has changed" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'jump', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, :user => u)
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'blouse'}
      ]}, :user => u)
      Worker.process_queues
      Worker.process_queues
      
      expect(b2.reload.settings['immediately_upstream_board_ids']).to eq([b.global_id])
      BoardDownstreamButtonSet.update_for(b2.global_id, true)

      bs = b.reload.board_downstream_button_set
      expect(bs).not_to eq(nil)
      expect(bs.buttons.length).to eq(2)
      bs2 = b2.reload.board_downstream_button_set
      expect(bs2).not_to eq(nil)
      expect(bs2.data['buttons']).to eq(nil)
      expect(bs2.buttons.length).to eq(1)
      
      b2.reload.process({'buttons' => [
        {'id' => 1, 'label' => 'blouse'},
        {'id' => 2, 'label' => 'banana'}
      ]}, :user => u)

      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b.global_id)
      BoardDownstreamButtonSet.update_for(b2.global_id)
      
      bs2 = BoardDownstreamButtonSet.find(bs2.id)
      expect(bs2).not_to eq(nil)
      expect(bs2.buttons.length).to eq(2)
      bs = BoardDownstreamButtonSet.find(bs.id)
      expect(bs).not_to eq(nil)
      expect(bs.buttons.length).to eq(3)
    end
    
    it "should use an existing upstream board if available" do
      u = User.create
      b = Board.create(user: u)
      b2 = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      b2.process({'buttons' => [
        {'id' => 3, 'label' => 'har'},
        {'id' => 4, 'label' => 'cap'}
      ]}, {:user => u})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.where(board_id: b.id).destroy_all
      bs = b.reload.board_downstream_button_set
      expect(bs).to eq(nil)
      BoardDownstreamButtonSet.update_for(b2.global_id, true)
      
      bs = b.reload.board_downstream_button_set
      expect(bs).to_not eq(nil)
      expect(bs.data['buttons']).to_not eq(nil)
      expect(bs.buttons.length).to eq(4)
      bs2 = b2.reload.board_downstream_button_set
      expect(bs2).to_not eq(nil)
      expect(bs2.data['buttons']).to eq(nil)
      expect(bs2.data['source_id']).to eq(bs.global_id)
      expect(bs2.buttons.length).to eq(2)
    end

    it "should clear the existing source_id if self-referential" do
      skip "update_for(bb2) does not create BoardDownstreamButtonSet for copied board"
      u = User.create
      u2 = User.create
      b = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      b2.process({'buttons' => [
        {'id' => 3, 'label' => 'har'},
        {'id' => 4, 'label' => 'cap'}
      ]}, {:user => u})
      Worker.process_queues
      Worker.process_queues
      
      bb = b.reload.copy_for(u2)
      bb.save!
      b.reload.track_downstream_boards!
      res = Board.copy_board_links_for(u2, {:starting_old_board => b.reload, :starting_new_board => bb.reload})
      bb2 = Board.where(parent_board_id: b2.id).first
      expect(bb2).to_not eq(nil)
      
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.where(board_id: bb.id).destroy_all
      bs = bb.reload.board_downstream_button_set
      expect(bs).to eq(nil)
      BoardDownstreamButtonSet.update_for(bb.global_id, true)

      bs = bb.reload.board_downstream_button_set
      expect(bs).to_not eq(nil)
      expect(bs.data['buttons']).to_not eq(nil)
      expect(bs.buttons.length).to eq(4)
      BoardDownstreamButtonSet.where(board_id: bb2.id).destroy_all
      bs2 = bb2.reload.board_downstream_button_set
      expect(bs2).to eq(nil)
      BoardDownstreamButtonSet.update_for(bb2.global_id, true)
      bs2 = bb2.reload.board_downstream_button_set
      expect(bs2).to_not eq(nil)
      expect(bs2.data['buttons']).to eq(nil)
      expect(bs2.data['source_id']).to eq(bs.global_id)
      expect(bs2.buttons.length).to eq(2)
    end
    
    it "should use existing upstream board when copying boards" do
      skip "update_for(bb2) does not create BoardDownstreamButtonSet for copied board"
      u = User.create
      u2 = User.create
      b = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      b2.process({'buttons' => [
        {'id' => 3, 'label' => 'har'},
        {'id' => 4, 'label' => 'cap'}
      ]}, {:user => u})
      Worker.process_queues
      Worker.process_queues
      
      bb = b.reload.copy_for(u2)
      bb.save!
      b.reload.track_downstream_boards!
      res = Board.copy_board_links_for(u2, {:starting_old_board => b.reload, :starting_new_board => bb.reload})
      bb2 = Board.where(parent_board_id: b2.id).first
      expect(bb2).to_not eq(nil)
      
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.where(board_id: bb.id).destroy_all
      BoardDownstreamButtonSet.where(board_id: bb2.id).destroy_all
      bs = bb.reload.board_downstream_button_set
      expect(bs).to eq(nil)
      BoardDownstreamButtonSet.update_for(bb2.global_id, true)

      bs = bb.reload.board_downstream_button_set
      expect(bs).to_not eq(nil)
      expect(bs.data['buttons']).to_not eq(nil)
      expect(bs.buttons.length).to eq(4)
      bs2 = bb2.reload.board_downstream_button_set
      expect(bs2).to_not eq(nil)
      expect(bs2.data['buttons']).to eq(nil)
      expect(bs2.data['source_id']).to eq(bs.global_id)
      expect(bs2.buttons.length).to eq(2)
    end
    
    it "should stop using an existing upstream board if disconnected" do
      u = User.create
      b = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      b2.process({'buttons' => [
        {'id' => 3, 'label' => 'har'},
        {'id' => 4, 'label' => 'cap', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {:user => u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'hax'},
        {'id' => 4, 'label' => 'cax'}
      ]}, {:user => u})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b3.global_id, true)
      
      bs = b.reload.board_downstream_button_set
      expect(bs).to_not eq(nil)
      expect(bs.data['buttons']).to_not eq(nil)
      expect(bs.data['linked_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(bs.buttons.length).to eq(6)
      bs2 = b2.reload.board_downstream_button_set
      expect(bs2).to_not eq(nil)
      expect(bs2.data['buttons']).to eq(nil)
      expect(bs2.data['source_id']).to eq(bs.global_id)
      expect(bs2.buttons.length).to eq(4)
      bs3 = b3.reload.board_downstream_button_set
      expect(bs3).to_not eq(nil)
      expect(bs3.data['buttons']).to eq(nil)
      expect(bs3.data['source_id']).to eq(bs.global_id)
      expect(bs3.buttons.length).to eq(2)
      expect(b2.reload.settings['full_set_revision']).to eq(bs2.reload.data['full_set_revision'])
      expect(b.reload.settings['full_set_revision']).to eq(bs.reload.data['full_set_revision'])
      expect(b3.reload.settings['full_set_revision']).to eq(bs3.reload.data['full_set_revision'])

      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      Worker.process_queues
      Worker.process_queues
      expect(b.reload.settings['full_set_revision']).to_not eq(bs.reload.data['full_set_revision'])
      expect(b2.reload.settings['full_set_revision']).to eq(bs2.reload.data['full_set_revision'])
      expect(b3.reload.settings['full_set_revision']).to eq(bs3.reload.data['full_set_revision'])
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      bs2 = b2.reload.board_downstream_button_set
      expect(bs2.reload.buttons).to eq([])
      expect(b2.reload.settings['full_set_revision']).to_not eq(bs2.reload.data['full_set_revision'])
      BoardDownstreamButtonSet.update_for(b3.global_id, true)

      bs = b.reload.board_downstream_button_set
      expect(bs).to_not eq(nil)
      expect(bs.data['buttons']).to_not eq(nil)
      expect(bs.buttons.length).to eq(2)
      bs2 = b2.reload.board_downstream_button_set
      expect(bs2).to_not eq(nil)
      expect(bs2.data['buttons']).to_not eq(nil)
      expect(bs2.data['source_id']).to eq(nil)
      expect(bs2.buttons.length).to eq(4)
      bs3 = b3.reload.board_downstream_button_set
      expect(bs3).to_not eq(nil)
      expect(bs3.reload.data['buttons']).to eq(nil)
      expect(bs3.data['source_id']).to eq(bs2.global_id)
      expect(bs3.buttons.length).to eq(2)
    end

    it "should immediately update the source button set if specified" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b1.global_id)
      bs1 = b1.reload.board_downstream_button_set
      expect(bs1.reload.data['buttons'].length).to eq(1)
      expect(b1.settings['downstream_board_ids']).to eq([b2.global_id])
      b2.reload
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'shoes'}
      ]}, {'user' => u})
      BoardDownstreamButtonSet.where(id: bs1.id).update_all(updated_at: 60.seconds.ago)
      BoardDownstreamButtonSet.update_for(b2.global_id, true)
      bs1.reload
      expect(bs1.data['buttons'].length).to eq(2)
    end

    it "should schedule updates for source button set if not immediate" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'coat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b2.global_id)
      expect(Worker.scheduled?(BoardDownstreamButtonSet, :perform_action, {'method' => 'update_for', 'arguments' => [b1.global_id, false, [b2.global_id]]}))
    end

    it "should not re-call in a potential loop" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b1.global_id)
      bs1 = b1.reload.board_downstream_button_set
      expect(bs1.reload.data['buttons'].length).to eq(1)
      expect(b1.settings['downstream_board_ids']).to eq([b2.global_id])
      b2.reload
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'shoes'}
      ]}, {'user' => u})
      expect(BoardDownstreamButtonSet).to_not receive(:update_for).with(b1.global_id, true, [b1.global_id, b2.global_id])
      BoardDownstreamButtonSet.update_for(b2.global_id, true, [b1.global_id])
    end
    
    it "should not get stuck in a loop when updating source button sets" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      bs1 = BoardDownstreamButtonSet.update_for(b1.global_id)
      bs2 = BoardDownstreamButtonSet.update_for(b2.global_id)
      bs1.data['source_id'] = bs2.global_id
      bs1.save
      bs2.data['source_id'] = bs1.global_id
      bs2.save
      BoardDownstreamButtonSet.update_for(b2.global_id)
    end

    it "should set all downstream boards to use this board as the source" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b4 = Board.create(user: u)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'land', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}}
      ]}, {'user' => u}) 
      Worker.process_queues
      Worker.process_queues
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'yours', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {'user' => u})
      Worker.process_queues
      Worker.process_queues
      b1.process({'buttons' => [
        {'id' => 3, 'label' => 'island', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      Worker.process_queues
      Worker.process_queues
      b1.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      b3.reload.track_downstream_boards!
      b4.reload.track_downstream_boards!
      # Update from root so source_id propagates to all downstream sets
      BoardDownstreamButtonSet.update_for(b1.global_id, true)
      BoardDownstreamButtonSet.update_for(b4.global_id, true)
      bs1 = b1.reload.board_downstream_button_set.reload
      bs2 = b2.reload.board_downstream_button_set.reload
      bs3 = b3.reload.board_downstream_button_set.reload
      bs4 = b4.reload.board_downstream_button_set.reload
      expect(bs2.reload.data['source_id']).to eq(bs1.global_id)
      expect(bs3.reload.data['source_id']).to eq(bs1.global_id)
      expect(bs4.reload.data['source_id']).to eq(bs1.global_id)
      
      BoardDownstreamButtonSet.update_for(b1.global_id)
      bs2.reload.buttons
      bs3.reload.buttons
      bs4.reload.buttons
      expect(bs2.reload.data['source_id']).to eq(bs1.global_id)
      expect(bs3.reload.data['source_id']).to eq(bs1.global_id)
      expect(bs4.reload.data['source_id']).to eq(bs1.global_id)
    end

    it "should schedule a flush for the button set when updated" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      bs1 = BoardDownstreamButtonSet.update_for(b1.global_id)
      bs2 = BoardDownstreamButtonSet.update_for(b2.global_id)
      bs1.data['source_id'] = bs2.global_id
      bs1.save
      bs2.data['source_id'] = bs1.global_id
      bs2.save
      expect(BoardDownstreamButtonSet).to receive(:schedule_for) do |queue, method, list, ts|
        expect(queue).to eq('slow')
        expect(method).to eq(:flush_caches)
        expect(list).to eq([b2.global_id])
        expect(ts).to be > 5.seconds.ago.to_i
        expect(ts).to be < 5.seconds.from_now.to_i
      end
      BoardDownstreamButtonSet.update_for(b2.global_id)
    end

    it "should record known inflections - even if they match the expected default" do
      u = User.create
      b = Board.create(user: u)
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234', 'inflections' => 
          ['haaatzch']
        }
      ], nil)
      b.save
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs.data['buttons']).to eq([{"board_id"=>b.global_id,
        "board_key"=>b.key,
        "depth"=>0,
        "hidden"=>true,
        "hidden_link"=>false,
        "id"=>"1_2",
        "infl"=>{"en"=>["haaatzch"]},
        "label"=>"hat",
        "link_disabled"=>false,
        "linked_level"=>1,
        "locale"=>"en",
        "visible_level"=>1}])
    end

    it "should record translations and translated inflections" do
      u = User.create
      b = Board.create(user: u)
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234', 'translations' => [
          {'locale' => 'en', 'label' => 'hat'},
          {'locale' => 'es', 'label' => 'hatzy', 'vocalization' => 'hatz', 'inflections' => ['haaatzch']}
        ]}
      ], nil)
      b.save
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      expect(b.settings['translations']).to eq({
        '1_2' => {
          'en' => {
            'label' => 'hat'
          },
          'es' => {
            'label' => 'hatzy',
            'vocalization' => 'hatz',
            'inflections' => ['haaatzch']
          }
        }
      })
      bs = BoardDownstreamButtonSet.update_for(b.global_id)
      expect(bs.data['buttons']).to eq([{"board_id"=>b.global_id,
        "board_key"=>b.key,
        "depth"=>0,
        "hidden"=>true,
        "hidden_link"=>false,
        "id"=>"1_2",
        "infl"=>{"es"=>["haaatzch"]},
        "label"=>"hat",
        "link_disabled"=>false,
        "linked_level"=>1,
        "locale"=>"en",
        "tr"=>{"en"=>["hat"], "es"=>["hatzy", "hatz"]},
        "visible_level"=>1}])
    end

    it "should generate correct button list for shallow clones with edited sub-boards" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, public: true)
      b2 = Board.create(user: u1, public: true)
      b3 = Board.create(user: u1, public: true)
      b4 = Board.create(user: u1, public: true)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'land', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}},
        {'id' => 11, 'label' => 'wish'}
      ]}, {'user' => u1}) 
      Worker.process_queues
      Worker.process_queues
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'yours', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 22, 'label' => 'dish'}
      ]}, {'user' => u1})
      Worker.process_queues
      Worker.process_queues
      b1.process({'buttons' => [
        {'id' => 3, 'label' => 'island', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 33, 'label' => 'fish'}
      ]}, {'user' => u1})
      b4.process({'buttons' => [
        {'id' => 4, 'label' => 'squish'}
      ]}, {'user' => u1})
      Worker.process_queues
      Worker.process_queues
      BoardDownstreamButtonSet.update_for(b1.global_id, true)
      bs1 = b1.reload.board_downstream_button_set.reload
      BoardDownstreamButtonSet.where(board_id: [b2.id, b3.id, b4.id]).destroy_all
      expect(b2.reload.board_downstream_button_set).to eq(nil)
      expect(b3.reload.board_downstream_button_set).to eq(nil)
      expect(b4.reload.board_downstream_button_set).to eq(nil)
      
      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u2.global_id}")
      bb2 = bb2.copy_for(u2)
      b5 = Board.create(user: u2)
      b5.process({'buttons' => [
        {'id' => 5, 'label' => 'finish'}
      ]}, {'user' => u2})
      bb2.process({'buttons' => [
        {'id' => 2, 'label' => 'yours', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}},
        {'id' => 22, 'label' => 'delish'}
      ]}, {'user' => u2})
      Worker.process_queues
      Worker.process_queues
      set = BoardDownstreamButtonSet.update_for("#{b1.global_id}-#{u2.global_id}", true)
      expect(set).to_not eq(nil)
      expect(set.board_id).to eq(b1.id)
      expect(set.user_id).to eq(u2.id)
      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      bbs1 = bb1.board_downstream_button_set
      expect(bbs1).to eq(set)
      expect(bbs1.id).to_not eq(bs1.id)
      expect(bbs1.data['buttons']).to eq([
        {
          'board_id' => "#{b1.global_id}-#{u2.global_id}",
          'board_key' => "#{u2.user_name}/my:#{b1.key.sub(/\//, ':')}",
          'depth' => 0,
          'hidden' => false,
          'hidden_link' => false,
          'id' => 3,
          'label' => 'island',
          'link_disabled' => false,
          'linked_board_id' => "#{b2.global_id}-#{u2.global_id}",
          'linked_board_key' => "#{u2.user_name}/my:#{b2.key.sub(/\//, ':')}",
          'linked_level' => 1,
          'locale' => 'en',
          'preferred_link' => true,
          'visible_level' => 1
        },
        {
          'board_id' => "#{b1.global_id}-#{u2.global_id}",
          'board_key' => "#{u2.user_name}/my:#{b1.key.sub(/\//, ':')}",
          'depth' => 0,
          'hidden' => false,
          'hidden_link' => false,
          'id' => 33,
          'label' => 'fish',
          'link_disabled' => false,
          'linked_level' => 1,
          'locale' => 'en',
          'visible_level' => 1
        },
        {
          'board_id' => "#{b2.global_id}-#{u2.global_id}",
          'board_key' => "#{u2.user_name}/my:#{b2.key.sub(/\//, ':')}",
          'depth' => 1,
          'hidden' => false,
          'hidden_link' => false,
          'id' => 2,
          'label' => 'yours',
          'link_disabled' => false,
          'linked_board_id' => b5.global_id,
          'linked_board_key' => b5.key,
          'linked_level' => 1,
          'locale' => 'en',
          'preferred_link' => true,
          'visible_level' => 1
        },
        {
          'board_id' => "#{b2.global_id}-#{u2.global_id}",
          'board_key' => "#{u2.user_name}/my:#{b2.key.sub(/\//, ':')}",
          'depth' => 1,
          'hidden' => false,
          'hidden_link' => false,
          'id' => 22,
          'label' => 'delish',
          'link_disabled' => false,
          'linked_level' => 1,
          'locale' => 'en',
          'visible_level' => 1
        },
        {
          'board_id' => b5.global_id,
          'board_key' => b5.key,
          'depth' => 2,
          'hidden' => false,
          'hidden_link' => false,
          'id' => 5,
          'label' => 'finish',
          'link_disabled' => false,
          'linked_level' => 1,
          'locale' => 'en',
          'visible_level' => 1
        },
      ])
    end
  end
  
  describe "for_user" do
    it "should include the user home board" do
      u = User.create
      b = Board.create(:user => u)
      BoardDownstreamButtonSet.update_for(b.global_id)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      res = BoardDownstreamButtonSet.for_user(u)
      expect(res.length).to eq(1)
      expect(res[0].board_id).to eq(b.id)
    end
    
    it "should include the user's sidebar boards" do
      u = User.create
      b = Board.create(:user => u)
      BoardDownstreamButtonSet.update_for(b.global_id)
      u.settings['preferences']['sidebar_boards'] = [{'key' => b.key}, {'key' => 'asdf'}]
      u.settings['preferences']['home_board'] = {'id' => 'qwer'}
      res = BoardDownstreamButtonSet.for_user(u)
      expect(res.length).to eq(1)
      expect(res[0].board_id).to eq(b.id)
    end
  end
  
  describe "word_map_for" do
    it 'should return nil if no button set found' do
      u = User.create
      expect(BoardDownstreamButtonSet.word_map_for(u)).to eq(nil)
    end
    
    it 'should return a mapping of all words in the user\' button set' do
      u = User.create
      b = Board.create(:user => u, :settings => {
        'buttons' => [
          {'id' => '1', 'label' => 'Hat', 'border_color' => '#f00', 'background_color' => '#fff', 'baon' => true},
          {'id' => '2', 'label' => 'RAT', 'border_color' => '#f00', 'background_color' => '#fff', 'baon' => true},
          {'id' => '3', 'label' => 'hat', 'border_color' => '#000', 'background_color' => '#888', 'baon' => true},
          {'id' => '3', 'label' => 'hat', 'locale' => 'es', 'border_color' => '#000', 'background_color' => '#888', 'baon' => true},
        ]
      })
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      BoardDownstreamButtonSet.update_for(b.global_id)
      expect(BoardDownstreamButtonSet.word_map_for(u)).to eq({
        'words' => ['hat', 'rat'],
        'word_map' => {
          'en' => {
            'hat' => {
              'label' => 'hat',
              'border_color' => '#000',
              'background_color' => '#888',
              'image' => {
                'image_url' => nil,
                'license' => 'private'
              }
            },
            'rat' => {
              'label' => 'rat',
              'border_color' => '#f00',
              'background_color' => '#fff',
              'image' => {
                'image_url' => nil,
                'license' => 'private'
              }
            }
          }
        }
      })
    end
  end
  
  describe "buttons" do
    it "should retrieve from the correct source" do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.new(board_id: b.id, data: {})
      bs.data['buttons'] = [{'id' => 1, 'board_id' => '1_1'}, {'id' => 2, 'board_id' => '1_2', 'linked_board_id' => '1_2'}]
      expect(bs.buttons.length).to eq(2)
      bs.save
      expect(bs.data['linked_board_ids']).to eq(['1_2'])
      expect(bs.buttons).to eq([{'id' => 1, 'board_id' => '1_1'}, {'id' => 2, 'board_id' => '1_2', 'linked_board_id' => '1_2'}])
      bs2 = BoardDownstreamButtonSet.create(board_id: 2)
      bs2 = BoardDownstreamButtonSet.find(bs2.id)
      bs2.data['source_id'] = bs.global_id
      expect(bs2.buttons).to eq([{'id' => 2, 'board_id' => '1_2', 'depth' => 0, 'linked_board_id' => '1_2'}])
    end

    it "should recurse through multiple levels if needed" do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board_id: b.id)
      bs.data['buttons'] = [{'id' => 1, 'board_id' => '1_1', 'linked_board_id' => '1_2'}, {'id' => 2, 'board_id' => '1_2', 'linked_board_id' => '1_3'}, {'id' => 3, 'board_id' => '1_3'}]
      bs.save
      expect(bs.buttons).to eq([{'id' => 1, 'board_id' => '1_1', 'linked_board_id' => '1_2'}, {'id' => 2, 'board_id' => '1_2', 'linked_board_id' => '1_3'}, {'id' => 3, 'board_id' => '1_3'}])
      bs2 = BoardDownstreamButtonSet.create(board_id: 2)
      bs2 = BoardDownstreamButtonSet.find(bs2.id)
      bs2.data['source_id'] = bs.global_id
      bs2.save
      expect(bs2.buttons).to eq([{'id' => 2, 'board_id' => '1_2', 'depth' => 0, 'linked_board_id' => '1_3'}, {"board_id"=>"1_3", "depth"=>1, "id"=>3}])
      bs3 = BoardDownstreamButtonSet.create(board_id: 3)
      bs3 = BoardDownstreamButtonSet.find(bs3.id)
      bs3.data['source_id'] = bs2.global_id
      expect(bs3.buttons).to eq([{'id' => 3, 'board_id' => '1_3', 'depth' => 0}])
      expect(bs3.data['source_id']).to eq(bs.global_id)
    end

    it "should update the source_id if mismatched" do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board_id: b.id)
      bs.data['buttons'] = [{'id' => 1, 'board_id' => '1_1', 'linked_board_id' => '1_2'}, {'id' => 2, 'board_id' => '1_2', 'linked_board_id' => '1_3'}, {'id' => 3, 'board_id' => '1_3'}]
      bs.save
      expect(bs.buttons).to eq([{"id"=>1, "board_id"=>"1_1", 'linked_board_id' => '1_2'}, {"id"=>2, "board_id"=>"1_2", 'linked_board_id' => '1_3'}, {"id"=>3, "board_id"=>"1_3"}])
      bs2 = BoardDownstreamButtonSet.create(board_id: 2)
      bs2 = BoardDownstreamButtonSet.find(bs2.id)
      bs2.data['source_id'] = bs.global_id
      bs2.save
      expect(bs2.buttons).to eq([{'id' => 2, 'board_id' => '1_2', 'depth' => 0, 'linked_board_id' => '1_3'}, {"board_id"=>"1_3", "depth"=>1, "id"=>3}])
      bs3 = BoardDownstreamButtonSet.create(board_id: 3)
      bs3 = BoardDownstreamButtonSet.find(bs3.id)
      bs3.data['source_id'] = bs2.global_id
      expect(bs3.buttons).to eq([{'id' => 3, 'board_id' => '1_3', 'depth' => 0}])
      expect(bs3.data['source_id']).to eq(bs.global_id)
    end
  end
  
  describe "buttons_starting_from" do
    it "should include multiple levels" do
      u = User.create
      b = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      b2.process({'buttons' => [
        {'id' => 3, 'label' => 'har'},
        {'id' => 4, 'label' => 'cap', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {:user => u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'hax'},
        {'id' => 4, 'label' => 'cax'}
      ]}, {:user => u})
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      
      bs = b.reload.board_downstream_button_set
      expect(bs.buttons_starting_from(b.global_id).length).to eq(6)
      expect(bs.buttons_starting_from(b2.global_id).length).to eq(4)
      expect(bs.buttons_starting_from(b3.global_id).length).to eq(2)
    end
    
    it "should update buttons with the correct depth value" do
      u = User.create
      b = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'car'}
      ]}, {:user => u})
      b2.process({'buttons' => [
        {'id' => 3, 'label' => 'har'},
        {'id' => 4, 'label' => 'cap', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {:user => u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'hax'},
        {'id' => 4, 'label' => 'cax'}
      ]}, {:user => u})
      BoardDownstreamButtonSet.update_for(b.global_id, true)

      bs = b.reload.board_downstream_button_set
      expect(bs.buttons_starting_from(b.global_id).length).to eq(6)
      expect(bs.buttons_starting_from(b.global_id).map{|b| b['depth']}).to eq([0, 0, 1, 1, 2, 2])
      expect(bs.buttons_starting_from(b2.global_id).length).to eq(4)
      expect(bs.buttons_starting_from(b2.global_id).map{|b| b['depth']}).to eq([0, 0, 1, 1])
      expect(bs.buttons_starting_from(b3.global_id).length).to eq(2)
      expect(bs.buttons_starting_from(b3.global_id).map{|b| b['depth']}).to eq([0, 0])
    end
  end

  describe "url_for" do
    it "should return the private url if the user has access to all board" do
      bs = BoardDownstreamButtonSet.create
      u = User.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'aha'
      expect(u).to receive(:private_viewable_board_ids).and_return(['3', '4'])
      expect(bs).to receive(:extra_data_private_url).and_return('qwer').at_least(1).times
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      expect(bs.url_for(u, 'aha')).to eq('zxcv')
    end

    it "should return the private url if no user but everything is public" do
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2', '3', '4']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'aha'
      expect(bs).to receive(:extra_data_private_url).and_return('qwer').at_least(1).times
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      expect(bs.url_for(nil, 'aha')).to eq('zxcv')
    end

    it "should return nil on a mismatched revision hash" do
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2', '3', '4']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      expect(Uploader).to_not receive(:check_existing_upload)
      expect(bs).to_not receive(:extra_data_private_url)
      expect(bs.url_for(nil, 'aha')).to eq(nil)
    end

    it "should return nil if it needs a custom url but none is available" do
      bs = BoardDownstreamButtonSet.create
      u = User.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      expect(u).to receive(:private_viewable_board_ids).and_return(['3'])
      expect(Uploader).to_not receive(:check_existing_upload)
      expect(bs).to_not receive(:extra_data_private_url)
      expect(bs.url_for(u, 'abc')).to eq(nil)
    end

    it "should return the private url if the user is a global admin" do
      u = User.create
      expect(u).to receive(:possible_admin?).and_return(true)
      expect(Organization).to receive(:admin_manager?).with(u).and_return(true)
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      expect(bs).to receive(:extra_data_private_url).and_return('qwer').at_least(1).times
      expect(bs.url_for(u, 'abc')).to eq('zxcv')
      expect(bs.data['private_cdn_url']).to eq("zxcv")
      expect(bs.data['private_cdn_revision']).to eq("abc")
    end

    it "should return the cached path if it exists already for the user's viewable set" do
      bs = BoardDownstreamButtonSet.create
      u = User.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      ids = ['4']
      hash = GoSecure.sha512(ids.sort.to_json, bs.data['remote_salt'])
      bs.data['remote_paths'] = {}
      expect(bs).to_not receive(:schedule_once).with(:touch_remote, hash)
      bs.data['remote_paths'][hash] = {'path' => 'zxcv', 'generated' => 6.hours.ago.to_i, 'expires' => 6.months.from_now.to_i}

      expect(Uploader).to receive(:check_existing_upload).with('zxcv').and_return({url: "https://www.example.com/zxcv"})

      expect(u).to receive(:private_viewable_board_ids).and_return(['3'])
      expect(bs).to_not receive(:extra_data_private_url)
      expect(bs.url_for(u, 'abc')).to eq("https://www.example.com/zxcv")
  end

    it "should schedule a remote touch if expiring soon" do
      bs = BoardDownstreamButtonSet.create
      u = User.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      ids = ['4']
      hash = GoSecure.sha512(ids.sort.to_json, bs.data['remote_salt'])
      bs.data['remote_paths'] = {}
      expect(bs).to receive(:schedule_once).with(:touch_remote, hash)
      bs.data['remote_paths'][hash] = {'path' => 'zxcv', 'generated' => 6.hours.ago.to_i, 'expires' => 1.hour.from_now.to_i}
      expect(Uploader).to receive(:check_existing_upload).with('zxcv').and_return({url: "https://www.example.com/zxcv"})

      expect(u).to receive(:private_viewable_board_ids).and_return(['3'])
      expect(bs).to_not receive(:extra_data_private_url)
      expect(bs.url_for(u, 'abc')).to eq("https://www.example.com/zxcv")
    end

    it "should return nil if the source button set is not valid" do
      bs = BoardDownstreamButtonSet.create
      bs.data['full_set_revision'] = 'abc'
      bs2 = BoardDownstreamButtonSet.create
      bs2.data['public_board_ids'] = ['1', '2', '3', '4']
      bs2.data['board_ids'] = ['1', '2', '3', '4']
      expect(bs2).to receive(:skip_extra_data_processing?).and_return(true).at_least(1).times
      bs2.save
      expect(bs2.data['board_ids']).to eq(['1', '2', '3', '4'])
      bs.data['source_id'] = bs2.global_id
      expect(BoardDownstreamButtonSet).to receive(:find_by_global_id).with(bs2.global_id).and_return(bs2)
      expect(bs2).to_not receive(:extra_data_private_url)
      expect(Uploader).to_not receive(:check_existing_upload)
      expect(bs.url_for(nil, 'abc')).to eq(nil)
    end

    it "should use the source button set if one is defined" do
      bs = BoardDownstreamButtonSet.create
      bs.board_id = 9
      bs.data['full_set_revision'] = 'abc'
      bs.data['linked_board_ids'] = ['1', '2', '3', '4']
      bs2 = BoardDownstreamButtonSet.create
      bs2.data['public_board_ids'] = ['1', '2', '3', '4']
      bs2.data['board_ids'] = ['1', '2', '3', '4']
      bs2.data['linked_board_ids'] = ['1', '2', '3', '4', '1_9']
      expect(bs2).to receive(:skip_extra_data_processing?).and_return(true).at_least(1).times
      bs2.save
      expect(bs2.data['board_ids']).to eq(['1', '2', '3', '4'])
      expect(bs2.data['linked_board_ids']).to eq(['1', '2', '3', '4', '1_9'])
      bs.data['source_id'] = bs2.global_id
      expect(BoardDownstreamButtonSet).to receive(:find_by_global_id).with(bs2.global_id).and_return(bs2)
      expect(Uploader).to receive(:check_existing_upload).with(nil).and_return({url: 'zxcv'})
      expect(bs.url_for(nil, 'abc')).to eq('zxcv')
    end

    it "should use cached cdn url if it matches" do
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2', '3', '4']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'aha'
      bs.data['private_cdn_url'] = 'tyuui'
      bs.data['private_cdn_revision'] = 'aha'
      expect(bs).to_not receive(:extra_data_private_url)
      expect(Uploader).to_not receive(:check_existing_upload)
      expect(bs.url_for(nil, 'aha')).to eq('tyuui')
    end

    it "should not used cached cdn url if it doesn't match" do
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2', '3', '4']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'aha'
      bs.data['private_cdn_url'] = 'tyuui'
      bs.data['private_cdn_revision'] = 'ahaaa'
      expect(bs).to receive(:extra_data_private_url).and_return('qwer').at_least(1).times
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      expect(bs.url_for(nil, 'aha')).to eq('zxcv')
    end

    it "should check if the private path exists before returning" do
      u = User.create
      expect(u).to receive(:possible_admin?).and_return(true)
      expect(Organization).to receive(:admin_manager?).with(u).and_return(true)
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      expect(bs).to receive(:extra_data_private_url).and_return('qwer').at_least(1).times
      expect(bs.url_for(u, 'abc')).to eq('zxcv')
      expect(bs.data['private_cdn_url']).to eq("zxcv")
      expect(bs.data['private_cdn_revision']).to eq("abc")
    end

    it "should cache the private path cdn for 24 hours only" do
      u = User.create
      expect(u).to receive(:possible_admin?).and_return(true).at_least(1).times
      expect(Organization).to receive(:admin_manager?).with(u).and_return(true).at_least(1).times
      bs = BoardDownstreamButtonSet.create
      bs.data['public_board_ids'] = ['1', '2']
      bs.data['board_ids'] = ['1', '2', '3', '4']
      bs.data['full_set_revision'] = 'abc'
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      expect(bs).to receive(:extra_data_private_url).and_return('qwer').at_least(1).times
      expect(bs.url_for(u, 'abc')).to eq('zxcv')
      expect(bs.data['private_cdn_url']).to eq("zxcv")
      expect(bs.data['private_cdn_url_checked']).to be > 5.minutes.ago.to_i
      expect(bs.data['private_cdn_url_checked']).to be < 5.minutes.from_now.to_i
      expect(bs.data['private_cdn_revision']).to eq("abc")

      bs.data['private_cdn_url_checked'] = 48.hours.ago.to_i
      expect(Uploader).to receive(:check_existing_upload).with('qwer').and_return({url: 'zxcv'})
      bs.save
      expect(bs.url_for(u, 'abc')).to eq('zxcv')
    end
  end

  describe "touch_remote" do
    it "should do nothing if remote_paths not set" do
      bs = BoardDownstreamButtonSet.create
      expect(Uploader).to_not receive(:remote_touch)
      bs.touch_remote('asdf')
    end

    it "should call remote_touch on generated paths" do
      bs = BoardDownstreamButtonSet.create
      bs.data['remote_paths'] = {
        'asdf' => {'generated' => 6.hours.ago.to_i, 'expires' => 6.hours.from_now.to_i, 'path' => 'asdf.asdf'},
        'jkl' => {'generated' => 12.months.ago.to_i, 'expires' => 4.months.ago.to_i, 'path' => 'jkl.jkl'}
      }
      expect(bs.data['remote_paths']['asdf']['expires']).to be < 4.months.from_now.to_i
      expect(Uploader).to receive(:remote_touch).with('asdf.asdf').and_return(true)
      bs.touch_remote('asdf')
      expect(bs.data['remote_paths'].keys).to eq(['asdf', 'jkl'])
      expect(bs.data['remote_paths']['asdf']['expires']).to be > 4.months.from_now.to_i
    end

    it "should update the expiration on successfully touched paths" do
      bs = BoardDownstreamButtonSet.create
      bs.data['remote_paths'] = {
        'asdf' => {'generated' => 6.hours.ago.to_i, 'expires' => 6.hours.from_now.to_i, 'path' => 'asdf.asdf'},
        'jkl' => {'generated' => 12.months.ago.to_i, 'expires' => 4.months.ago.to_i, 'path' => 'jkl.jkl'}
      }
      expect(bs.data['remote_paths']['asdf']['expires']).to be < 4.months.from_now.to_i
      expect(Uploader).to receive(:remote_touch).with('asdf.asdf').and_return(true)
      bs.touch_remote('asdf')
      expect(bs.data['remote_paths'].keys).to eq(['asdf', 'jkl'])
      expect(bs.data['remote_paths']['asdf']['expires']).to be > 4.months.from_now.to_i
    end

    it "should remove unsuccessfully touched paths" do
      bs = BoardDownstreamButtonSet.create
      bs.data['remote_paths'] = {
        'asdf' => {'generated' => 6.hours.ago.to_i, 'expires' => 6.hours.from_now.to_i, 'path' => 'asdf.asdf'},
        'jkl' => {'generated' => 12.months.ago.to_i, 'expires' => 4.months.ago.to_i, 'path' => 'jkl.jkl'}
      }
      expect(bs.data['remote_paths']['asdf']['expires']).to be < 4.months.from_now.to_i
      expect(Uploader).to receive(:remote_touch).with('asdf.asdf').and_return(false)
      bs.touch_remote('asdf')
      expect(bs.data['remote_paths'].keys).to eq(['jkl'])
    end
  end

  describe "generate_for" do
    it "should return false without a user" do
      u = User.create
      b = Board.create(user: u)
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, nil)).to eq({error: 'missing board or user', success: false})
    end

    it "should return false without a board" do
      u = User.create
      b = Board.create(user: u)
      expect(BoardDownstreamButtonSet.generate_for(nil, u.global_id)).to eq({error: 'missing board or user', success: false})
    end

    it "should generate a missing button set" do
      u = User.create
      b = Board.create(user: u)
      BoardDownstreamButtonSet.where(board_id: b.id).destroy_all
      expect(BoardDownstreamButtonSet).to receive(:update_for).with(b.global_id, true)
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({error: 'could not generate button set', success: false})
    end

    it "should return false if it can't generate a button set" do
      u = User.create
      b = Board.create(user: u)
      BoardDownstreamButtonSet.where(board_id: b.id).destroy_all
      expect(BoardDownstreamButtonSet).to receive(:update_for).with(b.global_id, true).and_return(false)
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({error: 'could not generate button set', success: false})
    end

    it "should return the source button set's url" do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      bs2 = BoardDownstreamButtonSet.create(board: b)
      expect(bs2).to receive(:skip_extra_data_processing?).and_return(true).at_least(1).times
      bs2.data['source_id'] = bs.global_id
      bs2.data['full_set_revision'] = 'asdfasdf'
      bs2.save
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:full_set_revision).and_return('asdfasdf').at_least(1).times
      expect(b).to receive(:board_downstream_button_set).and_return(bs2).at_least(1).times
      expect(BoardDownstreamButtonSet).to receive(:find_by_global_id).with(bs.global_id).and_return(bs)
      expect(bs).to receive(:url_for) do |a, b, c|
        expect(a).to eq(u)
        expect(b).to eq('asdfasdf')
        expect(c).to eq(true)
      end.and_return('asdf')
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'url_for', success: true, url: 'asdf'})
    end

    it "should return the existing url if there is one" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(:data => {'full_set_revision' => 'asdf'}, board: b)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(bs).to receive(:url_for).with(u, 'asdf', true).and_return('asdf')
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'url_for', success: true, url: 'asdf'})
    end

    it "should generate the default extra_data if there isn't one" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(:data => {'full_set_revision' => 'asdf'}, board: b)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(bs).to receive(:detach_extra_data)
      expect(bs).to receive(:url_for).with(u, 'asdf', true).and_return(nil)
      expect(bs).to receive(:extra_data_private_url).and_return('asdf').at_least(1).times
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'fresh', success: true, url: 'asdf'})
    end

    it "should return the newly-generated default extra_data if it matches for the user" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(:data => {'full_set_revision' => 'asdf'}, board: b)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(bs).to receive(:detach_extra_data)
      expect(bs).to receive(:url_for).with(u, 'asdf', true).and_return(nil)
      expect(bs).to receive(:extra_data_private_url).and_return('asdf').at_least(1).times
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'fresh', success: true, url: 'asdf'})
    end

    it "should return the newly-generated default extra_data if it matches for the user" do
      u = User.create
      b = Board.create(user: u)
      bs = BoardDownstreamButtonSet.create(board: b)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b).at_least(1).times
      expect(b).to receive(:board_downstream_button_set).and_return(bs).at_least(1).times
      expect(bs).to receive(:detach_extra_data)
      expect(bs).to receive(:extra_data_private_url).and_return('asdf').at_least(1).times
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'fresh', success: true, url: 'asdf'})
    end

    it "should not try to generate again less than 12 hours after a failed generation attempt" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['board_ids'] = ['1', '2', '3']
      bs.data['full_set_revision'] = 'asdf'
      hash = GoSecure.sha512(['1', '2', '3'].to_json, bs.data['remote_salt'])
      bs.data['remote_paths'] = {}
      bs.data['remote_paths'][hash] = {'generated' => 2.hours.ago.to_i}
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(bs).to receive(:detach_extra_data)
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({success: false, error: 'button set failed to generate, waiting for cool-down period'})
    end

    it "should remote upload only the available boards based on the user" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['board_ids'] = ['1', '2', '3']
      bs.data['full_set_revision'] = 'asdf'
      hash = GoSecure.sha512(['3'].to_json, bs.data['remote_salt'])
      bs.data['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'board_id' => '1'},
        {'id' => 1, 'label' => 'rat', 'board_id' => '2'},
        {'id' => 1, 'label' => 'splat', 'board_id' => '3'},
      ]
      expect(User).to receive(:find_by_global_id).with(u.global_id).and_return(u)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(u).to receive(:private_viewable_board_ids).and_return(['1', '2'])
      expect(bs).to receive(:detach_extra_data).at_least(1).times
      expect(Uploader).to receive(:remote_upload) do |path, file_path, type|
        expect(type).to eq('text/json')
        json = bs.decrypted_json(File.read(file_path))
        expect(json.is_a?(Array)).to eq(true)
        expect(json.length).to eq(2)
        expect(json[0]['label']).to eq('hat')
        expect(json[1]['label']).to eq('rat')
        expect(path).to eq(bs.data['remote_paths'][hash]['path'])
      end.and_return({url: "https://dc5pvf6xvgi7y.cloudfront.net/false"})
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'uploaded', success: true, url: "#{ENV['UPLOADS_S3_CDN']}/#{bs.data['remote_paths'][hash]['path']}"})
      expect(bs.data['remote_paths'][hash]['path']).to_not eq(nil)
      expect(bs.data['remote_paths'][hash]['expires']).to be > 3.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['expires']).to be < 6.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be < 10.seconds.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be > 10.seconds.ago.to_i
    end

    it "should remote upload only the available boards based on the user" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['board_ids'] = ['1', '2', '3']
      bs.data['full_set_revision'] = 'asdf'
      hash = GoSecure.sha512(['3'].to_json, bs.data['remote_salt'])
      bs.data['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'board_id' => '1'},
        {'id' => 1, 'label' => 'rat', 'board_id' => '2'},
        {'id' => 1, 'label' => 'splat', 'board_id' => '3'},
      ]
      expect(User).to receive(:find_by_global_id).with(u.global_id).and_return(u)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(u).to receive(:private_viewable_board_ids).and_return(['1', '2'])
      expect(bs).to receive(:detach_extra_data).at_least(1).times
      expect(Uploader).to receive(:remote_upload) do |path, file_path, type|
        expect(type).to eq('text/json')
        json = bs.decrypted_json(File.read(file_path))
        expect(json.is_a?(Array)).to eq(true)
        expect(json.length).to eq(2)
        expect(json[0]['label']).to eq('hat')
        expect(json[1]['label']).to eq('rat')
        expect(path).to eq(bs.data['remote_paths'][hash]['path'])
      end.and_raise("throttled upload")
      expect(RemoteAction.count).to eq(2)
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'uploaded', success: true, url: "#{ENV['UPLOADS_S3_CDN']}/#{bs.data['remote_paths'][hash]['path']}"})
      expect(RemoteAction.count).to eq(4)
      ra = RemoteAction.all[-1]
      expect(ra.path).to eq("#{b.global_id}::#{u.global_id}")
      expect(ra.action).to eq("upload_extra_data")
      expect(ra.act_at).to be > 4.minutes.from_now
      expect(bs.data['remote_paths'][hash]['path']).to_not eq(nil)
      expect(bs.data['remote_paths'][hash]['expires']).to be > 3.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['expires']).to be < 6.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be < 10.seconds.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be > 10.seconds.ago.to_i
    end    

    it "should remote upload only the available boards based on the user" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['board_ids'] = ['1', '2', '3']
      bs.data['full_set_revision'] = 'asdf'
      hash = GoSecure.sha512(['3'].to_json, bs.data['remote_salt'])
      bs.data['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'board_id' => '1'},
        {'id' => 1, 'label' => 'rat', 'board_id' => '2'},
        {'id' => 1, 'label' => 'splat', 'board_id' => '3'},
      ]
      expect(User).to receive(:find_by_global_id).with(u.global_id).and_return(u)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(u).to receive(:private_viewable_board_ids).and_return(['1', '2'])
      expect(bs).to receive(:detach_extra_data).at_least(1).times
      expect(Uploader).to_not receive(:remote_upload)
      expect(RemoteAction.count).to eq(2)
      ra = RemoteAction.create(path: "#{b.global_id}::#{u.global_id}", action: "upload_extra_data", act_at: 5.minutes.from_now)
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'uploaded', success: true, url: "#{ENV['UPLOADS_S3_CDN']}/#{bs.data['remote_paths'][hash]['path']}"})
      expect(RemoteAction.count).to eq(4)
      ra = RemoteAction.all[-2]
      expect(ra.path).to eq("#{b.global_id}::#{u.global_id}")
      expect(ra.action).to eq("upload_extra_data")
      expect(ra.act_at).to be > 4.minutes.from_now
      expect(bs.data['remote_paths'][hash]['path']).to_not eq(nil)
      expect(bs.data['remote_paths'][hash]['expires']).to be > 3.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['expires']).to be < 6.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be < 10.seconds.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be > 10.seconds.ago.to_i
    end    

    it "should record an error on upload fail" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['board_ids'] = ['1', '2', '3']
      bs.data['full_set_revision'] = 'asdf'
      hash = GoSecure.sha512(['3'].to_json, bs.data['remote_salt'])
      bs.data['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'board_id' => '1'},
        {'id' => 1, 'label' => 'rat', 'board_id' => '2'},
        {'id' => 1, 'label' => 'splat', 'board_id' => '3'},
      ]
      expect(User).to receive(:find_by_global_id).with(u.global_id).and_return(u)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(u).to receive(:private_viewable_board_ids).and_return(['1', '2'])
      expect(bs).to receive(:detach_extra_data).at_least(1).times
      expect(Uploader).to receive(:remote_upload) do |path, file_path, type|
        expect(type).to eq('text/json')
        json = bs.decrypted_json(File.read(file_path))
        expect(json.is_a?(Array)).to eq(true)
        expect(json.length).to eq(2)
        expect(json[0]['label']).to eq('hat')
        expect(json[1]['label']).to eq('rat')
        expect(path).to eq(bs.data['remote_paths'][hash]['path'])
        throw("nope")
      end
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({success: false, error: "button set failed to generate"})
      expect(bs.data['remote_paths'][hash]['path']).to eq(false)
      expect(bs.data['remote_paths'][hash]['expires']).to be > 3.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['expires']).to be < 6.months.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be < 10.seconds.from_now.to_i
      expect(bs.data['remote_paths'][hash]['generated']).to be > 10.seconds.ago.to_i
    end

    it "should return the URL on a successful generation" do
      u = User.create
      b = Board.create(user: u, :settings => {'full_set_revision' => 'asdf'})
      bs = BoardDownstreamButtonSet.create(board: b)
      bs.data['board_ids'] = ['1', '2', '3']
      bs.data['full_set_revision'] = 'asdf'
      hash = GoSecure.sha512(['3'].to_json, bs.data['remote_salt'])
      bs.data['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'board_id' => '1'},
        {'id' => 1, 'label' => 'rat', 'board_id' => '2'},
        {'id' => 1, 'label' => 'splat', 'board_id' => '3'},
      ]
      expect(User).to receive(:find_by_global_id).with(u.global_id).and_return(u)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
      expect(b).to receive(:board_downstream_button_set).and_return(bs)
      expect(u).to receive(:private_viewable_board_ids).and_return(['1', '2'])
      expect(bs).to receive(:detach_extra_data).at_least(1).times
      expect(Uploader).to receive(:remote_upload) do |path, file_path, type|
        expect(type).to eq('text/json')
        json = bs.decrypted_json(File.read(file_path))
        expect(json.is_a?(Array)).to eq(true)
        expect(json.length).to eq(2)
        expect(json[0]['label']).to eq('hat')
        expect(json[1]['label']).to eq('rat')
        expect(path).to eq(bs.data['remote_paths'][hash]['path'])
      end.and_return({url: "#{ENV['UPLOADS_S3_CDN']}/bacon"})
      expect(BoardDownstreamButtonSet.generate_for(b.global_id, u.global_id)).to eq({state: 'uploaded', success: true, url: "#{ENV['UPLOADS_S3_CDN']}/#{bs.data['remote_paths'][hash]['path']}"})
    end
 end

  describe "flush_caches" do
    it "should not error on bad board ids" do
      BoardDownstreamButtonSet.flush_caches([], 0)
      BoardDownstreamButtonSet.flush_caches(['a', 'b', 'c'], 111)
    end

    it "should not error on missing button sets for existing boards" do
      u = User.create
      b = Board.create(user: u)
      BoardDownstreamButtonSet.flush_caches([b.global_id], u.created_at.to_i)
    end

    it "should call Uploader.remote_remove for expired paths" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'jump'}
      ]})
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      bs = b.reload.board_downstream_button_set
      bs.data['remote_paths'] = {
        'asdf' => {'path' => 'asdf.asdf', 'generated' => 1234, 'expires' => 4.weeks.from_now.to_i},
        'jkl' => {'path' => 'jkl.jkl', 'generated' => 12345, 'expires' => 3.weeks.ago.to_i}
      }
      bs.save
      expect(Uploader).to receive(:remote_remove).with('asdf.asdf').and_return(true)
      expect(Uploader).to receive(:remote_remove).with('jkl.jkl').and_return(true)
      BoardDownstreamButtonSet.flush_caches([b.global_id], Time.now.to_i)
    end

    it "should remote path data for expired paths" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'jump'}
      ]})
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      bs = b.reload.board_downstream_button_set
      bs.data['remote_paths'] = {
        'asdf' => {'path' => 'asdf.asdf', 'generated' => 1234, 'expires' => 4.weeks.from_now.to_i},
        'jkl' => {'path' => 'jkl.jkl', 'generated' => 12345, 'expires' => 3.weeks.ago.to_i}
      }
      bs.save
      expect(Uploader).to receive(:remote_remove).with('asdf.asdf').and_return(true)
      expect(Uploader).to receive(:remote_remove).with('jkl.jkl').and_return(true)
      BoardDownstreamButtonSet.flush_caches([b.global_id], Time.now.to_i)
      bs.reload
      expect(bs.data['remote_paths'].keys).to eq([])
    end

    it "should not clear information for paths generated after the call was initiated" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'jump'}
      ]})
      BoardDownstreamButtonSet.update_for(b.global_id, true)
      bs = b.reload.board_downstream_button_set
      bs.data['remote_paths'] = {
        'asdf' => {'path' => 'asdf.asdf', 'generated' => 1234, 'expires' => 4.weeks.from_now.to_i},
        'jkl' => {'path' => 'jkl.jkl', 'generated' => 3.hours.from_now.to_i, 'expires' => 3.weeks.ago.to_i}
      }
      bs.save
      expect(Uploader).to receive(:remote_remove).with('asdf.asdf').and_return(true)
      expect(Uploader).to_not receive(:remote_remove).with('jkl.jkl')
      BoardDownstreamButtonSet.flush_caches([b.global_id], Time.now.to_i)
      bs.reload
      expect(bs.data['remote_paths'].keys).to eq(['jkl'])
    end
  end
end
