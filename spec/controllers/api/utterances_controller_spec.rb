require 'spec_helper'

describe Api::UtterancesController, :type => :controller do
  describe "POST create" do
    it "should require api token" do
      post :create, params: {:utterance => {}}
      assert_missing_token
    end
    
    it "should generate a valid utterance" do
      token_user
      post :create, params: {:utterance => {:button_list => [{label: "ok"}], :sentence => "ok"}}
      expect(response).to be_successful
      u = Utterance.last
      expect(u).not_to eq(nil)
      expect(u.data['button_list']).to eq([{'label' => 'ok'}])
      expect(u.data['sentence']).to eq('ok')
    end
    
    it "should return a json response" do
      token_user
      post :create, params: {:utterance => {:button_list => [{label: "ok"}], :sentence => "ok"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['utterance']['id']).not_to eq(nil)
      expect(json['utterance']['link']).not_to eq(nil)
      expect(json['utterance']['button_list']).not_to eq(nil)
      expect(json['utterance']['sentence']).not_to eq(nil)
      expect(json['utterance']['image_url']).not_to eq(nil)
    end
    
    it "should error gracefully on utterance create fail" do
      token_user
      expect_any_instance_of(Utterance).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      post :create, params: {:utterance => {:button_list => [{label: "ok"}], :sentence => "ok"}}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("utterance creation failed")
      expect(json['errors']).to eq(["bacon"])
    end

    it "should allow creating an utterance for a supervisee" do
      token_user
      com = User.create
      User.link_supervisor_to_user(@user, com)
      post :create, params: {:utterance => {:user_id => com.global_id, :button_list => [{label: "ok"}], :sentence => "ok"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['utterance']['id']).not_to eq(nil)
      expect(json['utterance']['user']['id']).to eq(com.global_id)
      expect(json['utterance']['link']).not_to eq(nil)
      expect(json['utterance']['button_list']).not_to eq(nil)
      expect(json['utterance']['sentence']).not_to eq(nil)
      expect(json['utterance']['image_url']).not_to eq(nil)
    end

    it "should not allow creating an utterance for a nonexistent user" do
      token_user
      com = User.create
      User.link_supervisor_to_user(@user, com)
      post :create, params: {:utterance => {:user_id => 'asdf', :button_list => [{label: "ok"}], :sentence => "ok"}}
      assert_not_found('asdf')
    end

    it "should not allow creating an utterance for a non-supervised user" do
      token_user
      com = User.create
      post :create, params: {:utterance => {:user_id => com.global_id, :button_list => [{label: "ok"}], :sentence => "ok"}}
      assert_unauthorized
    end
  end

  describe "POST reply" do
    it 'should not require an access token' do
      post :reply, params: {utterance_id: 'asdf'}
      assert_not_found('asdf')
   end

    it 'should require an existing utterance' do
      post :reply, params: {utterance_id: 'asdf'}
      assert_not_found('asdf')
    end

    it 'should not allow replying on a nonexistent share' do
      u = User.create
      ut = Utterance.create(user: u)
      post :reply, params: {utterance_id: "#{ut.global_id}x361879519461278A"}
      assert_not_found('361879519461278A')
    end

    it 'should not allow replying with an invalid reply nonce' do
      u = User.create
      ut = Utterance.create(user: u)
      post :reply, params: {utterance_id: "#{ut.global_id}x361879519461278A"}
      assert_not_found('361879519461278A')
    end

    it 'should require a valid sharer' do
      u = User.create
      ut = Utterance.create(user: u)
      ut.data['share_user_ids'] = ['asdf']
      ut.save
      post :reply, params: {utterance_id: "#{ut.global_id}x#{ut.reply_nonce}A"}
      assert_not_found("asdf")
    end

    it 'should create a reply message for the user' do
      u = User.create
      d = Device.create(user: u)
      u.process({'offline_actions' => [{'action' =>'add_contact', 'value' => {'name' => 'Yentil', 'contact' => '1234'}}]})
      contact_hash = u.settings['contacts'][0]['hash']
      contact_id = "#{u.global_id}x#{contact_hash}"
      ut = Utterance.create(user: u)
      ut.share_with({'user_id' => contact_id}, u)
      expect(LogSession).to receive(:message).with({
        recipient: ut.user,
        sender: u,
        sender_id: contact_id,
        notify: 'user_only',
        device: d,
        message: 'haldo',
        reply_id: ut.global_id
      }).and_return(true)
      post :reply, params: {utterance_id: "#{ut.global_id}x#{ut.reply_nonce}A", :message => "haldo"}
      json = assert_success_json
      expect(json).to eq({'from' => contact_id, 'to' =>  u.global_id, 'sent' => true})
    end

    it 'should return a json response' do
      u = User.create
      d = Device.create(user: u)
      ut = Utterance.create(user: u)
      ut.share_with({'user_id' => u.global_id}, u)
      expect(LogSession).to receive(:message).with({
        recipient: ut.user,
        sender: u,
        sender_id: u.global_id,
        notify: 'user_only',
        device: d,
        message: 'haldo',
        reply_id: ut.global_id
      }).and_return(true)
      post :reply, params: {utterance_id: "#{ut.global_id}x#{ut.reply_nonce}A", :message => "haldo"}
      json = assert_success_json
      expect(json).to eq({'from' => u.global_id, 'to' =>  u.global_id, 'sent' => true})
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+25558675309,+79876543,+35551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it "should increment unread_alerts when a contact replies to a text" do
        token_user
        @user.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'contact' => '12345', 'name' => 'Dad'}}]})
        hash = @user.settings['contacts'][0]['hash']
        contact_code = "#{@user.global_id}x#{hash}"
        utterance = Utterance.create(user: @user, data: {'sentence' => 'howdy'})
        post :share, params: {utterance_id: utterance.global_id, user_id: contact_code, sharer_id: @user.global_id}
        json = assert_success_json
        expect(json['shared']).to eq(true)
        expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => utterance.id, 'method' => 'deliver_to', 'arguments' => [{
          'user_id' => contact_code,
          'sharer_id' => @user.global_id,
          'share_index' => 0,
          'text_only' => nil
        }]})).to eq(true)
        expect(Pusher).to receive(:sms).with("12345", "from #{@user.settings['name']} - howdy\n\nreply: #{JsonApi::Json.current_host}/u/#{utterance.reply_nonce}A", nil).and_return(true)
        Worker.process_queues
        Worker.process_queues

        expect(@user.reload.settings['unread_alerts']).to eq(nil)

        post :reply, params: {utterance_id: "#{utterance.global_id}x#{utterance.reply_nonce}A", message: "good on ya!", reply_code: "#{utterance.reply_nonce}A"}
        json = assert_success_json
        expect(json['sent']).to eq(true)
        s = LogSession.last
        expect(s.log_type).to eq('note')
        expect(s.data['note']['text']).to eq('good on ya!')
        Worker.process_queues
      end

      it "should not notify anyone other than the user about the reply" do
        token_user
        sup1 = User.create
        sup2 = User.create
        User.link_supervisor_to_user(sup1, @user)
        User.link_supervisor_to_user(sup2, @user)
        @user.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'contact' => '12345', 'name' => 'Dad'}}]})
        hash = @user.settings['contacts'][0]['hash']
        contact_code = "#{@user.global_id}x#{hash}"
        utterance = Utterance.create(user: @user, data: {'sentence' => 'howdy'})
        post :share, params: {utterance_id: utterance.global_id, user_id: contact_code, sharer_id: @user.global_id}
        json = assert_success_json
        expect(json['shared']).to eq(true)
        expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => utterance.id, 'method' => 'deliver_to', 'arguments' => [{
          'user_id' => contact_code,
          'sharer_id' => @user.global_id,
          'share_index' => 0,
          'text_only' => nil
        }]})).to eq(true)
        expect(Pusher).to receive(:sms).with("12345", "from #{@user.settings['name']} - howdy\n\nreply: #{JsonApi::Json.current_host}/u/#{utterance.reply_nonce}A", nil).and_return(true)
        Worker.process_queues
        Worker.process_queues

        expect(@user.reload.settings['unread_alerts']).to eq(nil)

        post :reply, params: {utterance_id: "#{utterance.global_id}x#{utterance.reply_nonce}A", message: "good on ya!", reply_code: "#{utterance.reply_nonce}A"}
        json = assert_success_json
        expect(json['sent']).to eq(true)
        s = LogSession.last
        expect(s.log_type).to eq('note')
        expect(s.data['note']['text']).to eq('good on ya!')
        expect(s.data['notify_user']).to eq(true)
        expect(s.data['notify_user_only']).to eq(true)

        expect(UserMailer).to receive(:schedule_delivery).with(:log_message, @user.global_id, s.global_id)
        expect(UserMailer).to_not receive(:schedule_delivery).with(:log_message, sup1.global_id, s.global_id)
        expect(UserMailer).to_not receive(:schedule_delivery).with(:log_message, sup2.global_id, s.global_id)

        Worker.process_queues
      end
    end
  end
  
  describe "PUT update" do
    it "should require api token" do
      put :update, params: {:id => '1234', :utterance => {}}
      assert_missing_token
    end
    
    it "should update an utterance" do
      token_user
      utterance = Utterance.create(:user => @user)
      put :update, params: {:id => utterance.global_id, :utterance => {:show_user => true, :image_url => "http://www.pic.com/pic.png"}}
      expect(response).to be_successful
      u = Utterance.last.reload
      expect(u).not_to eq(nil)
      expect(u.data['show_user']).to eq(true)
      expect(u.data['image_url']).to eq("http://www.pic.com/pic.png")
    end
    
    it "should return a json response" do
      token_user
      utterance = Utterance.create(:user => @user)
      put :update, params: {:id => utterance.global_id, :utterance => {:show_user => true, :sentence => "ok"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['utterance']['id']).not_to eq(nil)
      expect(json['utterance']['link']).not_to eq(nil)
      expect(json['utterance']['button_list']).to eq(nil)
      expect(json['utterance']['sentence']).to eq("ok")
      expect(json['utterance']['show_user']).to eq(true)
      expect(json['utterance']['permissions']).to eq({'view' => true, 'edit' => true, 'user_id' => @user.global_id})
      expect(json['utterance']['user']['id']).to eq(@user.global_id)
      expect(json['utterance']['user']['user_name']).to eq(@user.user_name)
      expect(json['utterance']['image_url']).not_to eq(nil)
    end

    it "should return a json response" do
      token_user
      utterance = Utterance.create(:user => @user)
      put :update, params: {:id => utterance.global_id, :utterance => {:show_user => false, :sentence => "ok"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['utterance']['id']).not_to eq(nil)
      expect(json['utterance']['link']).not_to eq(nil)
      expect(json['utterance']['button_list']).to eq(nil)
      expect(json['utterance']['sentence']).to eq("ok")
      expect(json['utterance']['show_user']).to eq(false)
      expect(json['utterance']['permissions']).to eq({'view' => true, 'edit' => true, 'user_id' => @user.global_id})
      expect(json['utterance']['user']['id']).to eq(@user.global_id)
      expect(json['utterance']['user']['user_name']).to eq(@user.user_name)
      expect(json['utterance']['image_url']).not_to eq(nil)
    end
    
    it "should error gracefully on utterance create fail" do
      token_user
      utterance = Utterance.create(:user => @user)
      expect_any_instance_of(Utterance).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      put :update, params: {:id => utterance.global_id, :utterance => {:button_list => [{label: "ok"}], :sentence => "ok"}}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("utterance update failed")
      expect(json['errors']).to eq(["bacon"])
    end
  end
  
  describe "POST share" do
    it "should require api token" do
      post :share, params: {:utterance_id => 'asdf'}
      assert_missing_token
    end
    
    it "should error if not found" do
      token_user
      post :share, params: {:utterance_id => 'asdf'}
      assert_not_found
    end
    
    it "should require edit permission" do
      token_user
      u = User.create
      utterance = Utterance.create(:user => u)
      post :share, params: {:utterance_id => utterance.global_id}
      assert_unauthorized
    end
    
    it "should return success on success" do
      token_user
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :email => 'bob@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['shared']).to eq(true)
    end

    it "should require an existing sharer if specified" do
      token_user
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :email => 'bob@example.com', :sharer_id => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require supervisor permission to specify a sharer" do
      token_user
      u = User.create
      User.link_supervisor_to_user(u, @user)
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :email => 'bob@example.com', :sharer_id => u.global_id}
      assert_unauthorized
    end

    it "should allow sharing on behalf of a supervisee" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :email => 'bob@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['shared']).to eq(true)
    end
    
    it "should allow sharing to a supervisee's supervisor" do
      token_user
      com = User.create
      Device.create(user: com)
      sup = User.create
      User.link_supervisor_to_user(@user, com)
      User.link_supervisor_to_user(sup, com)
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :user_id => sup.global_id, :sharer_id => com.global_id}
      json = assert_success_json
      expect(json['shared']).to eq(true)
      expect(json['details']['from']).to eq(com.global_id)
      expect(json['details']['to']).to eq(sup.global_id)
    end

    it "should add a notification to the supervisor's feed" do
      token_user
      sup = User.create
      User.link_supervisor_to_user(sup, @user)
      utterance = Utterance.create(:user => @user, :data => {'sentence' => 'bacon free piglet'})
      post :share, params: {:utterance_id => utterance.global_id, :supervisor_id => sup.global_id}
      json = JSON.parse(response.body)
      expect(json['shared']).to eq(true)
      Worker.process_queues
      Worker.process_queues
      sup.reload
      expect(sup.settings['user_notifications']).to_not eq(nil)
      expect(sup.settings['user_notifications'].length).to eq(1)
      expect(sup.settings['user_notifications'][0]['text']).to eq('bacon free piglet')
      expect(sup.settings['user_notifications'][0]['sharer_user_name']).to eq(@user.user_name)
    end
    
    it "should return error on error" do
      token_user
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :supervisor_id => 1234}
      assert_error('utterance share failed')
    end

    it 'should return not authorized for non-premium accounts' do
      token_user
      @user.expires_at = 6.months.ago
      @user.save
      expect(@user.any_premium_or_grace_period?).to eq(false)
      utterance = Utterance.create(:user => @user)
      post :share, params: {:utterance_id => utterance.global_id, :email => 'bob@example.com'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['shared']).to eq(true)

      post :share, params: {:utterance_id => utterance.global_id, :user_id => @user.global_id}
      assert_unauthorized
    end

    env_wrap({
      'SMS_ORIGINATORS' => "+15558675309,+79876543,+15551234567,+3719875278,+9416751",
      'SMS_ENCRYPTION_KEY' => "abcdefg"
    }) do
      it 'should mention the right sender in the text' do
        token_user
        @user.process({'offline_actions' => [{'action' => 'add_contact', 'value' => {'contact' => '12345', 'name' => 'Dad'}}]})
        hash = @user.settings['contacts'][0]['hash']
        contact_code = "#{@user.global_id}x#{hash}"
        utterance = Utterance.create(user: @user, data: {'sentence' => 'howdy'})
        post :share, params: {utterance_id: utterance.global_id, user_id: contact_code, sharer_id: @user.global_id}
        json = assert_success_json
        expect(json['shared']).to eq(true)
        expect(Worker.scheduled_for?(:priority, Utterance, :perform_action, {'id' => utterance.id, 'method' => 'deliver_to', 'arguments' => [{
          'user_id' => contact_code,
          'sharer_id' => @user.global_id,
          'share_index' => 0,
          'text_only' => nil
        }]})).to eq(true)
        expect(Pusher).to receive(:sms).with("12345", "from #{@user.settings['name']} - howdy\n\nreply: #{JsonApi::Json.current_host}/u/#{utterance.reply_nonce}A", '+15551234567').and_return(true)
        Worker.process_queues
        Worker.process_queues
      end
    end
  end
  
  
  describe "GET show" do
    it "should not require api token" do
      user = User.create
      u = Utterance.create(:user => user, :data => {:button_list => [{label: 'ok'}], :sentence => 'ok'})
      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
    end
    
    it "should error gracefully if not found" do
      get :show, params: {:id => "abc"}
      assert_not_found('abc')
    end
    
    it "should return a json response" do
      user = User.create
      u = Utterance.create(:user => user, :data => {:button_list => [{label: 'ok'}], :sentence => 'ok'})
      get :show, params: {:id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['utterance']['id']).not_to eq(nil)
      expect(json['utterance']['link']).not_to eq(nil)
      expect(json['utterance']['button_list']).not_to eq(nil)
      expect(json['utterance']['sentence']).not_to eq(nil)
      expect(json['utterance']['image_url']).not_to eq(nil)
      expect(json['utterance']['user']).to eq(nil)
      expect(json['utterance']['permissions']).to eq(nil)
    end

    it "should return additional information if a reply_code is set" do
      token_user
      user = User.create
      d = Device.create(user: user)
      u = Utterance.create(:user => user, :data => {:button_list => [{label: 'ok'}], :sentence => 'ok'})
      u.share_with({'user_id' => user.global_id}, user)

      get :show, params: {:id => "#{u.global_id}x#{u.reply_nonce}A"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['utterance']['permissions']['reply']).to eq(true)
      expect(json['utterance']['reply_code']).to eq("#{u.reply_nonce}A")
      expect(json['utterance']['id']).to eq("#{u.global_id}x#{u.reply_nonce}A")
    end

    it "should not allow viewing private_only utterance without a reply_code" do
      token_user
      user = User.create
      d = Device.create(user: user)
      u = Utterance.create(:user => user, :data => {:private_only => true, :button_list => [{label: 'ok'}], :sentence => 'ok'})
      u.share_with({'user_id' => user.global_id}, user)
      get :show, params: {:id => u.global_id}
      assert_unauthorized
      
      get :show, params: {:id => "#{u.global_id}x#{u.reply_nonce}A"}
      json = assert_success_json
    end
  end
end
