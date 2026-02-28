require 'spec_helper'

describe User, :type => :model do
  describe "paper trail" do
    it "should make sure paper trail is doing its thing"
  end
  
  describe "permissions" do
    it "should always allow view_existence for valid (not deleted) users" do
      u = User.create
      u2 = User.new
      expect(u.allows?(nil, 'view_existence')).to eq(true)
      expect(u.allows?(u, 'view_existence')).to eq(true)
      expect(u.allows?(u2, 'view_existence')).to eq(true)
    end
    
    it "should allow view_detailed if public or self" do
      u = User.create
      u2 = User.new
      expect(u.allows?(nil, 'view_detailed')).to eq(false)
      expect(u.allows?(u, 'view_detailed')).to eq(true)
      expect(u.allows?(u2, 'view_detailed')).to eq(false)
      u.settings['public'] = true
      u.updated_at = Time.now
      expect(u.allows?(nil, 'view_detailed')).to eq(true)
      expect(u.allows?(u, 'view_detailed')).to eq(true)
      expect(u.allows?(u2, 'view_detailed')).to eq(true)
    end
    
    it "should allow edit if self" do
      u = User.create
      u2 = User.new
      expect(u.allows?(nil, 'edit')).to eq(false)
      expect(u.allows?(u, 'edit')).to eq(true)
      expect(u.allows?(u2, 'edit')).to eq(false)
      u.settings['public'] = true
      u.updated_at = Time.now
      expect(u.allows?(nil, 'edit')).to eq(false)
      expect(u.allows?(u, 'edit')).to eq(true)
      expect(u.allows?(u2, 'edit')).to eq(false)
    end

    it "should limit permissions if self but valet_mode" do
      u = User.create
      expect(u.valet_mode?).to eq(false)
      expect(u.allows?(u, 'view_detailed')).to eq(true)
      expect(u.allows?(u, 'edit')).to eq(true)
      expect(u.allows?(u, 'supervise')).to eq(true)
      expect(u.allows?(u, 'model')).to eq(true)
      expect(u.allows?(u, 'delete')).to eq(true)
      expect(u.allows?(u, 'view_existence')).to eq(true)
      u.assert_valet_mode!
      expect(u.valet_mode?).to eq(true)
      expect(u.allows?(u, 'view_detailed', ['full', 'modeling'])).to eq(true)
      expect(u.allows?(u, 'edit', ['full', 'modeling'])).to eq(false)
      expect(u.allows?(u, 'supervise', ['full', 'modeling'])).to eq(false)
      expect(u.allows?(u, 'model', ['full', 'modeling'])).to eq(true)
      expect(u.allows?(u, 'delete', ['full', 'modeling'])).to eq(false)
      expect(u.allows?(u, 'view_existence', ['full', 'modeling'])).to eq(true)
    end

    it "should match correct permissions for different supervisor types" do
      u = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      User.link_supervisor_to_user(u2, u, nil, 'read_only')
      User.link_supervisor_to_user(u3, u, nil, 'edit')
      User.link_supervisor_to_user(u4, u, nil, 'modeling_only')
      
      expect(u2.reload.supervisor_for?(u.reload)).to eq(true)
      expect(u2.modeling_only_for?(u)).to eq(false)
      perms = u.reload.permissions_for(u2.reload)
      expect(perms['edit']).to eq(nil)
      expect(perms['supervise']).to eq(true)
      expect(perms['model']).to eq(true)

      expect(u3.reload.supervisor_for?(u.reload)).to eq(true)
      expect(u3.modeling_only_for?(u)).to eq(false)
      perms = u.reload.permissions_for(u3.reload)
      expect(perms['edit']).to eq(true)
      expect(perms['supervise']).to eq(true)
      expect(perms['model']).to eq(true)

      expect(u4.reload.supervisor_for?(u.reload)).to eq(true)
      expect(u4.modeling_only_for?(u)).to eq(true)
      perms = u.reload.permissions_for(u4.reload)
      expect(perms['edit']).to eq(nil)
      expect(perms['supervise']).to eq(nil)
      expect(perms['model']).to eq(true)
    end

    it "should allow managers (but not assistants) to supervise communicators in the organization" do
      u = User.create
      u2 = User.create
      u3 = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(u2.user_name, true)
      o.add_manager(u3.user_name, false)
      o.add_user(u.user_name, false, true)
      u.reload
      u2.reload
      expect(Organization.manager_for?(u2, u, true)).to eq(true)
      expect(Organization.manager_for?(u3, u, true)).to eq(false)

      perms = u.reload.permissions_for(u2.reload)
      expect(perms['edit']).to eq(true)
      expect(perms['supervise']).to eq(true)
      expect(perms['model']).to eq(true)

      perms = u.reload.permissions_for(u3.reload)
      expect(perms['edit']).to eq(nil)
      expect(perms['supervise']).to eq(nil)
      expect(perms['model']).to eq(nil)
    end

    it "should not allow managers to retrieve pending user information in their org" do
      u = User.create
      u2 = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(u2.user_name, true)
      o.add_user(u.user_name, true, false)
      u.reload
      u2.reload
      expect(Organization.manager_for?(u2, u, true)).to eq(false)

      perms = u.reload.permissions_for(u2.reload)
      expect(perms['edit']).to eq(nil)
      expect(perms['supervise']).to eq(nil)
      expect(perms['model']).to eq(nil)
    end
    
    it "should only allow managers view_deleted_boards" do
      u = User.create
      u2 = User.create
      expect(u.allows?(u2, 'view_deleted_boards')).to eq(false)
      User.link_supervisor_to_user(u2, u)
      expect(u.allows?(u2, 'view_deleted_boards')).to eq(true)
      
      u3 = User.create
      o = Organization.create(:admin => true)
      o.add_manager(u3.user_name, true)
      expect(u.allows?(u3.reload, 'view_deleted_boards')).to eq(true)
    end

    it "should not allow modeling-only supervisors to do as much" do
      u = User.create
      u2 = User.create
      u2.settings['preferences']['role'] = 'supporter'
      u2.save
      u2.reload
      expect(u2.billing_state).to eq(:trialing_supporter)
      expect(u2.premium_supporter?).to eq(true)
      User.link_supervisor_to_user(u2, u)
      perms = u.permissions_for(u2)
      expect(perms['edit']).to eq(true)
      expect(perms['edit_boards']).to eq(true)
      expect(perms['manage_supervision']).to eq(true)
      expect(perms['model']).to eq(true)
      expect(perms['set_goals']).to eq(true)
      expect(perms['view_deleted_boards']).to eq(true)
      expect(perms['view_word_map']).to eq(true)
      expect(perms['view_detailed']).to eq(true)

      u2.expires_at = 2.days.ago
      u2.save
      expect(u2.billing_state).to eq(:modeling_only)
      expect(u2.premium_supporter?).to eq(false)
      expect(u2.modeling_only?).to eq(true)
      perms = u.reload.permissions_for(u2.reload)
      expect(perms['edit']).to eq(nil)
      expect(perms['edit_boards']).to eq(nil)
      expect(perms['manage_supervision']).to eq(nil)
      expect(perms['model']).to eq(true)
      expect(perms['set_goals']).to eq(nil)
      expect(perms['view_deleted_boards']).to eq(nil)
      expect(perms['view_word_map']).to eq(true)
      expect(perms['view_detailed']).to eq(true)
    end
  end
  
  describe "permissions cache" do
    it "should invalidate the cache when a supervisor is added" do
      sup = User.create
      user = User.create
      User.where(:id => [user.id, sup.id]).update_all(:updated_at => 2.months.ago)
      expect(user.reload.updated_at).to be < 1.hour.ago
      User.link_supervisor_to_user(sup, user)
      expect(user.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache when a supervisor is removed" do
      sup = User.create
      user = User.create
      User.link_supervisor_to_user(sup, user)
      User.where(:id => [user.id, sup.id]).update_all(:updated_at => 2.months.ago)
      expect(user.reload.updated_at).to be < 1.hour.ago
      User.unlink_supervisor_from_user(sup, user)
      expect(user.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache when a supervisee is added" do
      sup = User.create
      user = User.create
      User.where(:id => [user.id, sup.id]).update_all(:updated_at => 2.months.ago)
      expect(sup.reload.updated_at).to be < 1.hour.ago
      User.link_supervisor_to_user(sup, user)
      expect(sup.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache when a supervisee is removed" do
      sup = User.create
      user = User.create
      User.link_supervisor_to_user(sup, user)
      User.where(:id => [user.id, sup.id]).update_all(:updated_at => 2.months.ago)
      expect(sup.reload.updated_at).to be < 1.hour.ago
      User.unlink_supervisor_from_user(sup, user)
      expect(sup.reload.updated_at).to be > 1.hour.ago
    end
  end
  
  describe "session_duration" do
    it "should return the default unless overridden" do
      expect(User).to be_respond_to(:default_log_session_duration)
      u = User.new
      u.settings = {}
      expect(u.log_session_duration).to eq(User.default_log_session_duration)
      u.settings['preferences'] = {'log_session_duration' => 104}
      expect(u.log_session_duration).to eq(104)
      u.settings['preferences'] = {'log_session_duration' => 106}
      expect(u.log_session_duration).to eq(106)
    end
  end
  
  describe "named_email" do
    it "should return a named email" do
      u = User.new
      u.generate_defaults
      u.settings['email'] = "bob@yahoo.com"
      expect(u.named_email).to eq("No name <bob@yahoo.com>")
    end
  end

  describe "registration_code" do
    it "should generate a registration code if it doesn't exist yet" do
      u = User.new
      c = u.registration_code
      expect(c).not_to eq(nil)
      expect(c.length).to eq(24)
      expect(u.registration_code).to eq(c)
    end
    
    it "should return the existing code if it exists" do
      u = User.new(:settings => {'registration_code' => '123wer'})
      expect(u.registration_code).to eq('123wer')
      expect(u.registration_code).to eq('123wer')
    end
  end

  describe "generate_defaults" do
    it "should generate expected defaults" do
      u = User.new
      u.generate_defaults
      expect(u.settings['name']).not_to eq(nil)
      expect(u.settings['preferences']).not_to eq(nil)
      expect(u.settings['preferences']['devices']['default']).to eq({
        'name' => 'Web browser for Desktop',
        'utterance_text_only' => false,
        'voice' => {'pitch' => 1.0, 'volume' => 1.0},
        'button_spacing' => 'small',
        'button_border' => 'small',
        'button_text' => 'medium',
        'button_text_position'=> 'top',
        'vocalization_height' => 'small',
        'wakelock' => true
      })
      expect(u.settings['preferences']['activation_location']).to eq('end')
      expect(u.settings['preferences']['logging']).to eq(false)
      expect(u.settings['preferences']['geo_logging']).to eq(false)
      expect(u.settings['preferences']['auto_home_return']).to eq(true)
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(true)
      expect(u.user_name).to eq("no-name")
      expect(u.email_hash).not_to eq(nil)
    end
    
    it "should not override existing values" do
      u = User.new
      u.settings = {}
      u.settings['name'] = "Bob Miller"
      u.settings['preferences'] = {'devices' => {'default' => {
        'name' => 'not_browser',
        'voice' => {'pitch' => 2.0, 'volume' => 2.0},
        'auto_home_return' => false
      }}}
      u.generate_defaults
      expect(u.settings['name']).not_to eq(nil)
      expect(u.settings['preferences']).not_to eq(nil)
      expect(u.settings['preferences']['devices']['default']).to eq({
        'name' => 'not_browser',
        'utterance_text_only' => false,
        'voice' => {'pitch' => 2.0, 'volume' => 2.0},
        'auto_home_return' => false,
        'button_spacing' => 'small',
        'button_border' => 'small',
        'button_text' => 'medium',
        'button_text_position' => 'top',
        'vocalization_height' => 'small',
        'wakelock' => true
      })
      expect(u.user_name).to eq("bob-miller")
      expect(u.email_hash).not_to eq(nil)
      expect(u.settings['preferences']['activation_location']).to eq('end')
      u.settings['preferences']['devices']['default']['voice'] = nil
      u.generate_defaults
      expect(u.settings['preferences']['devices']['default']['voice']['pitch']).to eq(1.0)
    end
    
    it "should clear expected attributes for non-communicator role" do
      u = User.new
      u.generate_defaults
      expect(u.settings['preferences']).not_to eq(nil)
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(true)
      u.settings['preferences']['role'] = 'supporter'
      u.generate_defaults
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(nil)
    end
    
    it "should restore attributes when returned to communicator role" do
      u = User.new
      u.generate_defaults
      expect(u.settings['preferences']).not_to eq(nil)
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(true)

      u.settings['preferences']['role'] = 'supporter'
      u.generate_defaults
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(nil)

      u.settings['preferences']['role'] = 'communicator'
      u.generate_defaults
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(true)
    end
    
    it "should set word_suggestion_images to the correct default based on signup date" do
      u = User.new
      u.generate_defaults
      expect(u.settings['preferences']['word_suggestion_images']).to eq(true)
      
      u = User.new
      u.created_at = Date.parse('Jan 1, 2000')
      u.generate_defaults
      expect(u.settings['preferences']['word_suggestion_images']).to eq(false)
      
      u = User.new
      u.created_at = Date.parse('Feb 1, 2017')
      u.generate_defaults
      expect(u.settings['preferences']['word_suggestion_images']).to eq(true)
    end
  end

  describe "generate_email_hash" do
    it "should generate a hash for any value" do
      expect(User.generate_email_hash(nil)).to eq("334c4a4c42fdb79d7ebc3e73b517e6f8")
      expect(User.generate_email_hash("")).to eq("d41d8cd98f00b204e9800998ecf8427e")
      expect(User.generate_email_hash(123)).to eq("202cb962ac59075b964b07152d234b70")
      expect(User.generate_email_hash("bob@yahoo.com")).to eq("ff38ca9b84b9f5acd849848f5dbeb1bf")
    end
  end

  describe "track_boards" do
    it "should schedule a background job by default" do
      u = User.create
      u.instance_variable_set('@do_track_boards', true)
      expect(u.track_boards(nil, 123)).to eq(true)
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {'id' => u.id, 'method' => 'track_boards', 'arguments' => [true, 123]})).to eq(true)
    end
    
    it "should delete orphan connections" do
      u = User.create
      UserBoardConnection.create(:user_id => u.id, :board_id => 123)
      expect(UserBoardConnection.count).to eq(1)
      u.track_boards(true)
      expect(UserBoardConnection.count).to eq(0)
    end
    
    it "should trigger board updates for orphan connections" do
      u = User.create
      b = Board.create(:user => u)
      UserBoardConnection.create(:user_id => u.id, :board_id => b.id)
      o = [b]
      expect(Board).to receive(:where).with(:id => [b.id]).and_return(o)
      expect(o).to receive(:select).with('id').and_return([b])
      u.track_boards(true)
      s = JobStash.last
      expect(Worker.scheduled_for?(:slow, Board, :perform_action, {'method' => 'refresh_stats', 'arguments' => [{'stash' => s.global_id}, Time.now.to_i]})).to eq(true)
      expect(s.data).to eq([b.global_id])
    end

    it "should trigger board updates for updated home_board" do
      u = User.create(settings: {'preferences' => {'home_board' => {'id' => 'asdf'}}})
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id}}
      ]
      b.save
      expect(b.settings['immediately_downstream_board_ids']).to eq([b2.global_id])
      Worker.process_queues
      b.reload
      expect(b.settings['downstream_board_ids']).to eq([b2.global_id])

      o = [b]
      UserBoardConnection.create(:user_id => u.id, :board_id => b.id)
      expect(Board).to receive(:find_by_global_id).with(b.global_id).and_return(b)
#      expect(o).to receive(:select).with('id').and_return([b])
      Worker.flush_queues
      u.settings['preferences']['home_board']['id'] = b.global_id
      u.generate_defaults
      expect(u.settings['home_board_changed']).to eq(true)
      u.track_boards(true)
      s = JobStash.last
      expect(Worker.scheduled_for?(:slow, Board, :perform_action, {'method' => 'refresh_stats', 'arguments' => [{'stash' => s.global_id}, Time.now.to_i]})).to eq(true)
      expect(s.data).to eq([b2.global_id])
    end

    it "should create missing connections" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id}}
      ]
      b.save
      expect(b.settings['immediately_downstream_board_ids']).to eq([b2.global_id])
      Worker.process_queues
      b.reload
      expect(b.settings['downstream_board_ids']).to eq([b2.global_id])
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.track_boards(true)
      expect(UserBoardConnection.count).to eq(2)
      expect(UserBoardConnection.find_by(:user_id => u.id, :board_id => b.id, :home => true)).not_to eq(nil)
      expect(UserBoardConnection.find_by(:user_id => u.id, :board_id => b2.id, :home => false)).not_to eq(nil)
    end
    
    it "should update the user date when updating tracked boards if there are changes" do
      u = User.create
      b = Board.create(:user => u)
      User.where(:id => u.id).update_all(:updated_at => 2.months.ago)
      u.reload
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.track_boards(true)
      u.reload
      expect(u.updated_at).to be > 1.week.ago
    end
    
    it "should not update the user date when updating tracked board if there are no changes" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['home_board_changed'] = false
      u.save
      User.where(:id => u.id).update_all(:updated_at => 2.months.ago)
      u.reload
      u.track_boards(true)
      u.reload
      expect(u.updated_at).to be < (1.week.ago)
    end
  end
        
  describe "remember_starred_board!" do
    it "should do nothing if the board no longer exists" do
      u = User.new
      expect { u.remember_starred_board!(0) }.to_not raise_error
    end
    
    it "should add to the user's list if starred" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['starred_user_ids'] = [u.global_id]
      b.save
      u.remember_starred_board!(b.global_id)
      expect(u.settings['starred_board_ids']).to eq([b.global_id])
    end

    it "should not add to the user's list if already added" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['starred_user_ids'] = [u.global_id]
      b.save
      u.settings['starred_board_ids'] = [b.global_id, 'ac', 'def']
      u.remember_starred_board!(b.global_id)
      expect(u.settings['starred_board_ids']).to eq([b.global_id, 'ac', 'def'])
    end
    
    it "should remove from the user's list if not starred" do
      u = User.create
      b = Board.create(:user => u)
      b.save
      u.settings['starred_board_ids'] = [b.global_id, 'ac', 'def']
      u.remember_starred_board!(b.global_id)
      expect(u.settings['starred_board_ids']).to eq(['ac', 'def'])
    end
  end

  describe "process_params" do
    it "should ignore missing parameters" do
      u = User.new
      expect { u.process_params({}, {}) }.to_not raise_error
      expect(u.settings['name']).to eq(nil)
      expect(u.settings['email']).to eq(nil)
      expect(u.settings['location']).to eq(nil)
      expect(u.settings['public']).to eq(nil)
      
      u.process_params({
        'name' => 'bob',
        'email' => 'bob@example.com',
        'public' => true
      }, {})
      expect(u.settings['name']).to eq('bob')
      expect(u.settings['email']).to eq('bob@example.com')
      expect(u.settings['location']).to eq(nil)
      expect(u.settings['public']).to eq(true)
    end

    it "should remove spaces from email" do
      u = User.new
      u.process({'email' => 'bob@ example.com '})
      expect(u.settings['email']).to eq('bob@example.com')
    end
    
    it "should pipe device preferences to the correct settings" do
      u = User.new
      d = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Other One')
      u.process_params({
        'preferences' => {'device' => {
          'something' => '123',
          'voice' => {
            'voice_uri' => 'good_voice'
          }
        }}
      }, {'device' => d})
      expect(u.settings['preferences']['devices']).not_to eq(nil)
      expect(u.settings['preferences']['devices']['1.234 Other One']).not_to be_nil
      expect(u.settings['preferences']['devices']['1.234 Other One']['something']).to eq('123')
      expect(u.settings['preferences']['devices']['1.234 Other One']['voice']['voice_uris']).to eq(['good_voice'])

      u.process_params({
        'preferences' => {'device' => {
          'something' => '123',
          'voice' => {
            'voice_uri' => 'good_voice'
          }
        }}
      }, {})
      expect(u.settings['preferences']['devices']['default']).not_to be_nil
      expect(u.settings['preferences']['devices']['default']['something']).to eq('123')
      expect(u.settings['preferences']['devices']['default']['voice']['voice_uris']).to eq(['good_voice'])
    end
    
    it "should keep a trimmed list of old voice_uris" do
      u = User.new
      u.generate_defaults
      u.settings['preferences']['devices']['default']['voice'] = {'voice_uris' => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']}
      u.process_params({
        'preferences' => {'device' => {
          'something' => '123',
          'voice' => {
            'voice_uri' => 'good_voice'
          }
        }}
      }, {})
      expect(u.settings['preferences']['devices']['default']['voice']['voice_uris']).to eq(["good_voice", "a", "b", "c", "d", "e", "f", "g", "h", "i"])
    end
    
    it "should reset password only if allowed" do
      u = User.new
      u.settings = {}
      u.settings['password'] = {}
      expect(u.process_params({
        'password' => 'chicken'
      }, {}) ).to eq(false)
      expect( u.processing_errors ).to eq(["incorrect current password"])
      u.instance_variable_set('@processing_errors', [])

      expect( u.process_params({
        'password' => 'chicken',
        'old_password' => 'bacon'
      }, {}) ).to eq(false)
      expect( u.processing_errors ).to eq(["incorrect current password"])
      
      u.generate_password('horseradish')
      expect { u.process_params({
        'password' => 'chicken',
        'old_password' => 'horseradish'
      }, {}) }.to_not raise_error
      expect(u.valid_password?('chicken')).to eq(true)
      
      expect { u.process_params({
        'password' => 'chicken-little'
      }, {:allow_password_change => true}) }.to_not raise_error
      expect(u.valid_password?('chicken-little')).to eq(true)
      
      u.settings['password'] = nil
      expect { u.process_params({
        'password' => 'braised-beef'
      }, {}) }.to_not raise_error
      expect(u.valid_password?('braised-beef')).to eq(true)
    end
    
    it "should generate a username only if none yet and provided or forced" do
      u = User.new
      u.process_params({
      }, {:user_name => 'splendid'})
      expect(u.user_name).to eq('splendid')
      
      u.process_params({
      }, {:user_name => 'splendidly'})
      expect(u.user_name).to eq('splendidly')
      
      u.process_params({
        'user_name' => 'awkward'
      }, {})
      expect(u.user_name).to eq('splendidly')
      
      u.user_name = nil
      u.process_params({
        'user_name' => 'awkward'
      }, {})
      expect(u.user_name).to eq('awkward')
    end
    
    it "should downcase a username, but remember the capitalization" do
      u = User.new
      u.process_params({
      }, {:user_name => 'SpLenDid'})
      expect(u.user_name).to eq('splendid')
      expect(u.display_user_name).to eq('SpLenDid')
    end
    
    it "should clear unread messages only with a more-recent timestamp" do
      u = User.new
      u.settings ||= {}
      u.settings['last_message_read'] = 123
      u.settings['unread_messages'] = 4
      
      u.process_params({
        'last_message_read' => 122
      }, {})
      expect(u.settings['unread_messages']).to eq(4)
      expect(u.settings['last_message_read']).to eq(123)
      
      u.process_params({
        'last_message_read' => 124
      }, {})
      expect(u.settings['unread_messages']).to eq(0)
      expect(u.settings['last_message_read']).to eq(124)
    end
    
    it "should remember the agreement date/stamp" do
      u = User.new
      u.process_params({
      }, {});
      expect(u.settings['terms_agreed']).to eq(nil)
      
      u.process_params({'terms_agree' => true}, {})
      expect(u.settings['terms_agreed']).to eq(Time.now.to_i)
    end
    
    it "should sanitize parameters" do
      u = User.new
      expect { u.process_params({}, {}) }.to_not raise_error
      expect(u.settings['name']).to eq(nil)
      expect(u.settings['email']).to eq(nil)
      expect(u.settings['location']).to eq(nil)
      expect(u.settings['public']).to eq(nil)
      
      u.process_params({
        'name' => '<br/>bob',
        'email' => '<p>bob@example.com</p>',
        'location' => "<a href='http://www.google.com'>link</a>",
        'public' => true
      }, {})
      expect(u.settings['name']).to eq('bob')
      expect(u.settings['email']).to eq('bob@example.com')
      expect(u.settings['location']).to eq('link')
      expect(u.settings['public']).to eq(true)
    end
    
    it "should add requested phrase" do
      u = User.new
      u.process_params({'preferences' => {
        'requested_phrase_changes' => [
          'add:I like you',
          'add:I am you'
        ]
      }}, {})
      expect(u.settings['preferences']['requested_phrases']).to eq(['I like you', 'I am you'])
    end
    
    it "should remove requested phrase" do
      u = User.new
      u.process_params({'preferences' => {
        'requested_phrase_changes' => [
          'add:I like you',
          'add:I am you'
        ]
      }}, {})
      expect(u.settings['preferences']['requested_phrases']).to eq(['I like you', 'I am you'])
      u.process_params({'preferences' => {
        'requested_phrase_changes' => [
          'remove:I like you',
          'remove:I like you'
        ]
      }}, {})
      expect(u.settings['preferences']['requested_phrases']).to eq(['I am you'])
    end
    
    it "should not repeat added requested phrase" do
      u = User.new
      u.process_params({'preferences' => {
        'requested_phrase_changes' => [
          'add:I like you',
          'add:I am you',
          'add:I like you'
        ]
      }}, {})
      expect(u.settings['preferences']['requested_phrases']).to eq(['I like you', 'I am you'])
      u.process_params({'preferences' => {
        'requested_phrase_changes' => [
          'add:I like you',
          'add:I am you',
          'add:I like you'
        ]
      }}, {})
      expect(u.settings['preferences']['requested_phrases']).to eq(['I like you', 'I am you'])
    end

    it "should process offline_actions" do
      u = User.create
      expect(u.settings['vocalizations']).to eq(nil)
      u.process({'offline_actions' => [
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'asdf'}]},
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'qwer'}]}
      ]})
      expect(u.settings['vocalizations'].length).to eq(2)
      expect(u.settings['vocalizations'][0]['id']).to_not eq('aaa')
      expect(u.settings['vocalizations'][1]['id']).to eq('aaa')
      u.process({'offline_actions' => [
        {'action' => 'reorder_vocalizations', 'value' => ['asdf', u.settings['vocalizations'][0]['id']].join(',')}
      ]})
      expect(u.settings['vocalizations'].length).to eq(2)
      expect(u.settings['vocalizations'][0]['id']).to_not eq('aaa')
      expect(u.settings['vocalizations'][1]['id']).to eq('aaa')

      u.process({'offline_actions' => [
        {'action' => 'reorder_vocalizations', 'value' => ['aaa', 'asdf', u.settings['vocalizations'][0]['id']].join(',')}
      ]})
      expect(u.settings['vocalizations'].length).to eq(2)
      expect(u.settings['vocalizations'][0]['id']).to eq('aaa')
      expect(u.settings['vocalizations'][1]['id']).to_not eq('aaa')

      u.process({'offline_actions' => [
        {'action' => 'remove_vocalization', 'value' => 'aaa'},
        {'action' => 'remove_vocalization', 'value' => 'qwer'}
      ]})
      expect(u.settings['vocalizations'].length).to eq(1)
      expect(u.settings['vocalizations'][0]['id']).to_not eq('aaa')
    end

    it "should remove old journal entries from the cache when reordering" do
      u = User.create
      expect(u.settings['vocalizations']).to eq(nil)
      u.settings['vocalizations'] = [
        {'category' => 'journal', 'id' => 'asdf', 'sentence' => 'something', 'ts' => 6.months.ago.to_i},
        {'category' => 'journal', 'id' => 'qwer', 'sentence' => 'something', 'ts' => 6.minutes.ago.to_i},
        {'category' => 'default', 'id' => 'zxcv', 'sentence' => 'something', 'ts' => 6.months.ago.to_i},
      ]
      u.process({'offline_actions' => [
        {'action' => 'reorder_vocalizations', 'value' => ['asdf', 'qwer', 'zxcv'].join(',')}
      ]})
      expect(u.settings['vocalizations'].length).to eq(2)
      expect(u.settings['vocalizations'][0]['id']).to_not eq('asdf')
      expect(u.settings['vocalizations'][1]['id']).to eq('zxcv')
    end

    it "should allow saving phrase_categories" do
      u = User.create
      u.process({'preferences' => {'phrase_categories' => ['a', 'b']}})
      expect(u.settings['preferences']['phrase_categories']).to eq(['a', 'b'])
      u.process({'offline_actions' => [
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'asdf'}], 'category' => 'a'},
        {'action' => 'add_vocalization', 'id' => 'bbb', 'list' => [{'label' => 'qwer'}], 'category' => 'default'},
        {'action' => 'add_vocalization', 'id' => 'ccc', 'list' => [{'label' => 'zxcv'}], 'category' => 'c'},
      ]})
      expect(u.settings['vocalizations'].length).to eq(3)
      expect(u.settings['vocalizations'][0]['id']).to eq('ccc')
      expect(u.settings['vocalizations'][0]['category']).to eq('default')
      expect(u.settings['vocalizations'][1]['id']).to eq('bbb')
      expect(u.settings['vocalizations'][1]['category']).to eq('default')
      expect(u.settings['vocalizations'][2]['id']).to eq('aaa')
      expect(u.settings['vocalizations'][2]['category']).to eq('a')
    end

    it "should record add_vocalization journal entries to the user log" do
      u = User.create
      d = Device.create(user: u)
      u.process({'preferences' => {'phrase_categories' => ['a', 'b']}})
      expect(u.settings['preferences']['phrase_categories']).to eq(['a', 'b'])
      u.process({'offline_actions' => [
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'asdf'}], 'category' => 'journal'},
        {'action' => 'add_vocalization', 'id' => 'bbb', 'list' => [{'label' => 'qwer'}], 'category' => 'journal'},
        {'action' => 'add_vocalization', 'id' => 'ccc', 'list' => [{'label' => 'zxcv'}], 'category' => 'c'},
      ]})
      expect(u.settings['vocalizations'].length).to eq(3)
      expect(u.settings['vocalizations'][0]['id']).to eq('ccc')
      expect(u.settings['vocalizations'][1]['id']).to eq('bbb')
      expect(u.settings['vocalizations'][2]['id']).to eq('aaa')
      expect(LogSession.where(log_type: 'journal', user_id: u.id).count).to eq(2)
    end

    it "should use the default category for saved phrases if none specified" do
      u = User.create
      u.process({'preferences' => {'phrase_categories' => ['a', 'b']}})
      expect(u.settings['preferences']['phrase_categories']).to eq(['a', 'b'])
      u.process({'offline_actions' => [
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'asdf'}], 'category' => 'a'},
        {'action' => 'add_vocalization', 'id' => 'bbb', 'list' => [{'label' => 'qwer'}], 'category' => 'default'},
        {'action' => 'add_vocalization', 'id' => 'ccc', 'list' => [{'label' => 'zxcv'}], 'category' => 'c'},
      ]})
      expect(u.settings['vocalizations'].length).to eq(3)
      expect(u.settings['vocalizations'][0]['id']).to eq('ccc')
      expect(u.settings['vocalizations'][0]['category']).to eq('default')
      expect(u.settings['vocalizations'][1]['id']).to eq('bbb')
      expect(u.settings['vocalizations'][1]['category']).to eq('default')
      expect(u.settings['vocalizations'][2]['id']).to eq('aaa')
      expect(u.settings['vocalizations'][2]['category']).to eq('a')
    end

    it "should remove old journal entries when a new vocalization is added" do
      u = User.create
      expect(u.settings['vocalizations']).to eq(nil)
      u.settings['vocalizations'] = [
        {'category' => 'journal', 'id' => 'asdf', 'sentence' => 'something', 'ts' => 6.months.ago.to_i},
        {'category' => 'journal', 'id' => 'qwer', 'sentence' => 'something', 'ts' => 6.minutes.ago.to_i},
        {'category' => 'default', 'id' => 'zxcv', 'sentence' => 'something', 'ts' => 6.months.ago.to_i},
      ]
      u.process({'offline_actions' => [
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'asdf'}], 'category' => 'a'},
        {'action' => 'add_vocalization', 'id' => 'bbb', 'list' => [{'label' => 'qwer'}], 'category' => 'default'},
        {'action' => 'add_vocalization', 'id' => 'ccc', 'list' => [{'label' => 'zxcv'}], 'category' => 'c'},
      ]})
      expect(u.settings['vocalizations'].map{|v| v['id']}).to eq(['ccc', 'bbb', 'aaa', 'qwer', 'zxcv'])
    end

    it "should not log non-journal vocalization adds" do
      u = User.create
      u.process({'preferences' => {'phrase_categories' => ['a', 'b']}})
      expect(u.settings['preferences']['phrase_categories']).to eq(['a', 'b'])
      u.process({'offline_actions' => [
        {'action' => 'add_vocalization', 'id' => 'aaa', 'list' => [{'label' => 'asdf'}], 'category' => 'a'},
        {'action' => 'add_vocalization', 'id' => 'bbb', 'list' => [{'label' => 'qwer'}], 'category' => 'default'},
        {'action' => 'add_vocalization', 'id' => 'ccc', 'list' => [{'label' => 'zxcv'}], 'category' => 'c'},
      ]})
      expect(u.settings['vocalizations'].length).to eq(3)
      expect(u.settings['vocalizations'][0]['id']).to eq('ccc')
      expect(u.settings['vocalizations'][0]['category']).to eq('default')
      expect(u.settings['vocalizations'][1]['id']).to eq('bbb')
      expect(u.settings['vocalizations'][1]['category']).to eq('default')
      expect(u.settings['vocalizations'][2]['id']).to eq('aaa')
      expect(u.settings['vocalizations'][2]['category']).to eq('a')
      expect(LogSession.count).to eq(0)
    end

    it "should process offline_actions for managing contacts, removing duplicates" do
      u = User.create
      u.process({'offline_actions' => [
        {'action' => 'add_contact', 'value' => {'contact' => 'bob@example.com', 'name' => 'Bob'}},
        {'action' => 'remove_contact', 'value' => 'asdf'},
        {'action' => 'add_contact', 'value' => {'contact' => '801-988-0928', 'name' => 'Susy Bones', 'image_url' => 'http://www.example.com/pic.png'}},
        {'action' => 'add_contact', 'value' => {'contact' => 'bob@example.com', 'name' => 'Bobby'}},
        {'action' => 'add_contact', 'value' => {'contact' => '8019880928', 'name' => 'Susan Bones', 'image_url' => 'https://www.example.com/pic.png'}}
      ]})
      expect(u.settings['contacts']).to_not eq(nil)
      expect(u.settings['contacts'].length).to eq(2)
      susie = u.settings['contacts'].detect{|c| c['name'] == 'Susan Bones'}
      hash = susie['hash']
      expect(susie).to_not eq(nil)
      expect(susie['cell_phone']).to eq('8019880928')
      expect(susie['email']).to eq(false)
      expect(susie['contact_type']).to eq('sms')
      expect(susie['image_url']).to eq('https://www.example.com/pic.png')
      bob = u.settings['contacts'].detect{|c| c['name'] == 'Bobby'}
      expect(hash).to_not eq(bob['hash'])
      hash = bob['hash']
      expect(bob).to_not eq(nil)
      expect(bob['cell_phone']).to eq(false)
      expect(bob['email']).to eq('bob@example.com')
      expect(bob['contact_type']).to eq('email')
      expect(bob['image_url']).to match(/amazonaws/)
      u.process({'offline_actions' => [
        {'action' => 'remove_contact', 'value' => hash}
      ]})
      expect(u.settings['contacts']).to_not eq(nil)
      expect(u.settings['contacts'].length).to eq(1)
      susie = u.settings['contacts'].detect{|c| c['name'] == 'Susan Bones'}
      expect(susie).to_not eq(nil)
      bob = u.settings['contacts'].detect{|c| c['name'] == 'Bobby'}
      expect(bob).to eq(nil)
      u.process({'offline_actions' => [
        {'action' => 'add_contact', 'value' => {'contact' => '(555)123-4567,55580192831', 'name' => 'Grandparents'}}
      ]})
      expect(u.settings['contacts']).to_not eq(nil)
      expect(u.settings['contacts'].length).to eq(2)
      susie = u.settings['contacts'].to_a.detect{|c| c['name'] == 'Susan Bones'}
      expect(susie).to_not eq(nil)
      gp = u.settings['contacts'].to_a.detect{|c| c['name'] == 'Grandparents'}
      expect(gp).to_not eq(nil)
      expect(gp['cell_phone']).to eq("(555)123-4567,55580192831")
      expect(gp['email']).to eq(false)
      expect(gp['contact_type']).to eq('sms')
      expect(gp['image_url']).to match(/amazonaws/)
    end

    it "should only allow settings authored_organization_id (and unpending) if an org admin" do
      o = Organization.create
      u = User.process_new({'authored_organization_id' => o.global_id}, {'pending' => true})
      expect(u.settings['authored_organization_id']).to eq(nil)
      expect(u.settings['pending']).to eq(true)
      o.add_manager(u.user_name, true)
      u2 = User.process_new({'authored_organization_id' => o.global_id}, {'pending' => true, 'author' => u.reload})
      expect(u2.settings['authored_organization_id']).to eq(o.global_id)
      expect(u2.settings['pending']).to eq(false)
    end

    it "should only allow setting authored_organization_id on create" do
      u = User.create
      o = Organization.create
      o.add_manager(u.user_name, true)
      u.reload
      u.process({'authored_organization_id' => o.global_id}, {'pending' => true, 'author' => u})
      expect(u.settings['authored_organization_id']).to eq(nil)
    end

    it "should set the device as long_token_set if long_token is set" do
      u = User.create
      d = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Other One')
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
      u.process_params({
        'preferences' => {'device' => {
          'long_token' => true
        }}
      }, {'device' => d})
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(true)
    end

    it "should invalidate nothing when not an eval account" do
      u = User.create
      recent = 2.seconds.ago.to_i
      old = 1.year.ago.to_i
      u.save
      expect(u.eval_account?).to eq(false)
      d = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Other One', :settings => {'temporary_device' => true, 'app' => true, 'keys' => [{'last_timestamp' => recent}, {'last_timestamp' => old}]})
      d2 = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Second One', :settings => {'app' => true, 'keys' => [{'last_timestamp' => recent}, {'last_timestamp' => old}]})
      d3 = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Non-App One', :settings => {'keys' => [{'last_timestamp' => recent}]})
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
      u.process_params({
        'preferences' => {'device' => {
          'long_token' => true,
          'asserted' => true
        }}
      }, {'device' => d})
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(true)
      expect(d.settings['temporary_device']).to eq(nil)
      expect(d.settings['keys']).to eq([{'last_timestamp' => recent}, {'last_timestamp' => old}])
      expect(d2.reload.settings['keys']).to eq([{'last_timestamp' => recent}, {'last_timestamp' => old}])
      expect(d3.reload.settings['keys']).to eq([{'last_timestamp' => recent}])
    end

    it "should invalidate only app devices other than the current device if asserted by the user" do
      u = User.create
      recent = 2.seconds.ago.to_i
      old = 1.year.ago.to_i
      u.settings['subscription'] = {'eval_account' => true}
      u.save
      expect(u.eval_account?).to eq(true)
      d = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Other One', :settings => {'temporary_device' => true, 'app' => true, 'keys' => [{'last_timestamp' => recent}, {'last_timestamp' => old}]})
      d2 = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Second One', :settings => {'app' => true, 'keys' => [{'last_timestamp' => recent}, {'last_timestamp' => old}]})
      d3 = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Non-App One', :settings => {'keys' => [{'last_timestamp' => recent}]})
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
      u.process_params({
        'preferences' => {'device' => {
          'long_token' => true,
          'asserted' => true
        }}
      }, {'device' => d})
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(true)
      expect(d.settings['temporary_device']).to eq(nil)
      expect(d.settings['keys']).to eq([{'last_timestamp' => recent}, {'last_timestamp' => old}])
      expect(d2.reload.settings['keys']).to eq([])
      expect(d3.reload.settings['keys']).to eq([{'last_timestamp' => recent}])
    end

    it "should not invalidate app devices when logging in on a browser" do
      u = User.create
      recent = 2.seconds.ago.to_i
      old = 1.year.ago.to_i
      u.settings['subscription'] = {'eval_account' => true}
      u.save
      expect(u.eval_account?).to eq(true)
      d = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Other One', :settings => {'temporary_device' => true, 'keys' => [{'last_timestamp' => recent}, {'last_timestamp' => old}]})
      expect(d.token_type).to_not eq(:app)
      d2 = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Second One', :settings => {'app' => true, 'keys' => [{'last_timestamp' => recent}, {'last_timestamp' => old}]})
      d3 = Device.create(:user => u, :developer_key_id => 0, :device_key => '1.234 Non-App One', :settings => {'keys' => [{'last_timestamp' => recent}]})
      expect(d.settings['long_token']).to eq(nil)
      expect(d.settings['long_token_set']).to eq(nil)
      u.process_params({
        'preferences' => {'device' => {
          'long_token' => true,
          'asserted' => true
        }}
      }, {'device' => d})
      expect(d.settings['long_token']).to eq(true)
      expect(d.settings['long_token_set']).to eq(true)
      expect(d.settings['temporary_device']).to eq(nil)
      expect(d.settings['keys']).to eq([{'last_timestamp' => recent}, {'last_timestamp' => old}])
      expect(d2.reload.settings['keys']).to eq([{'last_timestamp' => recent}, {'last_timestamp' => old}])
      expect(d3.reload.settings['keys']).to eq([{'last_timestamp' => recent}])
    end

    it "should schedule inflection updates for a user's board set and sidebar board set when they enable inflections" do
      u = User.create
      u.process({'preferences' => {'inflections_overlay' => true}})
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'update_home_board_inflections', 'arguments' => []})).to eq(true)
    end

    it "should not schedule inflection updates for a user's board set and sidebar board set when inflections are enabled but were already enabled" do
      u = User.create
      u.settings['preferences']['inflections_overlay'] = true
      u.process({'preferences' => {'inflections_overlay' => true}})
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'update_home_board_inflections', 'arguments' => []})).to eq(false)
    end

    it "should correctly disable valet login" do
      u = User.create
      expect(u.settings['valet_password']).to eq(nil)
      u.process({'valet_login' => true}, {'updater' => u})
      expect(u.settings['valet_password']).to_not eq(nil)
      u.process({'valet_login' => false}, {'updater' => nil})
      expect(u.settings['valet_password']).to_not eq(nil)
      u.process({'valet_login' => false}, {'updater' => u})
      expect(u.settings['valet_password']).to eq(nil)
    end

    it "should correctly enable valet login" do
      u = User.create
      expect(u.settings['valet_password']).to eq(nil)
      u.process({'valet_login' => true}, {'updater' => u})
      expect(u.settings['valet_password']).to_not eq(nil)
    end

    it "should notify when valet login is enabled"  do
      u = User.create
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_enabled, u.global_id)
      expect(u.settings['valet_password']).to eq(nil)
      u.process({'valet_login' => true}, {'updater' => u})
      expect(u.settings['valet_password']).to_not eq(nil)
    end

    it  "should correctly set a new valet login password" do
      u = User.create
      expect(u.settings['valet_password']).to eq(nil)
      u.process({'valet_login' => true, 'valet_password' => 'gemini'}, {'updater' => u})
      expect(u.settings['valet_password']).to_not eq(nil)
      u.assert_valet_mode!
      expect(u.valid_password?('gemini')).to eq(true)
    end

    it "should update private logging settings only if done by the actual user" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, true)
      expect(u.settings['valet_password']).to eq(nil)
      u.process({'valet_login' => true, 'preferences' => {'private_logging' => true, 'logging_code' => 'qwer', 'logging_cutoff' => '72'}}, {'updater' => u})
      expect(u.settings['valet_password']).to_not eq(nil)
      expect(u.settings['preferences']['private_logging']).to eq(true)
      expect(u.settings['preferences']['logging_code']).to eq('qwer')
      expect(u.settings['preferences']['logging_cutoff']).to eq(72)

      u.process({'valet_login' => false, 'preferences' => {'private_logging' => false, 'logging_code' => 'false', 'logging_cutoff' => 'none'}}, {'updater' => u2})
      expect(u.settings['valet_password']).to_not eq(nil)
      expect(u.settings['preferences']['private_logging']).to eq(true)
      expect(u.settings['preferences']['logging_code']).to eq('qwer')
      expect(u.settings['preferences']['logging_cutoff']).to eq(72)

      u.process({'valet_login' => false, 'preferences' => {'private_logging' => false, 'logging_code' => 'false', 'logging_cutoff' => 'none'}}, {'updater' => u})
      expect(u.settings['valet_password']).to eq(nil)
      expect(u.settings['preferences']['private_logging']).to eq(false)
      expect(u.settings['preferences']['logging_code']).to eq(nil)
      expect(u.settings['preferences']['logging_cutoff']).to eq(nil)

      u.process({'valet_login' => true, 'preferences' => {'private_logging' => true, 'logging_code' => 'qwer', 'logging_cutoff' => '72'}}, {'updater' => u2})
      expect(u.settings['valet_password']).to eq(nil)
      expect(u.settings['preferences']['private_logging']).to eq(false)
      expect(u.settings['preferences']['logging_code']).to eq(nil)
      expect(u.settings['preferences']['logging_cutoff']).to eq(nil)
    end

    it "should process focus words when extras is not defined" do
      u = User.create
      obj = OpenStruct.new
      expect(UserExtra).to receive(:find_or_create_by).with(user: u).and_return obj
      expect(obj).to receive(:process_focus_words).with('aaa')
      u.process({'focus_words' => 'aaa'})
    end

    it "should set external_device correctly" do
      u = User.create
      u.process({'external_device' => {'a' => 1}})
      expect(u.settings['external_device']).to eq({'a' => 1})
      u.process({})
      expect(u.settings['external_device']).to eq({'a' => 1})
      u.process({'external_device' => nil})
      expect(u.settings['external_device']).to eq(nil)
    end

    it "should not schedule an external research update if no research data passed" do
      u = User.create
      expect(Webhook).to_not receive(:schedule)
      u.process({
        'preferences' => {
          'bacon' => 1
        }
      })
    end

    it "should schedule and deliver an external research update if research data passed" do
      u = User.create
      u.process({
        'preferences' => {
          'allow_log_reports' => true,
          'research_primary_use' => 'a',
          'research_age' => 'b',
          'research_experience_level' => 'c',
        }
      })
      s = JobStash.last
      expect(s).to_not eq(nil)
      expect(s.data['user_id']).to eq(u.global_id)

      ui = UserIntegration.create
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings['notifications'] ||= {}
      h.settings['include_content'] = true
      h.settings['url'] = 'http://www.example.com/callback2'
      h.settings['webhook_type'] = 'research'
      h.settings['content_types'] = ['anonymized_summary']
      h.settings['notifications']['anonymized_user_details'] = [{
        'callback' => 'http://www.example.com/callback',
        'include_content' => true,
        'content_type' => 'anonymized_summary'
      }]
      h.save

      expect(Worker.scheduled?(Webhook, :perform_action, {'method' => 'update_external_prefs', 'arguments' => [s.global_id]})).to be_truthy
      expect(Typhoeus).to receive(:post) do |url, args|
        expect(url).to eq('http://www.example.com/callback')
        expect(args[:body]).to eq({
          content: {
            uid: ui.user_token(u),
            anon_id: u.reload.anonymized_identifier,
            details: {
              primary_use: 'a',
              age: 'b',
              experience_level: 'c'
            },
            host: JsonApi::Json.current_host
          }.to_json,
          notification: 'anonymized_user_details',
          record: s.record_code,
          token: ui.settings['token']
        })
      end.and_return(OpenStruct.new(code: 200, body: 'asdf'))
      Worker.process_queues

      expect(JobStash.find_by(id: s.id)).to eq(nil)
    end

    it "should not schedule an external update if log reporting is not enabled" do
      u = User.create
      expect(Webhook).to_not receive(:schedule)
      u.process({
        'preferences' => {
          'research_primary_use' => 'a',
          'research_age' => 'b',
          'research_experience_level' => 'c',
        }
      })
    end

    it "should remove the stashed data once the research data is sent" do
      u = User.create
      u.process({
        'preferences' => {
          'allow_log_reports' => true,
          'research_primary_use' => 'a',
          'research_experience_level' => 'c',
        }
      })
      s = JobStash.last
      expect(s).to_not eq(nil)
      expect(s.data['user_id']).to eq(u.global_id)

      ui = UserIntegration.create
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings['notifications'] ||= {}
      h.settings['include_content'] = true
      h.settings['url'] = 'http://www.example.com/callback2'
      h.settings['webhook_type'] = 'research'
      h.settings['content_types'] = ['anonymized_summary']
      h.settings['notifications']['anonymized_user_details'] = [{
        'callback' => 'http://www.example.com/callback',
        'include_content' => true,
        'content_type' => 'anonymized_summary'
      }]
      h.save

      expect(Worker.scheduled?(Webhook, :perform_action, {'method' => 'update_external_prefs', 'arguments' => [s.global_id]})).to be_truthy
      expect(Typhoeus).to receive(:post) do |url, args|
        expect(url).to eq('http://www.example.com/callback')
        expect(args[:body]).to eq({
          content: {
            uid: ui.user_token(u),
            anon_id: u.reload.anonymized_identifier,
            details: {
              primary_use: 'a',
              experience_level: 'c'
            },
            host: JsonApi::Json.current_host
          }.to_json,
          notification: 'anonymized_user_details',
          record: s.record_code,
          token: ui.settings['token']
        })
      end.and_return(OpenStruct.new(code: 200, body: 'asdf'))
      Worker.process_queues

      expect(JobStash.find_by(id: s.id)).to eq(nil)
    end

    it "should remove the stashed data even if the research data send fails" do
      u = User.create
      u.process({
        'preferences' => {
          'allow_log_reports' => true,
          'research_primary_use' => 'a',
          'research_age' => 'b',
          'research_experience_level' => 'c',
        }
      })
      s = JobStash.last
      expect(s).to_not eq(nil)
      expect(s.data['user_id']).to eq(u.global_id)

      ui = UserIntegration.create
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings['notifications'] ||= {}
      h.settings['include_content'] = true
      h.settings['url'] = 'http://www.example.com/callback2'
      h.settings['webhook_type'] = 'research'
      h.settings['content_types'] = ['anonymized_summary']
      h.settings['notifications']['anonymized_user_details'] = [{
        'callback' => 'http://www.example.com/callback',
        'include_content' => true,
        'content_type' => 'anonymized_summary'
      }]
      h.save

      expect(Worker.scheduled?(Webhook, :perform_action, {'method' => 'update_external_prefs', 'arguments' => [s.global_id]})).to be_truthy
      expect(Typhoeus).to receive(:post) do |url, args|
        expect(url).to eq('http://www.example.com/callback')
        expect(args[:body]).to eq({
          content: {
            uid: ui.user_token(u),
            anon_id: u.reload.anonymized_identifier,
            details: {
              primary_use: 'a',
              age: 'b',
              experience_level: 'c'
            },
            host: JsonApi::Json.current_host
          }.to_json,
          notification: 'anonymized_user_details',
          record: s.record_code,
          token: ui.settings['token']
        })
      end.and_raise(Timeout::Error.new('whatever'))
      Worker.process_queues

      expect(JobStash.find_by(id: s.id)).to eq(nil)
    end
  end
  
  describe "logging_cutoff_for" do
    it "should return correct values" do
      u = User.create
      u2 = User.create
      expect(u.logging_cutoff_for(u, nil)).to eq(nil)
      expect(u.logging_cutoff_for(u2, nil)).to eq(nil)

      u.settings['preferences']['logging_cutoff'] = 12
      expect(u.logging_cutoff_for(u, nil)).to eq(12)
      expect(u.logging_cutoff_for(u2, nil)).to eq(12)

      u.settings['preferences']['logging_code'] =  'waterfall'
      expect(u.logging_cutoff_for(u, nil)).to eq(12)
      expect(u.logging_cutoff_for(u2, nil)).to eq(12)
      expect(u.logging_cutoff_for(u, 'waterfall')).to eq(nil)
      expect(u.logging_cutoff_for(u2, 'waterfall')).to eq(nil)

      u.settings['preferences']['logging_permissions'] = {}
      u.settings['preferences']['logging_permissions'][u2.global_id] = {'expires' => Time.now.to_i - 20, 'cutoff' => 200}
      expect(u.logging_cutoff_for(u, nil)).to eq(12)
      expect(u.logging_cutoff_for(u2, nil)).to eq(12)

      u.settings['preferences']['logging_permissions'][u2.global_id] = {'expires' => Time.now.to_i + 20, 'cutoff' => 200}
      expect(u.logging_cutoff_for(u, nil)).to eq(12)
      expect(u.logging_cutoff_for(u2, nil)).to eq(200)
    end
  end

  describe "replace_board" do
    it "should pass the arguments to Board" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:replace_board_for).with(u, {:valid_ids => nil, :starting_old_board => b, :starting_new_board => b2, :update_inline => true, :authorized_user => nil, :make_public => false, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
      u.replace_board(old_board_id: b.global_id, new_board_id: b2.global_id, ids_to_copy: [], update_inline: true)
    end

    it "should make public if specified" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:replace_board_for).with(u, {:valid_ids => nil, :starting_old_board => b, :starting_new_board => b2, :update_inline => true, :authorized_user => nil, :make_public => true, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
      u.replace_board(old_board_id: b.global_id, new_board_id: b2.global_id, ids_to_copy: [], update_inline: true, make_public: true)
    end

    it "should add a prefix for copied boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:replace_board_for).with(u, {:valid_ids => nil, :starting_old_board => b, :starting_new_board => b2, :update_inline => true, :authorized_user => nil, :make_public => true, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>'whatever', :copier => nil, :disconnect => nil, :new_owner => nil})
      u.replace_board(old_board_id: b.global_id, new_board_id: b2.global_id, ids_to_copy: [], update_inline: true, make_public: true, :copy_prefix => 'whatever')
    end
  end
    
  describe "copy_board_links" do
    it "should pass the arguments to Board" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:copy_board_links_for).with(u, {:valid_ids => nil, :starting_old_board => b, :starting_new_board => b2, :authorized_user => nil, :make_public => false, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
      u.copy_board_links(old_board_id: b.global_id, new_board_id: b2.global_id)
    end
    
    it "should make public if specified" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:copy_board_links_for).with(u, {:valid_ids => nil, :starting_old_board => b, :starting_new_board => b2, :authorized_user => nil, :make_public => true, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
      res = u.copy_board_links(old_board_id: b.global_id, new_board_id: b2.global_id, ids_to_copy: [], make_public: true)
      expect(res.keys).to eq(['affected_board_ids', 'new_board_ids'])
    end

    it "should use correct whodunnit user" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b1 = Board.create(:user => u1)
      b1a = Board.create(:user => u1)
      User.link_supervisor_to_user(u2, u1, nil, true)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b1a.key, 'id' => b1a.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      expect(b1.settings['downstream_board_ids']).to eq([b1a.global_id])
      b2 = b1.copy_for(u3)
      expect(Board).to receive(:relink_board_for) do |user, opts|
        board_ids = opts[:board_ids]
        pending_replacements = opts[:pending_replacements]
        action = opts[:update_preference]
        expect(opts[:authorized_user]).to eq(u2)
        expect(user).to eq(u3)
        expect(board_ids.length).to eq(2)
        expect(board_ids).to eq([b1.global_id, b1a.global_id])
        expect(pending_replacements.length).to eq(2)
        expect(pending_replacements[0]).to eq([b1.global_id, {id: b2.global_id, key: b2.key}])
        expect(pending_replacements[1][0]).to eq(b1a.global_id)
        expect(action).to eq('update_inline')
      end
      u3.copy_board_links(old_board_id: b1.global_id, new_board_id: b2.global_id, ids_to_copy: [], make_public: false, user_for_paper_trail: "user:#{u2.global_id}")
    end
    
    it "should make sub-boards public if specified" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2, nil, true)
      b1 = Board.create(:user => u2)
      b2 = Board.create(:user => u2)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b2.key, 'id' => b2.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      b3 = b1.copy_for(u1)
      u1.copy_board_links(old_board_id: b1.global_id, new_board_id: b3.global_id, ids_to_copy: [], make_public: true, user_for_paper_trail: "user:#{u1.global_id}")
      expect(Board.count).to eq(4)
      b4 = Board.last
      expect(b4.parent_board_id).to eq(b2.id)
      expect(b4.public).to eq(true)
    end

    it "should add a prefix to sub-board if specified" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2, nil, true)
      b1 = Board.create(:user => u2)
      b2 = Board.create(:user => u2)
      b2.settings['name'] = "Chatty Choo Choo"
      b2.settings['prefix'] = "Chatty"
      b2.save
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b2.key, 'id' => b2.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      b3 = b1.copy_for(u1)
      u1.copy_board_links(old_board_id: b1.global_id, new_board_id: b3.global_id, ids_to_copy: [], user_for_paper_trail: "user:#{u1.global_id}", copy_prefix: 'Noisy', :copier => nil, :disconnect => nil, :new_owner => nil)
      expect(Board.count).to eq(4)
      b4 = Board.last
      expect(b4.parent_board_id).to eq(b2.id)
      expect(b4.settings['name']).to eq("Noisy Choo Choo")
      expect(b4.settings['prefix']).to eq("Noisy")
    end

    it 'should swap the library images if specified' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:copy_board_links_for).with(u, {:valid_ids => nil, :starting_old_board => b, :starting_new_board => b2, :authorized_user => nil, :make_public => false, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
      expect(Board).to receive(:find_by_path).with(b.global_id).and_return(b)
      expect(Board).to receive(:find_by_path).with(b2.global_id).and_return(b2)
      expect(b2).to receive(:swap_images).with('bacon', u, [b2.global_id])
      res = u.copy_board_links(old_board_id: b.global_id, new_board_id: b2.global_id, swap_library: 'bacon')
      expect(res['swap_library']).to eq('bacon')
    end

    it "should correctly make copies of shallow clones as well as replaced shallow clones" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2, nil, true)
      b1 = Board.create(:user => u2)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u2)
      b2.settings['name'] = "Chatty Choo Choo"
      b2.settings['prefix'] = "Chatty"
      b2.save
      b2.settings['buttons'] = [{'id' => 2, 'load_board' => {'key' => b3.key, 'id' => b3.global_id}}]
      b2.save!
      b2.track_downstream_boards!
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'key' => b2.key, 'id' => b2.global_id}}]
      b1.save!
      b1.track_downstream_boards!
      bb3 = Board.find_by_global_id("#{b3.global_id}-#{u1.global_id}")
      b3u1 = bb3.copy_for(u1)

      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u1.global_id}")
      b1u1 = bb1.copy_for(u1, unshallow: true)
      expect(b1u1.global_id).to_not eq(bb1.global_id)
      expect(b1u1.shallow_id).to_not eq(bb1.global_id)
      res = u1.copy_board_links(old_board_id: b1.global_id, new_board_id: b1u1.global_id, ids_to_copy: [], user_for_paper_trail: "user:#{u1.global_id}", copy_prefix: 'Noisy', :copier => nil, :disconnect => nil, :new_owner => nil)
      expect(res).to_not eq(false)
      expect(res['affected_board_ids']).to eq([b1.global_id, b2.global_id, b3.global_id])
      expect(res['new_board_ids']).to be_include(b1u1.global_id)
      expect(res['new_board_ids']).to_not be_include(b3u1.global_id)
      expect(res['new_board_ids'].length).to eq(3)
      expect(Board.count).to eq(7)
      b5 = Board.last
      expect(b5.parent_board_id).to eq(b3.id)
      expect(b5.settings['name']).to eq("Noisy Unnamed Board")

      b4 = Board.find_by_global_id(res['new_board_ids'][1])
      expect(b4.parent_board_id).to eq(b2.id)
      expect(b4.settings['name']).to eq("Noisy Choo Choo")
    end
  end
 
  describe "notify_of_changes" do
    it "should not trigger password change event on first set" do
      expect(UserMailer).not_to receive(:schedule_delivery)
      u = User.process_new(:password => 'abcdefgh')
    end
    it "should schedule a notification when a user password changes" do
      expect(UserMailer).to receive(:schedule_delivery).with(:password_changed, /\d+_\d+/).and_return(true)
      u = User.process_new(:password => 'abcdefgh')
      u.process({'old_password' => 'abcdefgh', 'password' => 'baconator'})
    end
    it "should not trigger email changed event on first set" do
      expect(UserMailer).not_to receive(:schedule_delivery)
      u = User.process_new(:email => 'bob@example.com')
    end
    it "should schedule a notification to both addresses when a user email changes" do
      expect(UserMailer).to receive(:schedule_delivery).with(:email_changed, /\d+_\d+/).and_return(true)
      u = User.process_new(:email => 'bob@example.com')
      u.process({'email' => 'fred@example.com'})
    end
    it "should notify observers when a user's home board changes" do
      u = User.create
      b = Board.create(:user => u)
      expect(u).to receive(:notify).with('home_board_changed')
      u.process({'preferences' => {'home_board' => {'id' => b.global_id, 'key' => b.key}}})
    end

    it "should not notify observers when a user's home board doesn't actually change" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      u.save
      expect(u).to_not receive(:notify).with('home_board_changed')
      u.process({'preferences' => {'home_board' => {'id' => b.global_id, 'key' => b.key}}})
    end
  end
  
  describe "board_set_ids" do
    it "should include the user's home board and all sub-boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id}}
      ]
      b.save
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id])

      u.settings['preferences'] = {'home_board' => {'id' => b.global_id, 'key' => b.key}}
      u.save
      expect(u.reload.board_set_ids.sort).to eq([b.global_id, b2.global_id])
    end
    
    it "should include supervisee board ids if specified" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id}}
      ]
      b.save
      User.link_supervisor_to_user(u, u2)
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id])

      u.settings['preferences'] = {'home_board' => {'id' => b.global_id, 'key' => b.key}}
      u.save
      u2.settings['preferences'] = {'home_board' => {'id' => b4.global_id, 'key' => b4.key}}
      u2.save
      expect(u.reload.board_set_ids(:include_supervisees => true).sort).to eq([b.global_id, b2.global_id, b4.global_id])
    end
    
    it "should include starred board ids if specified" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id}}
      ]
      b.save
      User.link_supervisor_to_user(u, u2)
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id])

      u.settings['preferences'] = {'home_board' => {'id' => b.global_id, 'key' => b.key}}
      u.settings['starred_board_ids'] = ['1_4', b3.global_id]
      u.save
      u2.settings['preferences'] = {'home_board' => {'id' => b4.global_id, 'key' => b4.key}}
      u2.save
      expect(u.reload.board_set_ids(:include_starred => true).sort).to eq([b.global_id, b2.global_id, b3.global_id, '1_4'].sort)
    end
    
    it "should not include supervisee board ids if not specified" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id}}
      ]
      b.save
      User.link_supervisor_to_user(u, u2)
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id])

      u.settings['preferences'] = {'home_board' => {'id' => b.global_id, 'key' => b.key}}
      u.save
      u2.settings['preferences'] = {'home_board' => {'id' => b4.global_id, 'key' => b4.key}}
      u2.save
      expect(u.reload.board_set_ids(false).sort).to eq([b.global_id, b2.global_id])
    end
    
  end

  describe "default_premium_voices" do
    it "should return the correct defaults" do
      expect(User.default_premium_voices(true, true, true)).to eq({'claimed' => [], 'allowed' => 1})
      expect(User.default_premium_voices(true, true, false)).to eq({'claimed' => [], 'allowed' => 2})
      expect(User.default_premium_voices(true, false, false)).to eq({'claimed' => [], 'allowed' => 2})
      expect(User.default_premium_voices(false, true, true)).to eq({'claimed' => [], 'allowed' => 1})
      expect(User.default_premium_voices(false, false, true)).to eq({'claimed' => [], 'allowed' => 0})
      expect(User.default_premium_voices(false, true, false)).to eq({'claimed' => [], 'allowed' => 1})
      expect(User.default_premium_voices(true, false, true)).to eq({'claimed' => [], 'allowed' => 1})
      expect(User.default_premium_voices(false, false, false)).to eq({'claimed' => [], 'allowed' => 0})

      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      u.settings['subscription']['expiration_source'] = 'bacon'
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})

      u2 = User.create
      u2.settings['preferences']['role'] = 'supporter'
      u2.expires_at = 2.days.ago
      u2.save
      expect(u2.billing_state).to eq(:modeling_only)      
      expect(u2.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})

      u.settings['subscription'] = {'eval_account' => true}
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      u.settings['subscription'] = {'never_expires' => true}
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 2})
    end

    it "should not allow paid supporters to download premium voices" do
      u = User.create
      u.settings['preferences']['role'] = 'supporter'
      u.save
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})
      
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'slp_long_term_25',
        'purchase_id' => '23456',
        'seconds_to_add' => 5.years.to_i
      })
      expect(u.settings['preferences']['role']).to eq('supporter')
      expect(u.billing_state).to eq(:premium_supporter)      
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})
    end

    it "should allow a paid communicator in supporter role to download premium voices" do
      u = User.create
      expect(u.billing_state).to eq(:trialing_communicator)
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
        'seconds_to_add' => 5.years.to_i
      })
      expect(u.billing_state).to eq(:long_term_active_communicator)
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 2})

      u.settings['preferences']['role'] = 'supporter'
      expect(u.billing_state).to eq(:premium_supporter)      
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 2})
    end
  end
  
  describe "add_premium_voice" do
    it "should add the voice if not already claimed" do
      u = User.create
      u.subscription_override('never_expires')
      res = u.add_premium_voice('abcd', 'iOS')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']['claimed']).to eq(['abcd'])
    end
    
    it "should generate default values" do
      u = User.create
      u.subscription_override('never_expires')
      res = u.add_premium_voice('abcd', 'Android')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']['claimed']).to eq(['abcd'])
      expect(u.settings['premium_voices']['allowed']).to eq(2)
    end
    
    it "should allow eval accounts only a single voice" do
      u = User.create
      u.subscription_override('eval')
      u.save
      res = u.add_premium_voice('abcd', 'Android')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']['claimed']).to eq(['abcd'])
      expect(u.settings['premium_voices']['allowed']).to eq(1)
    end
    
    it "should error if too many voices have been claimed" do
      u = User.create
      u.subscription_override('never_expires')
      res = u.add_premium_voice('abcd', 'iOS')
      expect(res).to eq(true)
      res = u.add_premium_voice('abcdef', 'iOS')
      expect(res).to eq(true)
      res = u.add_premium_voice('abcdefg', 'iOS')
      expect(res).to eq(false)
      res = u.add_premium_voice('abcd', 'Android')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']['claimed']).to eq(['abcd', 'abcdef'])
    end
    
    it "should honor a manual change the the allowed number of voices" do
      u = User.create
      u.subscription_override('never_expires')
      u.settings['premium_voices'] = {'claimed' => [], 'allowed' => 3}
      res = u.add_premium_voice('abcd', 'iOS')
      expect(res).to eq(true)
      res = u.add_premium_voice('abcdef', 'iOS')
      expect(res).to eq(true)
      res = u.add_premium_voice('abcdefg', 'Android')
      expect(res).to eq(true)
      res = u.add_premium_voice('abcd', 'Android')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']['claimed']).to eq(['abcd', 'abcdef', 'abcdefg'])
    end
    
    it "should generate an AuditEvent record when a voice is added" do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.subscription_override('never_expires')
      u.settings['premium_voices'] = {'claimed' => [], 'allowed' => 3}
      expect(AuditEvent.count).to eq(1)
      res = u.add_premium_voice('abcd', 'Windows')
      expect(res).to eq(true)
      expect(AuditEvent.count).to eq(2)
      ae = AuditEvent.last
      expect(ae.event_type).to eq('voice_added')
      expect(ae.data['voice_id']).to eq('abcd')
      expect(ae.data['system']).to eq('Windows')
    end
    
    it "should not generate an AuditEvent record for an already-claimed voice" do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.subscription_override('never_expires')
      expect(AuditEvent.count).to eq(1)
      u.settings['premium_voices'] = {'claimed' => ['abcd'], 'allowed' => 3}
      res = u.add_premium_voice('abcd', 'Windows')
      expect(res).to eq(true)
      expect(AuditEvent.count).to eq(1)
    end

    it "should always allow global admins to add voices, and it should not generate AuditEvents for them" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u = User.create
      
      o.add_manager(u.user_name, true)
      u.reload

      expect(AuditEvent.count).to eq(0)
      res = u.add_premium_voice('abcd', 'Windows')
      expect(res).to eq(true)
      expect(AuditEvent.count).to eq(0)
      expect(u.settings['premium_voices']).to eq({'allowed' => 2, 'claimed' => ['abcd']})
    end

    it "should allow supervisors to add supervisee voices, and it should not generate AuditEvents for them" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2)
      expect(AuditEvent.count).to eq(0)
      u2.settings['premium_voices'] = {'claimed' => [], 'allowed' => 3}
      res = u2.add_premium_voice('abcd', 'Windows')
      expect(res).to eq(true)
      expect(AuditEvent.count).to eq(0)
      expect(u1.settings['premium_voices']).to eq(nil)
      expect(u2.settings['premium_voices']).to eq({'allowed' => 3, 'claimed' => ['abcd'], 'trial_voices' => [{'i' => 'abcd', 's' => 'Windows'}]})

      res = u1.add_premium_voice('abcd', 'Windows')
      expect(res).to eq(true)
      expect(AuditEvent.count).to eq(0)
      expect(u1.settings['premium_voices']).to eq({'allowed' => 0, 'claimed' => [], 'sup_claimed' => ['abcd']})
    end

    it "should allow trailing users to add a voice, but it should not generate an audit event at add time" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      expect(AuditEvent.count).to eq(0)
      res = u.add_premium_voice('abcd', 'Windows')
      expect(u.settings['premium_voices']).to eq({'allowed' => 1, 'claimed' => ['abcd'], 'trial_voices' => [{'i' => 'abcd', 's' => 'Windows'}]})
      expect(AuditEvent.count).to eq(0)
    end

    it "should not track trialing voices multiple times" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      expect(AuditEvent.count).to eq(0)
      res = u.add_premium_voice('abcd', 'Windows')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']).to eq({'allowed' => 1, 'claimed' => ['abcd'], 'trial_voices' => [{'i' => 'abcd', 's' => 'Windows'}]})
      expect(AuditEvent.count).to eq(0)

      res = u.add_premium_voice('abcd', 'iOS')
      expect(res).to eq(true)
      expect(u.settings['premium_voices']).to eq({'allowed' => 1, 'claimed' => ['abcd'], 'trial_voices' => [{'i' => 'abcd', 's' => 'Windows'}]})
      expect(AuditEvent.count).to eq(0)
    end

    it "should generate an audit event for trialing voices when the user actually subscribes" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      expect(AuditEvent.count).to eq(0)
      res = u.add_premium_voice('abcd', 'Windows')
      expect(u.settings['premium_voices']).to eq({'allowed' => 1, 'claimed' => ['abcd'], 'trial_voices' => [{'i' => 'abcd', 's' => 'Windows'}]})
      expect(AuditEvent.count).to eq(0)
      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'monthly_6'
      })
      expect(u.settings['premium_voices']).to eq({'allowed' => 2, 'claimed' => ['abcd']})
      expect(AuditEvent.count).to eq(1)
      ae = AuditEvent.last
      expect(ae.event_type).to eq('voice_added')
      expect(ae.data['voice_id']).to eq('abcd')
      expect(ae.data['system']).to eq('Windows')
    end

    it "should generate an audit event for trialing voices when the user actually purchases" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})
      expect(AuditEvent.count).to eq(0)
      res = u.add_premium_voice('abcd', 'Windows')
      expect(u.settings['premium_voices']).to eq({'allowed' => 1, 'claimed' => ['abcd'], 'trial_voices' => [{'i' => 'abcd', 's' => 'Windows'}]})
      expect(AuditEvent.count).to eq(0)
      res = u.update_subscription({
        'purchase' => true,
        'customer_id' => '12345',
        'plan_id' => 'long_term_200',
        'purchase_id' => '23456',
        'seconds_to_add' => 8.weeks.to_i
      })
      expect(u.settings['premium_voices']).to eq({'allowed' => 2, 'claimed' => ['abcd']})
      expect(AuditEvent.count).to eq(1)
      ae = AuditEvent.last
      expect(ae.event_type).to eq('voice_added')
      expect(ae.data['voice_id']).to eq('abcd')
      expect(ae.data['system']).to eq('Windows')
    end


    it "should not allow modeling_only accounts to download premium voices, even during the trial" do
      u = User.create
      expect(u.subscription_override('manual_modeler')).to eq(true)
      expect(u.billing_state).to eq(:modeling_only)
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})
      expect(u.settings['premium_voices']).to eq(nil)
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(false)
    end

    it "should not allow trialing supporters to download premium voices" do
      u2 = User.create
      u2.settings['preferences']['role'] = 'supporter'
      u2.save
      u2.reload
      expect(u2.billing_state).to eq(:trialing_supporter)
      expect(u2.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})
      expect(u2.add_premium_voice('abcd', 'Windows')).to eq(false)
    end

    it "should not allow a trialing communicator to claim a voice, switch to modeling-only, and keep the voice" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})      
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => ['abcd'], 'allowed' => 1, "trial_voices" => [{"i"=>"abcd", "s"=>"Windows"}]})
      expect(u.subscription_override('manual_modeler')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => [], 'allowed' => 0})
      expect(u.add_premium_voice('cdf', 'Windows')).to eq(false)
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(false)
    end

    it "should allow a modeling-only account to keep the voice that was manually granted" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})      
      expect(u.settings['premium_voices']).to eq(nil)
      expect(u.subscription_override('manual_modeler')).to eq(true)
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 0})      
      expect(u.settings['premium_voices']).to eq(nil)
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(false)
      expect(u.settings['premium_voices']).to eq(nil)
      
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})      
      expect(u.settings['premium_voices']).to eq(nil)
      u.allow_additional_premium_voice!
      u.allow_additional_premium_voice!
      expect(u.settings['premium_voices']).to eq({'claimed' => [], 'allowed' => 2, 'extra' => 2})
      expect(u.add_premium_voice('defg', 'Windows')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => ['defg'], 'allowed' => 2, 'extra' => 2, "trial_voices" => [{"i"=>"defg", "s"=>"Windows"}]})
      expect(u.subscription_override('manual_modeler')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => ['defg'], 'allowed' => 2, 'extra' => 2})
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => ['defg', 'abcd'], 'allowed' => 2, 'extra' => 2})
      expect(u.add_premium_voice('qwer', 'Windows')).to eq(false)
    end

    it "should not allow a trialing communicator to claim a voice, switch to a paid supporter, and keep the voice" do
      u = User.create
      expect(u.default_premium_voices).to eq({'claimed' => [], 'allowed' => 1})      
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => ['abcd'], 'allowed' => 1, "trial_voices"=>[{"i"=>"abcd", "s"=>"Windows"}]})
      expect(u.subscription_override('manual_modeler')).to eq(true)
      expect(u.settings['premium_voices']).to eq({'claimed' => [], 'allowed' => 0})
      expect(u.add_premium_voice('cdf', 'Windows')).to eq(false)
      expect(u.add_premium_voice('abcd', 'Windows')).to eq(false)
    end
  end

  describe "process_sidebar_boards" do
    it "should work on an empty list" do
      u = User.new
      u.settings = {}
      u.process_sidebar_boards([], {})
      expect(u.settings['preferences']['sidebar_boards']).to eq(nil)
      
      u.settings['preferences']['sidebar_boards'] = [{}, {}]
      u.process_sidebar_boards([], {})
      expect(u.settings['preferences']['sidebar_boards']).to eq(nil)
    end
    
    it "should filter out extra attributes" do
      u = User.create
      b = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'alert' => true,
          'bacon' => true
        },
        {
          'key' => b.key,
          'bacon' => true
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['sidebar_boards'][0]).to eq({
        'alert' => true,
        'name' => 'Alert',
        'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/to%20sound.png',
        'special' => true
      })
      expect(u.settings['preferences']['sidebar_boards'][1]).to eq({
        'name' => b.settings['name'],
        'key' => b.key,
        'home_lock' => false,
        'locale' => 'en',
        'image' => 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png'
      })
    end

    it "should support special buttons" do
      u = User.create
      b = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'special' => true,
          'name' => 'Beep',
          'action' => ':beep'
        },
        {},
        {
          'special' => true,
          'action' => ':app(com.facebook.katana)',
          'image' => 'http://www.example.com/pic.png'
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['sidebar_boards'][0]).to eq({
        'special' => true,
        'name' => 'Beep',
        'image' => 'https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/touch_437_g.svg',
        'action' => ':beep'
      })
      expect(u.settings['preferences']['sidebar_boards'][1]).to eq({
        'special' => true,
        'name' => ':app',
        'image' => 'http://www.example.com/pic.png',
        'action' => ':app(com.facebook.katana)'
      })
    end
    
    it "should only include each board once" do
      u = User.create
      b = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'alert' => true,
          'bacon' => true
        },
        {
          'alert' => true,
          'bacon' => true
        },
        {
          'key' => b.key,
          'home_lock' => true,
          'image' => 'http://www.example.com/pic.png',
          'name' => 'Fred',
          'bacon' => true
        },
        {
          'key' => b.key,
          'bacon' => true
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['sidebar_boards'][1]).to eq({
        'name' => 'Fred',
        'key' => b.key,
        'home_lock' => true,
        'locale' => 'en',
        'image' => 'http://www.example.com/pic.png'
      })
    end
    
    it "should support alert-style buttons" do
      u = User.create
      b = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'alert' => true,
          'name' => 'Ahem',
          'image' => 'http://www.example.com/pic.png'
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(1)
      expect(u.settings['preferences']['sidebar_boards'][0]).to eq({
        'alert' => true,
        'name' => 'Ahem',
        'image' => 'http://www.example.com/pic.png',
        'special' => true
      })
    end
    
    it "should check for view permission before allowing on the sidebar" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u2)
      u.process_sidebar_boards([
        {
          'alert' => true
        },
        {
          'key' => b.key
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(1)
    end
    
    it "should automatically share with the user if the updater has permission" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u2)
      u.process_sidebar_boards([
        {
          'alert' => true
        },
        {
          'key' => b.key
        }
      ], {'updater' => u2})
      u.save
      expect(b.reload.shared_with?(u)).to eq(true)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
    end
    
    it "should add buttons to prior_sidebar_boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'alert' => true
        },
        {
          'key' => b.key
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['prior_sidebar_boards'].length).to eq(2)

      u.process_sidebar_boards([
        {
          'alert' => true
        },
        {
          'key' => b.key
        }
      ], {})
      expect(u.settings['preferences']['prior_sidebar_boards'].length).to eq(2)

      u.process_sidebar_boards([
        {
          'alert' => true
        },
        {
          'key' => b2.key
        }
      ], {})
      expect(u.settings['preferences']['prior_sidebar_boards'].length).to eq(3)

      u.process_sidebar_boards([
        {
          'alert' => true
        }
      ], {})
      expect(u.settings['preferences']['prior_sidebar_boards'].length).to eq(3)
    end
    
    it "should allow location-based filtered boards" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'key' => b1.key,
          'highlight_type' => 'locations',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]]
        },
        {
          'key' => b2.key,
          'highlight_type' => 'locations',
          'ssids' => ['MonkeyBrains', 'whatever']
        },
        {
          'key' => b3.key,
          'highlight_type' => 'locations',
          'geos' => '1.1,2.2;3.3,4.4;5.5,6.6',
          'ssids' => 'Cooolness,Home Wifi'
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards']).to_not eq(nil)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(3)
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(b1.key)
      expect(u.settings['preferences']['sidebar_boards'][0]['highlight_type']).to eq('locations')
      expect(u.settings['preferences']['sidebar_boards'][0]['geos']).to eq([[5.1, 3.001], [6.11, 8888.34]])
      expect(u.settings['preferences']['sidebar_boards'][0]['ssids']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][1]['key']).to eq(b2.key)
      expect(u.settings['preferences']['sidebar_boards'][1]['highlight_type']).to eq('locations')
      expect(u.settings['preferences']['sidebar_boards'][1]['geos']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][1]['ssids']).to eq(['MonkeyBrains', 'whatever'])
      expect(u.settings['preferences']['sidebar_boards'][2]['key']).to eq(b3.key)
      expect(u.settings['preferences']['sidebar_boards'][2]['highlight_type']).to eq('locations')
      expect(u.settings['preferences']['sidebar_boards'][2]['geos']).to eq([[1.1,2.2],[3.3,4.4],[5.5,6.6]])
      expect(u.settings['preferences']['sidebar_boards'][2]['ssids']).to eq(['Cooolness','Home Wifi'])
    end
    
    it "should allow time-based filtered boards" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'key' => b1.key,
          'highlight_type' => 'times',
          'times' => [["05:00:12.1", "6:35"], ["12:00am", "4:14pm"]]
        },
        {
          'key' => b2.key,
          'highlight_type' => 'times',
          'times' => "21:00:04.1234-22:00;4:45pm-7:00pm"
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards']).to_not eq(nil)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(b1.key)
      expect(u.settings['preferences']['sidebar_boards'][0]['highlight_type']).to eq('times')
      expect(u.settings['preferences']['sidebar_boards'][0]['times']).to eq([["05:00", "06:35"], ["00:00", "16:14"]])
      expect(u.settings['preferences']['sidebar_boards'][1]['key']).to eq(b2.key)
      expect(u.settings['preferences']['sidebar_boards'][1]['highlight_type']).to eq('times')
      expect(u.settings['preferences']['sidebar_boards'][1]['times']).to eq([["21:00","22:00"],["16:45","19:00"]])
    end
    
    it "should allow place-based filtered boards" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'key' => b1.key,
          'highlight_type' => 'places',
          'places' => ['accountant', 'grocery_store']
        },
        {
          'key' => b2.key,
          'highlight_type' => 'places',
          'places' => "zoo,coffee_shop,laundromat"
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards']).to_not eq(nil)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(b1.key)
      expect(u.settings['preferences']['sidebar_boards'][0]['highlight_type']).to eq('places')
      expect(u.settings['preferences']['sidebar_boards'][0]['places']).to eq(["accountant", "grocery_store"])
      expect(u.settings['preferences']['sidebar_boards'][1]['key']).to eq(b2.key)
      expect(u.settings['preferences']['sidebar_boards'][1]['highlight_type']).to eq('places')
      expect(u.settings['preferences']['sidebar_boards'][1]['places']).to eq(['zoo', 'coffee_shop', 'laundromat'])
    end
    
    it "should allow custom filtered boards" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'key' => b1.key,
          'highlight_type' => 'custom',
          'places' => ['accountant', 'grocery_store'],
          'times' => [["05:00:12.1", "06:35"], ["12:00am", "4:14pm"]]
        },
        {
          'key' => b2.key,
          'highlight_type' => 'custom',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]],
          'ssids' => ['MonkeyBrains', 'whatever'],
          'places' => "zoo,coffee_shop,laundromat"
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards']).to_not eq(nil)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(2)
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(b1.key)
      expect(u.settings['preferences']['sidebar_boards'][0]['highlight_type']).to eq('custom')
      expect(u.settings['preferences']['sidebar_boards'][0]['geos']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][0]['ssids']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][0]['times']).to eq([["05:00", "06:35"], ["00:00", "16:14"]])
      expect(u.settings['preferences']['sidebar_boards'][0]['places']).to eq(['accountant', 'grocery_store'])
      expect(u.settings['preferences']['sidebar_boards'][1]['key']).to eq(b2.key)
      expect(u.settings['preferences']['sidebar_boards'][1]['highlight_type']).to eq('custom')
      expect(u.settings['preferences']['sidebar_boards'][1]['geos']).to eq([[5.1, 3.001], [6.11, 8888.34]])
      expect(u.settings['preferences']['sidebar_boards'][1]['ssids']).to eq(['MonkeyBrains', 'whatever'])
      expect(u.settings['preferences']['sidebar_boards'][1]['times']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][1]['places']).to eq(['zoo','coffee_shop','laundromat'])
    end
    
    it "should clear unnecessary board highlighting attributes" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b5 = Board.create(:user => u)
      u.process_sidebar_boards([
        {
          'key' => b1.key,
          'highlight_type' => 'locations',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]],
          'ssids' => ['MonkeyBrains', 'whatever'],
          'places' => ['accountant', 'grocery_store'],
          'times' => [["05:00:12.1", "06:35"], ["12:00am", "4:14pm"]]
        },
        {
          'key' => b2.key,
          'highlight_type' => 'times',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]],
          'ssids' => ['MonkeyBrains', 'whatever'],
          'places' => ['accountant', 'grocery_store'],
          'times' => [["05:00:12.1", "06:35"], ["12:00am", "4:14pm"]]
        },
        {
          'key' => b3.key,
          'highlight_type' => 'places',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]],
          'ssids' => ['MonkeyBrains', 'whatever'],
          'places' => ['accountant', 'grocery_store'],
          'times' => [["05:00:12.1", "06:35"], ["12:00am", "4:14pm"]]
        },
        {
          'key' => b4.key,
          'highlight_type' => 'custom',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]],
          'ssids' => ['MonkeyBrains', 'whatever'],
          'places' => ['accountant', 'grocery_store'],
          'times' => [["05:00:12.1", "06:35"], ["12:00am", "4:14pm"]]
        },
        {
          'key' => b5.key,
          'highlight_type' => 'none',
          'geos' => [[5.1, 3.001], [6.11, 8888.34]],
          'ssids' => ['MonkeyBrains', 'whatever'],
          'places' => ['accountant', 'grocery_store'],
          'times' => [["05:00:12.1", "06:35"], ["12:00am", "4:14pm"]]
        }
      ], {})
      expect(u.settings['preferences']['sidebar_boards']).to_not eq(nil)
      expect(u.settings['preferences']['sidebar_boards'].length).to eq(5)
      expect(u.settings['preferences']['sidebar_boards'][0]['key']).to eq(b1.key)
      expect(u.settings['preferences']['sidebar_boards'][0]['highlight_type']).to eq('locations')
      expect(u.settings['preferences']['sidebar_boards'][0]['geos']).to eq([[5.1, 3.001], [6.11, 8888.34]])
      expect(u.settings['preferences']['sidebar_boards'][0]['ssids']).to eq(['MonkeyBrains', 'whatever'])
      expect(u.settings['preferences']['sidebar_boards'][0]['times']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][0]['places']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][1]['key']).to eq(b2.key)
      expect(u.settings['preferences']['sidebar_boards'][1]['highlight_type']).to eq('times')
      expect(u.settings['preferences']['sidebar_boards'][1]['geos']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][1]['ssids']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][1]['times']).to eq([["05:00", "06:35"], ["00:00", "16:14"]])
      expect(u.settings['preferences']['sidebar_boards'][1]['places']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][2]['key']).to eq(b3.key)
      expect(u.settings['preferences']['sidebar_boards'][2]['highlight_type']).to eq('places')
      expect(u.settings['preferences']['sidebar_boards'][2]['geos']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][2]['ssids']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][2]['times']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][2]['places']).to eq(['accountant', 'grocery_store'])
      expect(u.settings['preferences']['sidebar_boards'][3]['key']).to eq(b4.key)
      expect(u.settings['preferences']['sidebar_boards'][3]['highlight_type']).to eq('custom')
      expect(u.settings['preferences']['sidebar_boards'][3]['geos']).to eq([[5.1, 3.001], [6.11, 8888.34]])
      expect(u.settings['preferences']['sidebar_boards'][3]['ssids']).to eq(['MonkeyBrains', 'whatever'])
      expect(u.settings['preferences']['sidebar_boards'][3]['times']).to eq([["05:00", "06:35"], ["00:00", "16:14"]])
      expect(u.settings['preferences']['sidebar_boards'][3]['places']).to eq(['accountant', 'grocery_store'])
      expect(u.settings['preferences']['sidebar_boards'][4]['key']).to eq(b5.key)
      expect(u.settings['preferences']['sidebar_boards'][4]['highlight_type']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][4]['geos']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][4]['ssids']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][4]['times']).to eq(nil)
      expect(u.settings['preferences']['sidebar_boards'][4]['places']).to eq(nil)
    end
  end
  
  describe "sidebar_boards" do
    it "should return the default by default" do
      u = User.new
      expect(u.sidebar_boards).to eq(User.default_sidebar_boards)
    end
    
    it "should return the default if the current setting is an empty list" do
      u = User.new
      u.settings = {'preferences' => {'sidebar_boards' => []}}
      expect(u.sidebar_boards).to eq(User.default_sidebar_boards)
    end
    
    it "should return the current setting if it's a non-empty list" do
      u = User.new
      u.settings = {'preferences' => {'sidebar_boards' => ['a', 'b', 'c']}}
      expect(u.sidebar_boards).to eq(['a', 'b', 'c'])
    end
  end
  
  describe "avatars" do
    describe "generated_avatar_url" do
      it "should use the fallback if specified" do
        u = User.new
        u.id = 199
        expect(u.generated_avatar_url('fallback')).to eq('https://lingolinq.s3.amazonaws.com/avatars/avatar-9.png')
        u.settings = {'email' => 'bob@example.com'}
        expect(u.generated_avatar_url('fallback')).to eq('https://lingolinq.s3.amazonaws.com/avatars/avatar-9.png')
        u.settings['avatar_url'] = 'http://www.example.com/pic.png'
      end
      
      it "should use the default if specified" do
        u = User.new
        u.id = 199
        u.settings = {'email' => 'bob@example.com'}
        expect(u.generated_avatar_url('default')).to eq('https://lingolinq.s3.amazonaws.com/avatars/avatar-9.png');
        u.settings['avatar_url'] = 'http://www.example.com/pic.png'
        expect(u.generated_avatar_url('default')).to eq('https://lingolinq.s3.amazonaws.com/avatars/avatar-9.png');
      end
      
      it "should use the passed-in url if specified" do
        u = User.new
        u.id = 199
        u.settings = {'email' => 'bob@example.com'}
        u.settings['avatar_url'] = 'http://www.example.com/pic.png'
        expect(u.generated_avatar_url('http://www.example.com/pic2.png')).to eq('http://www.example.com/pic2.png');
      end
      
      it "should use the user-saved url if set" do
        u = User.new
        u.id = 199
        u.settings = {'email' => 'bob@example.com'}
        u.settings['avatar_url'] = 'http://www.example.com/pic.png'
        expect(u.generated_avatar_url).to eq('http://www.example.com/pic.png');
      end
    end

#   def prior_avatar_urls
#     res = self.settings && self.settings['prior_avatar_urls']
#     current = generated_avatar_url
#     default = generated_avatar_url('default')
#     if (res && res.length > 0) || current != default
#       res = res || []
#       res.push(default)
#     end
#     res
#   end    
    describe "prior_avatar_urls" do
      it "should add the current avatar url to the list when changed" do
        u = User.new
        u.settings = {}
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'http://www.example.com/pic.png'})
        expect(u.generated_avatar_url).to eq('http://www.example.com/pic.png');
        expect(u.prior_avatar_urls).to eq([u.generated_avatar_url('default')])
        u.process({'avatar_url' => 'http://www.example.com/pic2.png'})
        expect(u.prior_avatar_urls).to eq(['http://www.example.com/pic.png', u.generated_avatar_url('default')])
      end
      
      it "should not add the current avatar url to the list if 'fallback'" do
        u = User.new
        u.settings = {}
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'fallback'})
        expect(u.generated_avatar_url).to eq(u.generated_avatar_url('fallback'));
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'http://www.example.com/pic2.png'})
        expect(u.prior_avatar_urls).to eq([u.generated_avatar_url('default')])
      end
      
      it "should not add the current avatar url to the list if 'default'" do
        u = User.new
        u.settings = {}
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'default'})
        expect(u.generated_avatar_url).to eq(u.generated_avatar_url('default'));
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'http://www.example.com/pic2.png'})
        expect(u.prior_avatar_urls).to eq([u.generated_avatar_url('default')])
      end
      
      it "should return a list of prior avatar urls" do
        u = User.new
        u.settings = {}
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'http://www.example.com/pic.png'})
        expect(u.generated_avatar_url).to eq('http://www.example.com/pic.png');
        expect(u.prior_avatar_urls).to eq([u.generated_avatar_url('default')])
        u.process({'avatar_url' => 'http://www.example.com/pic2.png'})
        expect(u.prior_avatar_urls).to eq(['http://www.example.com/pic.png', u.generated_avatar_url('default')])
      end
      
      it "should include the default avatar url only if different than the current avatar url" do
        u = User.create
        u.settings = {}
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => u.generated_avatar_url('default')})
        expect(u.generated_avatar_url).to eq(u.generated_avatar_url('default'));
        expect(u.prior_avatar_urls).to eq(nil)
        u.process({'avatar_url' => 'http://www.example.com/pic2.png'})
        expect(u.prior_avatar_urls).to eq([u.generated_avatar_url('default')])
      end
    end
  end
  
  describe "handle_notification" do
    it "should add a notification to the dashboard list"
    
    it "should handle push messages"
    
    it "should handle button change events"
    
    it "should handle utterance sharing" do
      u = User.create
      u2 = User.create
      ut = Utterance.create
      u.handle_notification('utterance_shared', ut, {
        'text' => 'alternate pantsuit',
        'sharer' => {'user_id' => u2.global_id}
      })
      expect(u.settings['user_notifications']).to_not eq(nil)
      expect(u.settings['user_notifications'].length).to eq(1)
      expect(u.settings['user_notifications'][0]['text']).to eq('alternate pantsuit')
      expect(u.settings['user_notifications'][0]['type']).to eq('utterance_shared')
    end
    
    it "should add an utterance share to the dashboard, even if email is sent" do
      u = User.create(:settings => {'email' => 'u1@example.com'})
      u.settings['preferences']['share_notifications'] = 'email'
      u.save
      
      u2 = User.create
      ut = Utterance.create
      expect(UserMailer).to receive(:schedule_delivery).with(:utterance_share, {
        'subject' => 'alternate pantsuit',
        'message' => 'alternate pantsuit',
        'sharer_id' => u2.global_id,
        'to' => 'u1@example.com',
        'sharer_name' => u2.settings['name'],
        'reply_url' => nil,
        'recipient_id' => u.global_id,
        'reply_id' => nil,
        'utterance_id' => ut.global_id
      })
      u.handle_notification('utterance_shared', ut, {
        'text' => 'alternate pantsuit',
        'sharer' => {'user_id' => u2.global_id}
      })
      expect(u.settings['user_notifications']).to_not eq(nil)
      expect(u.settings['user_notifications'].length).to eq(1)
      expect(u.settings['user_notifications'][0]['text']).to eq('alternate pantsuit')
      expect(u.settings['user_notifications'][0]['type']).to eq('utterance_shared')
    end
    
    it "should not email an utterance share if app is the preferred delivery method" do
      u = User.create
      u.settings['preferences']['share_notifications'] = 'app'
      u.save
      
      u2 = User.create(:settings => {'email' => 'u2@example.com'})
      ut = Utterance.create
      expect(UserMailer).to_not receive(:schedule_delivery)
      u.handle_notification('utterance_shared', ut, {
        'text' => 'alternate pantsuit',
        'sharer' => {'user_id' => u2.global_id}
      })
      expect(u.settings['user_notifications']).to_not eq(nil)
      expect(u.settings['user_notifications'].length).to eq(1)
      expect(u.settings['user_notifications'][0]['text']).to eq('alternate pantsuit')
      expect(u.settings['user_notifications'][0]['type']).to eq('utterance_shared')
    end
    
    it "should schedule email for badge awards if not disabled" do
      u = User.create
      u.settings['preferences']['goal_notifications'] = 'enabled'
      u.save
      b = UserBadge.create(:user => u, :data => {'name' => 'badgy wadgy'})
      expect(UserMailer).to receive(:schedule_delivery).with(:badge_awarded, u.global_id, b.global_id)
      u.handle_notification('badge_awarded', b, {})
    end
    
    it "should not schedule email for badge awards if disabled" do
      u = User.create
      u.settings['preferences']['goal_notifications'] = 'disabled'
      u.save
      b = UserBadge.create(:user => u, :data => {'name' => 'badgy wadgy'})
      expect(UserMailer).to_not receive(:schedule_delivery).with(:badge_awarded, u.global_id, b.global_id)
      u.handle_notification('badge_awarded', b, {})
    end
    
    it "should add a user notification for badge awards" do
      u = User.create
      u.settings['preferences']['goal_notifications'] = 'disabled'
      u.save
      b = UserBadge.create(:user => u, :data => {'name' => 'badgy wadgy'}, :level => 1)
      u.handle_notification('badge_awarded', b, {})
      expect(u.settings['user_notifications'].length).to eq(1)
      expect(u.settings['user_notifications'][0].except('added_at')).to eq({
        'type' => 'badge_awarded',
        'occurred_at' => b.awarded_at,
        'user_name' => u.user_name,
        'badge_name' => 'badgy wadgy',
        'badge_level' => 1,
        'id' => b.global_id
      })
    end
  end

  it "should securely serialize settings" do
    u = User.new(:settings => {:a => 2})
    u.generate_defaults
    expect(GoSecure::SecureJson).to receive(:dump).with(u.settings)
    u.save
  end
  
  describe "pending" do
    it "should unpend the user when they are added to an org" do
      u = User.create(:settings => {'pending' => true})
      expect(u.settings['pending']).to eq(true)
      o = Organization.create
      o.add_user(u.user_name, true, false)
      expect(u.reload.settings['pending']).to eq(false)
    end
    
    it "should unpend a user when they add a paid subscription" do
      u = User.create(:settings => {'pending' => true})
      expect(u.settings['pending']).to eq(true)

      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '12345',
        'plan_id' => 'slp_monthly_free'
      })
      expect(res).to eq(true)
      expect(u.settings['pending']).to eq(true)

      res = u.update_subscription({
        'subscribe' => true,
        'subscription_id' => '123456',
        'plan_id' => 'monthly_6'
      })
      expect(res).to eq(true)
      expect(u.settings['pending']).to eq(false)
    end
    
    it "should unpend a user when their subscription is manually overridden" do
      u = User.create(:settings => {'pending' => true})
      expect(u.settings['pending']).to eq(true)
      expect(u.subscription_override('never_expires')).to eq(true)
      expect(u.reload.settings['pending']).to eq(false)
    end
  end
  
  describe "next_notification_at" do
    it "should not schedule by default" do
      u = User.create
      expect(u.next_notification_at).to eq(nil)
    end
    
    it "should correctly schedule if notification_frequency is set" do
      u = User.create
      u.settings['preferences']['notification_frequency'] = 'something'
      u.save
      expect(u.next_notification_at).to be > Time.now
      expect(u.next_notification_at).to be < Time.now + 2.weeks

      u.settings['preferences']['notification_frequency'] = '2_weeks'
      u.save
      expect(u.next_notification_at).to be > Time.now
      expect(u.next_notification_at).to be < Time.now + 2.weeks
      u.next_notification_at = nil
      u.save
      expect(u.next_notification_at).to be > Time.now
      expect(u.next_notification_at).to be > Time.now + 1.week
      expect(u.next_notification_at).to be < Time.now + 16.days
    end
    
    it "should generate correct next_notification_schedule for weekly updates" do
      # 2015-01-01 was a thursday
      expect(Time).to receive(:now).and_return(Time.parse("2015-01-01")).at_least(1).times
      u = User.new(:settings => {'preferences' => {'notification_frequency' => 'whatever'}})
      u.id = 1
      # a week from saturday at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-03 23:30 UTC'));
      u.id = 0
      # a week from friday at 22:00
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-02 22:00 UTC'));
      u.id = 2
      # a week from friday at 0:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-03 00:00 UTC'));
      u.id = 3
      # a week from saturday at 1:30 (move to sunday)
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-04 01:30 UTC'));
      u.id = 4
      # a week from friday at 2:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-03 02:00 UTC'));
      u.id = 5
      # a week from saturday at 22:30
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-03 22:30 UTC'));
      u.settings['preferences']['notification_frequency'] = '1_week'
      u.id = 1
      # a week from saturday at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2015-01-03 23:30 UTC'));
    end

    it "should generate correct next_notification_schedule for weekly updates" do
      # 2015-01-01 was a thursday
      expect(Time).to receive(:now).and_return(Time.parse("2016-07-21")).at_least(1).times
      u = User.new(:settings => {'preferences' => {'notification_frequency' => '1_week'}})
      u.id = 1
      # a week from saturday at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 23:30 UTC'));
      u.id = 0
      # a week from friday at 22:00
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-22 22:00 UTC'));
      u.id = 2
      # a week from friday at 0:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 00:00 UTC'));
      u.id = 3
      # a week from saturday at 1:30 (move to sunday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-24 01:30 UTC'));
      u.id = 4
      # a week from friday at 2:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 02:00 UTC'));
      u.id = 5
      # a week from saturday at 22:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 22:30 UTC'));
    end

    it "should generate correct next_notification_schedule for weekly updates" do
      # 2015-01-01 was a thursday
      expect(Time).to receive(:now).and_return(Time.parse("2016-07-22")).at_least(1).times
      u = User.new(:settings => {'preferences' => {'notification_frequency' => '1_week'}})
      u.id = 1
      # a week from saturday at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 23:30 UTC'));
      u.id = 0
      # a week from friday at 22:00
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-29 22:00 UTC'));
      u.id = 2
      # a week from friday at 0:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-30 00:00 UTC'));
      u.id = 3
      # a week from saturday at 1:30 (move to sunday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-24 01:30 UTC'));
      u.id = 4
      # a week from friday at 2:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-30 02:00 UTC'));
      u.id = 5
      # a week from saturday at 22:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 22:30 UTC'));
    end
    
    it "should generate correct next_notification_schedule for every other week updates" do
      # 2016-06-03 was a friday
      expect(Time).to receive(:now).and_return(Time.parse("2016-06-03 11:00")).at_least(1).times
      u = User.new(:settings => {'preferences' => {'notification_frequency' => '2_weeks'}})
      u.id = 1
      # two weeks from saturday at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-06-18 23:30 UTC'));
      u.id = 0
      # two weeks from today at 22:00
      expect(u.next_notification_schedule).to eq(Time.parse('2016-06-17 22:00 UTC'));
      u.id = 2
      # two weeks from today at 0:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-06-18 00:00 UTC'));
      u.id = 3
      # two weeks from saturday at 1:30 (move to sunday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-06-19 01:30 UTC'));
      u.id = 4
      # two weeks from today at 2:00 (move to saturday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-06-18 02:00 UTC'));
      u.id = 5
      # two weeks from saturday at 22:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-06-18 22:30 UTC'));
    end

    it "should generate correct next_notification_schedule for monthly updates" do
      # 2016-03-02 was a wednesday
      expect(Time).to receive(:now).and_return(Time.parse("2016-03-02 02:00")).at_least(1).times
      u = User.new(:settings => {'preferences' => {'notification_frequency' => '1_month'}})
      u.id = 1
      # one month from today at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-04-02 23:30 UTC'));
      u.id = 0
      # one month from today at 22:00
      expect(u.next_notification_schedule).to eq(Time.parse('2016-04-02 22:00 UTC'));
      u.id = 2
      # one month from today at 0:00 (move to next day)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-04-03 00:00 UTC'));
      u.id = 3
      # one month from today at 1:30 (move to next day)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-04-03 01:30 UTC'));
      u.id = 4
      # one month from today at 2:00 (move to next day)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-04-03 02:00 UTC'));
      u.id = 5
      # one month from today at 22:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-04-02 22:30 UTC'));
    end
  end
  
  describe "goal_code" do
    describe "goal_code" do
      it "should raise if no user passed" do
        g = UserGoal.new
        expect{ g.goal_code(nil) }.to raise_error("goal_id required")
        g = UserGoal.create
        expect{ g.goal_code(nil) }.to raise_error("user required")
      end
      
      it "should generate a valid code" do
        u = User.create
        g = UserGoal.create
        res = g.goal_code(u)
        parts = res.split(/-/)
        expect(parts.length).to eq(6)
        expect(parts[0]).to eq('G')
        expect(parts[1]).to be > 5.seconds.ago.to_i.to_s
        expect(parts[1]).to be < 5.seconds.from_now.to_i.to_s
        expect(parts[2]).to eq(g.global_id)
        expect(parts[3]).to eq(u.global_id)
        expect(parts[5]).to eq(GoSecure.sha512(parts[1] + "_" + parts[2] + "_" + parts[3], parts[4])[0, 20])
      end

      it "should generate a valid status code" do
        u = User.create
        g = UserGoal.create
        res = UserGoal.goal_code('status', u)
        parts = res.split(/-/)
        expect(parts.length).to eq(6)
        expect(parts[0]).to eq('G')
        expect(parts[1]).to be > 5.seconds.ago.to_i.to_s
        expect(parts[1]).to be < 5.seconds.from_now.to_i.to_s
        expect(parts[2]).to eq('status')
        expect(parts[3]).to eq(u.global_id)
        expect(parts[5]).to eq(GoSecure.sha512(parts[1] + "_" + parts[2] + "_" + parts[3], parts[4])[0, 20])
      end
    end
    
    describe "process_status_from_code" do
      it "should return false if attributes not found" do
        g = UserGoal.new
        expect(UserGoal.process_status_from_code('123', '4', 'asdf')).to eq(false)
        u = User.create
        expect(UserGoal.process_status_from_code('123', '3', UserGoal.goal_code('123', u) + "x")).to eq(false)
      end
      
      it "should generate unique codes each time" do
        u = User.create
        g = UserGoal.create(user: u)
        code1 = g.goal_code(u)
        code2 = g.goal_code(u)
        code3 = g.goal_code(u)
        expect(code1).to_not eq(code2)
        expect(code1).to_not eq(code3)
        expect(code2).to_not eq(code3)
      end
      
      it "should return the generated log of processed" do
        u1 = User.create
        g = UserGoal.create(:user => u1)
        u2 = User.create
        d = Device.create(:user => u2)
        code = g.goal_code(u2)
        res = UserGoal.process_status_from_code(g.global_id, '2', code)
        expect(res).to_not eq(nil)
        expect(res.user).to eq(u1)
        expect(res.author).to eq(u2)
        expect(res.data['goal']['id']).to eq(g.global_id)
        expect(res.data['goal']['status']).to eq(2)
        expect(g.reload.settings['used_codes'][0][0]).to eq(code)
      end

      it "should allow processing a general status-check 'goal'" do
        u1 = User.create
        u2 = User.create
        d = Device.create(:user => u2)
        code = UserGoal.goal_code('status', u2)
        res = UserGoal.process_status_from_code("status-#{u1.global_id}", '2', code)
        expect(res).to_not eq(nil)
        expect(res.user).to eq(u1)
        expect(res.author).to eq(u2)
        expect(res.data['goal']['id']).to eq(nil)
        expect(res.data['goal']['global']).to eq(true)
        expect(res.data['goal']['status']).to eq(2)
      end
    end
  end
  
  describe "blocked email" do
    it "should not allow setting email to a blocked address" do
      Setting.block_email!('bob@yahoo.com')
      u = User.process_new({'email' => 'Bob@yahoo.com'})
      expect(u.id).to eq(nil)
      expect(u.errored?).to eq(true)
      expect(u.processing_errors).to eq(['blocked email address'])
    end
    
    it "should allow someone already created with a blocked email to continue updating their account" do
      u = User.process_new({'email' => 'bob@yahoo.com'})
      expect(u.id).to_not eq(nil)
      expect(u.errored?).to eq(false)
      Setting.block_email!('BOB@yahoo.com')

      u.process({'email' => 'bob@yahoo.com', 'name' => 'Bob Dude'})
      expect(u.errored?).to eq(false)
      
      Setting.block_email!('bob@yahoo.com')
      u = User.process_new({'email' => 'Bob@yahoo.com'})
      expect(u.id).to eq(nil)
      expect(u.errored?).to eq(true)
      expect(u.processing_errors).to eq(['blocked email address'])
    end
  end


  describe "find_for_login" do
    it "should find the right user_name" do
      u = User.create(:user_name => 'brody')
      u2 = User.create(:user_name => 'brittney')
      expect(User.find_for_login('brody')).to eq(u)
      expect(User.find_for_login('brittney')).to eq(u2)
      expect(User.find_for_login('bacon')).to eq(nil)
    end
    
    it "should be case insensitive and strip whitespace" do
      u = User.create(:user_name => 'brody')
      u2 = User.create(:user_name => 'brittney')
      expect(User.find_for_login('Brody')).to eq(u)
      expect(User.find_for_login(' BrOdY   ')).to eq(u)
      expect(User.find_for_login('BRITTNEY')).to eq(u2)
    end
    
    it "should find by email if not found by user_name" do
      u = User.create(:user_name => 'bob', :settings => {'email' => 'bob@example.com'})
      expect(User.find_for_login('bob@example.com')).to eq(u)
      expect(User.find_for_login(' bob@example.com')).to eq(u)
      expect(User.find_for_login('bob@example.com    ')).to eq(u)
      expect(User.find_for_login('BOB@example.Com')).to eq(u)
    end
    
    it "should return the first result if multiple logins for the same email address" do
      u1 = User.create(:user_name => 'bob', :settings => {'email' => 'bob@example.com'})
      u2 = User.create(:user_name => 'bob_2', :settings => {'email' => 'bob@example.com'})
      expect(User.find_for_login('bob')).to eq(u1)
      expect(User.find_for_login('bob_2')).to eq(u2)
      expect(User.find_for_login('bob@example.com')).to eq(u1)
    end

    it "should return the first password-matching email address" do
      u1 = User.create(:user_name => 'bob', :settings => {'email' => 'bob@example.com'})
      u1.generate_password('bacon')
      u1.save
      u2 = User.create(:user_name => 'bob_2', :settings => {'email' => 'bob@example.com'})
      u2.generate_password('cheddar')
      u2.save
      expect(User.find_for_login('bob')).to eq(u1)
      expect(User.find_for_login('bob_2')).to eq(u2)
      expect(User.find_for_login('bob@example.com')).to eq(u1)
      expect(User.find_for_login('bob@example.com', nil, 'bacon')).to eq(u1)
      expect(User.find_for_login('bob@example.com', nil, 'cheddar')).to eq(u2)
    end

    it "should return nothing if multiple email address accounts have the same password" do
      u1 = User.create(:user_name => 'bob', :settings => {'email' => 'bob@example.com'})
      u1.generate_password('bacon')
      u1.save
      u2 = User.create(:user_name => 'bob_2', :settings => {'email' => 'bob@example.com'})
      u2.generate_password('bacon')
      u2.save
      expect(User.find_for_login('bob')).to eq(u1)
      expect(User.find_for_login('bob_2')).to eq(u2)
      expect(User.find_for_login('bob@example.com')).to eq(u1)
      expect(User.find_for_login('bob@example.com', nil, 'bacon')).to eq(nil)
      expect(User.find_for_login('bob@example.com', nil, 'cheddar')).to eq(nil)
    end

    it "should not permit a valet login if not allowed" do
      u = User.create(:user_name => 'brody')
      u.process({'valet_login' => true, 'valet_password' => 'protractor'}, {'updater' => u})
      res = User.find_for_login("model@#{u.global_id.sub(/_/, '.')}")
      expect(res).to eq(nil)
      res = User.find_for_login("model@#{u.global_id.sub(/_/, '.')}", nil, nil, true)
      expect(res).to eq(u)
      expect(res.valet_mode?).to eq(true)
    end

    it "should correctly process a valet login" do
      u = User.create(:user_name => 'brody')
      u.process({'valet_login' => true, 'valet_password' => 'protractor'}, {'updater' => u})
      res = User.find_for_login("model@#{u.global_id.sub(/_/, '.')}")
      expect(res).to eq(nil)
      res = User.find_for_login("model@#{u.global_id.sub(/_/, '.')}", nil, 'whatever', true)
      expect(res).to eq(u)
      expect(res.valet_mode?).to eq(true)
    end
  end
  
  describe "record_locking" do
    it "should not run an update on an out-of-date entry" do
      u = User.create
      a = 2.weeks.ago
      User.where(:id => u.id).update_all(:updated_at => a)
      expect(u.reload.updated_at).to eq(a)
      b = 1.hour.ago
      User.where(:id => u.id).update_all(:updated_at => b)
      res = u.update_setting('asdf', 'bacon')
      expect(u.settings['asdf']).to eq('bacon')
      expect(res).to eq('pending')
      puts Worker.scheduled_actions
      s = JobStash.last
      expect(s).to_not eq(nil)
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'update_setting', 'arguments' => ['job_stash', s.global_id]})).to eq(true)
      expect(u.reload.settings['asdf']).to eq(nil)
      Worker.process_queues
      expect(u.reload.settings['asdf']).to eq('bacon')
    end
  end
  
  describe "external_email_allowed?" do
    it "should return the correct values" do
      u = User.new
      expect(u.external_email_allowed?).to eq(true)
      u.settings['authored_organization_id'] = '1234'
      expect(u.external_email_allowed?).to eq(false)
      u.settings['authored_organization_id'] = nil
      expect(Organization).to receive(:managed?).with(u).and_return(true)
      expect(u.external_email_allowed?).to eq(false)
    end
  end

  describe 'enabled_protected_sources' do
    it 'should return the cached value if any' do
      u = User.new
      expect(u).to receive(:get_cached).with('protected_sources/false').and_return([])
      expect(u.enabled_protected_sources).to eq([])
    end

    it 'should return the correct list of sources' do
      u = User.new
      expect(u).to receive(:get_cached).with('protected_sources/false').and_return(nil)
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return(true)
      expect(u).to receive(:subscription_hash).and_return({'extras_enabled' => true}).at_least(1).times
      expect(u.enabled_protected_sources).to eq(['lessonpix', 'pcs', 'symbolstix'])
    end

    it 'should persist the result to the cache' do
      u = User.new
      expect(u).to receive(:get_cached).with('protected_sources/false').and_return(nil)
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return(true)
      expect(u).to receive(:subscription_hash).and_return({'extras_enabled' => true}).at_least(1).times
      expect(u).to receive(:set_cached).with('protected_sources/false', ['lessonpix', 'pcs', 'symbolstix']).and_return(nil)
      expect(u.enabled_protected_sources).to eq(['lessonpix', 'pcs', 'symbolstix'])
    end

    it "should optionally include supervisee sources" do
      u = User.new
      expect(u).to receive(:get_cached).with('protected_sources/true').and_return(nil)
      u2 = User.new
      expect(u2).to receive(:get_cached).with('protected_sources/false').and_return(nil)
      expect(u).to receive(:supervisees).and_return([u2])
      expect(Uploader).to receive(:lessonpix_credentials).with(u2).and_return(true)
      expect(Uploader).to receive(:lessonpix_credentials).with(u).and_return(false)
      expect(u2).to receive(:subscription_hash).and_return({'extras_enabled' => true}).at_least(1).times
      expect(u).to receive(:set_cached).with('protected_sources/true', ['lessonpix', 'pcs', 'symbolstix']).and_return(nil)
      expect(u2).to receive(:set_cached).with('protected_sources/false', ['lessonpix', 'pcs', 'symbolstix']).and_return(nil)
      expect(u.enabled_protected_sources(true)).to eq(['lessonpix', 'pcs', 'symbolstix'])
    end
  end
  
  describe "user_token" do
    it 'should return the correct value' do
      u = User.create
      token = "#{u.global_id}-"
      token = token + GoSecure.sha512(token, 'user_token verifier')[0, 30]
      expect(u.user_token).to eq(token)
    end
  end
  
  describe "find_by_token" do
    it 'should find the correct user' do
      u = User.create
      token = "#{u.global_id}-"
      token = token + GoSecure.sha512(token, 'user_token verifier')[0, 30]
      expect(User.find_by_token(token)).to eq(u)
      expect(User.find_by_token('asdf')).to eq(nil)
      expect(User.find_by_token("#{u.global_id}-whatever")).to eq(nil)
      expect(User.find_by_token(nil)).to eq(nil)
    end
  end
  
  describe "versions" do
    it "should track versions correctly" do
      PaperTrail.request.whodunnit = 'user:bob'
      u = User.create!
      u.reload
      u.settings['email'] = 'email@example.com'
      u.save!
      u.reload
      u.settings['email'] = 'emails@example.com'
      u.settings['something_else'] = 'frogs'
      u.save!
      u.reload
      u.settings['something_else'] = 'cool'
      u.save!
      u.reload
      expect(u.versions.count).to eq(4)
      expect(User.load_version(u.versions[-1]).settings['something_else']).to eq('cool')
      expect(User.load_version(u.versions[-1]).settings['email']).to eq('emails@example.com')
      expect(User.load_version(u.versions[-2]).settings['something_else']).to eq('frogs')
      expect(User.load_version(u.versions[-2]).settings['email']).to eq('emails@example.com')
      expect(User.load_version(u.versions[-3]).settings['something_else']).to eq(nil)
      expect(User.load_version(u.versions[-3]).settings['email']).to eq('email@example.com')
      expect(User.load_version(u.versions[-4])).to eq(nil)
    end
  end

  describe "track_protected_source" do
    it "should track novel usage" do
      u = User.create
      u.settings['subscription'] = {'expiration_source' => 'cool stuff'}
      u.expires_at = 6.months.ago
      u.save
      expect(u.subscription_hash['grace_trial_period']).to eq(nil)
      expect(u.settings['activated_sources']).to eq(nil)
      u.track_protected_source('bacon')
      expect(u.reload.settings['activated_sources']).to eq(['bacon'])
      expect(AuditEvent.count).to eq(1)
      ae = AuditEvent.last
      expect(ae.event_type).to eq('source_activated')
      expect(ae.data['source']).to eq('bacon')
    end

    it "should not track usage during the trial period" do
      u = User.create
      expect(u.subscription_hash['grace_trial_period']).to eq(true)
      u.save
      expect(u.settings['activated_sources']).to eq(nil)
      u.track_protected_source('bacon')
      expect(u.reload.settings['activated_sources']).to eq(nil)
      expect(AuditEvent.count).to eq(0)

      u.track_protected_source('cheddar')
      expect(u.reload.settings['activated_sources']).to eq(nil)
      expect(AuditEvent.count).to eq(0)

      u.track_protected_source('cheddar')
      expect(u.reload.settings['activated_sources']).to eq(nil)
      expect(AuditEvent.count).to eq(0)
    end

    it "should not re-track tracked usage" do
      u = User.create
      u.settings['subscription'] = {'expiration_source' => 'cool stuff'}
      u.expires_at = 6.months.ago
      u.save
      expect(u.subscription_hash['grace_trial_period']).to eq(nil)
      expect(u.subscription_hash['grace_period']).to eq(nil)
      expect(u.settings['activated_sources']).to eq(nil)
      u.settings['activated_sources'] = ['bacon']
      u.save
      u.track_protected_source('bacon')
      expect(u.reload.settings['activated_sources']).to eq(['bacon'])
      expect(AuditEvent.count).to eq(0)

      u.track_protected_source('cheddar')
      expect(u.reload.settings['activated_sources']).to eq(['bacon', 'cheddar'])
      expect(AuditEvent.count).to eq(1)
      ae = AuditEvent.last
      expect(ae.event_type).to eq('source_activated')
      expect(ae.data['source']).to eq('cheddar')

      u.track_protected_source('cheddar')
      expect(u.reload.settings['activated_sources']).to eq(['bacon', 'cheddar'])
      expect(AuditEvent.count).to eq(1)
    end
  end

  describe "lookup_contact" do
    it "should return correct values" do
      u = User.create
      expect(u.lookup_contact('asdf')).to eq(nil)
      u.settings['contacts'] = {}
      expect(u.lookup_contact('asdf')).to eq(nil)
      u.settings['contacts'] = [
        {'hash' => 'qwer'}
      ]
      expect(u.lookup_contact('asdf')).to eq(nil)
      u.settings['contacts'] = [
        {'hash' => 'qwer'},
        {'hash' => 'asdf', 'name' => 'bob'}
      ]
      expect(u.lookup_contact('asdf')).to eq({'name' => 'bob', 'hash' => 'asdf', 'id' => "#{u.global_id}xasdf"})
      expect(u.lookup_contact("#{u.global_id}xasdf")).to eq({'name' => 'bob', 'hash' => 'asdf', 'id' => "#{u.global_id}xasdf"})

    end
  end

  describe "2fa" do
    describe "assert_2fa!" do
      it "should allow asserting" do
        u = User.create
        expect(ROTP::Base32).to receive(:random).and_return('abcdefg')
        expect(u.assert_2fa!).to eq(true)
        expect(u.settings['2fa']).to_not eq(nil)
        expect(u.settings['2fa']['secret']).to eq('abcdefg')
      end

      it "should allow resettings" do
        u = User.create
        expect(ROTP::Base32).to receive(:random).and_return('abcdefg')
        expect(u.assert_2fa!).to eq(true)
        expect(u.settings['2fa']).to_not eq(nil)
        expect(u.settings['2fa']['secret']).to eq('abcdefg')
        expect(ROTP::Base32).to receive(:random).and_return('qwerty')
        expect(u.assert_2fa!).to eq(true)
        expect(u.settings['2fa']).to_not eq(nil)
        expect(u.settings['2fa']['secret']).to eq('qwerty')
      end

      it "should allow setting a pending config without clearing the existing one" do
        u = User.create
        expect(ROTP::Base32).to receive(:random).and_return('abcdefg')
        expect(u.assert_2fa!).to eq(true)
        expect(u.settings['2fa']).to_not eq(nil)
        expect(u.settings['2fa']['secret']).to eq('abcdefg')
        expect(ROTP::Base32).to receive(:random).and_return('qwerty')
        expect(u.assert_2fa!(true)).to eq(true)
        expect(u.settings['2fa']).to_not eq(nil)
        expect(u.settings['2fa']['secret']).to eq('abcdefg')
        expect(u.settings['tmp_2fa']).to_not eq(nil)
        expect(u.settings['tmp_2fa']['secret']).to eq('qwerty')
        expect(u.settings['tmp_2fa']['expires']).to be > 5.hours.from_now.to_i
        expect(u.settings['tmp_2fa']['expires']).to be < 7.hours.from_now.to_i
      end
    end

    describe "state_2fa" do
      it "should be required for admins" do
        u = User.create
        expect(u.state_2fa).to eq({required: false})
      end

      it "should not require 2FA for admin managers when mandatory enforcement is disabled" do
        u = User.create
        o = Organization.create(admin: true)
        o.add_manager(u.user_name, true)
        u.reload
        expect(Organization.admin_manager?(u)).to eq(true)
        expect(u.state_2fa).to eq({required: false})
      end

      it "should be required if explicitly set" do
        u = User.create
        u.assert_2fa!
        expect(u.state_2fa).to eq({required: true, verified: false})
      end

      it "should only set verified if secret has ever been confirmed" do
        u = User.create
        u.assert_2fa!
        secret = u.settings['2fa']['secret']
        totp = ROTP::TOTP.new(secret)
        ts = totp.now
        expect(u.state_2fa).to eq({required: true, verified: false})
        res = u.valid_2fa?(ts)
        expect(res).to_not eq(false)
        expect(res).to be > 60.seconds.ago.to_i
        expect(res).to be < 60.seconds.from_now.to_i
        expect(u.state_2fa).to eq({required: true, verified: true})
        expect(u.valid_2fa?(ts)).to eq(false)
      end
    end
  
    describe "uri_2fa" do
      it "should return a provisioning URI if secret is set" do
        u = User.create
        u.assert_2fa!
        expect(u.uri_2fa).to eq("otpauth://totp/LingoLinq:#{u.user_name}:?secret=#{u.settings['2fa']['secret']}&issuer=LingoLinq")
        u.assert_2fa!(true)
        expect(u.uri_2fa).to eq("otpauth://totp/LingoLinq:#{u.user_name}:?secret=#{u.settings['tmp_2fa']['secret']}&issuer=LingoLinq")
      end

      it "should return nil without a secret" do
        u = User.create
        expect(u.uri_2fa).to eq(nil)
      end
    end
  
    describe "valid_2fa?" do
      it "should return false without 2fa settings" do
        u = User.new
        expect(u.valid_2fa?('asdf')).to eq(false)
        u.settings = {'2fa' => {}}
        expect(u.valid_2fa?('123456')).to eq(false)
        u.settings = {'2fa' => {'secret' => 'asdf'}}
        expect(u.valid_2fa?('123456')).to eq(false)
      end

      it "should return true for a valid code" do
        u = User.create(settings: {'2fa' => {'secret' => 'asdf'}})
        totp = ROTP::TOTP.new('asdf', issuer: "LingoLinq")  
        code = totp.at(Time.now)
        expect(u.settings['2fa']['last_otp']).to eq(nil)
        ts = u.valid_2fa?(code)
        expect(ts).to_not eq(false)
        expect(ts).to be > 30.seconds.ago.to_i
        expect(ts).to be < 30.seconds.from_now.to_i
        expect(u.settings['2fa']['last_otp']).to_not eq(nil)
      end

      it "should return false for an old code" do
        u = User.create(settings: {'2fa' => {'secret' => 'asdf'}})
        totp = ROTP::TOTP.new('asdf', issuer: "LingoLinq")  
        code = totp.at(90.seconds.ago)
        ts = u.valid_2fa?(code)
        expect(ts).to eq(false)
      end

      it "should return false for a code older than the last one" do
        u = User.create(settings: {'2fa' => {'secret' => 'asdf', 'last_otp' => 60.seconds.from_now.to_i}})
        totp = ROTP::TOTP.new('asdf', issuer: "LingoLinq")  
        code = totp.at(Time.now)
        ts = u.valid_2fa?(code)
        expect(ts).to eq(false)
      end

      it "should return false for a replayed code" do
        u = User.create(settings: {'2fa' => {'secret' => 'asdf'}})
        totp = ROTP::TOTP.new('asdf', issuer: "LingoLinq")  
        code = totp.at(Time.now)
        ts = u.valid_2fa?(code)
        expect(ts).to_not eq(false)
        expect(ts).to be > 30.seconds.ago.to_i
        expect(ts).to be < 30.seconds.from_now.to_i
        ts = u.valid_2fa?(code)
        expect(ts).to eq(false)
      end
    end
  end

  describe "audit_protected_sources" do
    it "should update any missing protected sources" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      i = ButtonImage.new(settings: {
        'search_term' => 'bacon',
        'label' => 'pig',
        'external_id' => '12356',
        'protected_source' => 'bacon'
      }, user: u, board: b)
      i.save
      b.settings['buttons'] = [
        {'label' => 'a', 'image_id' => i.global_id}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.map_images(true)
      b.save

      b.reload
      expect(b.known_button_images.to_a).to eq([i])
      expect(Worker.scheduled?(User, :perform_action, {id: u.id, method: 'track_protected_source', arguments: ['bacon']})).to eq(true)

      expect(u).to receive(:track_protected_source).with('bacon')
      u.audit_protected_sources
    end

    it "should track unauthored board sets when set as home" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u, :public => true)
      i = ButtonImage.new(settings: {
        'search_term' => 'bacon',
        'label' => 'pig',
        'external_id' => '12356',
        'protected_source' => 'bacon'
      }, user: u, board: b)
      i.save
      b.settings['buttons'] = [
        {'label' => 'a', 'image_id' => i.global_id}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.map_images(true)
      b.save

      b.reload
      expect(b.known_button_images.to_a).to eq([i])
      expect(Worker.scheduled?(User, :perform_action, {id: u.id, method: 'track_protected_source', arguments: ['bacon']})).to eq(true)

      u2.process({'preferences' => {'home_board' => {'id' => b.global_id, 'key' => b.key}}})
      ra = RemoteAction.where(action: 'audit_protected_sources').last
      expect(ra).to_not eq(nil)
      expect(ra.path).to eq(u2.global_id)
      # expect(Worker.scheduled?(User, :perform_action, {id: u2.id, method: 'audit_protected_sources', arguments: []})).to eq(true)

      expect(u2).to receive(:track_protected_source).with('bacon')
      u2.audit_protected_sources
    end
  end

  describe "access_methods" do
    it "should not fail on missing preferences" do
      u = User.create
      expect(u.access_methods).to eq(['touch'])
    end

    it "should use external override if set" do
      u = User.create
      u.settings['external_device'] = {'access_method' => 'bacon'}
      expect(u.access_methods).to eq(['bacon'])
    end

    it "should return all pertinent methods, sorted by frequency" do
      u = User.create
      u.settings['preferences']['devices'] ||= {}
      u.settings['preferences']['devices']['a'] = {'scanning' => true}
      u.settings['preferences']['devices']['b'] = {'dwell' => true}
      u.settings['preferences']['devices']['c'] = {}
      expect(u.access_methods).to eq(['dwell', 'scanning'])

      u.settings['preferences']['devices']['a'] = {}
      u.settings['preferences']['devices']['b'] = {}
      u.settings['preferences']['devices']['c'] = {}
      expect(u.access_methods).to eq(['touch'])

      u.settings['preferences']['devices']['a'] = {'scanning' => true}
      u.settings['preferences']['devices']['b'] = {'dwell' => true, 'dwell_type' => 'eyegaze'}
      u.settings['preferences']['devices']['c'] = {'dwell' => true, 'dwell_type' => 'eyegaze'}
      expect(u.access_methods).to eq(['gaze', 'scanning'])
    end

    it "should return only single device method, if specified" do
      u = User.create
      u.settings['preferences']['devices'] ||= {}
      u.settings['preferences']['devices']['a'] = {'scanning' => true}
      u.settings['preferences']['devices']['b'] = {'dwell' => true}
      u.settings['preferences']['devices']['c'] = {}
      d = Device.new
      d.device_key = 'a'
      expect(u.access_methods(d)).to eq(['scanning'])
      d.device_key = 'b'
      expect(u.access_methods(d)).to eq(['dwell'])
      d.device_key = 'c'
      expect(u.access_methods(d)).to eq(['touch'])
    end
  end

  describe "process_home_board" do
    it "should delete the current home board preference if not a valid option" do
      u = User.create
      u.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      u.process_home_board({'id' => 'bacon'}, {})
      expect(u.settings['preferences']['home_board']).to eq(nil)
    end

    it "should notify if the home board actually changed" do
      u = User.create
      u.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      expect(u).to receive(:notify).with('home_board_changed')
      u.process_home_board({'id' => 'bacon'}, {})
      expect(u.settings['preferences']['home_board']).to eq(nil)
      ra = RemoteAction.where(action: 'audit_protected_sources').last
      expect(ra).to_not eq(nil)
      expect(ra.path).to eq(u.global_id)
      # expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'audit_protected_sources', 'arguments' => []})).to eq(true)
    end

    it "should set as the home board if not specified as a copy" do
      u = User.create
      b = Board.create(user: u)
      u.process_home_board({'id' => b.global_id}, {})
      expect(u.settings['preferences']['home_board']).to eq({'id' => b.global_id, 'key' => b.key, 'locale' => 'en'})
    end

    it "should set the locale and level" do
      u = User.create
      b = Board.create(user: u)
      u.process_home_board({'id' => b.global_id, 'locale' => 'fr', 'level' => 5}, {})
      expect(u.settings['preferences']['home_board']).to eq({'id' => b.global_id, 'key' => b.key, 'locale' => 'fr', 'level' => 5})
    end

    it "should delete if target user can't view and updater can't share" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(user: u3)
      u1.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      u1.process_home_board({'id' => b.global_id}, {'updater' => u2})
      expect(u1.settings['preferences']['home_board']).to eq(nil)
    end

    it "should share if only updater is authorized to share" do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u2)
      u1.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      u1.process_home_board({'id' => b.global_id}, {'updater' => u2})
      expect(u1.settings['preferences']['home_board']).to eq({'id' => b.global_id, 'key' => b.key, 'locale' => 'en'})
      link = UserLink.links_for(u1.reload).detect{|l| l['type'] == 'board_share' && l['state']['include_downstream'] == true && l['record_code'] == Webhook.get_record_code(b)}
      expect(link).to_not eq(nil)
    end

    it "should share if async set" do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u2)
      u1.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      u1.process_home_board({'id' => b.global_id}, {'updater' => u2, 'async' => true})
      expect(u1.settings['preferences']['home_board']).to eq({'id' => b.global_id, 'key' => b.key, 'locale' => 'en'})
      expect(Worker.scheduled?(Board, :perform_action, {'id' => b.id, 'method' => 'process_share', 'arguments' => ["add_deep-#{u1.global_id}", u2.global_id]})).to eq(true)
    end

    it "should allow copying an org-allowed board" do

    end

    it "should allow copying if the copier has permission" do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u2)
      u1.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      expect(u1).to receive(:copy_to_home_board).with({'id' => b.global_id, 'copy' => true}, u2.global_id, nil)
      u1.process_home_board({'id' => b.global_id, 'copy' => true}, {'updater' => u2})
    end

    it "should schedule copying if async" do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u2)
      u1.settings['preferences']['home_board'] = {'id' => 1, 'a' => 1}
      expect(Progress).to receive(:schedule).with(u1, :copy_to_home_board, {'id' => b.global_id, 'copy' => true}, u2.global_id, nil)
      u1.process_home_board({'id' => b.global_id, 'copy' => true}, {'updater' => u2, 'async' => true})
    end

    it "should not notify if the home board didn't actually change" do
      u = User.create
      b = Board.create(user: u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key}
      expect(u).to_not receive(:notify).with('home_board_changed')
      u.process_home_board({'id' => b.global_id}, {})
      expect(u.settings['preferences']['home_board']).to eq( {'id' => b.global_id, 'key' => b.key, 'locale' => 'en'})
    end

    it "should allow a user to copy an org-affiliated private home board as their new home board, including links" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name)
      o.settings['default_home_board'] = {'key' => 'asdf'}
      o.save
      b1 = Board.create(user: u)
      o.process({'home_board_keys' => [b1.key]}, {'updater' => u})

      u.process({'preferences' => {'home_board' => {'id' => b1.global_id, 'key' => b1.key, 'copy' => true, 'copy_from_org' => o.global_id}}}, {'updater' => u})
      expect(u.settings['preferences']['home_board']).to_not eq(nil) 
      bb = Board.find_by_global_id(u.settings['preferences']['home_board']['id'])
      expect(bb.parent_board).to eq(b1)
    end
  end

  describe "copy_to_home_board" do
    it "should return without an valid original board" do
      u = User.create
      expect(u.copy_to_home_board({}, nil, nil)).to eq(nil)
    end

    it "should return if the current home board is already a copy with the correct library" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = b1.copy_for(u)
      u.settings['preferences']['home_board'] = {'id' => b2.global_id, 'key' => b2.key}
      expect(u.copy_to_home_board({'id' => b1.global_id}, u.global_id, nil)).to eq(true)
      expect(u.settings['preferences']['home_board']['id']).to eq(b2.global_id)
    end

    it "should set a current copy with the correct libraries that the user already owns if it exists" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = b1.copy_for(u)
      b2.settings['swapped_library'] = 'twemoji'
      b2.save
      expect(u.copy_to_home_board({'id' => b1.global_id}, u.global_id, 'twemoji')).to eq(true)
      expect(u.settings['preferences']['home_board']['id']).to eq(b2.global_id)
    end

    it "should create a brand new copy if needed, including swapping images" do
      u = User.create
      b1 = Board.create(user: u)
      
      bi = ButtonImage.create
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {})
      b2 = b1.copy_for(u)
      b2.settings['swapped_library'] = 'twemoji'
      b2.save
      expect(u.copy_to_home_board({'id' => b1.global_id}, u.global_id, 'mulberry')).to eq(true)
      expect(u.settings['preferences']['home_board']['id']).to_not eq(b2.global_id)
      b3 = Board.find_by_path(u.settings['preferences']['home_board']['id'])
      expect(b3.user).to eq(u)
      expect(b3.parent_board).to eq(b1)
      expect(b3.settings['swapped_library']).to eq('mulberry')
    end
    
    it "should create a new copy if the current works except for the symbols" do
      u = User.create
      b1 = Board.create(user: u)
      
      bi = ButtonImage.create
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {})
      b2 = b1.copy_for(u)
      b2.settings['swapped_library'] = 'twemoji'
      b2.save
      expect(u).to receive(:copy_board_links) do |opts|
        expect(opts[:old_board_id]).to eq(b1.global_id)
        expect(opts[:new_board_id]).to_not eq(nil)
        brd = Board.find_by_path(opts[:new_board_id])
        expect(brd.parent_board).to eq(b1)
        expect(opts[:ids_to_copy]).to eq([])
        expect(opts[:copier_id]).to eq(u.global_id)
        expect(opts[:swap_library]).to eq('mulberry')
      end
      expect(u.copy_to_home_board({'id' => b1.global_id}, u.global_id, 'mulberry')).to eq(true)
    end

    it "should create a shallow clone if specified" do
      u = User.create
      u2 = User.create
      b1 = Board.create(user: u2, public: true)
      
      bi = ButtonImage.create
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {})
      expect(u).to_not receive(:copy_board_links)
      expect(u.copy_to_home_board({'id' => b1.global_id, 'shallow' => true}, u.global_id, nil)).to eq(true)
      expect(u.settings['preferences']['home_board']).to eq({
        'id' => "#{b1.global_id}-#{u.global_id}",
        'key' => "#{u.user_name}/my:#{b1.key.sub(/\//, ':')}",
        'locale' => 'en'
      })
      ue = u.user_extra
      expect(ue).to_not eq(nil)
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to_not eq(nil)
    end
  end

  describe "save_with_sync" do
    it "should update synce stamp" do
      u = User.create(sync_stamp: 6.hours.ago)
      u.save_with_sync('bacon')
      expect(u.sync_stamp).to be > 5.minutes.ago
    end
    
    it "should update sync reason" do
      u = User.create(sync_stamp: 6.hours.ago)
      u.save_with_sync('bacon')
      expect(u.sync_stamp).to be > 5.minutes.ago
      expect(u.settings['sync_stamp_reason']).to eq('bacon')
    end

    it "should also update supervisors" do
      u = User.create(sync_stamp: 6.hours.ago)
      u2 = User.create

      u.save_with_sync('bacon')
      expect(u.sync_stamp).to be > 5.minutes.ago
      expect(u.settings['sync_stamp_reason']).to eq('bacon')

      expect(u).to receive(:supervisors).and_return([u2])
      expect(u2).to receive(:save_with_sync).with('supervisee update')
      u.save_sync_supervisors(true)
    end
  end
end
