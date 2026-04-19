require 'spec_helper'

describe ContactMessage, :type => :model do
  it "should process parameters" do
    m = ContactMessage.process_new({
      'name' => 'Bob Jones',
      'email' => 'bob@example.com',
      'subject' => 'ok',
      'recipient' => 'nobody',
      'message' => 'asdf',
      'hat' => 'asdf'
    })
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq('bob@example.com')
    expect(m.settings['name']).to eq('Bob Jones')
    expect(m.settings['subject']).to eq('ok')
    expect(m.settings['recipient']).to eq('nobody')
    expect(m.settings['message']).to eq('asdf')
    expect(m.settings['hat']).to eq(nil)
    
    m = ContactMessage.process_new({})
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq(nil)
  end

  it "should set email to supervisor's email if specified" do
    u1 = User.create(settings: {'name' => 'Bob Jones', 'email' => 'bob@example.com'})
    u2 = User.create(settings: {'name' => 'Alice Rider', 'email' => 'alice@example.com'})
    User.link_supervisor_to_user(u2, u1)
    m = ContactMessage.process_new({
      'name' => 'Fred Jones',
      'email' => 'fred@example.com',
      'subject' => 'ok',
      'recipient' => 'nobody',
      'message' => 'asdf',
      'hat' => 'asdf'
    }, {'api_user' => u1})
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq('bob@example.com')
    expect(m.settings['name']).to eq('Bob Jones')
    expect(m.settings['user_id']).to eq(u1.global_id)
    expect(m.settings['subject']).to eq('ok')
    expect(m.settings['recipient']).to eq('nobody')
    expect(m.settings['message']).to eq('asdf')
    expect(m.settings['hat']).to eq(nil)
    
    m = ContactMessage.process_new({
      'name' => 'Fred Jones',
      'email' => 'fred@example.com',
      'subject' => 'ok',
      'recipient' => 'nobody',
      'message' => 'asdf',
      'hat' => 'asdf',
      'author_id' => u2.global_id
    }, {'api_user' => u1})
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq('alice@example.com')
    expect(m.settings['name']).to eq('Alice Rider')
    expect(m.settings['subject']).to eq('ok')
    expect(m.settings['user_id']).to eq(u1.global_id)
    expect(m.settings['supervisor_id']).to eq(u2.global_id)
    expect(m.settings['recipient']).to eq('nobody')
    expect(m.settings['message']).to eq('asdf')
    expect(m.settings['hat']).to eq(nil)
  end

  it "should ignore author_id if not a supervisor" do
    u1 = User.create(settings: {'name' => 'Bob Jones', 'email' => 'bob@example.com'})
    u2 = User.create(settings: {'name' => 'Alice Rider', 'email' => 'alice@example.com'})
    m = ContactMessage.process_new({
      'name' => 'Fred Jones',
      'email' => 'fred@example.com',
      'subject' => 'ok',
      'recipient' => 'nobody',
      'message' => 'asdf',
      'hat' => 'asdf',
      'author_id' => u2.global_id
    }, {'api_user' => u1})
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq('bob@example.com')
    expect(m.settings['name']).to eq('Bob Jones')
    expect(m.settings['user_id']).to eq(u1.global_id)
    expect(m.settings['subject']).to eq('ok')
    expect(m.settings['recipient']).to eq('nobody')
    expect(m.settings['message']).to eq('asdf')
    expect(m.settings['hat']).to eq(nil)
  end
  
  it "should schedule a message delivery" do
    expect(AdminMailer).to receive(:schedule_delivery).with(:message_sent, /\d+_\d+/).and_return(true)
    m = ContactMessage.process_new({
      'name' => 'Bob Jones',
      'email' => 'bob@example.com',
      'subject' => 'ok',
      'recipient' => 'nobody',
      'message' => 'asdf',
      'hat' => 'asdf'
    })
  end

  it "should not email beta feedback messages" do
    expect(AdminMailer).not_to receive(:schedule_delivery).with(:beta_feedback_sent, anything)
    ContactMessage.process_new({
      'name' => 'Beta User',
      'email' => 'beta@example.com',
      'subject' => 'Short summary ok',
      'recipient' => 'beta_feedback',
      'feedback_type' => 'crash',
      'severity' => 'major',
      'general_feedback' => 'Detailed feedback here ok'
    })
  end

  it "should accept beta feedback without email" do
    expect(AdminMailer).not_to receive(:schedule_delivery).with(:beta_feedback_sent, anything)
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'subject' => 'Summary',
      'feedback_type' => 'crash',
      'severity' => 'major',
      'general_feedback' => 'x' * 12
    })
    expect(m.errored?).to eq(false)
    expect(m.recipient).to eq('beta_feedback')
  end

  it "should reject beta feedback without subject" do
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'email' => 'a@b.com',
      'general_feedback' => 'x' * 12
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['Summary is required for beta feedback'])
  end

  it "should reject invalid beta screenshot" do
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'email' => 'a@b.com',
      'subject' => 'ok',
      'general_feedback' => 'x' * 12,
      'screenshot_data' => 'not valid'
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['Invalid screenshot format'])
  end

  it "should reject beta feedback with invalid email" do
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'email' => 'not-an-email',
      'subject' => 'ok',
      'feedback_type' => 'crash',
      'severity' => 'major',
      'general_feedback' => 'x' * 12
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['Invalid email address'])
  end

  it "should reject beta feedback with invalid feedback type" do
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'email' => 'a@b.com',
      'subject' => 'ok',
      'feedback_type' => 'injection_attempt',
      'severity' => 'major',
      'general_feedback' => 'x' * 12
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['Invalid feedback type'])
  end

  it "should reject beta feedback with invalid severity" do
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'email' => 'a@b.com',
      'subject' => 'ok',
      'feedback_type' => 'crash',
      'severity' => 'critical',
      'general_feedback' => 'x' * 12
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['Invalid severity'])
  end

  it "should reject beta feedback when a field is too long" do
    m = ContactMessage.process_new({
      'recipient' => 'beta_feedback',
      'email' => 'a@b.com',
      'subject' => 'ok',
      'feedback_type' => 'crash',
      'severity' => 'major',
      'general_feedback' => 'x' * 12,
      'device_context' => 'y' * 3000
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['One or more fields are too long'])
  end

  it "should handle custom author_id correctly" do
    u1 = User.create(settings: {'name' => 'Bob Jones', 'email' => 'bob@example.com'})
    u2 = User.create(settings: {'name' => 'Alice Rider', 'email' => 'alice@example.com'})
    User.link_supervisor_to_user(u2, u1)
    m = ContactMessage.process_new({
      'name' => 'Fred Jones',
      'email' => 'fred@example.com',
      'subject' => 'ok',
      'recipient' => 'nobody',
      'message' => 'asdf',
      'author_id' => 'custom',
      'hat' => 'asdf'
    }, {'api_user' => u1})
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq('fred@example.com')
    expect(m.settings['name']).to eq('Fred Jones')
    expect(m.settings['user_id']).to eq(u1.global_id)
    expect(m.settings['subject']).to eq('ok')
    expect(m.settings['recipient']).to eq('nobody')
    expect(m.settings['message']).to eq('asdf')
    expect(m.settings['hat']).to eq(nil)
  end
  
  it "should schedule a message delivery for support messages when remote support not configured" do
    orig = ENV['ZENDESK_DOMAIN']
    ENV['ZENDESK_DOMAIN'] = nil

    expect(AdminMailer).to receive(:schedule_delivery).with(:message_sent, /\d+_\d+/).and_return(true)
    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'bob@example.com',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)

    ENV['ZENDESK_DOMAIN'] = orig
  end
  
  it "should error creating a support message with no email" do
    orig = ENV['ZENDESK_DOMAIN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'

    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(true)
    expect(m.processing_errors).to eq(['Email required for support tickets'])

    ENV['ZENDESK_DOMAIN'] = orig
  end
  
  it "should schedule a remote delivery for support messages if remote support configured" do
    orig = ENV['ZENDESK_DOMAIN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'

    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'asdf@example.com',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)
    expect(Worker.scheduled?(ContactMessage, :perform_action, {'id' => m.id, 'method' => 'deliver_remotely', 'arguments' => []})).to eq(true)

    ENV['ZENDESK_DOMAIN'] = orig
  end
  
  it "should try to deliver a remote message if configured" do
    orig_d = ENV['ZENDESK_DOMAIN']
    orig_u = ENV['ZENDESK_USER']
    orig_t = ENV['ZENDESK_TOKEN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'
    ENV['ZENDESK_USER'] = "nunya@example.com"
    ENV['ZENDESK_TOKEN'] = "q49t84awhg498gh34"

    expect(AdminMailer).not_to receive(:schedule_delivery)
    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'asdf@example.com',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)
    expect(Typhoeus).to receive(:post){|endpoint, args|
      expect(endpoint).to eq('https://asdf/api/v2/tickets.json')
      expect(args[:headers]).to eq({'Content-Type' => 'application/json'})
      expect(args[:userpwd]).to eq("nunya@example.com/token:q49t84awhg498gh34")
    }.and_return(OpenStruct.new(:code => 201))
    Worker.process_queues

    ENV['ZENDESK_DOMAIN'] = orig_d
    ENV['ZENDESK_USER'] = orig_u
    ENV['ZENDESK_TOKEN'] = orig_t
  end
  
  it "should fall back to an admin email if support ticket submission fails unexpectedly" do
    orig_d = ENV['ZENDESK_DOMAIN']
    orig_u = ENV['ZENDESK_USER']
    orig_t = ENV['ZENDESK_TOKEN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'
    ENV['ZENDESK_USER'] = "nunya@example.com"
    ENV['ZENDESK_TOKEN'] = "q49t84awhg498gh34"

    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'asdf@example.com',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)
    expect(Typhoeus).to receive(:post){|endpoint, args|
      expect(endpoint).to eq('https://asdf/api/v2/tickets.json')
      expect(args[:headers]).to eq({'Content-Type' => 'application/json'})
      expect(args[:userpwd]).to eq("nunya@example.com/token:q49t84awhg498gh34")
    }.and_return(OpenStruct.new(:code => 400, :body => "badness"))
    expect(AdminMailer).to receive(:schedule_delivery).with(:message_sent, m.global_id).and_return(true)
    Worker.process_queues
    m.reload
    expect(m.settings['error']).to eq('badness')

    ENV['ZENDESK_DOMAIN'] = orig_d
    ENV['ZENDESK_USER'] = orig_u
    ENV['ZENDESK_TOKEN'] = orig_t
  end
  
  it "should sanitize attributes" do
    m = ContactMessage.process_new({
      'name' => 'Bob <br/>Jones',
      'email' => '<b>bob@example.com</b>',
      'subject' => "ok<a href='#'></a>",
      'recipient' => "nobody<iframe src='http://www.google.com/>",
      'message' => 'asdf<p></p>',
      'hat' => 'asdf'
    })
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq('bob@example.com')
    expect(m.settings['name']).to eq('Bob  Jones')
    expect(m.settings['subject']).to eq('ok')
    expect(m.settings['recipient']).to eq('nobody')
    expect(m.settings['message']).to eq('asdf')
    expect(m.settings['hat']).to eq(nil)
    
    m = ContactMessage.process_new({})
    expect(m).not_to eq(nil)
    expect(m.errored?).to eq(false)
    expect(m.settings['email']).to eq(nil)
  end

  it "should add CCs if the user is tied to a premium org" do
    orig_d = ENV['ZENDESK_DOMAIN']
    orig_u = ENV['ZENDESK_USER']
    orig_t = ENV['ZENDESK_TOKEN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'
    ENV['ZENDESK_USER'] = "nunya@example.com"
    ENV['ZENDESK_TOKEN'] = "q49t84awhg498gh34"

    u1 = User.create
    u1.settings['email'] = 'asdf@example.com'
    u1.save
    o1 = Organization.create
    o1.settings['premium'] = true
    o1.settings['support_target'] = {'email' => 'org1@example.com'}
    o1.save
    o1.add_manager(u1.user_name)
    u2 = User.create
    u2.settings['email'] = 'asdf@example.com'
    u2.save
    o2 = Organization.create
    o2.settings['premium'] = true
    o2.settings['support_target'] = {'email' => 'org2@example.com'}
    o2.save
    o2.add_supervisor(u2.user_name, false)
    u3 = User.create
    u3.settings['email'] = 'asdf@example.com'
    u3.save
    o3 = Organization.create
    o3.settings['support_target'] = {'email' => 'org3@example.com'}
    o3.add_manager(u3.user_name)

    expect(User.find_by_email('asdf@example.com').sort_by(&:id)).to eq([u1, u2, u3])
    expect(Organization.attached_orgs(u1.reload, true)[0]['org']).to eq(o1)
    expect(Organization.attached_orgs(u2.reload, true)[0]['org']).to eq(o2)
    expect(Organization.attached_orgs(u3.reload, true)[0]['org']).to eq(o3)

    expect(AdminMailer).not_to receive(:schedule_delivery)
    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'asdf@example.com',
      'subject' => 'Ahem',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)
    expect(Typhoeus).to receive(:post){|endpoint, args|
      expect(endpoint).to eq('https://asdf/api/v2/tickets.json')
      expect(args[:headers]).to eq({'Content-Type' => 'application/json'})
      expect(args[:userpwd]).to eq("nunya@example.com/token:q49t84awhg498gh34")
      expect(args[:body]).to_not eq(nil)
      expect(JSON.parse(args[:body])).to eq({
        'ticket' => {
          'requester' => {'name' => 'asdf@example.com', 'email' => 'asdf@example.com'},
          'subject' => "Ahem",
          'comment' => {'html_body' => "<i>Source App: LingoLinq</i><br/>asdf<br/><br/><span style='font-style: italic;'>no IP address found<br/>no app version found<br/>no user agent found</span><br/>Unnamed Organization (premium), Unnamed Organization (premium), Unnamed Organization"},
          'email_ccs' => [
            {'user_name' => o1.settings['name'], 'user_email' => 'org1@example.com', 'action' => 'put'},
            {'user_name' => o2.settings['name'], 'user_email' => 'org2@example.com', 'action' => 'put'},
          ]
        }
      })
    }.and_return(OpenStruct.new(:code => 201))
    Worker.process_queues

    ENV['ZENDESK_DOMAIN'] = orig_d
    ENV['ZENDESK_USER'] = orig_u
    ENV['ZENDESK_TOKEN'] = orig_t
  end

  it "should add parent-org CCs" do
    orig_d = ENV['ZENDESK_DOMAIN']
    orig_u = ENV['ZENDESK_USER']
    orig_t = ENV['ZENDESK_TOKEN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'
    ENV['ZENDESK_USER'] = "nunya@example.com"
    ENV['ZENDESK_TOKEN'] = "q49t84awhg498gh34"

    u1 = User.create
    u1.settings['email'] = 'asdf@example.com'
    u1.save
    o1 = Organization.create
    o1.settings['premium'] = true
    o1.settings['support_target'] = {'email' => 'org1@example.com'}
    o1.save
    o1.add_user(u1.user_name, false, false)
    o2 = Organization.create
    o2.settings['premium'] = true
    o2.settings['support_target'] = {'email' => 'org2@example.com'}
    o2.save
    o1.parent_organization_id = o2.id
    o1.save
    expect(o1.parent_org_id).to eq(o2.global_id)
    expect(o1.upstream_orgs).to eq([o2])
    
    expect(AdminMailer).not_to receive(:schedule_delivery)
    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'asdf@example.com',
      'subject' => 'Ahem',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)
    expect(Typhoeus).to receive(:post){|endpoint, args|
      expect(endpoint).to eq('https://asdf/api/v2/tickets.json')
      expect(args[:headers]).to eq({'Content-Type' => 'application/json'})
      expect(args[:userpwd]).to eq("nunya@example.com/token:q49t84awhg498gh34")
      expect(args[:body]).to_not eq(nil)
      expect(JSON.parse(args[:body])).to eq({
        'ticket' => {
          'requester' => {'name' => 'asdf@example.com', 'email' => 'asdf@example.com'},
          'subject' => "Ahem",
          'comment' => {'html_body' => "<i>Source App: LingoLinq</i><br/>asdf<br/><br/><span style='font-style: italic;'>no IP address found<br/>no app version found<br/>no user agent found</span><br/>Unnamed Organization (premium)"},
          'email_ccs' => [
            {'user_name' => o1.settings['name'], 'user_email' => 'org1@example.com', 'action' => 'put'},
            {'user_name' => o2.settings['name'], 'user_email' => 'org2@example.com', 'action' => 'put'},
          ]
        }
      })
    }.and_return(OpenStruct.new(:code => 201))
    Worker.process_queues

    ENV['ZENDESK_DOMAIN'] = orig_d
    ENV['ZENDESK_USER'] = orig_u
    ENV['ZENDESK_TOKEN'] = orig_t
  end

  it "should include org names in email body" do
    orig_d = ENV['ZENDESK_DOMAIN']
    orig_u = ENV['ZENDESK_USER']
    orig_t = ENV['ZENDESK_TOKEN']
    ENV['ZENDESK_DOMAIN'] = 'asdf'
    ENV['ZENDESK_USER'] = "nunya@example.com"
    ENV['ZENDESK_TOKEN'] = "q49t84awhg498gh34"

    u1 = User.create
    u1.settings['email'] = 'asdf@example.com'
    u1.save
    o1 = Organization.create
    o1.settings['premium'] = true
    o1.settings['name'] = "Origami"
    o1.settings['support_target'] = {'email' => 'org1@example.com'}
    o1.save
    o1.add_user(u1.user_name, false, false)
    o2 = Organization.create
    o2.settings['premium'] = true
    o2.settings['name'] = "Originality"
    o2.settings['support_target'] = {'email' => 'org2@example.com'}
    o2.save
    o1.parent_organization_id = o2.id
    o1.save
    expect(o1.parent_org_id).to eq(o2.global_id)
    expect(o1.upstream_orgs).to eq([o2])
    
    expect(AdminMailer).not_to receive(:schedule_delivery)
    m = ContactMessage.process_new({
      'message' => 'asdf', 
      'email' => 'asdf@example.com',
      'subject' => 'Ahem',
      'recipient' => 'technical support'
    })
    expect(m.errored?).to eq(false)
    expect(Typhoeus).to receive(:post){|endpoint, args|
      expect(endpoint).to eq('https://asdf/api/v2/tickets.json')
      expect(args[:headers]).to eq({'Content-Type' => 'application/json'})
      expect(args[:userpwd]).to eq("nunya@example.com/token:q49t84awhg498gh34")
      expect(args[:body]).to_not eq(nil)
      expect(JSON.parse(args[:body])).to eq({
        'ticket' => {
          'requester' => {'name' => 'asdf@example.com', 'email' => 'asdf@example.com'},
          'subject' => "Ahem",
          'comment' => {'html_body' => "<i>Source App: LingoLinq</i><br/>asdf<br/><br/><span style='font-style: italic;'>no IP address found<br/>no app version found<br/>no user agent found</span><br/>Origami (premium)"},
          'email_ccs' => [
            {'user_name' => o1.settings['name'], 'user_email' => 'org1@example.com', 'action' => 'put'},
            {'user_name' => o2.settings['name'], 'user_email' => 'org2@example.com', 'action' => 'put'},
          ]
        }
      })
    }.and_return(OpenStruct.new(:code => 201))
    Worker.process_queues

    ENV['ZENDESK_DOMAIN'] = orig_d
    ENV['ZENDESK_USER'] = orig_u
    ENV['ZENDESK_TOKEN'] = orig_t
  end
end
