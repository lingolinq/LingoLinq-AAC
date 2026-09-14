require 'spec_helper'

describe Utterance, :type => :model do
  it "should generate defaults" do
    u = Utterance.new
    u.generate_defaults
    expect(u.data).not_to eq(nil)
    expect(u.data['image_url']).not_to eq(nil)
  end

  it "should generate a reply nonce" do
    u = Utterance.new
    u.generate_defaults
    expect(u.reply_nonce).to_not eq(nil)
  end

  it "should retry on existing reply nonce" do
    user = User.create
    expect(GoSecure).to receive(:nonce).with('security_nonce').and_return('34qt34t34').at_least(1).times
    expect(GoSecure).to receive(:nonce).with('utterance_reply_code').and_return('asdf').exactly(12).times
    u = Utterance.create(user: user, data: {'button_list' => []})
    expect(u.reply_nonce).to eq(GoSecure.sha512('utterance_reply_long', 'asdf')[0, 10])
    expect { Utterance.create(user: user, data: {'button_list' => []}) }.to raise_error("can't generate nonce")
  end
  
  it "should track the default image url" do
    user = User.create
    button_list = [
      {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
    ]
    u = Utterance.create(:user => user, :data => {
      'button_list' => button_list
    })
    expect(u.data['image_url']).to eq('http://www.example.com/pib.png')
    expect(u.data['default_image_url']).to eq(true)
  end
  
  it "should set the image url to the large image url if it's still set to the default image url" do
    button_list = [
      {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
    ]
    user = User.create
    u = Utterance.create(:user => user, :data => {
      'button_list' => button_list
    })
    expect(u.data['image_url']).to eq('http://www.example.com/pib.png')
    expect(u.data['default_image_url']).to eq(true)
    expect(SentencePic).to receive(:generate).with(u).and_return('http://www.example.com/pix.png')
    u.generate_preview
    expect(u.data['image_url']).to eq('http://www.example.com/pix.png')
    expect(u.data['default_image_url']).to eq(true)
  end

  it "should no longer track the default image url once it's changed" do
    user = User.create
    button_list = [
      {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
    ]
    u = Utterance.create(:user => user, :data => {
      'button_list' => button_list
    })
    expect(u.data['image_url']).to eq('http://www.example.com/pib.png')
    expect(u.data['default_image_url']).to eq(true)
    expect(SentencePic).to receive(:generate).with(u).and_return('http://www.example.com/pif.png')
    u.generate_preview
    expect(u.data['image_url']).to eq('http://www.example.com/pif.png')
    expect(u.data['default_image_url']).to eq(true)
  end
  
  it "should not set the image url to the large image url if it's not the default image url" do
    user = User.create
    button_list = [
      {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
    ]
    u = Utterance.create(:user => user, :data => {
      'button_list' => button_list
    })
    expect(u.data['image_url']).to eq('http://www.example.com/pib.png')
    expect(u.data['default_image_url']).to eq(true)
    u.data['default_image_url'] = false
    u.save
    expect(SentencePic).to receive(:generate).with(u).and_return('http://www.example.com/pif.png')
    u.generate_preview
    expect(u.data['image_url']).to eq('http://www.example.com/pib.png')
    expect(u.data['default_image_url']).to eq(false)
  end
  
  describe "share_with" do
    it "should allow sharing with a supervisor" do
      u1 = User.create
      Device.create(user: u1)
      u2 = User.create
      User.link_supervisor_to_user(u2, u1)
      u1.reload
      u2.reload
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:user => u1, :data => {
        'button_list' => button_list
      })
      res = u.share_with({
        'supervisor_id' => u2.global_id
      }, u1)
      expect(res).to eq({:to => u2.global_id, :from => u1.global_id, :type => 'utterance'})
      expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => u.id, 'method' => 'deliver_to', 'arguments' => [{
        'user_id' => u2.global_id,
        'sharer_id' => u1.global_id,
        'share_index' => 0,
        'text_only' => nil
      }]})).to eq(true)
    end

    it "should allow sharing with a supervisee by adding a note to their log" do
      u1 = User.create
      d = Device.create(user: u1)
      u2 = User.create
      User.link_supervisor_to_user(u1, u2)
      u1.reload
      u2.reload
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:user => u1, :data => {
        'button_list' => button_list,
      })
      res = u.share_with({
        'user_id' => u2.global_id
      }, u1)
      expect(res).to eq({:to => u2.global_id, :from => u1.global_id, :type => 'utterance'})
      s = LogSession.where(user: u2).last
      s2 = LogSession.where(user: u1).last
      # check that it was recorded to recipient
      expect(s.user).to eq(u2)
      expect(s.author).to eq(u1)
      expect(s.data['note']['text']).to eq('hat cat scat')
      expect(Worker.scheduled?(Utterance, :perform_action, {'id' => u.id, 'method' => 'deliver_to', 'arguments' => [{
        'user_id' => u2.global_id,
        'sharer_id' => u1.global_id,
        'share_index' => 0,
        'text_only' => nil
      }]})).to eq(false)
      # check that it was recorded for sharer
      expect(s2.log_type).to eq('note')
      expect(s2.data['event_summary']).to eq("Note by #{u1.user_name}: hat cat scat")
    end

    it "should allow sharing with one of the supervisors of one of my supervisees" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      Device.create(user: u2)
      Device.create(user: u3)
      User.link_supervisor_to_user(u2, u1)
      User.link_supervisor_to_user(u3, u1)
      u1.reload
      u2.reload
      u3.reload
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list
      })
      res = u.share_with({
        'user_id' => u3.global_id
      }, u2)
      expect(res).to eq({:to => u3.global_id, :from => u2.global_id, :type => 'utterance'})
      expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => u.id, 'method' => 'deliver_to', 'arguments' => [{
        'user_id' => u3.global_id,
        'sharer_id' => u2.global_id,
        'share_index' => 0,
        'text_only' => nil
      }]})).to eq(true)
    end

    it "should allow sharing to an email address" do
      u1 = User.create
      Device.create(user: u1)
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list
      })
      res = u.share_with({
        'email' => 'bob@example.com',
        'message' => 'hat cat scat'
      }, u1)
      expect(res).to eq({:from => u1.global_id, :to => 'bob@example.com', :type => 'email'})
      expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => u.id, 'method' => 'deliver_to', 'arguments' => [{
        "sharer_id" => u1.global_id,
        "email" => "bob@example.com",
        "share_index" => 0,
        "subject" => "hat cat scat",
        "message" => "hat cat scat"
      }]})).to eq(true)
    end
    
    it "should schedule a delivery for email shares" do
      u1 = User.create
      Device.create(user: u1)
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list
      })
      res = u.share_with({
        'email' => 'bob@example.com',
        'message' => 'hat cat scat'
      }, u1)
      expect(res).to eq({:from => u1.global_id, :to => 'bob@example.com', :type => 'email'})
      expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => u.id, 'method' => 'deliver_to', 'arguments' => [{
        'sharer_id' => u1.global_id,
        'email' => 'bob@example.com',
        'share_index' => 0,
        'subject' => 'hat cat scat',
        'message' => 'hat cat scat'
      }]})).to eq(true)
    end
    
    it "should return false if no valid share is specified" do
      u1 = User.create
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list
      })
      res = u.share_with({}, nil)
      expect(res).to eq(false)
      res = u.share_with({}, u1)
      expect(res).to eq(false)
    end
    
    it "should return false if an invalid supervisor is specified" do
      u1 = User.create
      u2 = User.create
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list
      })
      res = u.share_with({
        'supervisor_id' => u2.global_id
      }, u1)
      expect(res).to eq(false)
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+45558675309,+79876543,+45551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      before { allow(SentencePic).to receive(:generate).and_return('https://example.com/preview.png') }
      it "should allow sending an sms message to a user contact" do
        u = User.create
        d = Device.create(user: u)
        u.settings['cell_phone'] = '123456'
        u.settings['contacts'] = [
          { 
            'hash' => '48toytn4ta84ty',
            'contact_type' => 'sms',
            'cell_phone' => '98765',
            'name' => 'Mom'
          }
        ]
        u.save
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'whatevs'}]})
        utterance.share_with({'user_id' => "#{u.global_id}x48toytn4ta84ty"}, u)
        expect(utterance.data['share_user_ids']).to eq(["#{u.global_id}x48toytn4ta84ty"])
        Worker.process_queues
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '98765', 'pushed' => true, 'text' => "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A"}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '98765', "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A", nil)).to eq(true)
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
      end    
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      before { allow(SentencePic).to receive(:generate).and_return('https://example.com/preview.png') }
      it "should send sms to a user contact with one of the specified originators" do
        u = User.create
        d = Device.create(user: u)
        u.settings['cell_phone'] = '123456'
        u.settings['contacts'] = [
          { 
            'hash' => '48toytn4ta84ty',
            'contact_type' => 'sms',
            'cell_phone' => '5558675307',
            'name' => 'Mom'
          }
        ]
        u.save
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'whatevs'}]})
        utterance.share_with({'user_id' => "#{u.global_id}x48toytn4ta84ty"}, u)
        expect(utterance.data['share_user_ids']).to eq(["#{u.global_id}x48toytn4ta84ty"])
        Worker.process_queues
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '5558675307', 'pushed' => true, 'text' => "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A"}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '5558675307', "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A", "+15551234567")).to eq(true)
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
      end    
    end
  end
 
  describe "deliver_to" do
    it "should do nothing without a sharer" do
      u = Utterance.create
      expect{ u.deliver_to({}) }.to raise_error('sharer required')
      expect{ u.deliver_to({'email' => 'bob@example.com'}) }.to raise_error('sharer required')
    end
    
    it "should deliver to an email address" do
      u1 = User.create
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list,
        'sentence' => 'hat cat scat'
      })
      expect(u.data['sentence']).to eq('hat cat scat')
      expect(UserMailer).to receive(:schedule_delivery).with(:utterance_share, {
        'subject' => 'hat cat scat',
        'message' => 'hat cat scat',
        'sharer_id' => u1.global_id,
        'reply_id' => nil,
        'recipient_id' => nil,
        'sharer_name' => u1.user_name,
        'utterance_id' => u.global_id,
        'reply_url' => "#{JsonApi::Json.absolute_host}/u/#{u.reply_nonce}A",
        'to' => 'bob@example.com'
      })
      res = u.deliver_to({'sharer_id' => u1.global_id, 'email' => 'bob@example.com', 'share_index' => 0})
      expect(res).to eq(true)
    end
    
    it "should deliver to a supervisor" do
      u1 = User.create
      u2 = User.create
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:data => {
        'button_list' => button_list,
        'sentence' => 'hat cat scat'
      })
      expect(u).to receive(:notify).with('utterance_shared', {
        'sharer' => {'name' => nil, 'user_name' => u1.user_name, 'user_id' => u1.global_id},
        'user_id' => u2.global_id,
        'text' => 'hat cat scat',
        'utterance_id' => u.global_id,
        'share_index' => nil,
        'reply_id' => nil,
        'reply_url' => "#{JsonApi::Json.absolute_host}/u/#{u.reply_nonce}A"
      })
      res = u.deliver_to({'sharer_id' => u1.global_id, 'user_id' => u2.global_id})
      expect(res).to eq(true)
    end

    it "should deliver to a user contact, including prior message info" do
      u = User.create
      u.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'name' => 'Fred', 'contact' => '5558675309'}}]}, {})
      d = Device.create(user: u)
      expect(u.reload.settings['contacts'].length).to eq(1)
      contact_hash = u.settings['contacts'][0]['hash']
      contact_id = "#{u.global_id}x#{contact_hash}"
      session = LogSession.message({
        recipient: u,
        sender: u,
        sender_id: contact_id,
        notify: 'user_only',
        device: d,
        message: 'howdy doody'
      })
  
      expect(session.data['author_contact']['name']).to eq('Fred')
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      utterance = Utterance.create(:data => {
        'button_list' => button_list,
        'sentence' => 'hat cat scat',
        'author_ids' => [contact_id],
        'reply_ids' => {'0' => Webhook.get_record_code(session)},
        'share_user_ids' => [u.global_id]
      })

      expect(utterance).to receive(:deliver_message).with('sms', nil, {
        'sharer' => {'name' => nil, 'user_name' => u.user_name, 'user_id' => u.global_id},
        'recipient_id' => contact_id,
        'email' => false,
        'cell_phone' => '5558675309',
        'reply_id' => Webhook.get_record_code(session),
        'utterance_id' => utterance.global_id,
        'share_index' => 0,
        'reply_url' => "#{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}#{Utterance.to_alpha_code(0)}",
        'text' => 'hat cat scat',
        'text_only' => nil
      }, u)
      res = utterance.deliver_to({'sharer_id' => u.global_id, 'user_id' => contact_id, 'share_index' => 0})
      expect(res).to eq(true)
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should deliver to a tracked sms target" do
        u = User.create
        u.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'name' => 'Fred', 'contact' => '5558675309'}}]}, {})
        d = Device.create(user: u)
        expect(u.reload.settings['contacts'].length).to eq(1)
        contact_hash = u.settings['contacts'][0]['hash']
        contact_id = "#{u.global_id}x#{contact_hash}"
        session = LogSession.message({
          recipient: u,
          sender: u,
          sender_id: contact_id,
          notify: 'user_only',
          device: d,
          message: 'howdy doody'
        })
    
        expect(session.data['author_contact']['name']).to eq('Fred')
        button_list = [
          {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
          {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
          {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
        ]
        utterance = Utterance.create(:user => u, :data => {
          'button_list' => button_list,
          'sentence' => 'hat cat scat',
          'author_ids' => [contact_id],
          'reply_ids' => {'0' => Webhook.get_record_code(session)},
          'share_user_ids' => [contact_id]
        })

        res = utterance.deliver_to({'sharer_id' => u.global_id, 'user_id' => contact_id, 'share_index' => 0})
        expect(res).to eq(true)
        t = RemoteTarget.last
        expect(t).to_not eq(nil)
        expect(t.user).to eq(u)
        expect(t.target_id).to eq(5309)
        expect(t.current_source[:id]).to eq('+15551234567')
        expect(t.contact_id).to eq(contact_id)
      end
    end
  end
  
  describe "process_params" do
    it "should error without a user" do
      expect{ Utterance.process_new({}, {}) }.to raise_error("user required")
    end
    it "should process parameters" do
      user = User.create
      u = Utterance.process_new({:button_list => [{label: 'ok'}], :sentence => 'abc'}, {:user => user})
      expect(u.data['button_list']).to eq([{'label' => 'ok'}])
      expect(u.data['sentence']).to eq('abc')
      expect(u.user).to eq(user)
    end
  end
  
  describe "generate_preview" do
    it "should generate a preview" do
      user = User.create
      button_list = [
        {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
      ]
      u = Utterance.create(:user => user, :data => {
        'button_list' => button_list
      })
      expect(SentencePic).to receive(:generate).with(an_instance_of(Utterance)).and_return("http://www.example.com/pid.png")
      Worker.process_queues
#      expect(u.reload.data['large_image_url']).to eq("http://www.example.com/pid.png")
    end
  end

  describe "deliver_message" do
    env_wrap({
      'SMS_ORIGINATORS' => "+45558675309,+79876543,+45551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      before { allow(SentencePic).to receive(:generate).and_return('https://example.com/preview.png') }
      it "should send a text message to a user" do
        u = User.create
        u.settings['cell_phone'] = '123456'
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'howdy'}]})
        utterance.deliver_message('text', u, {'sharer' => {'name' => 'bob'}})
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '123456', 'from bob - howdy', nil)).to eq(true)
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '123456', 'pushed' => true, 'text' => 'from bob - howdy'}
        )
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
      end

      it "should include a reply email in an sms message" do
        u = User.create
        u.settings['cell_phone'] = '123456'
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'howdy'}]})
        utterance.data['share_user_ids'] = ['asdf', 'qwer']
        utterance.save
        utterance.deliver_message('text', u, {'sharer' => {'name' => 'bob'}, 'share_index' => 1})
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '123456', 'pushed' => true, 'text' => "from bob - howdy\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}B"}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '123456', "from bob - howdy\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}B", nil)).to eq(true)
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
      end

      it "should allow sending an sms message to a user contact" do
        u = User.create
        Device.create(user: u)
        u.settings['cell_phone'] = '123456'
        u.settings['contacts'] = [
          { 
            'hash' => '48toytn4ta84ty',
            'contact_type' => 'sms',
            'cell_phone' => '98765',
            'name' => 'Mom'
          }
        ]
        u.save
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'whatevs'}]})
        utterance.share_with({'user_id' => "#{u.global_id}x48toytn4ta84ty"}, u)
        expect(utterance.data['share_user_ids']).to eq(["#{u.global_id}x48toytn4ta84ty"])
        Worker.process_queues
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '98765', 'pushed' => true, 'text' => "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A"}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '98765', "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A", nil)).to eq(true)
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
      end
    end

    it "should send an email to a user" do
      u = User.create
      Device.create(user: u)
      u.settings['email'] = 'bob@example.com'
      utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'howdy'}]})
      expect(UserMailer).to receive(:schedule_delivery).with(:utterance_share, {
        'subject' => 'howdy',
        'sharer_id' => nil,
        'sharer_name' => 'bob',
        'reply_id' => nil,
        'recipient_id' => u.global_id,
        'message' => 'howdy',
        'utterance_id' => utterance.global_id,
        'to' => 'bob@example.com',
        'reply_url' => "#{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}B"
      })
      utterance.deliver_message('email', u, {'sharer' => {'name' => 'bob'}, 'share_index' => 1})
    end

    it "should allow sending an email to a user contact" do
      allow(SentencePic).to receive(:generate).and_return('https://example.com/preview.png')
      u = User.create
      Device.create(user: u)
      u.settings['email'] = 'bob@example.com'
      u.settings['contacts'] = [
        { 
          'hash' => '48toytn4ta84ty',
          'contact_type' => 'email',
          'email' => 'mom@example.com',
          'name' => 'Mom'
        }
      ]
      u.save
      utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'whatevs'}]})
      utterance.share_with({'user_id' => "#{u.global_id}x48toytn4ta84ty"}, u)
      expect(utterance.data['share_user_ids']).to eq(["#{u.global_id}x48toytn4ta84ty"])
      expect(UserMailer).to receive(:schedule_delivery).with(:utterance_share, {
        'subject' => 'whatevs',
        'sharer_id' => u.global_id,
        'sharer_name' => u.user_name,
        'message' => 'whatevs',
        'utterance_id' => utterance.global_id,
        'reply_id' => nil,
        'recipient_id' => "#{u.global_id}x48toytn4ta84ty",
        'to' => 'mom@example.com',
        'reply_url' => "#{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A"
      })
      Worker.process_queues
    end

    it "should include prior message information in email delivery" do
      u = User.create
      u.settings['email'] = 'bob@example.com'
      d = Device.create(user: u)
      session = LogSession.create(user: u, author: u, device: d, log_type: 'note', data: {'note' => {'text' => 'measure'}})
      utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'howdy'}]})
      utterance.data['reply_ids'] = {'1' => Webhook.get_record_code(session)}
      utterance.data['author_ids'] = [u.global_id, u.global_id]
      utterance.data['share_user_ids'] = [u.global_id, u.global_id]
      utterance.save
      expect(UserMailer).to receive(:schedule_delivery).with(:utterance_share, {
        'subject' => 'howdy',
        'sharer_id' => nil,
        'recipient_id' => u.global_id,
        'reply_id' => Webhook.get_record_code(session),
        'sharer_name' => 'bob',
        'message' => 'howdy',
        'utterance_id' => utterance.global_id,
        'to' => 'bob@example.com',
        'reply_url' => "#{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}B"
      })
      utterance.deliver_message('email', u, {'sharer' => {'name' => 'bob'}, 'share_index' => 1})
    end
  end

  describe "deliver_message SMS consent guard" do
    def enable_sms_consent_flag!(user)
      user.settings ||= {}
      user.settings['feature_flags'] = {'sms_recipient_consent' => true}
      user.save
      user
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+45558675309,+79876543,+45551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      before do
        allow(SentencePic).to receive(:generate).and_return('https://example.com/preview.png')
        allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(FeatureFlags::AVAILABLE_FRONTEND_FEATURES)
      end

      it "still sends without a consent row when the communicator flag is off" do
        u = User.create
        Device.create(user: u)
        u.settings['contacts'] = [
          {
            'hash' => '48toytn4ta84ty',
            'contact_type' => 'sms',
            'cell_phone' => '98765',
            'name' => 'Mom'
          }
        ]
        u.save
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'whatevs'}]})
        utterance.share_with({'user_id' => "#{u.global_id}x48toytn4ta84ty"}, u)
        Worker.process_queues
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '98765', 'pushed' => true, 'text' => "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A"}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '98765', "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A", nil)).to eq(true)
      end

      it "blocks deliver_to / share_with when the flag is on and there is no consent row" do
        u = enable_sms_consent_flag!(User.create)
        Device.create(user: u)
        u.settings['contacts'] = [
          {
            'hash' => '48toytn4ta84ty',
            'contact_type' => 'sms',
            'cell_phone' => '98765',
            'name' => 'Mom'
          }
        ]
        u.save
        utterance = Utterance.create(user: u, data: {'button_list' => [{'label' => 'whatevs'}]})
        targets_before = RemoteTarget.where(user_id: u.id).count
        utterance.share_with({'user_id' => "#{u.global_id}x48toytn4ta84ty"}, u)
        Worker.process_queues
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '98765', 'pushed' => false, 'reason' => 'no_consent'}
        )
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '98765', "from #{u.user_name} - whatevs\n\nreply: #{JsonApi::Json.absolute_host}/u/#{utterance.reply_nonce}A", nil)).to eq(false)
        expect(RemoteTarget.where(user_id: u.id).count).to eq(targets_before)
      end

      it "blocks handle_notification utterance_shared when the flag is on and there is no consent row" do
        communicator = enable_sms_consent_flag!(User.create)
        recipient = User.create
        recipient.settings['cell_phone'] = '5558675309'
        recipient.settings['preferences'] ||= {}
        recipient.settings['preferences']['share_notifications'] = 'text'
        recipient.save
        utterance = Utterance.create(user: communicator, data: {'button_list' => [{'label' => 'hello'}]})
        targets_before = RemoteTarget.where(user_id: communicator.id).count
        recipient.handle_notification('utterance_shared', utterance, {
          'text' => 'hello',
          'sharer' => {'user_id' => communicator.global_id}
        })
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '5558675309', 'pushed' => false, 'reason' => 'no_consent'}
        )
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
        sent_text = "from #{communicator.settings['name'] || communicator.user_name} - hello"
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '5558675309', sent_text, nil)).to eq(false)
        expect(RemoteTarget.where(user_id: communicator.id).count).to eq(targets_before)
      end

      it "blocks when the utterance author flag is on and ref_user is missing" do
        author = enable_sms_consent_flag!(User.create)
        recipient = User.create
        recipient.settings['cell_phone'] = '5558675309'
        utterance = Utterance.create(user: author, data: {'button_list' => [{'label' => 'howdy'}]})
        targets_before = RemoteTarget.count
        utterance.deliver_message('text', recipient, {'sharer' => {'name' => 'bob'}})
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '5558675309', 'pushed' => false, 'reason' => 'unknown_sender'}
        )
        expect(utterance.data['sms_attempts'][0]['timestamp']).to be > 10.seconds.ago.to_i
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '5558675309', 'from bob - howdy', nil)).to eq(false)
        expect(RemoteTarget.count).to eq(targets_before)
      end

      it "blocks handle_notification when the sharer cannot be resolved" do
        communicator = enable_sms_consent_flag!(User.create)
        recipient = User.create
        recipient.settings['cell_phone'] = '5558675309'
        recipient.settings['preferences'] ||= {}
        recipient.settings['preferences']['share_notifications'] = 'text'
        recipient.save
        utterance = Utterance.create(user: communicator, data: {'button_list' => [{'label' => 'hello'}]})
        targets_before = RemoteTarget.where(user_id: communicator.id).count
        recipient.handle_notification('utterance_shared', utterance, {
          'text' => 'hello',
          'sharer' => {'user_id' => '1_missing_sharer'}
        })
        utterance.reload
        expect(utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => '5558675309', 'pushed' => false, 'reason' => 'unknown_sender'}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, '5558675309', 'from someone - hello', nil)).to eq(false)
        expect(RemoteTarget.where(user_id: communicator.id).count).to eq(targets_before)
      end

      it "does not treat communicator A's grant as consent for communicator B on the same number" do
        alice = enable_sms_consent_flag!(User.create)
        bob = enable_sms_consent_flag!(User.create)
        number = '5558675309'
        SmsConsent.grant!(alice, number, ip: '203.0.113.10', disclosure_version: SmsConsent::DISCLOSURE_VERSION)

        alice_utterance = Utterance.create(user: alice, data: {'button_list' => [{'label' => 'hi'}]})
        bob_utterance = Utterance.create(user: bob, data: {'button_list' => [{'label' => 'hi'}]})

        alice_utterance.deliver_message('text', nil, {
          'sharer' => {'user_id' => alice.global_id},
          'cell_phone' => number
        }, alice)
        bob_utterance.deliver_message('text', nil, {
          'sharer' => {'user_id' => bob.global_id},
          'cell_phone' => number
        }, bob)

        alice_utterance.reload
        bob_utterance.reload
        alice_text = "from #{alice.settings['name'] || alice.user_name} - hi"
        bob_text = "from #{bob.settings['name'] || bob.user_name} - hi"
        expect(alice_utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => number, 'pushed' => true, 'text' => alice_text}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, number, alice_text, nil)).to eq(true)
        expect(bob_utterance.data['sms_attempts'][0].except('timestamp')).to eq(
          {'cell' => number, 'pushed' => false, 'reason' => 'no_consent'}
        )
        expect(Worker.scheduled_for?('priority', Pusher, :sms, number, bob_text, nil)).to eq(false)
        expect(RemoteTarget.where(user_id: bob.id).count).to eq(0)
      end
    end
  end

  describe "from_alpha_code" do
    it 'should generate correct values' do
      expect(Utterance.from_alpha_code(nil)).to eq(nil)
      expect(Utterance.from_alpha_code('23525')).to eq(nil)
      expect(Utterance.from_alpha_code('A')).to eq(0)
      expect(Utterance.from_alpha_code('B')).to eq(1)
      expect(Utterance.from_alpha_code('C')).to eq(2)
      expect(Utterance.from_alpha_code('AXERAG')).to eq(10592250)
      expect(Utterance.from_alpha_code('CADSYB')).to eq(23828273)
      expect(Utterance.from_alpha_code('BS')).to eq(44)
      100.times do
        num = rand(99999)
        expect(Utterance.from_alpha_code(Utterance.to_alpha_code(num))).to eq(num)
      end
    end
  end

  describe "to_alpha_code" do
    it 'should generate correct values' do
      expect(Utterance.to_alpha_code(0)).to eq('A')
      expect(Utterance.to_alpha_code(1)).to eq('B')
      expect(Utterance.to_alpha_code(2)).to eq('C')
      expect(Utterance.to_alpha_code(3)).to eq('D')
      expect(Utterance.to_alpha_code(44)).to eq('BS')
      expect(Utterance.to_alpha_code(23828273)).to eq('CADSYB')
      expect(Utterance.to_alpha_code(nil)).to eq(nil)
      expect(Utterance.to_alpha_code("0")).to eq(nil)
    end
  end
end
