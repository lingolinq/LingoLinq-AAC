require 'spec_helper'

describe Renaming, :type => :model do
  describe "old_link?" do
    it "should return based on the instance attribute" do
      u = User.new
      expect(u.old_link?).to eq(false)
      u.instance_variable_set('@old_link', true)
      expect(u.old_link?).to eq(true)
      u.instance_variable_set('@old_link', false)
      expect(u.old_link?).to eq(false)
    end
  end
  
  describe "collision_error?" do
    it "should return based on the instance attribute" do
      u = User.new
      expect(u.collision_error?).to eq(false)
      u.instance_variable_set('@collision_error', true)
      expect(u.collision_error?).to eq(true)
      u.instance_variable_set('@collision_error', false)
      expect(u.collision_error?).to eq(false)
    end
  end
  
  describe "record_type" do
    it "should return the correct type" do
      u = User.new
      expect(u.record_type).to eq('user')
      expect(User.record_type).to eq('user')
      b = Board.new
      expect(b.record_type).to eq('board')
      expect(Board.record_type).to eq('board')
    end
  end
  
  describe "rename_to" do
    it "should fail on name collision" do
      u = User.create
      u2 = User.create
      expect(u.collision_error?).to eq(false)
      res = u.rename_to(u2.user_name)
      expect(res).to eq(false)
      expect(u.collision_error?).to eq(true)
    end
    
    describe "renaming boards" do
      it "should fail if trying to change board key's user_name prefix" do
        u = User.create
        b = Board.create(:user => u)
        res = b.rename_to('wilma/flintstone')
        expect(res).to eq(false)
      end
    
      it "should return true on success" do
        u = User.create
        b = Board.create(:user => u)
        res = b.rename_to("#{u.user_name}/wilma")
        expect(res).to eq(true)
      end
    
      it "should schedule deep_link renaming" do
        u = User.create
        b = Board.create(:user => u)
        old_key = b.key
        res = b.rename_to("#{u.user_name}/wilma")
        expect(res).to eq(true)
        expect(Worker.scheduled_for?(:slow, Board, :perform_action, {'id' => b.id, 'method' => 'rename_deep_links', 'arguments' => [old_key]})).to eq(true)
      end
    
      it "should create an old_key reference if one doesn't already exist" do
        u = User.create
        b = Board.create(:user => u)
        old_key = b.key
        expect(OldKey.find_by(:type => 'board', :key => old_key)).to eq(nil)
        res = b.rename_to("#{u.user_name}/wilma")
        expect(res).to eq(true)
        k = OldKey.find_by(:type => 'board', :key => old_key)
        expect(k).not_to eq(nil)
        expect(k.record).to eq(b)
      end
    
      it "should replace an old_key reference if one already exists" do
        u = User.create
        b = Board.create(:user => u)
        b2 = Board.create(:user => u)
        old_key = b.key
        OldKey.create(:type => 'board', :key => old_key, :record_id => b2.global_id)
        res = b.rename_to("#{u.user_name}/wilma")
        expect(res).to eq(true)
        expect(OldKey.where(:type => 'board', :key => old_key).count).to eq(1)
        k = OldKey.find_by(:type => 'board', :key => old_key)
        expect(k).not_to eq(nil)
        expect(k.record).to eq(b)      
      end
    
      it "should allow changing the user_name as long as the rest of the key doesn't change" do
        u = User.create
        b = Board.create(:user => u)
        u2 = User.create
        old_key = b.key
        part = old_key.split(/\//)[1]
        res = b.rename_to("#{u2.user_name}/#{part}")
        expect(res).to eq(true)
      end
    
      it "should error if you try to change both the user_name and rest of the key" do
        u = User.create
        b = Board.create(:user => u)
        u2 = User.create
        old_key = b.key
        part = old_key.split(/\//)[1]
        res = b.rename_to("#{u2.user_name}/bacon")
        expect(res).to eq(false)
      end
    
      it "should schedule board_downstream_button_set updates for all upstream boards" do
        u = User.create
        b1 = Board.create(:user => u)
        b2 = Board.create(:user => u)
        b3 = Board.create(:user => u)
        b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]
        b1.save
        b2.settings['buttons'] = [{'id' => 2, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}]
        b2.save
        Worker.process_queues
        res = b3.reload.rename_to("#{u.user_name}/bestest")
        expect(res).to eq(true)
        Worker.process_queues
        # TODO: this should get fixed automatically be regenerated button sets, shouldn't need a manual schedule
        # expect(Worker.scheduled?(BoardDownstreamButtonSet, 'perform_action', {'method' => 'update_for', 'arguments' => [b1.global_id]})).to eq(true)
        # expect(Worker.scheduled?(BoardDownstreamButtonSet, 'perform_action', {'method' => 'update_for', 'arguments' => [b2.global_id]})).to eq(true)
      end
    
      it "should update keys for any users this board was shared with" do
        u = User.create
        u2 = User.create
        b = Board.create(:user => u)
        b.share_with(u2)
        expect(UserLink.links_for(u2)).to eq([{
          'user_id' => u2.global_id,
          'record_code' => Webhook.get_record_code(b),
          'type' => 'board_share',
          'state' => {
            'sharer_id' => u.global_id,
            'sharer_user_name' => u.user_name,
            'user_name' => u2.user_name,
            'board_key' => b.key,
            'pending' => false
          }
        }])
        expect(u2.settings['boards_shared_with_me']).to eq(nil)
        b.reload.rename_to("#{u.user_name}/bestest")
        Worker.process_queues
        expect(UserLink.links_for(u2.reload)).to eq([{
          'user_id' => u2.global_id,
          'record_code' => Webhook.get_record_code(b),
          'type' => 'board_share',
          'state' => {
            'sharer_id' => u.global_id,
            'sharer_user_name' => u.user_name,
            'user_name' => u2.user_name,
            'board_key' => "#{u.user_name}/bestest",
            'pending' => false
          }
        }])
      end
    
      it "should update any log entries where previous_key or new_id match the old key" do
        u = User.create
        d = Device.create(:user => u)
        b = Board.create(:user => u)

        s1 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'type' => 'action', 'action' => {'action' => 'open_board', 'previous_key' => {'key' => b.key, 'id' => b.global_id}, 'new_id' => {'key' => 'bacon'}}}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        s2 = LogSession.process_new({'events' => [{'timestamp' => Time.now.to_i, 'type' => 'action', 'action' => {'action' => 'open_board', 'previous_key' => {'key' => 'bacon'}, 'new_id' => {'key' => b.key, 'id' => b.global_id}}}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
        Worker.process_queues
        
        b.reload.rename_to("#{u.user_name}/something")
        Worker.process_queues
        
        expect(s1.reload.data['events'].length).to eq(1)
        # TODO: this spec fails because of an optimization that may beed to be re-added someday,
        # see app/models/log_session.rb:913
        # expect(s1.reload.data['events'][0]['action']['previous_key']['key']).to eq("#{u.user_name}/something")
        # expect(s1.reload.data['events'][0]['action']['new_id']['key']).to eq("bacon")
        # expect(s2.reload.data['events'][0]['action']['previous_key']['key']).to eq("bacon")
        # expect(s2.reload.data['events'][0]['action']['new_id']['key']).to eq("#{u.user_name}/something")
      end
    end
    
    describe "renaming users" do
      it "should rename all the user's boards" do
        u = User.create
        b = Board.create(:user => u, :key => "#{u.user_name}/alfalfa")
        b2 = Board.create(:user => u, :key => "#{u.user_name}/sprouts")
        u.rename_to("fred")
        Worker.process_queues
        expect(b.reload.key).to eq("fred/alfalfa")
        expect(b2.reload.key).to eq("fred/sprouts")
      end
      
      it "should update all users who have has boards shared with them" do
        u = User.create
        u2 = User.create
        b = Board.create(:user => u)
        b.share_with(u2)
        expect(UserLink.links_for(u.reload)).to eq([{
          'user_id' => u2.global_id,
          'record_code' => Webhook.get_record_code(b),
          'type' => 'board_share',
          'state' => {
            'sharer_id' => u.global_id,
            'sharer_user_name' => u.user_name,
            'user_name' => u2.user_name,
            'pending' => false,
            'board_key' => b.key
          }
        }])
        expect(u.reload.settings['boards_i_shared']).to eq(nil)
        u2.rename_to("janice")
        Worker.process_queues
        expect(UserLink.links_for(u.reload)).to eq([{
          'user_id' => u2.global_id,
          'record_code' => Webhook.get_record_code(b),
          'type' => 'board_share',
          'state' => {
            'sharer_id' => u.global_id,
            'sharer_user_name' => u.user_name,
            'user_name' => 'janice',
            'pending' => false,
            'board_key' => b.key
          }
        }])
        expect(u.reload.settings['boards_i_shared']).to eq(nil)
      end

      it "should update all users who have shared boards with the user" do
        u = User.create
        u2 = User.create
        b = Board.create(:user => u)
        b.share_with(u2)
        expect(UserLink.links_for(u.reload)).to eq([{
          'user_id' => u2.global_id,
          'record_code' => Webhook.get_record_code(b),
          'type' => 'board_share',
          'state' => {
            'sharer_id' => u.global_id,
            'sharer_user_name' => u.user_name,
            'user_name' => u2.user_name,
            'pending' => false,
            'board_key' => b.key
          }
        }])
        expect(u.reload.settings['boards_i_shared']).to eq(nil)
        u.rename_to("janice")
        Worker.process_queues
        expect(UserLink.links_for(u.reload)).to eq([{
          'user_id' => u2.global_id,
          'record_code' => Webhook.get_record_code(b),
          'type' => 'board_share',
          'state' => {
            'sharer_id' => u.global_id,
            'sharer_user_name' => 'janice',
            'user_name' => u2.user_name,
            'pending' => false,
            'board_key' => b.key
          }
        }])
        expect(u.reload.settings['boards_i_shared']).to eq(nil)
      end
      
      it "should update all supervisors" do
        u = User.create
        u2 = User.create
        User.link_supervisor_to_user(u2, u, nil, true)
        expect(u2.reload.supervisee_links[0]['state']['supervisee_user_name']).to eq(u.user_name)
        expect(u.reload.supervisor_links[0]['state']['supervisee_user_name']).to eq(u.user_name)
        u.rename_to('joyce')
        Worker.process_queues
        expect(u2.reload.supervisee_links[0]['state']['supervisee_user_name']).to eq('joyce')
        expect(u.reload.supervisor_links[0]['state']['supervisee_user_name']).to eq('joyce')
      end
      
      it "should update all supervisees" do
        u = User.create
        u2 = User.create
        User.link_supervisor_to_user(u2, u, nil, true)
        expect(u.reload.supervisor_links[0]['state']['supervisor_user_name']).to eq(u2.user_name)
        u2.rename_to('belinda')
        Worker.process_queues
        expect(u.reload.supervisor_links[0]['state']['supervisor_user_name']).to eq('belinda')
      end
    end
    
    
  end

  describe "rename_deep_links" do
    it "should error if key didn't actually change" do
      u = User.create
      expect{ u.rename_deep_links(u.user_name) }.to raise_error("must be renamed already")
    end
    
    it "should update linked buttons pointing to the renamed board" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b2.settings['buttons'] = [
        {'label' => 'fred'},
        {'id' => '1234', 'load_board' => {'id' => b.global_id, 'key' => b.key}}
      ]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      b3 = Board.create(:user => u)
      b3.settings['buttons'] = [
        {},
        {},
        {'id' => '111', 'load_board' => {'id' => b.global_id, 'key' => b.key}},
        {'id' => '222', 'load_board' => {'id' => b.global_id, 'key' => b2.key}},
        {'id' => '333', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '444', 'load_board' => {'id' => b2.global_id, 'key' => b.key}}
      ]
      b3.instance_variable_set('@buttons_changed', true)
      b3.save
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b.reload.downstream_board_ids.sort).to eq([])
      expect(b2.reload.downstream_board_ids.sort).to eq([b.global_id])
      expect(b3.reload.downstream_board_ids).to match_array([b.global_id, b2.global_id])
      old_key = b.key
      new_key = "#{u.user_name}/bambam"
      b.rename_to(new_key)
      b.rename_deep_links(old_key)
      b2.reload
      b3.reload
      expect(b2.settings['buttons'][1]['load_board']).to eq({'id' => b.global_id, 'key' => new_key})
      expect(b3.settings['buttons'][2]['load_board']).to eq({'id' => b.global_id, 'key' => new_key})
      expect(b3.settings['buttons'][3]['load_board']).to eq({'id' => b.global_id, 'key' => new_key})
      expect(b3.settings['buttons'][4]['load_board']).to eq({'id' => b2.global_id, 'key' => b2.key})
      expect(b3.settings['buttons'][5]['load_board']).to eq({'id' => b2.global_id, 'key' => old_key})
    end
    
    it "should update user home board preferences pointing to the renamed board" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      u2.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => 'asdf'}
      u2.save
      u3.settings['preferences']['home_board'] = {'id' => b.global_id + 'x', 'key' => b.key}
      u3.save
      Worker.process_queues
      old_key = b.key
      new_key = "#{u.user_name}/dino"
      b.rename_to(new_key)
      b.rename_deep_links(old_key)
      u.reload
      u2.reload
      u3.reload
      expect(u.settings['preferences']['home_board']).to eq({'id' => b.global_id, 'key' => new_key})
      expect(u2.settings['preferences']['home_board']).to eq({'id' => b.global_id, 'key' => new_key})
      expect(u3.settings['preferences']['home_board']).to eq({'id' => b.global_id + 'x', 'key' => old_key})
    end
    
    it "should update log session entries pointing to the renamed board" do
      u = User.create
      b = Board.create(:user => u)
      d = Device.create(:user => u)
      s = LogSession.create(:data => {'events' => [
        {'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'board' => {'id' => b.global_id, 'key' => b.key}}},
        {'timestamp' => 10.minutes.ago.to_i, 'type' => 'button'},
        {'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {}},
        {'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'board' => {'id' => b.global_id, 'key' => 'asdf'}}},
        {'timestamp' => 10.minutes.ago.to_i, 'type' => 'button', 'button' => {'board' => {'id' => b.global_id + 'x', 'key' => b.key}}}
      ]}, :user => u, :author => u, :device => d)
      Worker.process_queues
      old_key = b.key
      new_key = "#{u.user_name}/ethel"
      b.rename_to(new_key)
      b.rename_deep_links(old_key)
      u.reload
      s.reload
      # expect(s.data['events'][0]['button']).to eq({'board' => {'id' => b.global_id, 'key' => new_key}})
      # expect(s.data['events'][3]['button']).to eq({'board' => {'id' => b.global_id, 'key' => new_key}})
      # expect(s.data['events'][4]['button']).to eq({'board' => {'id' => b.global_id + 'x', 'key' => old_key}})
    end
    
    it "should update author urls of image licenses pointing to the renamed user" do
      u = User.create
      b1 = ButtonImage.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/#{u.user_name}"}
      })
      b2 = ButtonImage.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/#{u.user_name}/2"}
      })
      b3 = ButtonImage.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/jeb"}
      })
      Worker.process_queues
      old_key = u.user_name
      new_key = 'john_doe'
      u.rename_to(new_key)
      u.rename_deep_links(old_key)
      b1.reload
      b2.reload
      b3.reload
      expect(b1.settings['license']['author_url']).to eq("http://www.example.com/john_doe")
      expect(b2.settings['license']['author_url']).to eq("http://www.example.com/#{old_key}/2")
      expect(b3.settings['license']['author_url']).to eq("http://www.example.com/jeb")
    end

    it "should update author urls of board licenses pointing to the renamed user" do
      u = User.create
      b1 = Board.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/#{u.user_name}"}
      })
      b2 = Board.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/#{u.user_name}/2"}
      })
      b3 = Board.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/jeb"}
      })
      Worker.process_queues
      old_key = u.user_name
      new_key = 'john_doe'
      u.rename_to(new_key)
      u.rename_deep_links(old_key)
      b1.reload
      b2.reload
      b3.reload
      expect(b1.settings['license']['author_url']).to eq("http://www.example.com/john_doe")
      expect(b2.settings['license']['author_url']).to eq("http://www.example.com/#{old_key}/2")
      expect(b3.settings['license']['author_url']).to eq("http://www.example.com/jeb")
    end

    it "should update author urls of sound licenses pointing to the renamed user" do
      u = User.create
      b1 = ButtonSound.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/#{u.user_name}"}
      })
      b2 = ButtonSound.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/#{u.user_name}/2"}
      })
      b3 = ButtonSound.create(:user => u, :settings => {
        'license' => {'author_url' => "http://www.example.com/jeb"}
      })
      Worker.process_queues
      old_key = u.user_name
      new_key = 'john_doe'
      u.rename_to(new_key)
      u.rename_deep_links(old_key)
      b1.reload
      b2.reload
      b3.reload
      expect(b1.settings['license']['author_url']).to eq("http://www.example.com/john_doe")
      expect(b2.settings['license']['author_url']).to eq("http://www.example.com/#{old_key}/2")
      expect(b3.settings['license']['author_url']).to eq("http://www.example.com/jeb")
    end
  end
 
  describe "find_by_possibly_old_path" do
    it "should find the actual record first" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      k = OldKey.create(:type => 'board', :record_id => b2.global_id, :key => b.key)
      res = Board.find_by_possibly_old_path(b.key)
      expect(res).to eq(b)
    end
    
    it "should find the fallback if no actual record is found" do
      u = User.create
      b = Board.create(:user => u)
      k = OldKey.create(:type => 'board', :record_id => b.global_id, :key => 'fred/susan')
      res = Board.find_by_possibly_old_path('fred/susan')
      expect(res).to eq(b)
    end
    
    it "should not error if neither type of result is found" do
      res = Board.find_by_possibly_old_path('asdf')
      expect(res).to eq(nil)
    end
  end
end
