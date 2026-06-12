require 'spec_helper'

describe Permissions, :type => :model do
  class FakeRecord
    include Permissions
    attr_accessor :id
    attr_accessor :name
    attr_accessor :updated_at
    cattr_accessor :calls
  end
  
  before(:each) do
    FakeRecord.permissions_lookup = []
    FakeRecord.calls = []
  end
  
  describe "add_permissions" do
    it "should allow adding permissions" do
      permissions = FakeRecord.permissions_lookup.length
      FakeRecord.add_permissions('jump', 'hop', 'skip'){ true }
      expect(FakeRecord.permissions_lookup.length).to eq(permissions + 1)
      expect(FakeRecord.permissions_lookup[-1][0]).to eq(["jump", "hop", "skip"])
      expect(FakeRecord.permissions_lookup[-1][1]).not_to eq(nil)
    end
  end

  describe "allows?" do
    it "should check permissions" do
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check"; true }
      expect(FakeRecord.permissions_lookup.length).to eq(1)
      r = FakeRecord.new
      expect(r.allows?(nil, "jump")).to eq(true)
      expect(r.allows?(nil, "jumping")).to eq(false)
      expect(FakeRecord.calls).to eq(["jump_check"])
    end

    it "should check each permissions until it finds a match" do
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check"; false }
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check2"; true }
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check3"; true }
      expect(FakeRecord.permissions_lookup.length).to eq(3)
      r = FakeRecord.new
      expect(r.allows?(nil, "jump")).to eq(true)
      expect(FakeRecord.calls).to eq(["jump_check", "jump_check2"])
    end
    
    it "should not call checks that expect a user unless there actually is a user argument" do
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check"; false }
      FakeRecord.add_permissions('jump'){|u| FakeRecord.calls << "jump_check2"; true }
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check3"; false }
      expect(FakeRecord.permissions_lookup.length).to eq(3)
      r = FakeRecord.new
      expect(r.allows?(nil, "jump")).to eq(false)
      expect(FakeRecord.calls).to eq(["jump_check", "jump_check3"])
    end
  end
  
  describe "permissions_for" do
    it "should return a list of permissions" do
      FakeRecord.add_permissions('jump'){ true }
      FakeRecord.add_permissions('hop'){ true }
      FakeRecord.add_permissions('skip'){ false }
      expect(FakeRecord.permissions_lookup.length).to eq(3)
      r = FakeRecord.new
      expect(r.permissions_for(nil)).to eq({"user_id" => nil, "jump" => true, "hop" => true})
    end
    
    it "shouldn't call checks that expect a user unless a user argument is provided" do
      FakeRecord.add_permissions('jump'){ true }
      FakeRecord.add_permissions('hop'){|u| true }
      FakeRecord.add_permissions('skip'){ false }
      expect(FakeRecord.permissions_lookup.length).to eq(3)
      r = FakeRecord.new
      expect(r.permissions_for(nil)).to eq({"user_id" => nil, "jump" => true})
      expect(r.permissions_for(User.new)).to eq({"user_id" => nil, "jump" => true, "hop" => true})
    end
    
    it "should skip checks that include all permissions already discovered" do
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check"; true }
      FakeRecord.add_permissions('jump'){ FakeRecord.calls << "jump_check2"; true }
      r = FakeRecord.new
      expect(r.permissions_for(nil)).to eq({"user_id" => nil, "jump" => true})
      expect(FakeRecord.calls).to eq(["jump_check"])

      FakeRecord.calls = []
      FakeRecord.add_permissions('skip'){ FakeRecord.calls << "skip_check"; true }
      FakeRecord.add_permissions('skip'){ FakeRecord.calls << "skip_check2"; true }
      expect(r.permissions_for(nil)).to eq({"user_id" => nil, "jump" => true, "skip" => true})
      expect(FakeRecord.calls).to eq(["jump_check", "skip_check"])

      FakeRecord.calls = []
      FakeRecord.add_permissions('hop'){|u| FakeRecord.calls << "hop_check"; true }
      FakeRecord.add_permissions('hop'){ FakeRecord.calls << "hop_check2"; true }
      expect(r.permissions_for(nil)).to eq({"user_id" => nil, "jump" => true, "skip" => true, "hop" => true})
      expect(FakeRecord.calls).to eq(["jump_check", "skip_check", "hop_check2"])
    end
    
    it "should handle checks that have multiple overlapping permissions" do
      FakeRecord.add_permissions('jump', 'skip'){ FakeRecord.calls << "jump_skip"; true }
      FakeRecord.add_permissions('jump', 'hop'){ FakeRecord.calls << "jump_hop"; true }
      FakeRecord.add_permissions('leap'){ FakeRecord.calls << "leap"; true }
      FakeRecord.add_permissions('hop', 'skip'){ FakeRecord.calls << "hop_skip"; true }
      r = FakeRecord.new
      expect(r.permissions_for(nil)).to eq({"user_id" => nil, "jump" => true, "skip" => true, "hop" => true, "leap" => true})
      expect(FakeRecord.calls).to eq(["jump_skip", "jump_hop", "leap"])
    end
  end
  
  describe "cache_key" do
    it "should not require a parameter" do
      u = User.create
      expect(u.cache_key).to eq("User#{u.id}-#{u.updated_at.to_f}:#{RedisInit.cache_token}")
    end
    
    it "should append a passed parameter" do
      u = User.create
      expect(u.cache_key('bacon')).to eq("bacon/User#{u.id}-#{u.updated_at.to_f}:#{RedisInit.cache_token}")
    end
    
    it "should return nil on an unsaved record" do
      u = User.new(:updated_at => Time.now)
      expect(u.cache_key).to eq("Usernil-#{u.updated_at.to_f}:#{RedisInit.cache_token}")
    end
  end
  
  describe "scopes" do
    it "should limit allows? permissions based on scopes" do
      u = User.create
      g = UserGoal.create(:user => u)
      edit = 'edit'
      view = 'view'
      expect(u.allows?(u, 'edit')).to eq(true)
      expect(u.allows?(u, 'edit', ['*'])).to eq(false)
      expect(u.allows?(u, 'view_detailed', ['*'])).to eq(true)
      expect(u.allows?(u, 'edit', ['read_profile'])).to eq(false)
      expect(u.allows?(u, 'view_detailed', ['read_profile'])).to eq(true)
      expect(u.allows?(u, 'edit', ['full'])).to eq(true)
      expect(u.allows?(u, 'set_goals', ['read_profile'])).to eq(true)
      expect(u.allows?(u, 'set_goals', ['*'])).to eq(false)

      expect(g.allows?(u, view)).to eq(true)
      expect(view.instance_variable_get('@scope_rejected')).to eq(false)
      expect(g.allows?(u, edit)).to eq(true)
      expect(edit.instance_variable_get('@scope_rejected')).to eq(false)
      expect(g.allows?(u, view, ['read_profile'])).to eq(true)
      expect(view.instance_variable_get('@scope_rejected')).to eq(false)
      expect(g.allows?(u, edit, ['read_profile'])).to eq(false)
      expect(edit.instance_variable_get('@scope_rejected')).to eq(true)
      expect(g.allows?(u, view, ['full'])).to eq(true)
      expect(view.instance_variable_get('@scope_rejected')).to eq(false)
      expect(g.allows?(u, edit, ['full'])).to eq(true)
      expect(edit.instance_variable_get('@scope_rejected')).to eq(false)
    end
    
    it "should limit permissions_for permissions based on scopes" do
      u = User.create
      g = UserGoal.create(:user => u)
      u2 = User.create
      expect(u.permissions_for(u)).to eq({'user_id' => u.global_id, 'link_auth' => true, 'view_existence' => true, 'view_detailed' => true, 'view_word_map' => true, 'view_deleted_boards' => true, 'supervise' => true, 'model' => true, 'edit' => true, 'edit_boards' => true, 'manage_supervision' => true, 'delete' => true, 'set_goals' => true})
      expect(u.permissions_for(u, ['*'])).to eq({'user_id' => u.global_id, 'link_auth' => false, 'view_existence' => true, 'view_detailed' => true, 'view_word_map' => true, 'view_deleted_boards' => true, 'supervise' => false, 'model' => false, 'edit' => false, 'edit_boards' => false, 'manage_supervision' => false, 'delete' => false, 'set_goals' => false})
      expect(u.permissions_for(u, ['*', 'read_profile'])).to eq({'user_id' => u.global_id, 'link_auth' => false, 'view_existence' => true, 'view_word_map' => true, 'view_detailed' => true, 'view_deleted_boards' => true, 'supervise' => false, 'model' => false, 'edit' => false, 'edit_boards' => false, 'manage_supervision' => false, 'delete' => false, 'set_goals' => true})
      expect(u.permissions_for(u, ['*', 'read_profile', 'full'])).to eq({'user_id' => u.global_id, 'link_auth' => true, 'view_existence' => true, 'view_word_map' => true, 'view_detailed' => true, 'view_deleted_boards' => true, 'supervise' => true, 'model' => true, 'edit' => true, 'edit_boards' => true, 'manage_supervision' => true, 'delete' => true, 'set_goals' => true})
      
      expect(g.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true, 'comment' => true})
      expect(g.permissions_for(u2)).to eq({'user_id' => u2.global_id})
      expect(g.permissions_for(u, ['read_profile', '*'])).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => false, 'comment' => false})
      expect(g.permissions_for(u, ['full'])).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true, 'comment' => true})
    end
  end
end
