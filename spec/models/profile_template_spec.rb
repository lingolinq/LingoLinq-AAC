require 'spec_helper'

describe ProfileTemplate, :type => :model do
  describe "generate_defaults" do
    it "should generate default values" do
      pt = ProfileTemplate.new
      pt.generate_defaults
      expect(pt.settings).to_not eq(nil)
      expect(pt.settings['profile']).to eq({})
      expect(pt.settings['public']).to eq(false)
      expect(pt.public_profile_id).to eq(nil)
    end

    it "should clear public_profile_id for private templates" do
      pt = ProfileTemplate.new(settings: {'public' => true}, public_profile_id: 123)
      pt.generate_defaults
      expect(pt.settings).to_not eq(nil)
      expect(pt.settings['profile']).to eq({})
      expect(pt.settings['public']).to eq(true)
      expect(pt.public_profile_id).to eq('123')
      pt.settings['public'] = false
      pt.generate_defaults
      expect(pt.settings).to_not eq(nil)
      expect(pt.settings['profile']).to eq({})
      expect(pt.settings['public']).to eq(false)
      expect(pt.public_profile_id).to eq(nil)
    end
  end

  describe "static_template" do
    it "should return nil for unknown type" do
      expect(ProfileTemplate.static_template('asdf')).to eq(nil)
    end

    it "should return unsaved template for known profile_id" do
      pt = ProfileTemplate.static_template('cole')
      expect(pt).to be_is_a(ProfileTemplate)
      expect(pt.public_profile_id).to eq('cole')
      expect(pt.settings['public']).to eq(true)
      expect(pt.settings['profile']['name']).to eq("COLE - LCPS Continuum Of Language Expression")
    end
  end

  describe "find_by_code" do
    it "should search by public_profile_id" do
      expect(ProfileTemplate.find_by_code(nil)).to eq(nil)
      pt = ProfileTemplate.create(public_profile_id: 'bacon', settings: {'public' => true, 'profile' => {}})
      expect(ProfileTemplate.find_by_code('whatever')).to eq(nil)
      expect(ProfileTemplate.find_by_code('bacon')).to eq(pt)
    end

    it "should search by protected global id" do
      expect(ProfileTemplate.find_by_code(nil)).to eq(nil)
      pt = ProfileTemplate.create(public_profile_id: 'bacon', settings: {'public' => true, 'profile' => {}})
      expect(ProfileTemplate.find_by_code('whatever')).to eq(nil)
      expect(ProfileTemplate.find_by_code('bacon')).to eq(pt)
      expect(ProfileTemplate.find_by_code(pt.global_id)).to eq(pt)
      pt2 = ProfileTemplate.create(settings: {'public' => false, 'profile' => {}})
      expect(ProfileTemplate.find_by_code(pt2.global_id)).to eq(pt2)
    end
  end

  describe "same_profile?" do
    it "should treat public_profile_id and global id as the same template" do
      pt = ProfileTemplate.create(public_profile_id: 'bacon', settings: {'public' => true, 'profile' => {}})
      expect(ProfileTemplate.same_profile?('bacon', pt.global_id, 'communicator')).to eq(true)
      expect(ProfileTemplate.same_profile?(pt.global_id, 'bacon', 'communicator')).to eq(true)
    end
  end

  describe "permissions" do
    it "should allow anyone to view a public template" do
      pt = ProfileTemplate.create(settings: {'public' => true})
      expect(pt.permissions_for(nil)).to eq({'user_id' => nil, 'view' => true})
    end

    it "should allow the author to edit and delete, even if private" do
      u = User.create
      u2 = User.create
      pt = ProfileTemplate.create(user: u)
      expect(pt.permissions_for(nil)).to eq({'user_id' => nil})
      expect(pt.permissions_for(u2)).to eq({'user_id' => u2.global_id})
      expect(pt.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true, 'delete' => true})
    end

    it "should allow a connected org to edit, even if private" do
      u = User.create
      u2 = User.create
      o = Organization.create
      o.add_manager(u.user_name)
      o.add_supervisor(u2.user_name, false)
      pt = ProfileTemplate.create(organization: o)
      expect(pt.permissions_for(nil)).to eq({'user_id' => nil})
      expect(pt.permissions_for(u2)).to eq({'user_id' => u2.global_id})
      expect(pt.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true})
    end
  end

  describe "process" do
    it "should set public setting if valid" do
      pt = ProfileTemplate.process_new({'public' => true})
      expect(pt.settings['public']).to eq(true)
      pt = ProfileTemplate.process_new({'public' => false})
      expect(pt.settings['public']).to eq(false)
      u = User.create
      o = Organization.create
      pt = ProfileTemplate.process_new({'public' => false}, {'user' => u, 'organization' => o})
      expect(pt.user).to eq(u)
      expect(pt.organization).to eq(o)
    end

    it "should not allow setting a public_profile_id that already exists" do
      pt = ProfileTemplate.create(public_profile_id: 'treasure', settings: {'public' => true})
      pt2 = ProfileTemplate.process_new('profile_id' => 'treasure', 'public' => true)
      expect(pt2.processing_errors).to eq(["profile_id \"treasure\" already in use"])
    end

    it "should set profile data" do
      pt = ProfileTemplate.process_new({'public' => true, 'profile' => {'a' => 1, 'b' => '2'}})
      expect(pt.settings['public']).to eq(true)
      expect(pt.settings['profile']).to eq({'a' => 1, 'b' => '2'})
    end    
  end

  describe "self.default_profile_id" do
    it "should return based on env settings" do
      expect(ENV).to receive('[]').with('DEFAULT_BACON_PROFILE_ID').and_return("cheese")
      expect(ProfileTemplate.default_profile_id('bacon')).to eq('cheese')
    end
  end
end
