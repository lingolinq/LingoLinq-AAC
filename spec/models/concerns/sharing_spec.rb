require 'spec_helper'

describe Sharing, :type => :model do
  describe "process_share" do
    it "should add shallow share properly" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      expect(b).to receive(:share_with) do |user, deep|
        expect(user).to eq(u2)
        expect(deep).to eq(false)
      end
      b.process({'sharing_key' => "add_shallow-#{u2.global_id}"})
    end
    
    it "should error gracefully on invalid user" do
      u = User.create
      b = Board.create(:user => u)
      res = b.process({'sharing_key' => "add_deep-bacon"})
      expect(res).to eq(false)
      expect(b.processing_errors).to eq(["user bacon not found while trying to share"])
    end
    
    it "should add deep share properly" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      expect(b).to receive(:share_with) do |user, deep|
        expect(user).to eq(u2)
        expect(deep).to eq(true)
      end
      b.process({'sharing_key' => "add_deep-#{u2.global_id}"})
    end
    
    it "should add shallow edit share properly" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      expect(b).to receive(:share_with) do |user, deep, edit|
        expect(user).to eq(u2)
        expect(deep).to eq(true)
        expect(edit).to eq(true)
      end
      b.process({'sharing_key' => "add_edit_deep-#{u2.global_id}"})
    end
    
    it "should add deep edit share properly" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      expect(b).to receive(:share_with) do |user, deep, edit|
        expect(user).to eq(u2)
        expect(deep).to eq(false)
        expect(edit).to eq(true)
      end
      b.process({'sharing_key' => "add_edit_shallow-#{u2.global_id}"})
    end
    
    it "should remove share properly" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b.share_with(u)
      expect(b).to receive(:unshare_with) do |user|
        expect(user).to eq(u2)
      end
      b.process({'sharing_key' => "remove-#{u2.global_id}"})
    end
    
    it "should not allow sharing protected material that is unshareable" do
      u = User.create
      u2 = User.create
      bi = ButtonImage.create(:settings => {'protected' => true, 'protected_source' => 'lessonpix'})
      b = Board.create(:user => u, :settings => {'protected' => {'vocabulary' => true}})
      expect(b.protected_material?).to eq(true)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'image_id' => bi.global_id}
        ]
      })
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
      expect(b.settings['protected']['media_sources']).to eq(['lessonpix'])
      expect(UserIntegration.integration_keys_for(u2)).to eq([])
      res = b.process({'sharing_key' => "add_deep-#{u2.user_name}"})
      expect(res).to eq(false)
      expect(b.processing_errors).to eq(["user #{u2.user_name} does not have access to the protected material on this board"])
      expect(b.reload.shared_with?(u2.reload)).to eq(false)
    end

    it 'should allow sharing protected material that is not unshareable' do
      u = User.create
      u2 = User.create
      bi = ButtonImage.create(:settings => {'protected' => true, 'protected_source' => 'lessonpix'})
      b = Board.create(:user => u)
      expect(b.protected_material?).to eq(false)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'image_id' => bi.global_id}
        ]
      })
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
      expect(b.settings['protected']['media_sources']).to eq(['lessonpix'])
      expect(UserIntegration.integration_keys_for(u2)).to eq([])
      res = b.process({'sharing_key' => "add_deep-#{u2.user_name}"})
      expect(res).to eq(true)
      expect(b.reload.shared_with?(u2.reload)).to eq(true)
    end
    
    it "should allow sharing protected material if both users have access" do
      u = User.create
      u2 = User.create
      UserIntegration.create(user: u2, integration_key: 'lessonpix', settings: {'template_key' => 'lessonpix'})
      bi = ButtonImage.create(:settings => {'protected' => true, 'protected_source' => 'lessonpix'})
      b = Board.create(:user => u)
      expect(b.protected_material?).to eq(false)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'image_id' => bi.global_id}
        ]
      })
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
      expect(b.settings['protected']['media_sources']).to eq(['lessonpix'])
      expect(UserIntegration.integration_keys_for(u2)).to eq(['lessonpix'])
      res = b.process({'sharing_key' => "add_deep-#{u2.user_name}"})
      expect(res).to eq(true)
      expect(b.reload.shared_with?(u2.reload)).to eq(true)
    end
  end
  
  describe "share_with" do
    it "should add sharing details to both users" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      res = b.share_with(u2)
      expect(res).to eq(true)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(UserLink.links_for(u2.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }])
      expect(u2.settings['boards_shared_with_me']).to eq(nil)
    end
    
    it "should replace an existing share setting" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      u.settings['boards_i_shared'] = {}
      u.settings['boards_i_shared'][b.global_id] = [{
        'user_id' => u2.global_id, 'hat' => true
      }]
      u.save
      u2.settings['boards_shared_with_me'] = [{
        'board_id' => b.global_id, 'cheese' => true
      }]
      u2.save
      res = b.share_with(u2)
      expect(res).to eq(true)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }])
      expect(u.settings['boards_i_shared']).not_to eq(nil)
      expect(u.settings['boards_i_shared'][b.global_id]).to eq([{
        'user_id' => u2.global_id, 'hat' => true
      }])
      expect(u2.settings['boards_shared_with_me']).to eq([{
        'board_id' => b.global_id, 'cheese' => true
      }])

      expect(UserLink.links_for(u2.reload)).to eq([
      {
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }
      ])
    end
    
    it "should error gracefully on an invalid user" do
      u = User.create
      b = Board.create(:user => u)
      expect{ b.share_with(nil) }.to raise_error("user required")
    end
    
    it "should allow sharing multiple users" do
      u = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      u5 = User.create
      b = Board.create(:user => u)
      res = b.share_with(u2)
      expect(res).to eq(true)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(UserLink.links_for(u2.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }])
      expect(u2.settings['boards_shared_with_me']).to eq(nil)
      
      res = b.share_with(u3, true)
      b = Board.find(b.id)
      u = User.find(u.id)
      expect(UserLink.links_for(u.reload).sort_by{|l| l['user_id'] }).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }, {
        'user_id' => u3.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u3.user_name,
          'pending' => false,
          'include_downstream' => true
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(UserLink.links_for(u3.reload)).to eq([{
        'user_id' => u3.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u3.user_name,
          'pending' => false,
          'include_downstream' => true
        }
      }])
      
      b.share_with(u4)
      b.share_with(u5)
      b = Board.find(b.id)
      u = User.find(u.id)
      expect(UserLink.links_for(u.reload).sort_by{|l| l['user_id'] }).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u2.user_name
        }
      }, {
        'user_id' => u3.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u3.user_name,
          'pending' => false,
          'include_downstream' => true
        }
      }, {
        'user_id' => u4.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u4.user_name
        }
      }, {
        'user_id' => u5.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'pending' => false,
          'user_name' => u5.user_name
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
    end

    it "should not get all messed up if you try to share with yourself" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      res = b.share_with(u2)
      expect(res).to eq(true)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'pending' => false
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(u2.settings['boards_shared_with_me']).to eq(nil)
      expect(UserLink.links_for(u2.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'pending' => false
        }
      }])
      
      res = b.share_with(u, true)
      b = Board.find(b.id)
      u = User.find(u.id)
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u.user_name,
          'pending' => false,
          'include_downstream' => true
        }
      }, {
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'pending' => false
        }
      }])
    end
    
    it "should set to pending if it's an editing downstream share" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      res = b.share_with(u2, true, true)
      expect(res).to eq(true)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'pending' => true,
          'include_downstream' => true,
          'allow_editing' => true
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(u2.settings['boards_shared_with_me']).to eq(nil)
      expect(UserLink.links_for(u2.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'pending' => true,
          'include_downstream' => true,
          'allow_editing' => true
        }
      }])
    end
  end
  
  describe "update_shares_for" do
    it "should call share_with with the appropriate arguments" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      res = b.share_with(u2, true, true)
      expect(res).to eq(true)
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'include_downstream' => true,
          'allow_editing' => true,
          'pending' => true
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(UserLink.links_for(u2.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'include_downstream' => true,
          'allow_editing' => true,
          'pending' => true
        }
      }])
      expect(u2.settings['boards_shared_with_me']).to eq(nil)
      
      b.update_shares_for(u2, true)
      u2.reload
      u.reload
      expect(UserLink.links_for(u.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'include_downstream' => true,
          'allow_editing' => true,
          'pending' => false
        }
      }])
      expect(u.settings['boards_i_shared']).to eq(nil)
      expect(UserLink.links_for(u2.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(b),
        'type' => 'board_share',
        'state' => {
          'sharer_id' => u.global_id,
          'sharer_user_name' => u.user_name,
          'board_key' => b.key,
          'user_name' => u2.user_name,
          'include_downstream' => true,
          'allow_editing' => true,
          'pending' => false
        }
      }])
      expect(u2.settings['boards_shared_with_me']).to eq(nil)
    end
  end
  
  describe "unshare_with" do
    it "should remove the share setting on both users" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      u.settings ||= {}
      u.settings['boards_i_shared'] = {}
      u.settings['boards_i_shared'][b.global_id] = [{
        'user_id' => u2.global_id, 'hat' => true
      }]
      u.save!
      u2.settings ||= {}
      u2.settings['boards_shared_with_me'] = [{
        'board_id' => b.global_id, 'cheese' => true
      }]
      u2.save!
      res = b.unshare_with(u2)
      expect(res).to eq(true)
      expect(u.reload.settings['boards_i_shared']).not_to eq(nil)
      expect(u.settings['boards_i_shared'][b.global_id]).to eq([])
      expect(u2.reload.settings['boards_shared_with_me']).not_to eq(nil)
      expect(u2.settings['boards_shared_with_me']).to eq([])
      expect(UserLink.count).to eq(0)
      expect(UserLink.links_for(u.reload)).to eq([])
      expect(UserLink.links_for(u2)).to eq([])
    end

    it "should error gracefully on an invalid user" do
      u = User.create
      b = Board.create(:user => u)
      expect{ b.unshare_with(nil) }.to raise_error("user required")
    end
  end
  
  describe "shared_users" do
    it "should return a list of all users the board was explicitly shared with (not deep shared)" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}
      b.save
      b2.share_with(u2)
      b.share_with(u3, true)
      
      expect(b2.shared_users.length).to eq(1)
      user = b2.shared_users[0]
      expect(user['id']).to eq(u2.global_id)
      expect(user['user_name']).to eq(u2.user_name)
      expect(user['include_downstream']).to eq(false)
    end
  end
  
  describe "shared_with?" do
    it "should not error when no user provided" do
      u = User.create
      b = Board.create(:user => u)
      expect(b.shared_with?(nil)).to eq(false)
    end
    
    it "should return true for an exact share" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b.share_with(u2)
      expect(b.shared_with?(u2)).to eq(true)
      
      b.share_with(u3, true)
      expect(b.shared_with?(u3)).to eq(true)
    end
    
    it "should return true when an upstream board was deep-shared" do
      u = User.create
      u2 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2, true)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2)).to eq(true)
      expect(b2.reload.shared_with?(u2)).to eq(true)
    end
    
    it "should return false when an upstream board was not deep-shared" do
      u = User.create
      u2 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2)).to eq(true)
      expect(b2.reload.shared_with?(u2)).to eq(false)
    end
    
    it "should return false when an upstream board by a different author was deep-shared" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u3)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2, true)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2)).to eq(true)
      expect(b2.reload.shared_with?(u2)).to eq(false)
    end
    
    it "should return false if asking about edit shares and it wasn't an edit share" do
      u = User.create
      u2 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2, true)).to eq(false)
      expect(b2.reload.shared_with?(u2, true)).to eq(false)
    end
    
    it "should return true if asking about edit shares and it's downstream of an approved downstream edit share" do
      u = User.create
      u2 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2, true, true)
      b.update_shares_for(u2, true)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2, true)).to eq(true)
      expect(b2.reload.shared_with?(u2, true)).to eq(true)
    end
    
    it "should return true if asking about edit shares and it was explicitly shared, even if still pending" do
      u = User.create
      u2 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2, true, true)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2, true)).to eq(true)
      expect(b2.reload.shared_with?(u2, true)).to eq(false)
    end
    
    it "should return false if asking about edit shares and it's downstream of a pending downstream edit share" do
      u = User.create
      u2 = User.create
      b2 = Board.create(:user => u)
      b = Board.new(:user => u)
      b.settings = {'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}
      b.save
      b.share_with(u2, true, true)
      Worker.process_queues
      
      expect(b.reload.shared_with?(u2, true)).to eq(true)
      expect(b2.reload.shared_with?(u2, true)).to eq(false)
    end
  end
  
  describe "all_shared_board_ids" do
    it "should return all shallow shares" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u3)
      b.share_with(u3)
      b2.share_with(u3)
      expect(Board.all_shared_board_ids_for(u3.reload).sort).to eq([b.global_id, b2.global_id])
    end
    
    it "should return downstream deep shares" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u2)
      b5 = Board.create(:user => u2)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b4.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b5.global_id}}]
      b4.save
      Worker.process_queues
      b.reload.share_with(u3, true)
      b4.reload.share_with(u3)
      
      expect(Board.all_shared_board_ids_for(u3.reload).sort).to eq([b.global_id, b2.global_id, b3.global_id, b4.global_id])
    end
    
    it "should not return downstream deep shares by different authors than the original upstream shared boards" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u2)
      b5 = Board.create(:user => u2)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b4.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b5.global_id}}]
      b4.save
      Worker.process_queues
      b.reload.share_with(u3, true)
      b4.reload.share_with(u3)
      
      expect(Board.all_shared_board_ids_for(u3.reload).sort).to eq([b.global_id, b3.global_id, b4.global_id])
    end
    
    it "should not return duplicates" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      Worker.process_queues
      b.reload.share_with(u3, true)
      b2.reload.share_with(u3, true)
      b3.reload.share_with(u3, true)
      
      expect(Board.all_shared_board_ids_for(u3.reload).sort).to eq([b.global_id, b2.global_id, b3.global_id])
    end
    
    it "should not return a downstream deep share by a different author even if that author shared an unrelated board" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u2)
      b5 = Board.create(:user => u2)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b4.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b5.global_id}}]
      b4.save
      Worker.process_queues
      b.reload.reload.share_with(u3, true)
      b4.reload.reload.share_with(u3)
      
      expect(Board.all_shared_board_ids_for(u3.reload).sort).to eq([b.global_id, b3.global_id, b4.global_id])
    end
    
    it "should return downstream deep shares by any of the co-authors, even if the share is pending" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      Worker.process_queues
      
      b.reload.share_with(u2.reload, true, true)
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(Board.all_shared_board_ids_for(u2.reload).sort).to eq([b.global_id, b2.global_id, b3.global_id])
    end
    
    it "should return only edit shares if specified" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b4 = Board.create(:user => u)
      Worker.process_queues      
      
      b.reload.share_with(u2, true, true)
      b4.reload.share_with(u2, true)
      expect(Board.all_shared_board_ids_for(u2.reload, true).sort).to eq([b.global_id])
    end
    
    it "should return downstream deep edit shares only if the co-author has approved the edit-share" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b4 = Board.create(:user => u)
      Worker.process_queues      
      
      b.reload.share_with(u2, true, true)
      b4.reload.share_with(u2, true)
      expect(Board.all_shared_board_ids_for(u2.reload, true).sort).to eq([b.global_id])
      b.reload.update_shares_for(u2, true)
      u2.reload
      expect(Board.all_shared_board_ids_for(u2.reload, true).sort).to eq([b.global_id, b2.global_id, b3.global_id])
    end
  end
  
  describe "shared_by?" do
    it "should return true if the user has shared the board" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b.share_with(u2)
      expect(b.shared_by?(u)).to eq(true)
    end
    
    it "should return false if the user hasn't shared the board" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      expect(b.shared_by?(u)).to eq(false)
    end
  end
  
  describe "author" do
    it "should return true if the user is the author" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      expect(b.author?(u)).to eq(true)
      expect(b.author?(u2)).to eq(false)
    end
    
    it "should return true if the user is a co-author" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, false, true)
      expect(b.author?(u)).to eq(true)
      expect(b.author?(u2)).to eq(true)
    end
    
    it "should return a list of author_ids" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, false, true)
      expect(b.author_ids.sort).to eq([u.global_id, u2.global_id])
    end
    
    it "should return a list of approved downstream editing author ids" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, false, true)
      b.share_with(u3, true, true)
      b.update_shares_for(u3, true)
      expect(b.reload.author_ids(true).sort).to eq([u.global_id, u3.global_id])
    end
  end
  
  describe "permission cache invalidating" do
    it "should invalidate the cache of all downstream boards when a board is shared" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      Worker.process_queues
      Board.where(:user_id => u.id).update_all(:updated_at => 2.weeks.ago)
      
      b.reload.share_with(u)
      expect(b.reload.updated_at).to be > 1.hour.ago
      expect(b2.reload.updated_at).to be < 1.hour.ago
      Board.where(:user_id => u.id).update_all(:updated_at => 2.weeks.ago)

      Worker.process_queues
      expect(b.reload.updated_at).to be > 1.hour.ago
      expect(b2.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache of all downstream boards when a board is unshared" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      b.share_with(u)
      Worker.process_queues
      Board.where(:user_id => u.id).update_all(:updated_at => 2.weeks.ago)
      
      b.unshare_with(u)
      expect(b.reload.updated_at).to be > 1.hour.ago
      expect(b2.reload.updated_at).to be < 1.hour.ago
      Board.where(:user_id => u.id).update_all(:updated_at => 2.weeks.ago)

      Worker.process_queues
      expect(b.reload.updated_at).to be > 1.hour.ago
      expect(b2.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache of all just-now linked boards when a new board link is added" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b3.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b4.global_id}}]
      b3.save
      Worker.process_queues
      
      Board.where(:user_id => u.id).update_all(:updated_at => 2.weeks.ago)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save      
      expect(b3.reload.updated_at).to be < 1.hour.ago
      expect(b4.reload.updated_at).to be < 1.hour.ago
      
      Worker.process_queues
      expect(b3.reload.updated_at).to be > 1.hour.ago
      expect(b4.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache of all no-longer linked boards when a board link is removed" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save      
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      b3.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b4.global_id}}]
      b3.save
      Worker.process_queues
      Worker.process_queues
      b.reload.track_downstream_boards!
      
      Board.where(:user_id => u.id).update_all(:updated_at => 2.weeks.ago)
      b.reload
      b.settings['buttons'] = []
      b.save
      expect(b3.reload.updated_at).to be < 1.hour.ago
      expect(b4.reload.updated_at).to be < 1.hour.ago
      
      Worker.process_queues
      Worker.process_queues
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      expect(b3.reload.updated_at).to be > 1.hour.ago
      expect(b4.reload.updated_at).to be > 1.hour.ago
    end
  end
  
  describe "edit-sharing" do
    it "should allow co-authors to edit and delete the shared board, but not sub-boards" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, false, true)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u3, :public => true)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}, {'id' => 2, 'load_board' => {'id' => b3.global_id}}]
      b.save
      Worker.process_queues
      Worker.process_queues
      expect(b.allows?(u.reload, 'view')).to eq(true)
      expect(b.allows?(u, 'edit')).to eq(true)
      expect(b.allows?(u, 'delete')).to eq(true)
      expect(b.allows?(u, 'share')).to eq(true)
      expect(b.allows?(u2.reload, 'view')).to eq(true)
      expect(b.allows?(u2, 'edit')).to eq(true)
      expect(b.allows?(u2, 'delete')).to eq(true)
      expect(b.allows?(u2, 'share')).to eq(true)
      expect(b2.allows?(u, 'view')).to eq(true)
      expect(b2.allows?(u, 'edit')).to eq(true)
      expect(b2.allows?(u, 'delete')).to eq(true)
      expect(b2.allows?(u, 'share')).to eq(true)
      expect(b2.allows?(u2, 'view')).to eq(false)
      expect(b2.allows?(u2, 'edit')).to eq(false)
      expect(b2.allows?(u2, 'delete')).to eq(false)
      expect(b2.allows?(u2, 'share')).to eq(false)
      expect(b3.allows?(u, 'view')).to eq(true)
      expect(b3.allows?(u, 'edit')).to eq(false)
      expect(b3.allows?(u, 'delete')).to eq(false)
      expect(b3.allows?(u, 'share')).to eq(false)
      expect(b3.allows?(u2, 'view')).to eq(true)
      expect(b3.allows?(u2, 'edit')).to eq(false)
      expect(b3.allows?(u2, 'delete')).to eq(false)
      expect(b3.allows?(u2, 'share')).to eq(false)
    end
    
    it "should allow co-authors to edit and delete the shared board and sub-boards if allowed" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, true, true)
      b.update_shares_for(u2, true)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.save
      Worker.process_queues
      Worker.process_queues
      expect(b.allows?(u.reload, 'view')).to eq(true)
      expect(b.allows?(u, 'edit')).to eq(true)
      expect(b.allows?(u, 'delete')).to eq(true)
      expect(b.allows?(u, 'share')).to eq(true)
      expect(b.allows?(u2.reload, 'view')).to eq(true)
      expect(b.allows?(u2, 'edit')).to eq(true)
      expect(b.allows?(u2, 'delete')).to eq(true)
      expect(b.allows?(u2, 'share')).to eq(true)
      expect(b2.allows?(u, 'view')).to eq(true)
      expect(b2.allows?(u, 'edit')).to eq(true)
      expect(b2.allows?(u, 'delete')).to eq(true)
      expect(b2.allows?(u, 'share')).to eq(true)
      expect(b2.allows?(u2, 'view')).to eq(true)
      expect(b2.allows?(u2, 'edit')).to eq(true)
      expect(b2.allows?(u2, 'delete')).to eq(true)
      expect(b2.allows?(u2, 'share')).to eq(true)
    end
    
    it "should not allow me to edit-share and then magically have edit permission on the other person's boards" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2, :public => true)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      RemoteAction.process_all
      Worker.process_queues
      b2.reload
      expect(Board.all_shared_board_ids_for(u.reload, true)).to eq([])
      expect(Board.all_shared_board_ids_for(u2.reload, true)).to eq([])
      expect(b2.allows?(u, 'view')).to eq(true)
      expect(b2.allows?(u, 'edit')).to eq(false)
      expect(b.allows?(u2, 'edit')).to eq(false)
      
      # u shares with u2 (pending)
      b.reload.share_with(u2, true, true)
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      b2.reload
      expect(Board.all_shared_board_ids_for(u.reload, true)).to eq([b.global_id])
      expect(Board.all_shared_board_ids_for(u2.reload, true)).to eq([b.global_id])
      u2.reload
      u.reload
      expect(b2.allows?(u, 'view')).to eq(true)
      expect(b2.allows?(u, 'edit')).to eq(false)
      expect(b.allows?(u2, 'edit')).to eq(true)

      # u2 accept share (allowing u downstream access)
      b.reload.update_shares_for(u2.reload, true)
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      b.reload.track_downstream_boards!
      b2.reload
      expect(Board.all_shared_board_ids_for(u.reload, true)).to eq([b.global_id, b2.global_id])
      expect(Board.all_shared_board_ids_for(u2.reload, true)).to eq([b.global_id, b2.global_id])
      expect(b.reload.shared_with?(u2, true)).to eq(true)
      u2.reload
      u.reload
      u.update_available_boards
      expect(b2.reload.allows?(u, 'view')).to eq(true)
      expect(u.can_edit?(b2)).to eq(true)
      expect(b2.allows?(u, 'edit')).to eq(true)
    end
    
    it "if I share a board with a co-author, and then with one of my supervisees, and the co-author links to one of their boards which links to another of my boards, the supervisee should have access to all three boards" do
      u = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      u5 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, true, true)
      b2 = Board.create(:user => u2)
      b4 = Board.create(:user => u3)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}, {'id' => 1, 'load_board' => {'id' => b4.global_id}}]
      b.save
      b3 = Board.create(:user => u)
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      expect(UserLink.count).to eq(1)
      User.link_supervisor_to_user(u, u4)
      expect(UserLink.count).to eq(2)
      b.share_with(u4, true, false)
      Worker.process_queues

      expect(b4.public).to eq(false)
      expect(b4.user).to eq(u3)
      expect(b4.user.edit_permission_for?(u)).to eq(false)
      expect(b4.user.allows?(u, 'edit')).to eq(false)
      expect(b4.shared_with?(u)).to eq(false)
      expect(b4.allows?(u, 'view')).to eq(false)
      expect(b4.allows?(u4, 'view')).to eq(false)
    end

    it "if I share a board with a co-author, and then with one of my supervisees, and the co-author links to one of their boards which links to another of my boards, the supervisee's other supervisors should have access to all three boards" do
      u = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      u5 = User.create
      b = Board.create(:user => u)
      b.share_with(u2, true, true)
      b2 = Board.create(:user => u2)
      b4 = Board.create(:user => u3)
      b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}, {'id' => 1, 'load_board' => {'id' => b4.global_id}}]
      b.save
      b3 = Board.create(:user => u)
      b2.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b3.global_id}}]
      b2.save
      User.link_supervisor_to_user(u, u4)
      b.share_with(u4, true, false)
      Worker.process_queues
      Worker.process_queues
      expect(b.allows?(u.reload, 'view')).to eq(true)
      expect(b.allows?(u4.reload, 'view')).to eq(true)
      expect(b.allows?(u5.reload, 'view')).to eq(false)
      expect(b2.allows?(u, 'view')).to eq(true)
      expect(b2.allows?(u4, 'view')).to eq(true)
      expect(b2.allows?(u5, 'view')).to eq(false)
      expect(b3.allows?(u, 'view')).to eq(true)
      expect(b3.allows?(u4, 'view')).to eq(true)
      expect(b3.allows?(u5, 'view')).to eq(false)
      expect(b4.allows?(u, 'view')).to eq(false)
      expect(b4.allows?(u4, 'view')).to eq(false)
      expect(b4.allows?(u5, 'view')).to eq(false)

      User.link_supervisor_to_user(u5, u4)
      Worker.process_queues
      expect(b.allows?(u.reload, 'view')).to eq(true)
      expect(b.allows?(u4.reload, 'view')).to eq(true)
      expect(b.allows?(u5.reload, 'view')).to eq(true)
      expect(b2.allows?(u, 'view')).to eq(true)
      expect(b2.allows?(u4, 'view')).to eq(true)
      expect(b2.allows?(u5, 'view')).to eq(true)
      expect(b3.allows?(u, 'view')).to eq(true)
      expect(b3.allows?(u4, 'view')).to eq(true)
      expect(b3.allows?(u5, 'view')).to eq(true)
      expect(b4.allows?(u, 'view')).to eq(false)
      expect(b4.allows?(u4, 'view')).to eq(false)
      expect(b4.allows?(u5, 'view')).to eq(false)
    end
  end
end
