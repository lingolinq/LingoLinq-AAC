require "spec_helper"

describe UserMailer, :type => :mailer do
  after(:each) do
    JsonApi::Json.load_domain("default")
  end

  describe "schedule_delivery" do
    it "should schedule deliveries" do
      UserMailer.schedule_delivery('confirm_registration', 4)
      expect(Worker.scheduled_for?('priority', UserMailer, :deliver_message, 'confirm_registration', 4)).to eq(true)
    end
  end
  
  describe "bounce_email" do
    it "should not error on no results" do
      expect { UserMailer.bounce_email(nil) }.not_to raise_error
      expect { UserMailer.bounce_email("bob.miller@example.com") }.not_to raise_error
    end
    it "should set email as disabled for any matching emails" do
      u = User.create(:settings => {'email' => 'bob.miller@example.com'})
      UserMailer.bounce_email("bob.miller@example.com")
      expect(u.reload.settings['email_disabled']).to eq(true)

      u2 = User.create(:settings => {'email' => 'bob.miller@example.com'})
      u3 = User.create(:settings => {'email' => 'bob.miller@example.com'})
      UserMailer.bounce_email("bob.miller@example.com")
      expect(u2.reload.settings['email_disabled']).to eq(true)
      expect(u3.reload.settings['email_disabled']).to eq(true)
    end
  end

  describe "deliver_message" do
    it "should deliver the correct message" do
      obj = Object.new
      expect(obj).to receive(:deliver)
      expect(UserMailer).to receive(:confirm_registration).with(5).and_return(obj)
      UserMailer.deliver_message('confirm_registration', 5)

      obj = Object.new
      expect(obj).to receive(:deliver)
      expect(UserMailer).to receive(:forgot_password).with([5, 6]).and_return(obj)
      UserMailer.deliver_message('forgot_password', [5, 6])
    end
  end
  
  describe "confirm_registration" do
    it "should find the correct user" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.confirm_registration(u.global_id)
      expect(m.subject).to eq("MyCoolApp - Welcome!")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/Welcome to MyCoolApp!/)
      expect(html).to match("-The Someone Team")
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      text = message_body(m, :text)
      expect(text).to match(/Welcome to MyCoolApp!/)
      expect(text).to match(/\"#{u.user_name}\"/)
    end

    it "should use the domain-overridden app name if set" do
      o = Organization.create(custom_domain: true)
      o.settings['hosts'] = ['cheddar.org']
      o.settings['host_settings'] = {}
      o.settings['host_settings']['app_name'] = "Cheddar"
      o.settings['host_settings']['company_name'] = "Cheddarific"
      o.save
      Worker.process_queues
      JsonApi::Json.load_domain('cheddar.org')
      expect(JsonApi::Json.current_domain['settings']['app_name']).to eq("Cheddar")
      expect(JsonApi::Json.current_domain['settings']['company_name']).to eq("Cheddarific")

      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.confirm_registration(u.global_id)
      expect(m.subject).to eq("Cheddar - Welcome!")
      html = message_body(m, :html)
      expect(html).to match("-The Cheddarific Team")
    end
  end
  
  describe "forgot_password" do
    it "should find the correct user" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.forgot_password([u.global_id])
      expect(m.subject).to eq("MyCoolApp - Forgot Password Confirmation")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/password reset/)
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      text = message_body(m, :text)
      expect(text).to match(/password reset/)
      expect(text).to match(/\"#{u.user_name}\"/)
    end
    
    it "should send to email with multiple users, each with their own reset link" do
      u1 = User.create
      u1.settings['email'] = 'bob@example.com'
      u1.save!
      u2 = User.create
      u2.settings['email'] = 'bob@example.com'
      u2.save!
      u1.generate_password_reset
      u1.save
      u2.generate_password_reset
      u2.save
      m = UserMailer.forgot_password([u1.global_id, u2.global_id])
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/password reset/)
      expect(html).to match(/<b>#{u1.user_name}<\/b>/)
      expect(html).to match(/<b>#{u2.user_name}<\/b>/)
      expect(html).to match(/#{u1.password_reset_code}/)
      expect(html).to match(/#{u2.password_reset_code}/)
      text = message_body(m, :text)
      expect(text).to match(/password reset/)
      expect(text).to match(/\"#{u1.user_name}\"/)
      expect(text).to match(/\"#{u2.user_name}\"/)
      expect(text).to match(/#{u1.password_reset_code}/)
      expect(text).to match(/#{u2.password_reset_code}/)
    end

    it "should use the domain-overridden forgot password domain if set" do
      o = Organization.create(custom_domain: true)
      o.settings['hosts'] = ['cheddar.org']
      o.settings['host_settings'] = {}
      o.settings['host_settings']['app_name'] = "Cheddar"
      o.save
      Worker.process_queues
      Worker.set_domain_id('https://cheddar.org')
      expect(JsonApi::Json.current_domain['settings']['app_name']).to eq("Cheddar")

      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.forgot_password([u.global_id])
      expect(m.subject).to eq("Cheddar - Forgot Password Confirmation")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/password reset/)
      expect(html).to match("https://cheddar.org/#{u.user_name}/password_reset")
    end
  end
  
  describe "login_no_user" do
    it "should send a message" do
      m = UserMailer.login_no_user('bacon@example.com')
      expect(m.subject).to eq("MyCoolApp - Login Help")
      expect(m.to).to eq(["bacon@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/sign up for a free trial/)
      expect(html).to match(/<b>bacon@example.com<\/b>/)
      text = message_body(m, :text)
      expect(text).to match(/sign up for a free trial/)
      expect(text).to match(/\"bacon@example.com\"/)
    end
  end
  
  describe "password_changed" do
    it "should find the correct user" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.password_changed(u.global_id)
      expect(m.subject).to eq("MyCoolApp - Password Changed")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/password change/)
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/password change/)
      expect(text).to match(/\"#{u.user_name}\"/)
    end
  end
  
  describe "email_changed" do
    it "should email both addresses" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      expect_any_instance_of(User).to receive(:prior_named_email).and_return("fred@example.com")
      m = UserMailer.email_changed(u.global_id)
      expect(m.subject).to eq("MyCoolApp - Email Changed")
      expect(m.to).to eq(["fred@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/email address change/)
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/email address change/)
      expect(text).to match(/"#{u.user_name}"/)
    end
  end
  
  describe "log_message" do
    it "should email the right address" do
      u = User.create(settings: {email: 'test@example.com'})
      d = Device.create(:user => u)
      l = LogSession.create(:user => u, :author => u, :device => d)
      l.data['note'] = {'text' => "you are my friend"}
      l.save
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.log_message(u.global_id, l.global_id)
      expect(m.subject).to eq("MyCoolApp - New Message")
      expect(m.to).to eq(["bob@example.com"])
      
      html = message_body(m, :html)
      expect(html).to match(/just posted a message/)
      expect(html).to match(/you are my friend/)
      expect(html).to_not match(/No Complaints/)
      
      text = message_body(m, :text)
      expect(text).to match(/just posted a message/)
      expect(text).to match(/you are my friend/)
      expect(text).to_not match(/No Complaints/)
    end
    
    it "should not email anyone if the email is disabled" do
      u = User.create
      d = Device.create(:user => u)
      l = LogSession.create(:user => u, :author => u, :device => d)
      u.settings['email_disabled'] = true
      u.save
      m = UserMailer.log_message(u.global_id, l.global_id)
      expect(m.subject).to eq(nil)
    end

    it "should include a status-check footer if specified" do
      u = User.create(settings: {email: 'test@example.com'})
      d = Device.create(:user => u)
      l = LogSession.create(:user => u, :author => u, :device => d)
      l.data['note'] = {'text' => "you are my friend"}
      l.data['include_status_footer'] = true
      l.save
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.log_message(u.global_id, l.global_id)
      expect(m.subject).to eq("MyCoolApp - New Message")
      expect(m.to).to eq(["bob@example.com"])
      
      html = message_body(m, :html)
      expect(html).to match(/just posted a message/)
      expect(html).to match(/you are my friend/)
      expect(html).to match(/No Complaints/)
      
      text = message_body(m, :text)
      expect(text).to match(/just posted a message/)
      expect(text).to match(/you are my friend/)
      expect(text).to match(/No Complaints/)
    end
  end
  
  describe "new_user_registration" do
    it "should use the ENV recipient address" do
      u = User.create
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.to).to eq(['asdf@example.com'])
    end
    
    it "should generate a message" do
      u = User.create
      d = Device.create(:user => u, :settings => {'ip_address' => '1.2.3.4'})
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      ENV['IPSTACK_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).and_raise("no worky")
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('MyCoolApp - New Communicator Registration')
      html = message_body(m, :html)
      expect(html).to match(/just signed up/)
      expect(html).to match(/#{u.user_name}/)
      expect(html).to_not match(/Location:/)
      expect(html).to_not match(/Start Code:/)
      
      text = message_body(m, :text)
      expect(text).to match(/just signed up/)
      expect(text).to match(/#{u.user_name}/)
      expect(text).to_not match(/Location:/)
    end

    it "should generate a supervisor registration message" do
      u = User.create(:settings => {'preferences' => {'registration_type' => 'therapist'}})
      d = Device.create(:user => u, :settings => {'ip_address' => '1.2.3.4'})
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      ENV['IPSTACK_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).and_raise("no worky")
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('MyCoolApp - New Supervisor Registration')
      html = message_body(m, :html)
      expect(html).to match(/just signed up/)
      expect(html).to match(/#{u.user_name}/)
      expect(html).to_not match(/Location:/)
      expect(html).to_not match(/Start Code:/)
      
      text = message_body(m, :text)
      expect(text).to match(/just signed up/)
      expect(text).to match(/#{u.user_name}/)
      expect(text).to_not match(/Location:/)
    end
    
    it "should include location data if available" do
      u = User.create
      d = Device.create(:user => u, :settings => {'ip_address' => '1.2.3.4'})
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      ENV['IPSTACK_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).with("http://api.ipstack.com/1.2.3.4?access_key=testkey", {timeout: 5}).and_return(OpenStruct.new(body: {city: 'Paris', region_name: 'Texas', country_code: 'US'}.to_json))
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('MyCoolApp - New Communicator Registration')
      html = message_body(m, :html)
      expect(html).to match(/just signed up/)
      expect(html).to match(/#{u.user_name}/)
      expect(html).to match(/Location: Paris, Texas, US/)
      expect(html).to_not match(/Start Code:/)
      
      text = message_body(m, :text)
      expect(text).to match(/just signed up/)
      expect(text).to match(/#{u.user_name}/)
      expect(text).to match(/Location: Paris, Texas, US/)
    end

    it "should include activation code if set" do
      u = User.create
      u.settings['activations'] = [{'code' => 'asdf'}, {'code' => 'qqqq'}]
      u.save
      d = Device.create(:user => u, :settings => {'ip_address' => '1.2.3.4'})
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      ENV['IPSTACK_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).with("http://api.ipstack.com/1.2.3.4?access_key=testkey", {timeout: 5}).and_return(OpenStruct.new(body: {city: 'Paris', region_name: 'Texas', country_code: 'US'}.to_json))
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('MyCoolApp - New Communicator Registration')
      html = message_body(m, :html)
      expect(html).to match(/just signed up/)
      expect(html).to match(/#{u.user_name}/)
      expect(html).to match(/Location: Paris, Texas, US/)
      expect(html).to match(/Start Code:/)
      expect(html).to match(/asdf, qqqq/)
      
      text = message_body(m, :text)
      expect(text).to match(/just signed up/)
      expect(text).to match(/#{u.user_name}/)
      expect(text).to match(/Location: Paris, Texas, US/)
    end
  end
  
  describe "organization_assigned" do
    it "generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      o = Organization.create
      m = UserMailer.organization_assigned(u.global_id, o.global_id)
      expect(m.to).to eq(['fred@example.com'])
      expect(m.subject).to eq("MyCoolApp - Organization Sponsorship Added")
      
      html = message_body(m, :html)
      expect(html).to match(/added you to their list of supported users/)
      expect(html).to match(/<b>fred<\/b>/)
      expect(html).to match(/<b>#{o.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/added you to their list of supported users/)
      expect(text).to match(/"fred"/)
      expect(text).to match(/"#{o.settings['name']}"/)
    end
  end
  
  describe "organization_unassigned" do
    it "should generate the correct message" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      o = Organization.create
      m = UserMailer.organization_unassigned(u.global_id, o.global_id)
      expect(m.to).to eq(['fred@example.com'])
      expect(m.subject).to eq("MyCoolApp - Organization Sponsorship Removed")
      
      html = message_body(m, :html)
      expect(html).to match(/was just removed from the supported list by an organization/)
      expect(html).to match(/<b>fred<\/b>/)
      expect(html).to match(/<b>#{o.settings['name']}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/was just removed from the supported list by an organization/)
      expect(text).to match(/"fred"/)
      expect(text).to match(/"#{o.settings['name']}"/)
    end

    it "should not send the message if the user has been re-assigned to the org" do
      u = User.create(:settings => {'name' => 'fred', 'email' => 'fred@example.com'})
      o = Organization.create
      o.add_user(u.user_name, false, false)
      
      m = UserMailer.organization_unassigned(u.global_id, o.global_id)
      expect(m.to).to eq(nil)
    end
  end
  
  describe "usage_reminder" do
    it "should generate a message to the specified user" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
    end
    
    it "should include logging notes only if logging is disabled" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).to match(/reporting and logging built-in/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).to match(/reporting and logging built-in/)
      
      u.settings['preferences']['logging'] = true
      u.save
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).not_to match(/reporting and logging built-in/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).not_to match(/reporting and logging built-in/)
    end
    
    it "should include supervision notes only if appropriate" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).to match(/haven't had much chance/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).not_to match(/signed up as a supervisor/)
      expect(text).to match(/haven't had much chance/)
      
      u.settings['preferences']['role'] = 'supporter'
      u.save
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).to match(/signed up as a supervisor/)
      expect(html).not_to match(/haven't had much chance/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).to match(/signed up as a supervisor/)
      expect(text).not_to match(/haven't had much chance/)
      
      u2 = User.create
      User.link_supervisor_to_user(u, u2)
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).not_to match(/signed up as a supervisor/)
      expect(html).to match(/haven't had much chance/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).not_to match(/signed up as a supervisor/)
      expect(text).to match(/haven't had much chance/)
    end
    
    it "should include subscription notes only of not subscribed" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).to match(/keep using all of MyCoolApp/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).to match(/keep using all the features of MyCoolApp/)
      
      u.expires_at = nil
      u.save
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).not_to match(/keep using all of MyCoolApp/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).not_to match(/keep using all the features of MyCoolApp/)      
    end
  end
  
  describe "utterance_share" do
    it "should generate a message to the intended user" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.utterance_share({'sharer_id' => u.global_id, 'message' => 'bacon', 'to' => 'fred@example.com', 'subject' => 'something'})
      
      expect(m.to).to eq(['fred@example.com'])
      expect(m.subject).to eq("something")

      html = message_body(m, :html)
      expect(html).to match(/bacon/)
      
      text = message_body(m, :text)
      expect(text).to match(/bacon/)
    end

    it "should include reply link if defined" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.utterance_share({'sharer_id' => u.global_id, 'message' => 'bacon', 'to' => 'fred@example.com', 'subject' => 'something', 'reply_url' => 'http://www.example.com/reply'})
      
      expect(m.to).to eq(['fred@example.com'])
      expect(m.subject).to eq("something")

      html = message_body(m, :html)
      expect(html).to match(/example\.com\/reply/)
      
      text = message_body(m, :text)
      expect(text).to match(/example\.com\/reply/)
    end

    it "should include the previous message if defined" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      utterance = Utterance.create(user: u, data: {'sentence' => 'bygones are by guns'})
      m = UserMailer.utterance_share({'sharer_id' => u.global_id, 'message' => 'bacon', 'to' => 'fred@example.com', 'subject' => 'something', 'reply_url' => 'http://www.example.com/share', 'reply_id' => utterance.global_id})
      
      expect(m.to).to eq(['fred@example.com'])
      expect(m.subject).to eq("something")

      html = message_body(m, :html)
      expect(html).to match(/bygones/)
      
      text = message_body(m, :text)
      expect(text).to match(/bygones/)
    end
  end
  
  describe "badge_awarded" do
    it "should generate a message to the badge recipient" do
      u = User.create(:settings => {'email' => 'amanda@example.com'})
      b = UserBadge.create(:user => u)
      b.data['name'] = 'Awesome Badge'
      b.level = 1
      b.save
      m = UserMailer.badge_awarded(u.global_id, b.global_id)
      expect(m.to).to eq(['amanda@example.com'])
      expect(m.subject).to eq("MyCoolApp - Badge Awarded")
      
      html = message_body(m, :html)
      expect(html).to match(/Level 1/)
      expect(html).to match(/Awesome Badge/)
      expect(html).to match(/You have earned a MyCoolApp badge!/)
      expect(html).to match(/part of a set, so keep at it/)

      text = message_body(m, :text)
      expect(text).to match(/Level 1/)
      expect(text).to match(/You have earned a MyCoolApp badge!/)
      expect(text).to match(/part of a set, so keep at it/)
    end

    it "should generate a message to the badge recipient's supervisors" do
      u = User.create
      u2 = User.create(:settings => {'email' => 'betty@example.com'})
      User.link_supervisor_to_user(u2, u)
      g = UserGoal.create(:user => u, :settings => {'summary' => 'best goal ever'})
      
      b = UserBadge.create(:user => u)
      b.data['name'] = 'Awesome Badge'
      b.data['max_level'] = true
      b.user_goal = g
      b.level = 1
      b.save
      m = UserMailer.badge_awarded(u2.global_id, b.global_id)
      expect(m.to).to eq(['betty@example.com'])
      expect(m.subject).to eq("MyCoolApp - Badge Awarded")
      
      html = message_body(m, :html)
      expect(html).to match(/Level 1/)
      expect(html).to match(/Awesome Badge/)
      expect(html).to match(/part of the goal,/)
      expect(html).to match(/best goal ever/)
      expect(html).to_not match(/part of a set, so keep at it/)
      expect(html).to match(/#{u.user_name} has earned a MyCoolApp badge!/)

      text = message_body(m, :text)
      expect(text).to match(/Level 1/)
      expect(text).to match(/Awesome Badge/)
      expect(text).to match(/part of the goal,/)
      expect(text).to match(/best goal ever/)
      expect(text).to_not match(/part of a set, so keep at it/)
      expect(text).to match(/#{u.user_name} has earned a MyCoolApp badge!/)
    end
  end
  
  describe "log_summary" do
    it "should generate a message to the intended user" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      u.settings['preferences'] ||= {}
      u.settings['preferences']['role'] = 'communicator'
      u.expires_at = 2.weeks.from_now
      u.save!
      d = Device.create(:user => u)

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 1.day.ago.to_time.to_i - 2},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 1.day.ago.to_time.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1.day.ago.to_time.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'never ever ever ever again', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 8.days.ago.to_time.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 8.days.ago.to_time.to_i}
      ]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      ClusterLocation.all.each { |c| c.generate_stats(true) }
      WeeklyStatsSummary.update_for(s1.global_id)
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s3.global_id)
      
      m = UserMailer.log_summary(u.global_id)
      
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Communication Report")

      html = m.body.to_s
      expect(html).to_not match(/All Communicators/)
      expect(html).to match(/\+100\.0%/)
    end
    
    it "should include supervisees" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      u2 = User.create
      u2.settings['preferences'] ||= {}
      u2.settings['preferences']['role'] = 'communicator'
      u2.expires_at = 2.weeks.from_now
      u2.save!
      u3 = User.create
      d = Device.create(:user => u2)
      User.link_supervisor_to_user(u, u2)
      User.link_supervisor_to_user(u, u3)
      Worker.process_queues
      u3.expires_at = 2.weeks.ago
      u3.save

      s1 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 1},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i - 2},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => Time.now.to_i}
      ]}, {:user => u2, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s2 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 1.day.ago.to_time.to_i - 2},
        {'type' => 'button', 'button' => {'label' => 'ok go ok', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 1.day.ago.to_time.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'ok go ok', 'buttons' => []}, 'geo' => ['13', '12'], 'timestamp' => 1.day.ago.to_time.to_i}
      ]}, {:user => u2, :author => u, :device => d, :ip_address => '1.2.3.4'})
      s3 = LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'label' => 'never ever ever ever again', 'button_id' => 1, 'board' => {'id' => '1_1'}, 'spoken' => true}, 'geo' => ['13', '12'], 'timestamp' => 8.days.ago.to_time.to_i - 1},
        {'type' => 'utterance', 'utterance' => {'text' => 'never again', 'buttons' => []}, 'geo' => ['13.0001', '12.0001'], 'timestamp' => 8.days.ago.to_time.to_i}
      ]}, {:user => u2, :author => u, :device => d, :ip_address => '1.2.3.4'})
      
      ClusterLocation.clusterize_ips(u.global_id)
      ClusterLocation.clusterize_geos(u.global_id)
      ClusterLocation.all.each { |c| c.generate_stats(true) }
      WeeklyStatsSummary.update_for(s1.global_id)
      WeeklyStatsSummary.update_for(s2.global_id)
      WeeklyStatsSummary.update_for(s3.global_id)
      
      m = UserMailer.log_summary(u.global_id)
      
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("MyCoolApp - Communication Report")

      html = m.body.to_s
      expect(html).to match(/All Communicators/)
      expect(html).to match(/stacy/)
      expect(html).to match(/#{u2.user_name}/)
      expect(html).to match(/#{u3.user_name}/)
      expect(html).to match(/\+100\.0%/)
      expect(html).to match(/so no reports are generated/)
    end

    it "should include goal data"
  end

  describe "valet_password_enabled" do
    it "should have send message to user" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.valet_password_enabled(u.global_id)
      expect(m.subject).to eq("MyCoolApp - Valet Login Enabled")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/were recently enabled/)
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/were recently enabled/)
      expect(text).to match(/\"#{u.user_name}\"/)
    end
  end

  describe "valet_password_used" do
    it "should have send message to user" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.valet_password_used(u.global_id)
      expect(m.subject).to eq("MyCoolApp - Valet Login Used")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/were recently used to log in to your account/)
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      
      text = message_body(m, :text)
      expect(text).to match(/were recently used to log in to your account/)
      expect(text).to match(/\"#{u.user_name}\"/)
    end
  end

  describe "lesson_assigned" do
    it "should have send message to user" do
      u = User.create(settings: {email: 'test@example.com'})
      l = Lesson.create
      l.settings['title'] = "Super Lesson"
      l.settings['description'] = "This is a great lesson"
      l.settings['time_estimate'] = 14
      l.save
      l.nonce
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.lesson_assigned(l.global_id, [u.global_id])
      expect(m.subject).to eq("MyCoolApp - New Lesson Assigned")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/Super Lesson/)
      expect(html).to match(/This is a great lesson/)
      expect(html).to match(/14 minutes/)
      expect(html).to match(/#{JsonApi::Json.current_host}\/lessons\/#{l.global_id}\/#{l.nonce}\/#{u.user_token}/)
      
      text = message_body(m, :text)
      expect(text).to match(/Super Lesson/)
      expect(text).to match(/This is a great lesson/)
      expect(text).to match(/14 minutes/)
      expect(text).to match(/#{JsonApi::Json.current_host}\/lessons\/#{l.global_id}\/#{l.nonce}\/#{u.user_token}/)
    end
  end
  
  it "should have a default reply-to of noreply@mylingolinq.com"
  it "should have specs for the mailer erb templates"
end
