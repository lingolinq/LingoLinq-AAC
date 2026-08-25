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
      expect(m.subject).to eq("LingoLinq - Welcome!")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/Welcome to LingoLinq!/)
      expect(html).to match("The Lingolinq Team")
      expect(html).to match(/<b>#{u.user_name}<\/b>/)
      text = message_body(m, :text)
      expect(text).to match(/Welcome to LingoLinq!/)
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
      expect(html).to match("The Cheddarific Team")
    end
  end

  describe "schedule_parent_consent_delivery" do
    it "delivers inline in development when INLINE_PARENTAL_CONSENT_EMAIL is set" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('development'))
      allow(UserMailer).to receive(:inline_parental_consent_email?).and_return(true)
      expect(UserMailer).to receive(:deliver_message).with(:parental_consent_request, '1_1')
      expect(UserMailer).not_to receive(:schedule_delivery)
      UserMailer.schedule_parent_consent_delivery(:parental_consent_request, '1_1')
    end

    it "queues when not in inline development mode" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('test'))
      expect(UserMailer).to receive(:schedule_delivery).with(:parental_consent_confirmation, '1_1')
      expect(UserMailer).not_to receive(:deliver_message)
      UserMailer.schedule_parent_consent_delivery(:parental_consent_confirmation, '1_1')
    end
  end

  describe "parental_consent_request" do
    after do
      Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
      RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
    end

    it "sends to the parent email with a consent URL" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'name' => 'mail_kid',
        'email' => 'kid_m@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_m@example.com'
      }, {:pending => true})
      expect(u).to be_persisted
      m = UserMailer.parental_consent_request(u.global_id)
      expect(m.to).to eq(['parent_m@example.com'])
      expect(m.subject).to eq(I18n.t('parental_consent_mailer.subject', app_name: 'LingoLinq'))
      html = message_body(m, :html)
      expect(html).to match(/parental_consent\/complete/)
      expect(html).to include(I18n.t('parental_consent_mailer.decline_prompt'))
      expect(html).not_to include('prepare an export')
    end

    # The reason JsonApi::Json.absolute_host exists. Mail is delivered from a
    # Resque worker, which has no request, so current_host falls back to
    # ENV['DEFAULT_HOST'] -- a BARE host by design (.env.example documents it as
    # "www.lingolinq.com"). Built as "#{current_host}/path" that reaches the
    # parent as href="www.lingolinq.com/parental_consent/complete?...", which a
    # mail client resolves against its own base and cannot follow -- breaking the
    # only route to activating a child's account.
    #
    # Asserted on the RENDERED href rather than on the helper, so this fails if
    # any of the three links regresses to current_host, independently of the
    # unit coverage in spec/lib/json_api/absolute_host_spec.rb. The `not_to
    # match` guards are the load-bearing half: a substring check for
    # "parental_consent/complete" passes just as happily on a relative URL.
    it "builds parent-facing links as ABSOLUTE urls when there is no request host" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      expect(JsonApi::Json).to receive(:current_host).at_least(:once).and_return('www.lingolinq.com')
      u = User.process_new({
        'name' => 'mail_abs_kid',
        'email' => 'kid_abs@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_abs@example.com'
      }, {:pending => true})
      m = UserMailer.parental_consent_request(u.global_id)
      [message_body(m, :html), message_body(m, :text)].each do |body|
        expect(body).to match(%r{https://www\.lingolinq\.com/parental_consent/complete})
        expect(body).to match(%r{https://www\.lingolinq\.com/parental_consent/decline})
        expect(body).to match(%r{https://www\.lingolinq\.com/privacy})
        # No bare-host occurrence anywhere: that is what a reverted call site
        # would produce, and it is invisible to a plain substring assertion.
        expect(body).to_not match(%r{(?<!//)www\.lingolinq\.com})
      end
    end

    it "uses offboarding decline copy that mentions export when coppa.offboarding is set" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'name' => 'mail_off_kid',
        'email' => 'kid_off_m@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_off_m@example.com'
      }, {:pending => true})
      c = u.settings['coppa']
      c['offboarding'] = true
      u.settings['coppa'] = c
      u.save!
      m = UserMailer.parental_consent_request(u.global_id)
      html = message_body(m, :html)
      text = message_body(m, :text)
      expect(html).to include(I18n.t('parental_consent_mailer.offboarding_decline_prompt'))
      expect(text).to include(I18n.t('parental_consent_mailer.offboarding_decline_prompt'))
      expect(html).not_to include(I18n.t('parental_consent_mailer.decline_prompt'))
    end

    it "uses admin-edited i18n overrides in the email body" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        i18n_overrides: {
          'parental_consent_mailer.greeting' => 'Custom greeting,'
        }
      })
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'name' => 'mail_kid2',
        'email' => 'kid_m2@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_m2@example.com'
      }, {:pending => true})
      m = UserMailer.parental_consent_request(u.global_id)
      html = message_body(m, :html)
      expect(html).to include('Custom greeting,')
    end

    it 'applies the email layout when an html_body override is stored' do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        html_body: '<p>Custom layout test body</p>'
      })
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'name' => 'mail_kid3',
        'email' => 'kid_m3@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_m3@example.com'
      }, {:pending => true})
      m = UserMailer.parental_consent_request(u.global_id)
      html = message_body(m, :html)
      expect(html).to include('Custom layout test body')
      expect(html).to include('background-color: #eee')
    end
  end

  describe "parental_consent_confirmation" do
    after do
      Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
      RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
    end

    it "sends to the parent email with a revoke URL after consent is granted" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'name' => 'mail_kid_confirm',
        'email' => 'kid_confirm@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_confirm@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(tok)).to eq(true)
      m = UserMailer.parental_consent_confirmation(u.global_id)
      expect(m.to).to eq(['parent_confirm@example.com'])
      expect(m.subject).to eq(I18n.t('parental_consent_confirmation_mailer.subject', app_name: 'LingoLinq'))
      html = message_body(m, :html)
      expect(html).to match(/parental_consent\/revoke/)
    end
  end

  describe "parental_consent_revoked" do
    it "sends to the parent email after consent is withdrawn" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({
        'name' => 'mail_kid_revoked',
        'email' => 'kid_revoked@example.com',
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'parent_revoked@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(tok)).to eq(true)
      revoke_tok = u.settings['coppa']['parent_consent_revoke_token']
      expect(u.revoke_parental_consent!(revoke_tok)).to eq(true)
      m = UserMailer.parental_consent_revoked(u.global_id)
      expect(m.to).to eq(['parent_revoked@example.com'])
      expect(m.subject).to eq(I18n.t('parental_consent_revoked_mailer.subject', app_name: 'LingoLinq'))
      html = message_body(m, :html)
      expect(html).to match(/withdrawn/i)
    end
  end
  
  describe "forgot_password" do
    it "should find the correct user" do
      u = User.create(settings: {email: 'test@example.com'})
      expect_any_instance_of(User).to receive(:named_email).and_return("bob@example.com")
      m = UserMailer.forgot_password([u.global_id])
      expect(m.subject).to eq("LingoLinq - Forgot Password Confirmation")
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
      expect(m.subject).to eq("LingoLinq - Login Help")
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
      expect(m.subject).to eq("LingoLinq - Password Changed")
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
      expect(m.subject).to eq("LingoLinq - Email Changed")
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
      expect(m.subject).to eq("LingoLinq - New Message")
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
      expect(m.subject).to eq("LingoLinq - New Message")
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
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).and_raise("no worky")
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('LingoLinq - New Communicator Registration')
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
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).and_raise("no worky")
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('LingoLinq - New Supervisor Registration')
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
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).with("https://iplocate.io/api/lookup/1.2.3.4?apikey=testkey", {timeout: 5}).and_return(OpenStruct.new(body: {city: 'Paris', subdivision: 'Texas', country_code: 'US'}.to_json))
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('LingoLinq - New Communicator Registration')
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
      ENV['IPLOCATE_API_KEY'] = 'testkey'
      expect(Typhoeus).to receive(:get).with("https://iplocate.io/api/lookup/1.2.3.4?apikey=testkey", {timeout: 5}).and_return(OpenStruct.new(body: {city: 'Paris', subdivision: 'Texas', country_code: 'US'}.to_json))
      m = UserMailer.new_user_registration(u.global_id)
      expect(m.subject).to eq('LingoLinq - New Communicator Registration')
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
      expect(m.subject).to eq("LingoLinq - Organization Sponsorship Added")
      
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
      expect(m.subject).to eq("LingoLinq - Organization Sponsorship Removed")
      
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
      expect(m.subject).to eq("LingoLinq - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
    end
    
    it "should include logging notes only if logging is disabled" do
      u = User.create(:settings => {'name' => 'stacy', 'email' => 'stacy@example.com'})
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("LingoLinq - Checking In")

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
      expect(m.subject).to eq("LingoLinq - Checking In")

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
      expect(m.subject).to eq("LingoLinq - Checking In")

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
      expect(m.subject).to eq("LingoLinq - Checking In")

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
      expect(m.subject).to eq("LingoLinq - Checking In")

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
      expect(m.subject).to eq("LingoLinq - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).to match(/keep using all of LingoLinq/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).to match(/keep using all the features of LingoLinq/)
      
      u.expires_at = nil
      u.save
      m = UserMailer.usage_reminder(u.global_id)
      expect(m.to).to eq(['stacy@example.com'])
      expect(m.subject).to eq("LingoLinq - Checking In")

      html = message_body(m, :html)
      expect(html).to match(/Hello again/)
      expect(html).not_to match(/keep using all of LingoLinq/)
      
      text = message_body(m, :text)
      expect(text).to match(/Hello again/)
      expect(text).not_to match(/keep using all the features of LingoLinq/)      
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
      expect(m.subject).to eq("LingoLinq - Badge Awarded")
      
      html = message_body(m, :html)
      expect(html).to match(/Level 1/)
      expect(html).to match(/Awesome Badge/)
      expect(html).to match(/You have earned a LingoLinq badge!/)
      expect(html).to match(/part of a set, so keep at it/)

      text = message_body(m, :text)
      expect(text).to match(/Level 1/)
      expect(text).to match(/You have earned a LingoLinq badge!/)
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
      expect(m.subject).to eq("LingoLinq - Badge Awarded")
      
      html = message_body(m, :html)
      expect(html).to match(/Level 1/)
      expect(html).to match(/Awesome Badge/)
      expect(html).to match(/part of the goal,/)
      expect(html).to match(/best goal ever/)
      expect(html).to_not match(/part of a set, so keep at it/)
      expect(html).to match(/#{u.user_name} has earned a LingoLinq badge!/)

      text = message_body(m, :text)
      expect(text).to match(/Level 1/)
      expect(text).to match(/Awesome Badge/)
      expect(text).to match(/part of the goal,/)
      expect(text).to match(/best goal ever/)
      expect(text).to_not match(/part of a set, so keep at it/)
      expect(text).to match(/#{u.user_name} has earned a LingoLinq badge!/)
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
      expect(m.subject).to eq("LingoLinq - Communication Report")

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
      expect(m.subject).to eq("LingoLinq - Communication Report")

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
      expect(m.subject).to eq("LingoLinq - Valet Login Enabled")
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
      expect(m.subject).to eq("LingoLinq - Valet Login Used")
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
      expect(m.subject).to eq("LingoLinq - New Lesson Assigned")
      expect(m.to).to eq(["bob@example.com"])
      html = message_body(m, :html)
      expect(html).to match(/Super Lesson/)
      expect(html).to match(/This is a great lesson/)
      expect(html).to match(/14 minutes/)
      # The lesson link now carries an expiring lesson_share_token, not the permanent user_token
      # (LL-90045bb29c option (b)); assert the path shape and that the embedded token resolves to u.
      lesson_link = /#{JsonApi::Json.current_host}\/lessons\/#{l.global_id}\/#{l.nonce}\/([\w-]+)/
      expect(html).to match(lesson_link)
      expect(User.find_by_lesson_share_token(html.match(lesson_link)[1])).to eq(u)

      text = message_body(m, :text)
      expect(text).to match(/Super Lesson/)
      expect(text).to match(/This is a great lesson/)
      expect(text).to match(/14 minutes/)
      expect(text).to match(lesson_link)
      expect(User.find_by_lesson_share_token(text.match(lesson_link)[1])).to eq(u)
    end
  end
  
  it "should have a default reply-to of noreply@mylingolinq.com"
  it "should have specs for the mailer erb templates"
end
