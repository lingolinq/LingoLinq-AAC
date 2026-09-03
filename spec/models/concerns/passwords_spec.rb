require 'spec_helper'

describe Passwords, :type => :model do
  describe "password resetting" do
    it "should clean old reset attempts" do
      u = User.new
      u.settings = {}
      u.settings['password_resets'] = [
        {'timestamp' => Time.now.to_i - 100000},
        {'timestamp' => Time.now.to_i - 50000},
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 100},
        {'timestamp' => Time.now.to_i - 100},
        {'timestamp' => Time.now.to_i - 10},
      ]
      u.clean_password_resets
      expect(u.settings['password_resets'].length).to eq(4)
    end
    
    it "should generate a password reset token" do
      u = User.new
      expect(u.generate_password_reset).to eq(true)
      expect(u.settings['password_resets'].length).to eq(1)
      expect(u.settings['password_resets'][0]['timestamp']).to be > (Time.now.to_i - 100)
      expect(u.settings['password_resets'][0]['code']).not_to eq(nil)
    end
    
    it "should fail to generate a reset token if there are too many already generated" do
      u = User.new
      u.settings = {}
      u.settings['password_resets'] = [
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 100},
        {'timestamp' => Time.now.to_i - 100},
        {'timestamp' => Time.now.to_i - 10},
      ]
      expect(u.generate_password_reset).to eq(false)
    end
    
    it "should return the latest reset code when requested" do
      u = User.new
      u.settings = {}
      u.settings['password_resets'] = [
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 500},
        {'timestamp' => Time.now.to_i - 100},
        {'timestamp' => Time.now.to_i - 100, 'code' => 'cheese'},
        {'timestamp' => Time.now.to_i - 10, 'code' => 'coolness'},
      ]
      expect(u.password_reset_code).to eq('coolness')
      u.settings['password_resets'][-1]['timestamp'] = Time.now.to_i - 50000
      expect(u.password_reset_code).to eq('cheese')
    end
    
    it "should generate a reset token when a valid code is provided" do
      u = User.new
      u.settings = {}
      u.settings['password_resets'] = [
        {'timestamp' => Time.now.to_i - 50000, 'code' => 'always'},
        {'timestamp' => Time.now.to_i - 10, 'code' => 'coolness'},
      ]
      expect(u.reset_token_for_code('nothing')).to eq(nil)
      expect(u.reset_token_for_code('always')).to eq(nil)
      expect(u.reset_token_for_code('coolness')).not_to eq(nil)
      expect(u.settings['password_resets'][-1]['token']).not_to eq(nil)
    end
    
    it "should confirm the reset token for any still-valid reset attempt" do
      u = User.new
      u.settings = {}
      u.settings['password_resets'] = [
        {'timestamp' => Time.now.to_i - 50000, 'code' => 'always'},
        {'timestamp' => Time.now.to_i - 10, 'code' => 'coolness'},
      ]
      token = u.reset_token_for_code('coolness')
      expect(token).not_to eq(nil)
      expect(u.valid_reset_token?(token)).to eq(true)
      expect(u.valid_reset_token?('abcdef')).to eq(false)

      u.settings['password_resets'] = [
        {'timestamp' => Time.now.to_i - 50000, 'code' => 'always', 'token' => 'qwert'},
        {'timestamp' => Time.now.to_i - 10, 'code' => 'coolness', 'token' => 'werty'},
      ]
      expect(u.valid_reset_token?('qwert')).to eq(false)
      expect(u.valid_reset_token?('werty')).to eq(true)
    end
  end
  
  describe "generate_password" do
    it "should generate a password" do
      u = User.new
      u.generate_password("hippo")
      expect(u.settings['password']['hash_type']).to eq('pbkdf2-sha256-2')
      expect(u.settings['password']['hashed_password']).not_to eq(nil)
      expect(u.settings['password']['salt']).not_to eq(nil)
      
      expect(GoSecure).to receive(:generate_password).with("hashed?:#sha512?:#628e5bdc3a64db65f14447a68796223925dcd0465c26cb3f86e16776552e0959ecd9a1a9140980593392e969e0027d49300bd64bbf9e28de351228e8ef047b93").and_return({})
      User.new.generate_password("bacon")
    end
  end
  
  describe "valid_password?" do
    it "should check the password" do
      u = User.new
      u.generate_password("I love to eat apples and bananas")
      pw = u.settings['password']
      expect(u.valid_password?("chicken")).to eq(false)
      expect(u.valid_password?("I love to eat apples and bananas")).to eq(true)
      expect(u.valid_password?("I love to eat fried chicken")).to eq(false)
      expect(u.valid_password?("I love to eat apples and bananas ")).to eq(false)
      expect(u.valid_password?("I love to eat apples and bananas!")).to eq(false)
      expect(u.valid_password?("I love to eat apples and banana")).to eq(false)
      expect(GoSecure).to receive(:matches_password?).with("hashed?:#sha512?:#1d43864bef42802cf5c7919aabda3e57ac4ca9845b2591faa3a7ad445b6960597487703b3e7afb82948d874e3096b2476bcf48bbff32a4061f46cbbbeaecbcb3", pw)
      u.valid_password?("hippopotamus")
    end
    
    it "should validate an outdated password" do
      u = User.new
      u.settings = {}
      salt = Digest::MD5.hexdigest("pw" + Time.now.to_i.to_s)
      hash = Digest::SHA512.hexdigest(GoSecure.encryption_key + salt + "bacon")
      u.settings['password'] = {
        'hash_type' => 'sha512',
        'hashed_password' => hash,
        'salt' => salt
      }
      expect(GoSecure.outdated_password?(u.settings['password'])).to eq(true)
      expect(u.valid_password?('bracken')).to eq(false)
      expect(u.valid_password?('bacon')).to eq(true)
      expect(u.valid_password?(u.pre_hashed_password('bacon'))).to eq(true)
    end

    it "should validate a valet password" do
      u = User.new
      u.settings = {}
      salt = Digest::MD5.hexdigest("pw" + Time.now.to_i.to_s)
      hash = Digest::SHA512.hexdigest(GoSecure.encryption_key + salt + "bacon")
      u.settings['valet_password'] = {
        'hash_type' => 'sha512',
        'hashed_password' => hash,
        'salt' => salt
      }
      expect(GoSecure.outdated_password?(u.settings['valet_password'])).to eq(true)
      u.assert_valet_mode!
      expect(u.valid_password?('bracken')).to eq(false)
      expect(u.valid_password?('bacon')).to eq(true)
      expect(u.valid_password?(u.pre_hashed_password('bacon'))).to eq(true)
    end

    it "should validate a valet temp password" do
      u = User.new
      u.settings = {}
      salt = Digest::MD5.hexdigest("pw" + Time.now.to_i.to_s)
      hash = Digest::SHA512.hexdigest(GoSecure.encryption_key + salt + "bacon")
      u.settings['valet_password'] = {
        'hash_type' => 'sha512',
        'hashed_password' => hash,
        'salt' => salt
      }
      expect(GoSecure.outdated_password?(u.settings['valet_password'])).to eq(true)
      u.assert_valet_mode!
      expect(u.valid_password?('bracken')).to eq(false)
      expect(u.valid_password?("asdf?:##{GoSecure.sha512(hash, 'asdf')[0,30]}")).to eq(true)
      expect(u.valid_password?(u.valet_temp_password('whatever'))).to eq(true)
      expect(u.valid_password?(u.pre_hashed_password("asdf?:##{GoSecure.sha512(hash, 'asdf')[0,30]}"))).to eq(false)
    end

    it "should re-generate a non-pre-hashed password" do
      u = User.new
      u.settings = {}
      salt = Digest::MD5.hexdigest("pw" + Time.now.to_i.to_s)
      hash = Digest::SHA512.hexdigest(GoSecure.encryption_key + salt + "bacon")
      u.settings['password'] = GoSecure.generate_password('bacon')
      expect(u.settings['password']['pre_hash_algorithm']).to eq(nil)
      expect(u.valid_password?(u.pre_hashed_password('bacon'))).to eq(false)
      expect(u.valid_password?('bacon')).to eq(true)
      expect(u.settings['password']['pre_hash_algorithm']).to eq('sha512')
      expect(u.valid_password?(u.pre_hashed_password('bacon'))).to eq(true)
      expect(u.valid_password?('bacon')).to eq(true)
    end
    
    it "should re-generate an outdated password" do
      u = User.new
      u.settings = {}
      salt = Digest::MD5.hexdigest("pw" + (Time.now.to_i - 10).to_s)
      hash = Digest::SHA512.hexdigest(GoSecure.encryption_key + salt + "bacon")
      u.settings['password'] = {
        'hash_type' => 'sha512',
        'hashed_password' => hash,
        'salt' => salt
      }
      expect(GoSecure.outdated_password?(u.settings['password'])).to eq(true)
      expect(u.valid_password?('bacon')).to eq(true)
      expect(u.settings['password']['hash_type']).to eq('pbkdf2-sha256-2')
      expect(u.settings['password']['hashed_password']).not_to eq(hash)
      expect(u.settings['password']['salt']).not_to eq(salt)
    end
    
    it "should not re-generate an outdated password on a bad guess" do
      u = User.new
      u.settings = {}
      salt = Digest::MD5.hexdigest("pw" + Time.now.to_i.to_s)
      hash = Digest::SHA512.hexdigest(GoSecure.encryption_key + salt + "bacon")
      u.settings['password'] = {
        'hash_type' => 'sha512',
        'hashed_password' => hash,
        'salt' => salt
      }
      expect(GoSecure.outdated_password?(u.settings['password'])).to eq(true)
      expect(u.valid_password?('baconator')).to eq(false)
      expect(u.settings['password']['hash_type']).to eq('sha512')
      expect(u.settings['password']['hashed_password']).to eq(hash)
      expect(u.settings['password']['salt']).to eq(salt)
    end
  end

  describe "valet_mode?" do
    it "should return the correct value" do
      u = User.new
      expect(u.valet_mode?).to eq(false)
      u.assert_valet_mode!(true)
      expect(u.valet_mode?).to eq(true)
      u.assert_valet_mode!(false)
      expect(u.valet_mode?).to eq(false)
    end
  end

  describe "valet_allowed?" do
    it "should return the correct value" do
      u = User.new
      expect(u.valet_allowed?).to eq(false)
      u.settings = {}
      expect(u.valet_allowed?).to eq(false)
      u.settings['valet_password'] = {}
      expect(u.valet_allowed?).to eq(true)
      u.settings['valet_password_disabled'] = 5.seconds.ago.to_i
      expect(u.valet_allowed?).to eq(false)
      u.settings['valet_password_disabled'] = nil
      u.settings['valet_password_at'] = 10.minutes.ago.to_i
      expect(u.valet_allowed?).to eq(true)
      u.settings['valet_password_at'] = 30.hours.ago.to_i
      expect(u.valet_allowed?).to eq(false)
    end

    it "should allow valet with a used password if valet_prevent_disable is set" do
      u = User.new
      expect(u.valet_allowed?).to eq(false)
      u.settings = {}
      expect(u.valet_allowed?).to eq(false)
      u.settings['valet_password'] = {}
      expect(u.valet_allowed?).to eq(true)
      u.settings['valet_password_disabled'] = 5.seconds.ago.to_i
      expect(u.valet_allowed?).to eq(false)
      u.settings['valet_password_disabled'] = nil
      u.settings['valet_password_at'] = 10.minutes.ago.to_i
      expect(u.valet_allowed?).to eq(true)
      u.settings['valet_password_at'] = 30.hours.ago.to_i
      expect(u.valet_allowed?).to eq(false)
      u.settings['valet_prevent_disable'] = true
      expect(u.valet_allowed?).to eq(true)
    end
  end

  describe "set_valet_password" do
    it "should set to a non-blank password if none specified" do
      u = User.create
      expect(GoSecure).to receive(:nonce).with('valet_temporary_password').and_return("abcdefghijklmnop")
      u.set_valet_password(nil)
      u.assert_valet_mode!
      expect(u.valid_password?("abcdefghij")).to eq(true)
    end

    it "should clear if password set to false" do
      u = User.create
      expect(GoSecure).to receive(:nonce).with('valet_temporary_password').and_return("abcdefghijklmnop")
      u.set_valet_password(nil)
      u.assert_valet_mode!
      expect(u.valid_password?("abcdefghij")).to eq(true)
      expect(u.settings['valet_password']).to_not eq(nil)
      u.set_valet_password(false)
      expect(u.valid_password?("abcdefghij")).to eq(false)
      expect(u.settings['valet_password']).to eq(nil)
      u.set_valet_password("whatever you say")
      expect(u.valid_password?("whatever you say")).to eq(true)
      expect(u.settings['valet_password']).to_not eq(nil)
    end

    it "should notify when enabling valet login for the first time" do
      u = User.create
      expect(GoSecure).to receive(:nonce).with('valet_temporary_password').and_return("abcdefghijklmnop")
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_enabled, u.global_id)
      u.set_valet_password(nil)
    end

    it "should not notify when valet login already enabled" do
      u = User.create
      u.settings['valet_password'] = {}
      expect(GoSecure).to_not receive(:nonce)
      expect(UserMailer).to_not receive(:schedule_delivery).with(:valet_password_enabled, u.global_id)
      u.set_valet_password("baconator")
    end

    it "should not re-generate when setting to the same password" do
      u = User.create
      u.settings['valet_password'] = {}
      u.set_valet_password("baconator")
      hash = u.settings['valet_password']
      u.set_valet_password("baconator")
      expect(u.settings['valet_password']).to eq(hash)
    end

    it "should notify when valet login was disabled and password was already set" do
      u = User.create
      u.settings['valet_password'] = {}
      u.settings['valet_password_disabled'] = Time.now.to_i
      expect(GoSecure).to_not receive(:nonce)
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_enabled, u.global_id)
      u.set_valet_password("baconator")
    end

    it "should notify when valet login was about to be disabled and password was already set" do
      u = User.create
      u.settings['valet_password'] = {}
      u.settings['valet_password_at'] = Time.now.to_i
      expect(GoSecure).to_not receive(:nonce)
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_enabled, u.global_id)
      u.set_valet_password("baconator")
    end

    it "should clear any disablings" do
      u = User.create
      u.settings['valet_password_at'] = 'asdf'
      u.settings['valet_password_disabled'] = 'asdf'
      u.set_valet_password(false)
      expect(u.settings['valet_password_at']).to eq(nil)
      expect(u.settings['valet_password_disabled']).to eq(nil)
    end

    it "should NOT put the current request into valet mode" do
      # Configuring a valet password is not the same as authenticating AS the
      # valet. Asserting it here left the rest of the request believing the
      # caller was a valet, and every supervisor permission rule in User is
      # guarded by `&& !user.valet_mode?`.
      u = User.create
      expect(u.valet_mode?).to eq(false)
      u.set_valet_password("baconator")
      expect(u.valet_mode?).to eq(false)
      u.set_valet_password(nil)
      expect(u.valet_mode?).to eq(false)
    end

    it "should NOT re-generate the password on a blank re-save when one is already set" do
      # The client never echoes the valet secret back, so an ordinary profile
      # save (including the PUT /users/self the app issues on login) arrives with
      # valet_login=true and valet_password=null. Regenerating there silently
      # rotated the secret out from under anyone holding it.
      u = User.create
      u.set_valet_password("baconator")
      hash = u.settings['valet_password']
      expect(hash).to_not eq(nil)
      u.set_valet_password(nil)
      expect(u.settings['valet_password']).to eq(hash)
      u.set_valet_password('')
      expect(u.settings['valet_password']).to eq(hash)
      # still the working password, not a fresh random one
      u.assert_valet_mode!
      expect(u.valid_password?("baconator")).to eq(true)
    end

    it "should still generate a temporary password when enabling with none set" do
      u = User.create
      expect(u.settings['valet_password']).to eq(nil)
      expect(GoSecure).to receive(:nonce).with('valet_temporary_password').and_return("abcdefghijklmnop")
      u.set_valet_password(nil)
      u.assert_valet_mode!
      expect(u.valid_password?("abcdefghij")).to eq(true)
    end
  end

  describe "valet permission caching" do
    it "should not let a valet-mode computation poison the non-valet cache" do
      # Permissable keys its cache on user.cache_key (id + updated_at) + scopes,
      # and valet_mode? is a transient instance flag in neither. Without folding
      # it into the scopes, whichever ran first won the slot for 30 minutes —
      # denying a supervisor model/supervise over their own communicators, or (in
      # the inverse direction) handing a valet session a full permission set.
      com = User.create
      sup = User.create
      User.link_supervisor_to_user(sup, com, nil, true)
      com.reload; sup.reload

      expect(com.allows?(sup, 'model')).to eq(true)

      valet_sup = User.find_by_global_id(sup.global_id)
      valet_sup.assert_valet_mode!
      expect(com.allows?(valet_sup, 'model')).to eq(false)

      # the valet answer must not have overwritten the ordinary one
      fresh_sup = User.find_by_global_id(sup.global_id)
      expect(com.allows?(fresh_sup, 'model')).to eq(true)
    end
  end
  
  describe "valet_password_used!" do
    it "should have record usage" do
      u = User.create
      expect(u.settings['valet_password_at']).to eq(nil)
      u.valet_password_used!
      expect(u.settings['valet_password_at']).to be > Time.now.to_i - 5
    end
    
    it "should keep the oldest usage stamp" do
      u = User.create
      ts = 10.minutes.ago.to_i
      u.settings['valet_password_at'] = ts
      u.valet_password_used!
      expect(u.settings['valet_password_at']).to eq(ts)
    end

    it "should update the usage stamp after a long enough delay if prevent_disable set" do
      u = User.create
      u.settings['valet_password_at'] = 123
      u.settings['valet_prevent_disable'] = true
      u.valet_password_used!
      expect(u.settings['valet_password_at']).to be > 123
    end

    it "should notify user if not a repeat use" do
      u = User.create
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      u.valet_password_used!
    end

    it "should not notify the user if just notified" do
      u = User.create
      u.settings['valet_password_at'] = 5.minutes.ago.to_i
      expect(UserMailer).to_not receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      u.valet_password_used!
    end

    it "should notify if not notified for a while" do
      u = User.create
      u.settings['valet_password_at'] = 1.hour.ago.to_i
      expect(UserMailer).to receive(:schedule_delivery).with(:valet_password_used, u.global_id)
      u.valet_password_used!
    end
  end

  describe "password_used!" do
    it "should disable a used valet password" do
      u = User.create
      u.settings['valet_password_at'] = {}
      expect(u.settings['valet_password_at']).to eq({})
      expect(u.settings['valet_password_disabled']).to eq(nil)
      u.settings['valet_password'] = {}
      expect(u.settings['valet_password_at']).to eq({})
      expect(u.settings['valet_password_disabled']).to eq(nil)
      u.password_used!
      expect(u.settings['valet_password_at']).to eq(nil)
      expect(u.settings['valet_password_disabled']).to be > Time.now.to_i - 5
    end

    it "should not disable a used valet password if set not to" do
      u = User.create
      u.settings['valet_password_at'] = {}
      expect(u.settings['valet_password_at']).to eq({})
      expect(u.settings['valet_password_disabled']).to eq(nil)
      u.settings['valet_password'] = {}
      expect(u.settings['valet_password_at']).to eq({})
      expect(u.settings['valet_password_disabled']).to eq(nil)
      u.settings['valet_prevent_disable'] = true
      u.password_used!
      expect(u.settings['valet_password_at']).to eq({})
      expect(u.settings['valet_password_disabled']).to eq(nil)
    end
  end

  describe "assert_valet_mode!" do
    it "should set valet mode" do
      u = User.new
      expect(u.valet_mode?).to eq(false)
      u.assert_valet_mode!(true)
      expect(u.valet_mode?).to eq(true)
      u.assert_valet_mode!(false)
      expect(u.valet_mode?).to eq(false)
    end
  end

  describe "generate_valet_password" do
    it "should generate a password" do
      u = User.new
      u.generate_valet_password("hippo")
      expect(u.settings['valet_password']['hash_type']).to eq('pbkdf2-sha256-2')
      expect(u.settings['valet_password']['hashed_password']).not_to eq(nil)
      expect(u.settings['valet_password']['salt']).not_to eq(nil)
      
      expect(GoSecure).to receive(:generate_password).with("hashed?:#sha512?:#628e5bdc3a64db65f14447a68796223925dcd0465c26cb3f86e16776552e0959ecd9a1a9140980593392e969e0027d49300bd64bbf9e28de351228e8ef047b93").and_return({})
      User.new.generate_valet_password("bacon")
    end
  end

  describe "password_meets_minimum?" do
    it "should reject plaintext shorter than NIST 8" do
      u = User.new
      expect(u.password_meets_minimum?("a")).to eq(false)
      expect(u.password_meets_minimum?("1234567")).to eq(false)
      expect(u.password_meets_minimum?("12345678")).to eq(true)
    end

    it "should accept already-hashed values so login rehash is not blocked" do
      u = User.new
      expect(u.password_meets_minimum?("hashed?:#sha512?:#abc")).to eq(true)
    end
  end

  describe "process_params password length" do
    it "should reject a short password on write" do
      u = User.create
      expect(u.process_params({'password' => '1234567'}, {})).to eq(false)
      expect(u.processing_errors).to include("password too short")
    end

    it "should accept an 8-character password" do
      u = User.create
      expect(u.process_params({'password' => '12345678'}, {:allow_password_change => true})).to eq(true)
      expect(u.valid_password?('12345678')).to eq(true)
    end

    it "should still authenticate an existing short password (login rehash)" do
      u = User.create
      u.generate_password("bacon")
      u.save
      expect(u.reload.valid_password?("bacon")).to eq(true)
    end
  end

end
