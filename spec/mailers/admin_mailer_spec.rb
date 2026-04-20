require "spec_helper"

describe AdminMailer, :type => :mailer do
  after(:each) do
    JsonApi::Json.load_domain("default")
  end
  describe "message_sent" do
    it "should use the ENV recipient address" do
      m = ContactMessage.process_new({
        'email' => 'maisy@example.com',
        'subject' => 'asdf'
      })
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      m = AdminMailer.message_sent(m.global_id)
      expect(m.subject).to eq('LingoLinq - "Contact Us" Message Received')
      expect(m.to).to eq(['asdf@example.com'])
    end

    it "should use the domain override if set" do
      m = ContactMessage.process_new({
        'email' => 'maisy@example.com',
        'subject' => 'asdf'
      })
      o = Organization.create(custom_domain: true)
      o.settings['hosts'] = ['cheddar.org']
      o.settings['host_settings'] = {}
      o.settings['host_settings']['admin_email'] = "Admin <admin@example.com>"
      o.settings['host_settings']['app_name'] = "Cheddar"
      o.save
      Worker.process_queues
      JsonApi::Json.load_domain('cheddar.org')
      expect(JsonApi::Json.current_domain['settings']['admin_email']).to eq("Admin <admin@example.com>")
      m = AdminMailer.message_sent(m.global_id)
      expect(m.subject).to eq('Cheddar - "Contact Us" Message Received')
      expect(m.to).to eq(['admin@example.com'])
    end
    
    it "should generate a message" do
      m = ContactMessage.process_new({
        'email' => 'maisy@example.com',
        'subject' => 'asdf'
      })
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      m = AdminMailer.message_sent(m.global_id)
      expect(m.subject).to eq('LingoLinq - "Contact Us" Message Received')
      expect(m.to).to eq(['asdf@example.com'])
      html = message_body(m, :html)
      expect(html).to match(/Subject: asdf/)

      text = message_body(m, :text)
      expect(text).to match(/Subject: asdf/)
    end
  end

  describe "beta_feedback_sent" do
    after(:each) do
      ENV.delete('BETA_FEEDBACK_EMAIL')
    end

    it "should mail support@lingolinq.com by default" do
      allow(AdminMailer).to receive(:schedule_delivery)
      m = ContactMessage.process_new({
        'email' => 'betatester@example.com',
        'subject' => 'Bug summary',
        'recipient' => 'beta_feedback',
        'general_feedback' => 'Enough detail for the message body.',
        'feedback_type' => 'crash',
        'severity' => 'major'
      })
      ENV.delete('BETA_FEEDBACK_EMAIL')
      mail = AdminMailer.beta_feedback_sent(m.global_id)
      expect(mail.to).to eq(['support@lingolinq.com'])
      expect(mail.subject).to match(/Beta Feedback/)
    end

    it "should honor BETA_FEEDBACK_EMAIL" do
      allow(AdminMailer).to receive(:schedule_delivery)
      m = ContactMessage.process_new({
        'email' => 'betatester@example.com',
        'subject' => 'Bug summary',
        'recipient' => 'beta_feedback',
        'general_feedback' => 'Enough detail for the message body.',
        'feedback_type' => 'crash',
        'severity' => 'major'
      })
      ENV['BETA_FEEDBACK_EMAIL'] = 'custom@example.com'
      mail = AdminMailer.beta_feedback_sent(m.global_id)
      expect(mail.to).to eq(['custom@example.com'])
    end
  end

  describe "opt_out" do
    it "should use the ENV recipient address" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      m = AdminMailer.opt_out(u.global_id, nil)
      expect(m.subject).to eq('LingoLinq - "Opt-Out" Requested')
      expect(m.to).to eq(['asdf@example.com'])
    end
    
    it "should generate a message" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      ENV['NEW_REGISTRATION_EMAIL'] = 'asdf@example.com'
      m = AdminMailer.opt_out(u.global_id, 'bacon')
      expect(m.subject).to eq('LingoLinq - "Opt-Out" Requested')
      expect(m.to).to eq(['asdf@example.com'])

      html = m.body
      expect(html).to match(/User Name: #{u.user_name}/)
      expect(html).to match(/Email: #{u.settings['email']}/)
    end
    
    it "should be triggered by a user preference changing" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      expect(u.settings['preferences']['cookies']).to eq(true)
      expect(AdminMailer).to receive(:schedule_delivery).with(:opt_out, u.global_id, 'disabled')
      u.process({'preferences' => {'cookies' => false}})
      Worker.process_queues
    end

    it "should be triggered when cookies is sent as string false" do
      u = User.create(:settings => {'email' => 'bob@example.com'})
      expect(u.settings['preferences']['cookies']).to eq(true)
      expect(AdminMailer).to receive(:schedule_delivery).with(:opt_out, u.global_id, 'disabled')
      u.process({'preferences' => {'cookies' => 'false'}})
      Worker.process_queues
    end
  end
  
end
