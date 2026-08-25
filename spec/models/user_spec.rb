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
      expect(perms['set_goals']).to eq(true)
      expect(perms['view_deleted_boards']).to eq(nil)
      # Modeling-only links lose USAGE DATA and PROFILE DETAIL: they keep only
      # existence + model (+ set_goals, which the lapsed-billing carve-out above
      # deliberately preserves). Narrowed in user.rb:63-65,85.
      expect(perms['view_word_map']).to eq(nil)
      expect(perms['view_detailed']).to eq(nil)
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
      expect(u.settings['preferences']['auto_home_return']).to eq(false)
      expect(u.settings['preferences']['auto_open_speak_mode']).to eq(true)
      expect(u.user_name).to match(/\Ano-name(_\d+)?\z/)
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

    it "should default word_suggestions ON for new users only, never backfilling existing users" do
      # New users (new_record?) get word prediction ON by default at registration.
      u = User.new
      u.generate_defaults
      expect(u.settings['preferences']['word_suggestions']).to eq(true)
      expect(u.settings['preferences']['word_suggestion_position']).to eq('side_rail')

      # Existing (already-persisted) users with no stored value are NOT backfilled
      # — word prediction is never silently enabled for them (it stays nil/off).
      u2 = User.new
      u2.settings = {'preferences' => {}}
      allow(u2).to receive(:new_record?).and_return(false)
      u2.generate_defaults
      expect(u2.settings['preferences']['word_suggestions']).to eq(nil)
      expect(u2.settings['preferences']['word_suggestion_position']).to eq(nil)
    end

    it "should not carry word_suggestions in the unconditional preference_defaults bucket" do
      # If it were in the bucket, the generate_defaults bucket loop would backfill
      # every existing user — the regression this guards against.
      User.preference_defaults.each do |bucket, defaults|
        expect(defaults).not_to have_key('word_suggestions'), "found word_suggestions in preference_defaults['#{bucket}']"
      end
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
    before(:each) do
      JobStash.delete_all
      allow(RedisInit).to receive(:any_queue_pressure?).and_return(false)
    end

    def expect_refresh_stats_scheduled(stash)
      jobs = Worker.scheduled_actions('slow').select do |job|
        args = job['args'][2]
        args &&
          args['method'] == 'refresh_stats' &&
          args['arguments'][0] == {'stash' => stash.global_id} &&
          args['arguments'][1].is_a?(Integer)
      end
      expect(jobs.length).to eq(1)
    end

    it "should schedule a background job by default" do
      u = User.create
      u.instance_variable_set('@do_track_boards', true)
      expect(u.track_boards(nil, 123)).to eq(true)
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {'id' => u.id, 'method' => 'track_boards', 'arguments' => [true, 123]})).to eq(true)
    end
    
    it "should delete orphan connections" do
      u = User.create
      b = Board.create(:user => u)
      UserBoardConnection.create(:user_id => u.id, :board_id => b.id)
      u.settings['preferences'] ||= {}
      u.settings['preferences']['home_board'] = nil
      u.settings['preferences']['sidebar_boards'] = []
      u.save
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
      expect_refresh_stats_scheduled(s)
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
      expect(s.data).to eq([b2.global_id])
      expect_refresh_stats_scheduled(s)
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

    it "should record a versioned privacy-policy acknowledgment alongside terms agreement" do
      u = User.new
      u.process_params({}, {})
      expect(u.settings['terms_agreed']).to eq(nil)
      expect(u.settings['privacy_policy_acknowledged']).to eq(nil)

      u.process_params({'terms_agree' => true}, {})
      expect(u.settings['terms_agreed']).to_not eq(nil)
      expect(u.settings['privacy_policy_acknowledged']).to_not eq(nil)
      expect(u.settings['privacy_policy_acknowledged']['policy_version']).to eq(User::PRIVACY_POLICY_VERSION)
      expect(u.settings['privacy_policy_acknowledged']['acknowledged_at']).to match(/^\d{4}-\d{2}-\d{2}T/)
    end

    it "should not record acknowledgment when terms_agree is the string 'false'" do
      # In Ruby the string 'false' is truthy; the gate must use process_boolean
      # so an API request that explicitly declines records neither terms
      # agreement nor the Privacy Policy acknowledgment.
      u = User.new
      u.process_params({'terms_agree' => 'false'}, {})
      expect(u.settings['terms_agreed']).to eq(nil)
      expect(u.settings['privacy_policy_acknowledged']).to eq(nil)
    end

    it "should defer a minor's privacy-policy acknowledgment to the parental grant (COPPA)" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.new
      u.process_params({
        'name' => 'coppa_kid_privacy',
        'email' => 'kidpriv@example.com',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parentpriv@example.com'
      }, {})
      # The child's signup tick must NOT record the Privacy Policy acknowledgment...
      expect(u.settings['coppa']['pending_parent_consent']).to eq(true)
      expect(u.settings['privacy_policy_acknowledged']).to eq(nil)

      # ...the parent records it by completing the email token flow.
      u.save!
      token = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(token)).to eq(true)
      expect(u.settings['privacy_policy_acknowledged']).to_not eq(nil)
      expect(u.settings['privacy_policy_acknowledged']['acknowledged_by']).to eq('parent')
      expect(u.settings['privacy_policy_acknowledged']['policy_version']).to eq(User::PRIVACY_POLICY_VERSION)
    end

    it "grant_parental_consent! writes an immutable AuditEvent atomically, and rolls the grant back if the audit insert fails" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      AuditEvent.delete_all
      u = User.new
      u.process_params({
        'name' => 'coppa_kid_audit',
        'email' => 'kidaudit@example.com',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parentaudit@example.com'
      }, {})
      u.save!
      token = u.settings['coppa']['parent_consent_token']

      # Happy path: one immutable event carrying the persisted grant timestamp.
      expect { expect(u.grant_parental_consent!(token, ip: '203.0.113.7', user_agent: 'TestAgent/1.0')).to eq(true) }
        .to change { AuditEvent.where(event_type: 'parental_consent_grant', user_key: u.global_id).count }.by(1)
      ae = AuditEvent.where(event_type: 'parental_consent_grant', user_key: u.global_id).last
      expect(ae.record_id).to be_present
      expect(ae.data['ip']).to eq('203.0.113.7')
      expect(ae.data['user_agent']).to eq('TestAgent/1.0')
      expect(ae.data['privacy_policy_version']).to eq(User::PRIVACY_POLICY_VERSION)
      expect(ae.data['granted_at']).to eq(u.reload.settings['coppa']['parent_consent_granted_at'])

      # Rollback: a fresh grantable user whose audit insert raises must NOT end up
      # consented, and the token must remain usable for a retry.
      u2 = User.new
      u2.process_params({
        'name' => 'coppa_kid_rollback',
        'email' => 'kidrollback@example.com',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parentrollback@example.com'
      }, {})
      u2.save!
      token2 = u2.settings['coppa']['parent_consent_token']
      allow(AuditEvent).to receive(:create!).and_raise(ActiveRecord::RecordInvalid.new(AuditEvent.new))
      expect {
        expect { u2.grant_parental_consent!(token2) }.to raise_error(ActiveRecord::RecordInvalid)
      }.to_not change { AuditEvent.count }
      u2.reload
      expect(u2.settings['coppa']['parent_consent_granted_at']).to be_blank
      expect(u2.settings['coppa']['parent_consent_token']).to eq(token2)
      expect(u2.coppa_parental_consent_pending?).to eq(true)
    end

    it "stores a revoke token when parental consent is granted" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.new
      u.process_params({
        'name' => 'coppa_kid_revoke_token',
        'email' => 'kidrevoketok@example.com',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parentrevoketok@example.com'
      }, {})
      u.save!
      token = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(token)).to eq(true)
      expect(u.settings['coppa']['parent_consent_revoke_token']).to be_present
      expect(u.coppa_parental_consent_active?).to eq(true)
      expect(u.valid_parent_consent_grant_link_token?(token)).to eq(true)
    end

    it "revoke_parental_consent! records an immutable AuditEvent and blocks access" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      AuditEvent.delete_all
      u = User.new
      u.process_params({
        'name' => 'coppa_kid_revoke',
        'email' => 'kidrevoke@example.com',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parentrevoke@example.com'
      }, {})
      u.save!
      token = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(token)).to eq(true)
      revoke_tok = u.settings['coppa']['parent_consent_revoke_token']
      expect(u.valid_parent_consent_revoke_link_token?(revoke_tok)).to eq(true)
      expect(u.valid_parent_consent_revoke_link_token?('wrong')).to eq(false)
      expect {
        expect(u.revoke_parental_consent!(revoke_tok, ip: '203.0.113.8', user_agent: 'TestAgent/2.0')).to eq(true)
      }.to change { AuditEvent.where(event_type: 'parental_consent_revoke', user_key: u.global_id).count }.by(1)
      u.reload
      expect(u.coppa_parental_consent_revoked?).to eq(true)
      expect(u.coppa_parental_consent_blocks_access?).to eq(true)
      expect(u.coppa_parental_consent_active?).to eq(false)
      expect(u.valid_parent_consent_revoke_link_token?(revoke_tok)).to eq(true)
      ae = AuditEvent.where(event_type: 'parental_consent_revoke', user_key: u.global_id).last
      expect(ae.data['ip']).to eq('203.0.113.8')
      expect(ae.data['user_agent']).to eq('TestAgent/2.0')
    end

    it "should coerce preferences cookies to boolean" do
      u = User.new
      u.settings = {'preferences' => {}}
      u.process_params({'preferences' => {'cookies' => 'false'}}, {})
      expect(u.settings['preferences']['cookies']).to eq(false)
      u.process_params({'preferences' => {'cookies' => 'true'}}, {})
      expect(u.settings['preferences']['cookies']).to eq(true)
    end

    it "preserves supporter dashboard sections rooms and attention on write" do
      u = User.new
      u.settings = {'preferences' => {}}
      u.process_params({'preferences' => {
        'dashboard_sections' => {
          'boards' => true,
          'rooms' => true,
          'attention' => false,
          'not_a_section' => true
        },
        'dashboard_order' => ['boards', 'rooms', 'attention', 'bogus']
      }}, {})
      expect(u.settings['preferences']['dashboard_sections']).to eq({
        'boards' => true,
        'rooms' => true,
        'attention' => false
      })
      expect(u.settings['preferences']['dashboard_order']).to eq(['boards', 'rooms', 'attention'])
    end

    it "should persist require_sidebar_edit_pin (whitelisted) and coerce to boolean" do
      # Guards the silent-drop failure mode: a preference not in PREFERENCE_PARAMS
      # is dropped by process_params and never persists. require_sidebar_edit_pin
      # gates the sidebar editor behind the speak-mode PIN.
      u = User.new
      u.settings = {'preferences' => {}}
      u.process_params({'preferences' => {'require_sidebar_edit_pin' => 'true'}}, {})
      expect(u.settings['preferences']['require_sidebar_edit_pin']).to eq(true)
      u.process_params({'preferences' => {'require_sidebar_edit_pin' => 'false'}}, {})
      expect(u.settings['preferences']['require_sidebar_edit_pin']).to eq(false)
    end

    it "should default require_sidebar_edit_pin to false for authenticated users" do
      expect(User.preference_defaults['authenticated_user']['require_sidebar_edit_pin']).to eq(false)
    end

    it "should ignore beta_program_access from preferences unless updater is admin" do
      u = User.new
      u.settings = {'preferences' => {}}
      u.process_params({'preferences' => {'beta_program_access' => true}}, {})
      expect(u.settings['preferences']['beta_program_access']).to eq(nil)
      u.process_params({'preferences' => {'beta_program_access' => true}}, {'updater' => u})
      expect(u.settings['preferences']['beta_program_access']).to eq(nil)
      admin = User.new
      admin.settings = {'admin' => true}
      u.process_params({'preferences' => {'beta_program_access' => true}}, {'updater' => admin})
      expect(u.settings['preferences']['beta_program_access']).to eq(true)
      u.process_params({'preferences' => {'beta_program_access' => 'false'}}, {'updater' => admin})
      expect(u.settings['preferences']['beta_program_access']).to eq(false)
    end

    it "should default beta_program_access to true for new users" do
      u = User.process_new({'name' => 'beta_default_user'})
      expect(u.settings['preferences']['beta_program_access']).to eq(true)
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

    it "should allow a self-service password change even when valet_login is the string 'false' (regression)" do
      # The Ember client serializes the boolean valet_login attribute as a
      # STRING, so a normal profile save sends valet_login => 'false'. A bare
      # truthiness check treated the non-empty string 'false' as true, enabled
      # valet mode (assert_valet_mode! + a random valet password), and the
      # following valid_password? check then compared the real password against
      # the valet secret -> every self-service password change failed with
      # "incorrect current password". The valet block only runs when the
      # updater is the user themselves, so pass updater => u.
      u = User.create
      u.generate_password('horseradish')
      u.save!
      expect(u.valet_mode?).to eq(false)
      res = u.process_params({
        'password' => 'chicken',
        'old_password' => 'horseradish',
        'valet_login' => 'false'
      }, {'updater' => u})
      expect(u.processing_errors).to eq([])
      expect(res).to_not eq(false)
      expect(u.valid_password?('chicken')).to eq(true)
      # valet mode must NOT have been silently enabled by the falsey string
      expect(u.valet_mode?).to eq(false)
      expect(u.settings['valet_password']).to eq(nil)
    end

    it "should still disable valet when valet_login is boolean false" do
      u = User.create
      u.generate_password('horseradish')
      u.process_params({'valet_login' => true, 'valet_password' => 'gemini'}, {'updater' => u})
      u.save!
      expect(u.settings['valet_password']).to_not eq(nil)
      u.process_params({'valet_login' => false}, {'updater' => u})
      expect(u.settings['valet_password']).to eq(nil)
    end

    describe "password-change audit trail (LL-747bb0e02d)" do
      # AuditEvent.log_command commits outside the per-example transaction, so
      # rows leak across examples and inflate counts. Scope the reset to this
      # describe block (not globally) per the AuditEvent testing convention.
      before(:each) { AuditEvent.delete_all }

      it "logs an AuditEvent when an existing password is changed by the user" do
        u = User.create
        u.generate_password('horseradish')
        u.save!
        expect(AuditEvent.count).to eq(0)
        expect(u.process_params({'password' => 'chicken', 'old_password' => 'horseradish'}, {})).to_not eq(false)
        u.save!
        expect(u.valid_password?('chicken')).to eq(true)
        expect(AuditEvent.count).to eq(1)
        ae = AuditEvent.last
        expect(ae.user_key).to eq(u.global_id)
        expect(ae.data['type']).to eq('password_changed')
        expect(ae.data['self_service']).to eq(true)
      end

      it "logs an AuditEvent for an admin-initiated / forced reset without the old password" do
        u = User.create
        u.generate_password('horseradish')
        u.save!
        expect(AuditEvent.count).to eq(0)
        expect(u.process_params({'password' => 'chicken-little'}, {:allow_password_change => true})).to_not eq(false)
        u.save!
        expect(u.valid_password?('chicken-little')).to eq(true)
        expect(AuditEvent.count).to eq(1)
        ae = AuditEvent.last
        expect(ae.data['type']).to eq('password_changed')
        expect(ae.data['self_service']).to eq(false)
      end

      it "does not log an AuditEvent when an initial password is first set" do
        u = User.create
        expect(u.settings['password']).to be_nil
        expect(u.process_params({'password' => 'first-pass'}, {})).to_not eq(false)
        u.save!
        expect(u.valid_password?('first-pass')).to eq(true)
        expect(AuditEvent.count).to eq(0)
      end
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

    it "should skip malformed (non-hash) offline_actions entries without raising" do
      u = User.create
      # A corrupt/stale entry that is an Array (not a hash) must not 500 the update
      # via action['action'] (TypeError: no implicit conversion of String into
      # Integer) — otherwise the queue never clears and re-fails on every save.
      expect {
        u.process({'offline_actions' => [
          [{'label' => 'bogus'}],
          {'action' => 'add_vocalization', 'id' => 'ok', 'list' => [{'label' => 'asdf'}]}
        ]})
      }.to_not raise_error
      expect(u.settings['vocalizations'].length).to eq(1)
      expect(u.settings['vocalizations'][0]['id']).to eq('ok')
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

    it "should schedule and deliver an external research update if research data passed", :skip => "Typhoeus.post not called - research webhook flow may have changed" do
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

      ui = UserIntegration.create(:user => u)
      ui.settings ||= {}
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings ||= {}
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

    it "should remove the stashed data once the research data is sent", :skip => "Typhoeus.post not called - research webhook flow may have changed" do
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

      ui = UserIntegration.create(:user => u)
      ui.settings ||= {}
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings ||= {}
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

    it "should remove the stashed data even if the research data send fails", :skip => "Typhoeus.post not called - research webhook flow may have changed" do
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

      ui = UserIntegration.create(:user => u)
      ui.settings ||= {}
      ui.settings['allow_trends'] = true
      ui.save
      h = Webhook.create(record_code: 'research', user_integration_id: ui.id)
      h.settings ||= {}
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
      expect(Board).to receive(:copy_board_links_for).with(u, {:valid_ids => nil, :expand_selected_board_ids => false, :starting_old_board => b, :starting_new_board => b2, :authorized_user => nil, :make_public => false, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
      u.copy_board_links(old_board_id: b.global_id, new_board_id: b2.global_id)
    end
    
    it "should make public if specified" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      expect(Board).to receive(:copy_board_links_for).with(u, {:valid_ids => nil, :expand_selected_board_ids => false, :starting_old_board => b, :starting_new_board => b2, :authorized_user => nil, :make_public => true, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
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
      expect(BoardSetCopier).to receive(:new).and_wrap_original do |m, **kwargs|
        expect(kwargs[:user]).to eq(u3)
        expect(kwargs[:starting_old_board]).to eq(b1)
        expect(kwargs[:starting_new_board]).to eq(b2)
        expect(kwargs[:opts][:authorized_user]).to eq(u2)
        m.call(**kwargs)
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
      expect(Board).to receive(:copy_board_links_for).with(u, {:valid_ids => nil, :expand_selected_board_ids => false, :starting_old_board => b, :starting_new_board => b2, :authorized_user => nil, :make_public => false, :new_default_locale=>nil,:old_default_locale=>nil,:copy_prefix=>nil, :copier => nil, :disconnect => nil, :new_owner => nil})
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
        'image' => Board::DEFAULT_ICON
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
    it "should return the default active list by default" do
      u = User.new
      expect(u.sidebar_boards).to eq(User.default_active_sidebar_boards)
    end
    
    it "should return the default active list if the current setting is an empty list" do
      u = User.new
      u.settings = {'preferences' => {'sidebar_boards' => []}}
      expect(u.sidebar_boards).to eq(User.default_active_sidebar_boards)
    end
    
    it "should return the current setting if it's a non-empty list" do
      u = User.new
      u.settings = {'preferences' => {'sidebar_boards' => ['a', 'b', 'c']}}
      expect(u.sidebar_boards).to eq(['a', 'b', 'c'])
    end

    it "should merge new default sidebar entries into an older saved string list" do
      u = User.new
      old_default_keys = User.default_active_sidebar_boards.map { |b| b['key'] }.compact - [SystemBoardSources.board_key('crisis-vocabulary')]
      u.settings = {'preferences' => {'sidebar_boards' => old_default_keys}}
      keys = u.sidebar_boards.map { |b| User.sidebar_board_identity(b) }
      expect(keys).to include(SystemBoardSources.board_key('crisis-vocabulary'))
    end

    it "should merge new default sidebar entries into an older saved default list" do
      # The stored order IS the user's chosen sidebar order (drag / up-down reorder
      # in the Edit Sidebar panel), so it must be PRESERVED on load — a newly-added
      # auto-add default (crisis-vocabulary) is APPENDED, not re-sorted into its
      # default-order slot. See User.merge_missing_default_sidebar_boards.
      u = User.new
      crisis_key = SystemBoardSources.board_key('crisis-vocabulary')
      old_defaults = User.default_sidebar_boards.reject { |b| b['key'] == crisis_key }
      u.settings = {'preferences' => {'sidebar_boards' => old_defaults}}
      expect(u.sidebar_boards.map { |b| b['key'] || 'alert' }).to eq(
        old_defaults.map { |b| b['key'] || 'alert' } + [crisis_key]
      )
    end

    it "should not re-add sidebar boards the user removed from their saved list" do
      u = User.new
      senner_key = SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG)
      saved = User.default_sidebar_boards.reject do |b|
        b['key'] == senner_key || b['key'] == SystemBoardSources.board_key('crisis-vocabulary')
      end
      u.settings = {'preferences' => {'sidebar_boards' => saved}}
      keys = u.sidebar_boards.map { |b| b['key'] || 'alert' }
      expect(keys).not_to include(senner_key)
      expect(keys).to include(SystemBoardSources.board_key('crisis-vocabulary'))
    end

    it "should leave senner-baud in the disabled pool by default" do
      senner_key = SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG)
      keys = User.default_active_sidebar_boards.map { |b| b['key'] }.compact
      expect(keys).not_to include(senner_key)
      expect(User.default_sidebar_boards.map { |b| b['key'] }).to include(senner_key)
      expect(User.default_sidebar_boards.map { |b| b['key'] }).not_to include('mbaud12/senner-baud-greetings')
    end

    it "should not include vocal-flair-84 or senner-baud in the empty-list fallback" do
      u = User.new
      keys = u.sidebar_boards.map { |b| b['key'] }.compact
      expect(keys).not_to include(SystemBoardSources.board_key('vocal-flair-84'))
      expect(keys).not_to include(SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG))
      expect(keys).not_to include(SystemBoardSources.board_key('vocal-flair-60'))
    end

    it "should include vocal-flair-84 and senner-baud in the signup sidebar list" do
      keys = User.signup_sidebar_boards.map { |b| b['key'] }.compact
      expect(keys).to include(SystemBoardSources.board_key('vocal-flair-84'))
      expect(keys).to include(SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG))
      expect(keys).not_to include(SystemBoardSources.board_key('vocal-flair-60'))
      expect(keys).not_to include('mbaud12/senner-baud-greetings')
    end

    it "should not auto-add vocal-flair-84 or senner-baud into an older saved sidebar" do
      u = User.new
      vf84_key = SystemBoardSources.board_key('vocal-flair-84')
      senner_key = SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG)
      crisis_key = SystemBoardSources.board_key('crisis-vocabulary')
      saved = User.default_sidebar_boards.reject do |b|
        [senner_key, crisis_key].include?(b['key'])
      end
      u.settings = {'preferences' => {'sidebar_boards' => saved}}
      keys = u.sidebar_boards.map { |b| b['key'] }.compact
      expect(keys).not_to include(vf84_key)
      expect(keys).not_to include(senner_key)
      expect(keys).to include(crisis_key)
    end

    it "should resolve default sidebar entries to user-owned copies except keyboard" do
      source = User.create(user_name: 'lingolinq')
      u = User.create(user_name: 'communicator')
      yesno = Board.process_new({name: 'Yes/No', public: true}, {user: source, key: 'yesno'})
      inflections = Board.process_new({name: 'Inflections', public: true}, {user: source, key: 'inflections'})
      crisis = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: source, key: 'crisis-vocabulary'})
      yesno_copy = yesno.copy_for(u)
      inflections_copy = inflections.copy_for(u)
      crisis_copy = crisis.copy_for(u)

      keys = u.sidebar_boards.map { |b| b['key'] }.compact
      expect(keys).to include(yesno_copy.key)
      expect(keys).to include(inflections_copy.key)
      expect(keys).to include(crisis_copy.key)
      expect(keys).to include(SystemBoardSources.board_key('keyboard'))
      expect(keys).not_to include(yesno.key)
      expect(keys).not_to include(inflections.key)
      expect(keys).not_to include(crisis.key)
    end

    it "should resolve signup sidebar entries to user-owned copies except keyboard" do
      source = User.create(user_name: 'lingolinq')
      u = User.create(user_name: 'communicator')
      yesno = Board.process_new({name: 'Yes/No', public: true}, {user: source, key: 'yesno'})
      inflections = Board.process_new({name: 'Inflections', public: true}, {user: source, key: 'inflections'})
      crisis = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: source, key: 'crisis-vocabulary'})
      vf84 = Board.process_new({name: 'Vocal Flair 84', public: true}, {user: source, key: 'vocal-flair-84'})
      senner = Board.process_new({name: SystemBoardSources::SENNER_BAUD_NAME, public: true}, {user: source, key: 'senner-baud'})
      yesno.copy_for(u)
      inflections.copy_for(u)
      crisis.copy_for(u)
      vf84_copy = vf84.copy_for(u)
      senner_copy = senner.copy_for(u)
      UserBoardProvisioner.apply_signup_sidebar!(u)
      u.reload

      keys = u.sidebar_boards.map { |b| b['key'] }.compact
      expect(keys).to include(vf84_copy.key)
      expect(keys).to include(senner_copy.key)
      expect(keys).to include(SystemBoardSources.board_key('keyboard'))
      expect(keys).not_to include(vf84.key)
      expect(keys).not_to include(senner.key)
    end

    it "should not auto-add crisis when the user's resolved copy key is already stored" do
      source = User.create(user_name: 'lingolinq')
      u = User.create(user_name: 'communicator')
      crisis = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: source, key: 'crisis-vocabulary'})
      crisis_copy = crisis.copy_for(u)
      saved = User.default_sidebar_boards.reject { |b| b['key'] == SystemBoardSources.board_key('crisis-vocabulary') }
      saved << {
        'name' => 'Crisis Vocabulary',
        'key' => crisis_copy.key,
        'image' => 'https://cdn-icons-png.flaticon.com/512/7373/7373323.png',
        'home_lock' => false
      }
      u.settings = {'preferences' => {'sidebar_boards' => saved}}

      crisis_keys = u.sidebar_boards.map { |b| b['key'] }.compact.select do |key|
        key.split('/').last == SystemBoardSources::CRISIS_VOCABULARY_SLUG
      end
      expect(crisis_keys).to eq([crisis_copy.key])
    end

    it "should dedupe duplicate crisis sidebar entries after resolving to the user copy" do
      source = User.create(user_name: 'lingolinq')
      u = User.create(user_name: 'communicator')
      crisis = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: source, key: 'crisis-vocabulary'})
      crisis_copy = crisis.copy_for(u)
      system_key = SystemBoardSources.board_key('crisis-vocabulary')
      u.settings = {'preferences' => {'sidebar_boards' => [
        {'name' => 'Crisis Vocabulary', 'key' => system_key, 'image' => 'https://example.com/crisis.png', 'home_lock' => false},
        {'name' => 'Crisis Vocabulary', 'key' => crisis_copy.key, 'image' => 'https://example.com/crisis.png', 'home_lock' => false}
      ]}}

      crisis_keys = u.sidebar_boards.map { |b| b['key'] }.compact.select do |key|
        key.split('/').last == SystemBoardSources::CRISIS_VOCABULARY_SLUG
      end
      expect(crisis_keys).to eq([crisis_copy.key])
    end

    it "should dedupe duplicate non-crisis sidebar entries after resolving to the user copy" do
      source = User.create(user_name: 'lingolinq')
      u = User.create(user_name: 'communicator')
      yesno = Board.process_new({name: 'Yes/No', public: true}, {user: source, key: 'yesno'})
      yesno_copy = yesno.copy_for(u)
      system_key = SystemBoardSources.board_key('yesno')
      u.settings = {'preferences' => {'sidebar_boards' => [
        {'name' => 'Yes/No', 'key' => system_key, 'image' => 'https://example.com/yesno.png', 'home_lock' => false},
        {'name' => 'Yes/No', 'key' => yesno_copy.key, 'image' => 'https://example.com/yesno.png', 'home_lock' => false}
      ]}}

      yesno_keys = u.sidebar_boards.map { |b| b['key'] }.compact.select do |key|
        key.split('/').last == 'yesno'
      end
      expect(yesno_keys).to eq([yesno_copy.key])
    end
  end
  
  describe "avatars" do
    describe "generated_avatar_url" do
      it "should use the fallback if specified" do
        u = User.new
        u.id = 199
        expect(u.generated_avatar_url('fallback')).to match(%r{/avatars/avatar-9\.png$})
        u.settings = {'email' => 'bob@example.com'}
        expect(u.generated_avatar_url('fallback')).to match(%r{/avatars/avatar-9\.png$})
        u.settings['avatar_url'] = 'http://www.example.com/pic.png'
      end
      
      it "should use the default if specified" do
        u = User.new
        u.id = 199
        u.settings = {'email' => 'bob@example.com'}
        expect(u.generated_avatar_url('default')).to match(%r{/avatars/avatar-9\.png$});
        u.settings['avatar_url'] = 'http://www.example.com/pic.png'
        expect(u.generated_avatar_url('default')).to match(%r{/avatars/avatar-9\.png$});
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
      ut = Utterance.create(:user => u2)
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
      ut = Utterance.create(:user => u2)
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
      ut = Utterance.create(:user => u2)
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
      # 2016-07-22 was a friday - use Time.utc for deterministic result across timezones
      expect(Time).to receive(:now).and_return(Time.utc(2016, 7, 22)).at_least(1).times
      u = User.new(:settings => {'preferences' => {'notification_frequency' => '1_week'}})
      u.id = 1
      # a week from saturday at 23:30
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 23:30 UTC'));
      u.id = 0
      # a week from friday at 22:00
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-29 22:00 UTC'));
      u.id = 2
      # saturday at 0:00 (next occurrence within cutoff)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 00:00 UTC'));
      u.id = 3
      # a week from saturday at 1:30 (move to sunday)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-24 01:30 UTC'));
      u.id = 4
      # saturday at 2:00 (next occurrence within cutoff)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-07-23 02:00 UTC'));
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
      # 2016-03-02 was a wednesday - use Time.utc for deterministic result across timezones
      expect(Time).to receive(:now).and_return(Time.utc(2016, 3, 2, 2, 0, 0)).at_least(1).times
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
      # next day at 2:00 (within 24h cutoff)
      expect(u.next_notification_schedule).to eq(Time.parse('2016-03-03 02:00 UTC'));
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
      expect(u.reload.updated_at).to be_within(1.second).of(a)
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

    it 'should use a constant-time comparison to guard against timing attacks (LL-90045bb29c)' do
      u = User.create
      token = "#{u.global_id}-"
      token = token + GoSecure.sha512(token, 'user_token verifier')[0, 30]
      expect(ActiveSupport::SecurityUtils).to receive(:secure_compare).and_call_original
      expect(User.find_by_token(token)).to eq(u)
    end

    it 'should still use the constant-time comparison on the mismatch path, not just the happy path (LL-90045bb29c)' do
      u = User.create
      # Correct length (30 hex chars) but wrong verifier: exercises the branch a
      # timing attack targets, so a future fast-path/early-return on mismatch fails here.
      wrong_token = "#{u.global_id}-" + ('0' * 30)
      expect(ActiveSupport::SecurityUtils).to receive(:secure_compare).and_call_original
      expect(User.find_by_token(wrong_token)).to eq(nil)
    end
  end

  describe "protected_image_token" do
    it 'should return a signed token that expires after the default lifespan' do
      now = Time.utc(2026, 7, 5, 12, 0, 0)
      allow(Time).to receive(:now).and_return(now)
      u = User.create
      expires_at = (now + User::PROTECTED_IMAGE_TOKEN_LIFESPAN).to_i
      sig = GoSecure.sha512("#{u.global_id}-#{expires_at}", 'protected_image_token verifier')[0, 30]
      expect(u.protected_image_token).to eq("#{u.global_id}-#{expires_at}-#{sig}")
    end

    it 'should respect a custom lifespan' do
      now = Time.utc(2026, 7, 5, 12, 0, 0)
      allow(Time).to receive(:now).and_return(now)
      u = User.create
      expires_at = (now + 7.days).to_i
      sig = GoSecure.sha512("#{u.global_id}-#{expires_at}", 'protected_image_token verifier')[0, 30]
      expect(u.protected_image_token(7.days)).to eq("#{u.global_id}-#{expires_at}-#{sig}")
    end
  end

  describe "find_by_protected_image_token" do
    it 'should find the correct user for a valid, unexpired token' do
      u = User.create
      expect(User.find_by_protected_image_token(u.protected_image_token)).to eq(u)
    end

    it 'should fall back to the legacy permanent user_token format' do
      u = User.create
      expect(User.find_by_protected_image_token(u.user_token)).to eq(u)
    end

    it 'should log when the legacy permanent-token fallback is used' do
      u = User.create
      expect(Rails.logger).to receive(:info).with(/\[protected_image_legacy_token\] accepted permanent-format token for #{Regexp.escape(u.global_id)}/)
      User.find_by_protected_image_token(u.user_token)
    end

    it 'should not log for the newer expiring token format' do
      u = User.create
      expect(Rails.logger).to_not receive(:info).with(/protected_image_legacy_token/)
      User.find_by_protected_image_token(u.protected_image_token)
    end

    it 'should return nil for an expired token' do
      now = Time.utc(2026, 7, 5, 12, 0, 0)
      allow(Time).to receive(:now).and_return(now)
      u = User.create
      token = u.protected_image_token(1.day)
      allow(Time).to receive(:now).and_return(now + 2.days)
      expect(User.find_by_protected_image_token(token)).to eq(nil)
    end

    it 'should return nil for a tampered signature' do
      u = User.create
      parts = u.protected_image_token.split('-')
      parts[-1] = 'a' * 30
      expect(User.find_by_protected_image_token(parts.join('-'))).to eq(nil)
    end

    it 'should return nil for a tampered expiry' do
      u = User.create
      parts = u.protected_image_token.split('-')
      parts[-2] = (parts[-2].to_i + 100).to_s
      expect(User.find_by_protected_image_token(parts.join('-'))).to eq(nil)
    end

    it 'should return nil when the expiry segment is not numeric' do
      u = User.create
      expect(User.find_by_protected_image_token("#{u.global_id}-notanumber-#{'a' * 30}")).to eq(nil)
    end

    it 'should return nil for garbage or missing input' do
      expect(User.find_by_protected_image_token('asdf')).to eq(nil)
      expect(User.find_by_protected_image_token(nil)).to eq(nil)
    end
  end

  describe "lesson_share_token" do
    it 'should return a signed token that expires after the default lifespan' do
      now = Time.utc(2026, 7, 5, 12, 0, 0)
      allow(Time).to receive(:now).and_return(now)
      u = User.create
      expires_at = (now + User::LESSON_SHARE_TOKEN_LIFESPAN).to_i
      sig = GoSecure.sha512("#{u.global_id}-#{expires_at}", 'lesson_share_token verifier')[0, 30]
      expect(u.lesson_share_token).to eq("#{u.global_id}-#{expires_at}-#{sig}")
    end

    it 'should respect a custom lifespan' do
      now = Time.utc(2026, 7, 5, 12, 0, 0)
      allow(Time).to receive(:now).and_return(now)
      u = User.create
      expires_at = (now + 7.days).to_i
      sig = GoSecure.sha512("#{u.global_id}-#{expires_at}", 'lesson_share_token verifier')[0, 30]
      expect(u.lesson_share_token(7.days)).to eq("#{u.global_id}-#{expires_at}-#{sig}")
    end

    it 'should use its own verifier purpose, distinct from protected_image_token' do
      u = User.create
      expect(u.lesson_share_token.split('-')[-1]).to_not eq(u.protected_image_token.split('-')[-1])
    end

    it 'should mint the legacy permanent user_token when the kill-switch is off (LL-90045bb29c option (b))' do
      u = User.create
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('EXPIRING_LESSON_SHARE_TOKENS').and_return('off')
      expect(u.lesson_share_token).to eq(u.user_token)
    end
  end

  describe "find_by_lesson_share_token" do
    it 'should find the correct user for a valid, unexpired token' do
      u = User.create
      expect(User.find_by_lesson_share_token(u.lesson_share_token)).to eq(u)
    end

    it 'should fall back to the legacy permanent user_token format' do
      u = User.create
      expect(User.find_by_lesson_share_token(u.user_token)).to eq(u)
    end

    it 'should accept both formats regardless of the mint kill-switch' do
      u = User.create
      expiring = u.lesson_share_token
      # even with construction reverted to legacy, the finder still resolves an already-issued expiring token
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('EXPIRING_LESSON_SHARE_TOKENS').and_return('off')
      expect(User.find_by_lesson_share_token(expiring)).to eq(u)
      expect(User.find_by_lesson_share_token(u.user_token)).to eq(u)
    end

    it 'should log when the legacy permanent-token fallback is used' do
      u = User.create
      expect(Rails.logger).to receive(:info).with(/\[lesson_share_legacy_token\] accepted permanent-format token for #{Regexp.escape(u.global_id)}/)
      User.find_by_lesson_share_token(u.user_token)
    end

    it 'should not log for the newer expiring token format' do
      u = User.create
      expect(Rails.logger).to_not receive(:info).with(/lesson_share_legacy_token/)
      User.find_by_lesson_share_token(u.lesson_share_token)
    end

    it 'should return nil for an expired token' do
      now = Time.utc(2026, 7, 5, 12, 0, 0)
      allow(Time).to receive(:now).and_return(now)
      u = User.create
      token = u.lesson_share_token(1.day)
      allow(Time).to receive(:now).and_return(now + 2.days)
      expect(User.find_by_lesson_share_token(token)).to eq(nil)
    end

    it 'should return nil for a tampered signature' do
      u = User.create
      parts = u.lesson_share_token.split('-')
      parts[-1] = 'a' * 30
      expect(User.find_by_lesson_share_token(parts.join('-'))).to eq(nil)
    end

    it 'should use a constant-time comparison on the signature (LL-90045bb29c)' do
      u = User.create
      expect(ActiveSupport::SecurityUtils).to receive(:secure_compare).and_call_original
      expect(User.find_by_lesson_share_token(u.lesson_share_token)).to eq(u)
    end

    it 'should return nil for a tampered expiry' do
      u = User.create
      parts = u.lesson_share_token.split('-')
      parts[-2] = (parts[-2].to_i + 100).to_s
      expect(User.find_by_lesson_share_token(parts.join('-'))).to eq(nil)
    end

    it 'should return nil when the expiry segment is not numeric' do
      u = User.create
      expect(User.find_by_lesson_share_token("#{u.global_id}-notanumber-#{'a' * 30}")).to eq(nil)
    end

    it 'should return nil for garbage or missing input' do
      expect(User.find_by_lesson_share_token('asdf')).to eq(nil)
      expect(User.find_by_lesson_share_token(nil)).to eq(nil)
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

  describe "copy_board_to_library" do
    it "returns false without a valid original board" do
      u = User.create
      expect(u.copy_board_to_library({}, nil, nil)).to eq(false)
    end

    it "copies a board without setting home_board" do
      u = User.create
      owner = User.create
      b1 = Board.create(user: owner, public: true)
      expect(u.copy_board_to_library({'id' => b1.global_id}, owner.global_id, nil)).to eq(true)
      expect(u.settings['preferences']['home_board']).to eq(nil)
      expect(u.boards.where(parent_board: b1).first).to_not eq(nil)
    end

    it "returns true when the user already owns a matching copy" do
      u = User.create
      owner = User.create
      b1 = Board.create(user: owner, public: true)
      existing = b1.copy_for(u)
      expect(u).to_not receive(:copy_board_links)
      expect(u.copy_board_to_library({'id' => b1.global_id}, owner.global_id, nil)).to eq(true)
      expect(u.boards.where(parent_board: b1).first.id).to eq(existing.id)
    end

    it "should re-swap an existing library copy in place when swap_incomplete is set" do
      u = User.create
      owner = User.create
      b1 = Board.create(user: owner, public: true)
      bi = ButtonImage.create(user: owner)
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
      ]}, {})
      existing = b1.copy_for(u)
      existing.settings['swapped_library'] = 'opensymbols'
      existing.settings['swap_incomplete'] = true
      existing.save
      expect(u).to_not receive(:copy_board_links)
      expect(Uploader).to receive(:default_images).and_return({
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })
      expect(u.copy_board_to_library({'id' => b1.global_id}, owner.global_id, 'opensymbols')).to eq(true)
      expect(u.boards.where(parent_board: b1).count).to eq(1)
      existing.reload
      expect(existing.settings['swap_incomplete']).to eq(nil)
      expect(existing.buttons[0]['image_id']).to_not eq(bi.global_id)
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
      bi = ButtonImage.create(user: u)
      bi2 = ButtonImage.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {})
      b2 = b1.copy_for(u)
      b2.settings['swapped_library'] = 'twemoji'
      b2.save
      expect(Uploader).to receive(:default_images).with('mulberry', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => { 'lingolinq_image_id' => bi2.global_id },
        'hat' => { 'lingolinq_image_id' => bi2.global_id },
      })
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

    it "should re-swap an existing home copy in place when swap_incomplete is set" do
      u = User.create
      owner = User.create
      b1 = Board.create(user: owner, public: true)
      bi = ButtonImage.create(user: owner)
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
      ]}, {})
      b2 = b1.copy_for(u)
      b2.settings['swapped_library'] = 'opensymbols'
      b2.settings['swap_incomplete'] = true
      b2.save
      u.settings['preferences']['home_board'] = {'id' => b2.global_id, 'key' => b2.key}
      u.save
      expect(u).to_not receive(:copy_board_links)
      expect(Uploader).to receive(:default_images).and_return({
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })
      expect(u.copy_to_home_board({'id' => b1.global_id}, owner.global_id, 'opensymbols')).to eq(true)
      expect(u.settings['preferences']['home_board']['id']).to eq(b2.global_id)
      b2.reload
      expect(b2.settings['swap_incomplete']).to eq(nil)
      expect(b2.buttons[0]['image_id']).to_not eq(bi.global_id)
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

  describe "effective data policy preferences" do
    it "should return true when user enables logging and no org policy" do
      u = User.create
      u.settings['preferences'] = {'logging' => true}
      expect(u.effective_logging_allowed?).to eq(true)
    end

    it "should return false when user disables logging regardless of org" do
      o = Organization.create
      o.settings['data_policy'] = {'logging_allowed' => true}
      o.settings['total_licenses'] = 1
      o.save
      u = User.create
      u.settings['preferences'] = {'logging' => false}
      o.add_user(u.user_name, false, true)
      u.reload
      expect(u.effective_logging_allowed?).to eq(false)
    end

    it "should return false when org disallows logging even if user enables it" do
      o = Organization.create
      o.settings['data_policy'] = {'logging_allowed' => false}
      o.settings['total_licenses'] = 1
      o.save
      u = User.create
      u.settings['preferences'] = {'logging' => true}
      o.add_user(u.user_name, false, true)
      u.reload
      expect(u.effective_logging_allowed?).to eq(false)
    end

    it "should return false for geo when org disallows geo logging" do
      o = Organization.create
      o.settings['data_policy'] = {'geo_logging_allowed' => false}
      o.settings['total_licenses'] = 1
      o.save
      u = User.create
      u.settings['preferences'] = {'geo_logging' => true}
      o.add_user(u.user_name, false, true)
      u.reload
      expect(u.effective_geo_logging_allowed?).to eq(false)
    end

    it "should allow user to be more private than org policy" do
      o = Organization.create
      o.settings['data_policy'] = {'geo_logging_allowed' => true}
      o.settings['total_licenses'] = 1
      o.save
      u = User.create
      u.settings['preferences'] = {'geo_logging' => false}
      o.add_user(u.user_name, false, true)
      u.reload
      expect(u.effective_geo_logging_allowed?).to eq(false)
    end

    it "should enforce org max logging cutoff" do
      o = Organization.create
      o.settings['data_policy'] = {'max_logging_cutoff_hours' => 48}
      o.settings['total_licenses'] = 1
      o.save
      u = User.create
      u.settings['preferences'] = {'logging_cutoff' => nil}
      o.add_user(u.user_name, false, true)
      u.reload

      supervisor = User.create
      expect(u.effective_logging_cutoff_for(supervisor, nil)).to eq(48)
    end

    it "should use user cutoff when more restrictive than org" do
      o = Organization.create
      o.settings['data_policy'] = {'max_logging_cutoff_hours' => 48}
      o.settings['total_licenses'] = 1
      o.save
      u = User.create
      o.add_user(u.user_name, false, true)
      u.reload
      u.settings['preferences']['logging_cutoff'] = 24
      u.save

      supervisor = User.create
      expect(u.effective_logging_cutoff_for(supervisor, nil)).to eq(24)
    end

    it "should return empty policy for users without an org" do
      u = User.create
      expect(u.effective_data_policy).to eq({})
    end
  end

  describe '#ai_consent_granted?' do
    # AuditEvent.create! fires inside grant/revoke under with_lock(requires_new: true)
    # and commits outside the per-example fixture transaction, so rows leak across
    # examples and break the `expect(AuditEvent.count).to eq(0)` baselines. Clean per
    # example, scoped to the consent specs so there is no global suite blast radius.
    before(:each) { AuditEvent.delete_all }

    it 'returns false for a newly created user with no ai_consent grant' do
      u = User.create
      expect(u.settings).to be_a(Hash)
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(false)
    end

    it 'returns false when settings hash exists but ai_consent key is absent' do
      u = User.create
      u.settings = {}
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(false)
    end

    it 'returns true after grant_ai_consent! at the same disclosures_version' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(true)
    end

    it 'returns false when queried at a different disclosures_version' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      expect(u.ai_consent_granted?(disclosures_version: 2)).to eq(false)
    end

    it 'returns false after revoke_ai_consent!' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      u.revoke_ai_consent!
      u.reload
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(false)
    end

    it 'defaults disclosures_version: to LingoLinq::AiConsentDisclosures::CURRENT_VERSION when the kwarg is omitted (VPC Phase 2)' do
      expect(LingoLinq::AiConsentDisclosures::CURRENT_VERSION).to eq(1)
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      expect(u.ai_consent_granted?).to eq(true)
    end

    it 'the omitted-kwarg default still returns false for a user with no grant (does not silently pass)' do
      u = User.create
      expect(u.ai_consent_granted?).to eq(false)
    end

    it 'returns false when explicit disclosures_version: nil is passed' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      expect(u.ai_consent_granted?(disclosures_version: nil)).to eq(false)
    end
  end

  describe '#article_50_disclosure_shown? / #mark_article_50_disclosure_shown!' do
    # AuditEvent.create! fires inside the writer under with_lock(requires_new: true)
    # and commits outside the per-example fixture transaction, so rows leak across
    # examples and break the AuditEvent.count baselines. Scope the clean to this block.
    before(:each) { AuditEvent.delete_all }

    it 'reader defaults to false for a newly created user with no ai_transparency key' do
      u = User.create
      expect(u.settings).to be_a(Hash)
      expect(u.article_50_disclosure_shown?(disclosures_version: 1)).to eq(false)
    end

    it 'reader returns false when settings hash exists but ai_transparency key is absent' do
      u = User.create
      u.settings = {}
      expect(u.article_50_disclosure_shown?(disclosures_version: 1)).to eq(false)
    end

    it 'defaults disclosures_version: to LingoLinq::Article50Disclosures::CURRENT_VERSION (PN-02, its OWN source)' do
      expect(LingoLinq::Article50Disclosures::CURRENT_VERSION).to eq(1)
      u = User.create
      u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      u.reload
      expect(u.article_50_disclosure_shown?).to eq(true)
    end

    it 'reader returns true after the writer marks it at the same version' do
      u = User.create
      u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      u.reload
      expect(u.article_50_disclosure_shown?(disclosures_version: 1)).to eq(true)
    end

    it 'reader returns false when queried at a bumped version (re-prompt semantics)' do
      u = User.create
      u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      u.reload
      expect(u.article_50_disclosure_shown?(disclosures_version: 2)).to eq(false)
    end

    it 'writer sets shown_at, disclosures_version, source, and a UUID-shaped record_id' do
      u = User.create
      res = u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      expect(res).to be_truthy
      u.reload
      c = u.settings['ai_transparency']
      expect(c).to be_a(Hash)
      expect(c['shown_at']).to be_present
      expect(c['disclosures_version']).to eq(1)
      expect(c['source']).to eq('modal_ack')
      # Assert the record_id CONTRACT (UUID shape), not the generator.
      expect(c['record_id']).to match(/\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/)
    end

    it "fires exactly one AuditEvent with event_type 'article_50_disclosure_shown' and the expected payload" do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      expect(AuditEvent.count).to eq(0)
      res = u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      expect(res).to be_truthy
      expect(AuditEvent.count).to eq(1)
      ae = AuditEvent.last
      expect(ae.event_type).to eq('article_50_disclosure_shown')
      expect(ae.data['type']).to eq('article_50_disclosure_shown')
      expect(ae.data['disclosures_version']).to eq(1)
      expect(ae.data['source']).to eq('modal_ack')
      expect(ae.data['record_id']).to be_present
      u.reload
      expect(ae.data['record_id']).to eq(u.settings['ai_transparency']['record_id'])
    end

    it 'is idempotent on same-version re-call: returns false and fires no second AuditEvent' do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      expect(AuditEvent.count).to eq(1)
      pre_count = AuditEvent.count
      res = u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      expect(res).to eq(false)
      expect(AuditEvent.count - pre_count).to eq(0)
    end

    it 'preserves record_id across a version bump re-record' do
      u = User.create
      u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'modal_ack')
      u.reload
      original_record_id = u.settings['ai_transparency']['record_id']
      expect(original_record_id).to be_present
      res = u.mark_article_50_disclosure_shown!(disclosures_version: 2, source: 'modal_ack')
      expect(res).to be_truthy
      u.reload
      expect(u.settings['ai_transparency']['disclosures_version']).to eq(2)
      expect(u.settings['ai_transparency']['record_id']).to eq(original_record_id)
    end

    it 'raises ArgumentError invalid_source for a non-allowlisted source' do
      u = User.create
      expect {
        u.mark_article_50_disclosure_shown!(disclosures_version: 1, source: 'sneaky')
      }.to raise_error(ArgumentError, 'invalid_source')
    end
  end

  describe '#grant_ai_consent!' do
    before(:each) { AuditEvent.delete_all }  # see #ai_consent_granted? note above

    it 'writes the settings hash and returns truthy on first call' do
      u = User.create
      res = u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(res).to be_truthy
      u.reload
      c = u.settings['ai_consent']
      expect(c).to be_a(Hash)
      expect(c['granted_at']).to be_present
      expect(c['granted_by']).to eq('Parent Name <parent@example.com>')
      expect(c['source']).to eq('email_link')
      expect(c['record_id']).to be_present
      expect(c['disclosures_version']).to eq(1)
    end

    it 'deletes pending_token and pending_token_expires_at on grant' do
      u = User.create
      u.settings ||= {}
      u.settings['ai_consent'] = {
        'pending_token' => 'abc',
        'pending_token_expires_at' => (Time.now.utc + 14 * 86400).iso8601
      }
      u.save
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      c = u.settings['ai_consent']
      expect(c).not_to have_key('pending_token')
      expect(c).not_to have_key('pending_token_expires_at')
    end

    it 'assigns record_id in RFC-4122 UUID format on first grant' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      # 8-4-4-4-12 hex pattern. We assert the contract (UUID-shaped string),
      # not the implementation (whatever generator was used). Adversary-flagged
      # concern: the prior implementation (GoSecure.nonce) had only ~20 bits of
      # input entropy per second per purpose, which could collide under bulk
      # admin_backfill. SecureRandom.uuid gives 122 bits.
      expect(u.settings['ai_consent']['record_id']).to match(/\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/)
    end

    it 'preserves record_id across the revoke/re-grant lifecycle' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      original_record_id = u.settings['ai_consent']['record_id']
      expect(original_record_id).to be_present
      u.revoke_ai_consent!
      u.reload
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      expect(u.settings['ai_consent']['record_id']).to eq(original_record_id)
    end

    it "fires exactly one AuditEvent with data['type'] == 'ai_consent_grant' and the expected payload" do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      expect(AuditEvent.count).to eq(0)
      res = u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(res).to be_truthy
      expect(AuditEvent.count).to eq(1)
      ae = AuditEvent.last
      expect(ae.data['type']).to eq('ai_consent_grant')
      expect(ae.data['disclosures_version']).to eq(1)
      expect(ae.data['source']).to eq('email_link')
      expect(ae.data['granted_by']).to eq('Parent Name <parent@example.com>')
      expect(ae.data['record_id']).to be_present
      u.reload
      expect(ae.data['record_id']).to eq(u.settings['ai_consent']['record_id'])
    end

    it 'is idempotent on same-version re-call: returns false and fires no second AuditEvent' do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(AuditEvent.count).to eq(1)
      pre_count = AuditEvent.count
      res = u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(res).to eq(false)
      expect(AuditEvent.count - pre_count).to eq(0)
    end

    it 'does NOT silently grant at a stale (older) version: returns false and fires no AuditEvent' do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.grant_ai_consent!(disclosures_version: 2, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(AuditEvent.count).to eq(1)
      pre_count = AuditEvent.count
      res = u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(res).to eq(false)
      expect(AuditEvent.count - pre_count).to eq(0)
      u.reload
      expect(u.settings['ai_consent']['disclosures_version']).to eq(2)
    end

    it 'accepts a version upgrade: grant at a newer disclosures_version overwrites the prior active grant and preserves record_id' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      original_record_id = u.settings['ai_consent']['record_id']
      pre_count = AuditEvent.count
      res = u.grant_ai_consent!(disclosures_version: 2, granted_by: 'Parent Name <parent@example.com>', source: 'in_app')
      expect(res).to eq(true)
      expect(AuditEvent.count - pre_count).to eq(1)
      u.reload
      c = u.settings['ai_consent']
      expect(c['disclosures_version']).to eq(2)
      expect(c['source']).to eq('in_app')
      expect(c['record_id']).to eq(original_record_id)
      expect(c['revoked_at']).to be_blank
    end

    it 'records the prior_disclosures_version in the audit payload on a version upgrade' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.grant_ai_consent!(disclosures_version: 2, granted_by: 'Parent Name <parent@example.com>', source: 'in_app')
      ae = AuditEvent.last
      expect(ae.event_type).to eq('ai_consent_grant')
      expect(ae.data['disclosures_version']).to eq(2)
      expect(ae.data['prior_disclosures_version']).to eq(1)
    end

    it 'emits prior_disclosures_version as nil on a first-time grant (no prior version to upgrade from)' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      ae = AuditEvent.last
      expect(ae.data['prior_disclosures_version']).to be_nil
    end

    it 'passes through optional ip, user_agent, granted_by_user_id to the settings hash' do
      u = User.create
      granter = User.create
      u.grant_ai_consent!(
        disclosures_version: 1,
        granted_by: 'Parent Name <parent@example.com>',
        source: 'in_app',
        ip: '192.0.2.42',
        user_agent: 'Mozilla/5.0 (test-agent)',
        granted_by_user_id: granter.global_id
      )
      u.reload
      c = u.settings['ai_consent']
      expect(c['ip']).to eq('192.0.2.42')
      expect(c['user_agent']).to eq('Mozilla/5.0 (test-agent)')
      expect(c['granted_by_user_id']).to eq(granter.global_id)
      expect(c['source']).to eq('in_app')
    end

    it 'accepts the admin_backfill source value' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Admin Backfill', source: 'admin_backfill')
      u.reload
      expect(u.settings['ai_consent']['source']).to eq('admin_backfill')
    end

    it 'raises ArgumentError when source is not in the allowlist' do
      u = User.create
      expect {
        u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent', source: 'sms_link')
      }.to raise_error(ArgumentError, 'invalid_source')
      expect {
        u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent', source: nil)
      }.to raise_error(ArgumentError, 'invalid_source')
      expect {
        u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent', source: '')
      }.to raise_error(ArgumentError, 'invalid_source')
      u.reload
      # Pre-validation raise means no settings mutation, no audit row.
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'raises ArgumentError when granted_by_user_id equals self.global_id (no self-grant)' do
      u = User.create
      expect {
        u.grant_ai_consent!(
          disclosures_version: 1,
          granted_by: 'Self',
          source: 'in_app',
          granted_by_user_id: u.global_id
        )
      }.to raise_error(ArgumentError, 'self_grant_forbidden')
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'raises ArgumentError when granted_by_user_id is the bare numeric self id (no self-grant bypass)' do
      u = User.create
      expect {
        u.grant_ai_consent!(
          disclosures_version: 1,
          granted_by: 'Self',
          source: 'in_app',
          granted_by_user_id: u.id
        )
      }.to raise_error(ArgumentError, 'self_grant_forbidden')
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'raises ArgumentError when granted_by_user_id is not a global_id or numeric db id' do
      u = User.create
      expect {
        u.grant_ai_consent!(
          disclosures_version: 1,
          granted_by: 'Parent',
          source: 'in_app',
          granted_by_user_id: 'not-a-valid-id'
        )
      }.to raise_error(ArgumentError, 'invalid_granted_by_user_id')
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'normalizes a bare numeric granted_by_user_id to global_id form in settings' do
      u = User.create
      granter = User.create
      u.grant_ai_consent!(
        disclosures_version: 1,
        granted_by: 'Parent',
        source: 'in_app',
        granted_by_user_id: granter.id
      )
      u.reload
      expect(u.settings['ai_consent']['granted_by_user_id']).to eq(granter.global_id)
    end

    it 'allows a different user as granted_by_user_id' do
      u = User.create
      granter = User.create
      expect {
        u.grant_ai_consent!(
          disclosures_version: 1,
          granted_by: 'Parent',
          source: 'in_app',
          granted_by_user_id: granter.global_id
        )
      }.not_to raise_error
    end

    it 'raises ArgumentError when granted_by is nil and writes no consent row' do
      u = User.create
      expect {
        u.grant_ai_consent!(disclosures_version: 1, granted_by: nil, source: 'email_link')
      }.to raise_error(ArgumentError, 'invalid_granted_by')
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'raises ArgumentError when granted_by is blank and writes no consent row' do
      u = User.create
      expect {
        u.grant_ai_consent!(disclosures_version: 1, granted_by: '   ', source: 'email_link')
      }.to raise_error(ArgumentError, 'invalid_granted_by')
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'raises ArgumentError when disclosures_version is nil and writes no consent row' do
      u = User.create
      expect {
        u.grant_ai_consent!(disclosures_version: nil, granted_by: 'Parent', source: 'email_link')
      }.to raise_error(ArgumentError, 'invalid_disclosures_version')
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'raises ArgumentError when disclosures_version is non-numeric' do
      u = User.create
      expect {
        u.grant_ai_consent!(disclosures_version: 'abc', granted_by: 'Parent', source: 'email_link')
      }.to raise_error(ArgumentError, 'invalid_disclosures_version')
    end

    it 'raises ArgumentError when disclosures_version is below 1' do
      u = User.create
      expect {
        u.grant_ai_consent!(disclosures_version: 0, granted_by: 'Parent', source: 'email_link')
      }.to raise_error(ArgumentError, 'invalid_disclosures_version')
    end

    it 'compares versions numerically, not lexicographically (v10 is newer than v2)' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 2, granted_by: 'Parent', source: 'email_link')
      pre_count = AuditEvent.count
      res = u.grant_ai_consent!(disclosures_version: 10, granted_by: 'Parent', source: 'in_app')
      # Lexicographic "10" < "2" would wrongly treat v10 as stale and no-op.
      expect(res).to eq(true)
      expect(AuditEvent.count - pre_count).to eq(1)
      u.reload
      expect(u.settings['ai_consent']['disclosures_version']).to eq(10)
    end

    it 'coerces a numeric-string disclosures_version to an Integer' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: '3', granted_by: 'Parent', source: 'email_link')
      u.reload
      expect(u.settings['ai_consent']['disclosures_version']).to eq(3)
      expect(u.ai_consent_granted?(disclosures_version: 3)).to eq(true)
    end

    it 'does NOT reactivate consent at a stale version after a revoke (revoked-then-stale grant is a no-op)' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 2, granted_by: 'Parent <p@example.com>', source: 'email_link')
      u.revoke_ai_consent!
      u.reload
      pre_count = AuditEvent.count
      # Following an OLD v1 grant link after revoking v2 must not reactivate at v1.
      res = u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent <p@example.com>', source: 'email_link')
      expect(res).to eq(false)
      expect(AuditEvent.count - pre_count).to eq(0)
      u.reload
      c = u.settings['ai_consent']
      expect(c['revoked_at']).to be_present       # still revoked, not reactivated
      expect(c['disclosures_version']).to eq(2)   # not downgraded to v1
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(false)
      expect(u.ai_consent_granted?(disclosures_version: 2)).to eq(false)
    end

    it 'reactivates consent on a same-or-newer version grant after a revoke' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent <p@example.com>', source: 'email_link')
      u.revoke_ai_consent!
      u.reload
      res = u.grant_ai_consent!(disclosures_version: 2, granted_by: 'Parent <p@example.com>', source: 'in_app')
      expect(res).to eq(true)
      u.reload
      c = u.settings['ai_consent']
      expect(c['revoked_at']).to be_blank
      expect(c['disclosures_version']).to eq(2)
      expect(u.ai_consent_granted?(disclosures_version: 2)).to eq(true)
    end
  end

  describe '#revoke_ai_consent!' do
    before(:each) { AuditEvent.delete_all }  # see #ai_consent_granted? note above

    it 'returns false when called on a user with no consent record' do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      pre_count = AuditEvent.count
      res = u.revoke_ai_consent!
      expect(res).to eq(false)
      expect(AuditEvent.count - pre_count).to eq(0)
    end

    it 'marks the record revoked and returns true on first call after grant' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      res = u.revoke_ai_consent!
      expect(res).to eq(true)
      u.reload
      expect(u.settings['ai_consent']['revoked_at']).to be_present
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(false)
    end

    it "fires exactly one AuditEvent with data['type'] == 'ai_consent_revoke' and the expected payload" do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(AuditEvent.count).to eq(1)
      u.reload
      granted_record_id = u.settings['ai_consent']['record_id']
      u.revoke_ai_consent!(source: 'parent')
      expect(AuditEvent.count).to eq(2)
      ae = AuditEvent.last
      expect(ae.data['type']).to eq('ai_consent_revoke')
      expect(ae.data['disclosures_version']).to eq(1)
      expect(ae.data['source']).to eq('parent')
      expect(ae.data['record_id']).to eq(granted_record_id)
    end

    it 'is idempotent on already-revoked: returns false and fires no second AuditEvent' do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.revoke_ai_consent!
      expect(AuditEvent.count).to eq(2)
      u.reload
      first_revoked_at = u.settings['ai_consent']['revoked_at']
      pre_count = AuditEvent.count
      res = u.revoke_ai_consent!
      expect(res).to eq(false)
      expect(AuditEvent.count - pre_count).to eq(0)
      u.reload
      expect(u.settings['ai_consent']['revoked_at']).to eq(first_revoked_at)
    end

    it 'passes through optional revoked_by and reason to the settings hash' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      u.revoke_ai_consent!(revoked_by: 'Parent Name <parent@example.com>', reason: 'Withdrawing consent')
      u.reload
      c = u.settings['ai_consent']
      expect(c['revoked_by']).to eq('Parent Name <parent@example.com>')
      expect(c['revoked_reason']).to eq('Withdrawing consent')
    end

    it 'defaults source to parent when not specified' do
      expect(AuditEvent.count).to eq(0)
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.revoke_ai_consent!
      expect(AuditEvent.last.data['source']).to eq('parent')
    end

    it 'raises ArgumentError when revoke source is not in the allowlist' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent', source: 'email_link')
      expect {
        u.revoke_ai_consent!(source: 'malicious-input')
      }.to raise_error(ArgumentError, 'invalid_source')
      # Pre-validation raise: settings still show the grant intact
      u.reload
      expect(u.settings['ai_consent']['revoked_at']).to be_blank
    end

    it 'accepts admin and system as revoke sources in addition to parent' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent', source: 'email_link')
      expect { u.revoke_ai_consent!(source: 'admin') }.not_to raise_error
      u2 = User.create
      u2.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent', source: 'email_link')
      expect { u2.revoke_ai_consent!(source: 'system') }.not_to raise_error
    end

    it 'records revoked_by and revoked_reason in the immutable AuditEvent payload, not just settings' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent <p@example.com>', source: 'email_link')
      u.revoke_ai_consent!(revoked_by: 'Parent <p@example.com>', reason: 'Withdrawing consent', source: 'parent')
      ae = AuditEvent.last
      expect(ae.data['type']).to eq('ai_consent_revoke')
      expect(ae.data['revoked_by']).to eq('Parent <p@example.com>')
      expect(ae.data['revoked_reason']).to eq('Withdrawing consent')
    end

    it 'preserves revoked_by/revoked_reason in the audit trail even after a re-grant clears the settings copy' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent <p@example.com>', source: 'email_link')
      u.revoke_ai_consent!(revoked_by: 'Parent <p@example.com>', reason: 'changed mind')
      revoke_ae = AuditEvent.last
      u.reload
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent <p@example.com>', source: 'email_link')
      u.reload
      # The settings copy is cleared on re-grant...
      expect(u.settings['ai_consent']['revoked_by']).to be_blank
      expect(u.settings['ai_consent']['revoked_reason']).to be_blank
      # ...but the audit row still carries who revoked and why.
      revoke_ae.reload
      expect(revoke_ae.data['revoked_by']).to eq('Parent <p@example.com>')
      expect(revoke_ae.data['revoked_reason']).to eq('changed mind')
    end
  end

  describe 'AI consent atomicity and audit-event coupling' do
    before(:each) { AuditEvent.delete_all }  # see #ai_consent_granted? note above

    it 'populates audit_events.event_type and record_id columns on grant (not just the data blob)' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      ae = AuditEvent.last
      expect(ae.event_type).to eq('ai_consent_grant')
      expect(ae.record_id).to eq(u.settings['ai_consent']['record_id'])
    end

    it 'populates audit_events.event_type and record_id columns on revoke' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      record_id = u.settings['ai_consent']['record_id']
      u.revoke_ai_consent!
      ae = AuditEvent.last
      expect(ae.event_type).to eq('ai_consent_revoke')
      expect(ae.record_id).to eq(record_id)
    end

    it 'rolls back the User settings write when AuditEvent.create! raises during grant' do
      u = User.create
      allow(AuditEvent).to receive(:create!).and_raise(ActiveRecord::RecordInvalid.new(AuditEvent.new))
      expect {
        expect { u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link') }.to raise_error(ActiveRecord::RecordInvalid)
      }.not_to change { AuditEvent.count }
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'rolls back the User settings write when AuditEvent.create! raises during revoke' do
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u.reload
      pre_count = AuditEvent.count
      allow(AuditEvent).to receive(:create!).and_raise(ActiveRecord::RecordInvalid.new(AuditEvent.new))
      expect {
        u.revoke_ai_consent!
      }.to raise_error(ActiveRecord::RecordInvalid)
      expect(AuditEvent.count).to eq(pre_count)
      u.reload
      expect(u.settings['ai_consent']['revoked_at']).to be_blank
    end

    it 'rolls back the consent write even when the audit error is rescued inside an outer transaction (requires_new SAVEPOINT)' do
      # Without `requires_new: true` on with_lock, Rails would join the outer
      # transaction and a rescued AR error would still leave the consent settings
      # committed when the outer transaction commits. This spec is the canary for
      # that regression.
      u = User.create
      allow(AuditEvent).to receive(:create!).and_raise(ActiveRecord::RecordInvalid.new(AuditEvent.new))
      ActiveRecord::Base.transaction do
        begin
          u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
        rescue ActiveRecord::RecordInvalid
          # Caller swallows the audit failure (e.g. controller renders a 500)
          # but expects the consent write to NOT have leaked through.
        end
        # Outer transaction commits cleanly here.
      end
      u.reload
      expect(u.settings && u.settings['ai_consent']).to be_blank
    end

    it 'no-ops on a stale in-memory revoke after another copy already revoked (lost-update guard via with_lock reload)' do
      # NOTE: This test runs single-threaded inside Rails' test transaction, so it
      # does not exercise true cross-connection SELECT FOR UPDATE blocking. What it
      # does prove is the second half of the lost-update guard: with_lock reloads
      # the row inside its block, so a stale in-memory copy observes the committed
      # state (revoked) and the idempotency guard correctly no-ops. The SELECT FOR
      # UPDATE behavior under real concurrent connections is a database-level
      # guarantee, not asserted here.
      u = User.create
      u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      u_a = User.find(u.id)
      u_b = User.find(u.id)
      u_a.revoke_ai_consent!
      # u_b is stale: in-memory state still says granted-and-unrevoked. Calling
      # revoke! should reload inside with_lock, see the revoked state, and no-op.
      res = u_b.revoke_ai_consent!
      expect(res).to eq(false)
      u.reload
      expect(u.settings['ai_consent']['revoked_at']).to be_present
    end

    it 'treats a non-Hash truthy value at settings[ai_consent] as missing (does not crash)' do
      u = User.create
      u.settings = { 'ai_consent' => 'corrupted-string-value' }
      u.save
      expect(u.ai_consent_granted?(disclosures_version: 1)).to eq(false)
      # grant! must overwrite the malformed value with a proper hash.
      res = u.grant_ai_consent!(disclosures_version: 1, granted_by: 'Parent Name <parent@example.com>', source: 'email_link')
      expect(res).to eq(true)
      u.reload
      expect(u.settings['ai_consent']).to be_a(Hash)
      expect(u.settings['ai_consent']['granted_at']).to be_present
    end
  end
end
