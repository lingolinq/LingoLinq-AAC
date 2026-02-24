require 'spec_helper'

describe Webhook, :type => :model do
  describe "register" do
    it "should register the webhook" do
      u = User.create
      expect(Webhook.count).to eq(0)
      Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      expect(Webhook.count).to eq(1)
    end
    
    it "should register an internal webhook" do
      u = User.create
      expect(Webhook.count).to eq(0)
      expect(Webhook.register(u, u, {:callback => 'push_notification', :notification_type => 'swinging'})).to eq(nil)
      expect(Webhook.count).to eq(0)
      Webhook.register_internal(u, u, {:callback => 'push_notification', :notification_type => 'swinging'})
      expect(Webhook.count).to eq(1)
    end
    
    it "should return a token" do
      u = User.create
      expect(Webhook.count).to eq(0)
      t = Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      expect(t).not_to eq(nil)
      expect(t).to be_is_a(String)
      expect(Webhook.count).to eq(1)
    end
    
    it "should log repeat registrations only once" do
      u = User.create
      expect(Webhook.count).to eq(0)
      t = Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      t2 = Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      t3 = Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      expect(t).not_to eq(nil)
      expect(t).to be_is_a(String)
      expect(t).to eq(t2)
      expect(t).to eq(t3)
      expect(Webhook.count).to eq(1)
      h = Webhook.last
      expect(h.settings['notifications']['swinging'].length).to eq(1)
      expect(h.settings['callback_token']).to eq(t)
      expect(h.settings['notifications']['swinging'][0]['callback']).to eq("http://www.example.com/ping")
    end
  end
  
  describe "notify_all" do
    it "should find all associated webhooks and call notify" do
      hook1 = {id: '1234'}
      hook2 = {id: '2345'}
      expect(hook1).to receive(:notify).with('bacon', nil, nil).and_return([])
      expect(hook2).to receive(:notify).with('bacon', nil, nil).and_return([])
      expect(Webhook).to receive(:where).with(:record_code => 'OpenStruct:abcdefg').and_return([hook1, hook2])
      expect(OpenStruct).to receive(:find_by).with(:id => 'abcdefg').and_return(nil)
      r = OpenStruct.new(:id => "abcdefg")
      expect(Webhook.get_record_code(r)).to eq('OpenStruct:abcdefg')
      Webhook.notify_all(r, 'bacon')
      expect(Worker.scheduled?(Webhook, 'perform_action', {'method' => 'notify_all_with_code', 'arguments' => ['OpenStruct:abcdefg', 'bacon', nil]})).to eq(true)
      Worker.process_queues
    end
    
    it "should find default internal callbacks and trigger them" do
      r = OpenStruct.new(:id => "abcdefg")
      listener1 = OpenStruct.new(:id => 'qwer')
      listener2 = OpenStruct.new(:id => 'asdf')
      
      expect(OpenStruct).to receive(:find_by).with(:id => 'abcdefg').and_return(r)
      expect(r).to receive(:default_listeners).with('chicken').and_return(['OpenStruct:qwer', 'OpenStruct:asdf'])
      expect(OpenStruct).to receive(:find_by).with(:id => 'qwer').and_return(listener1)
      expect(OpenStruct).to receive(:find_by).with(:id => 'asdf').and_return(listener2)
      expect(listener1).to receive(:handle_notification).with('chicken', r, nil)
      expect(listener2).to receive(:handle_notification).with('chicken', r, nil)

      expect(Webhook.get_record_code(r)).to eq('OpenStruct:abcdefg')
      Webhook.notify_all(r, 'chicken')
      expect(Worker.scheduled?(Webhook, 'perform_action', {'method' => 'notify_all_with_code', 'arguments' => ['OpenStruct:abcdefg', 'chicken', nil]})).to eq(true)
      Worker.process_queues
    end
  end

  describe "notify_all_with_code" do
    it "should call handle_notification for all default listeners" do
      h = Webhook.new
      r = User.new
      a = User.new
      b = User.new
      c = User.new
      expect(Webhook).to receive(:find_record).with('r').and_return(r)
      expect(Webhook).to receive(:find_record).with('a').and_return(a)
      expect(Webhook).to receive(:find_record).with('b').and_return(b)
      expect(a).to receive(:handle_notification).with('bacon', r, {'a' => 1}).and_return true
      expect(b).to receive(:handle_notification).with('bacon', r, {'a' => 1}).and_return true
      expect(c).to_not receive(:handle_notification)
      expect(r).to receive(:default_listeners).with('bacon').and_return(['a', 'b'])
      res = Webhook.notify_all_with_code('r', 'bacon', {'a' => 1})
      expect(res).to eq([
        {'default' => true, 'code' => 'a'},
        {'default' => true, 'code' => 'b'}
      ])
    end
    
    it "should call handle_notification for all additional listeners" do
      h = Webhook.new
      r = User.new
      a = User.new
      b = User.new
      c = User.new
      expect(Webhook).to receive(:find_record).with('r').and_return(r)
      expect(Webhook).to receive(:find_record).with('a').and_return(a)
      expect(Webhook).to receive(:find_record).with('b').and_return(b)
      expect(a).to receive(:handle_notification).with('bacon', r, {'a' => 1}).and_return true
      expect(b).to receive(:handle_notification).with('bacon', r, {'a' => 1}).and_return true
      expect(c).to_not receive(:handle_notification)
      expect(r).to receive(:default_listeners).with('bacon').and_return([])
      expect(r).to receive(:additional_listeners).with('bacon', {'a' => 1}).and_return(['a', 'b'])
      res = Webhook.notify_all_with_code('r', 'bacon', {'a' => 1})
      expect(res).to eq([
        {'additional' => true, 'code' => 'a'},
        {'additional' => true, 'code' => 'b'}
      ])
    end
    
    it "should call notify for any external webhook listeners" do
      h = Webhook.new
      r = User.new
      w1 = Webhook.new
      w2 = Webhook.new
      expect(Webhook).to receive(:find_record).with('r').and_return(r)
      expect(w1).to receive(:notify).with('bacon', r, {'a' => 1}).and_return([{'ok' => true}])
      expect(w2).to receive(:notify).with('bacon', r, {'a' => 1}).and_return([{'ok' => false}])
      expect(Webhook).to receive(:for_record).with('bacon', 'r', r, {'a' => 1}).and_return([w1, w2])
      res = Webhook.notify_all_with_code('r', 'bacon', {'a' => 1})
      expect(res).to eq([
        {'ok' => true},
        {'ok' => false}
      ])
    end
  end
  
  describe "for_record" do
    it "should return default webhooks" do
      u = User.create
      h = Webhook.create(:record_code => 'asdf', :user => u)
      h2 = Webhook.create(:record_code => 'asdf2', :user => u)
      h3 = Webhook.create(:record_code => 'asdf', :user => u)
      res = Webhook.for_record('something', 'asdf', nil, {})
      expect(res.length).to eq(2)
      expect(res).to be_include(h)
      expect(res).to be_include(h3)
      expect(res).to_not be_include(h2)
    end
    
    it "should return any additional webhooks" do
      u = User.create
      h = Webhook.create(:record_code => 'asdf', :user => u)
      h2 = Webhook.create(:record_code => 'jkl', :user => u)
      h3 = Webhook.create(:record_code => 'wert', :user => u)
      r = User.new
      expect(r).to receive(:additional_webhook_record_codes).and_return(['jkl', 'jkl', 'wert'])
      res = Webhook.for_record('something', 'asdf', r, {})
      expect(res.length).to eq(3)
      expect(res).to be_include(h)
      expect(res).to be_include(h2)
      expect(res).to be_include(h3)
    end
  end
  
  describe "test_notification" do
    it "should trigger a test notification" do
      h = Webhook.new
      expect(h).to receive(:notify).with('test', h)
      h.test_notification
    end
  end
   
  describe "notify" do
    it "should post to external services for external callbacks" do
      u = User.create
      token = Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      w = Webhook.last
      expect(Typhoeus).to receive(:post){|url, args|
        expect(url).to eq('http://www.example.com/ping')
        expect(args[:body][:token]).to eq(token)
      }.and_return(OpenStruct.new(code: 200))
      res = w.notify('swinging', w, {})
      expect(res).to eq([{:url=>"http://www.example.com/ping", :response_code=>200, :response_body=>nil}])
    end
    
    it "should error on slow external responses" do
      u = User.create
      token = Webhook.register(u, u, {:callback => 'http://www.example.com/ping', :notification_type => 'swinging'})
      w = Webhook.last
      expect(Typhoeus).to receive(:post){|url, args|
        expect(url).to eq('http://www.example.com/ping')
        expect(args[:body][:token]).to eq(token)
        raise Timeout::Error.new('asdf')
      }.and_return(OpenStruct.new(code: 200))
      res = w.notify('swinging', w, {})
      expect(res).to eq([{:url=>"http://www.example.com/ping", :response_code=>0, :response_body=>"Timeout, request took more than 10 seconds"}])
    end

    it "should handle internal service callbacks as well" do
      u = User.create
      token = Webhook.register_internal(u, u, {:callback => 'push_notification', :notification_type => 'swinging'})
      w = Webhook.last
      expect(Typhoeus).not_to receive(:post)
      expect(w).to receive(:internal_notify).with('push_notification', 'swinging')
      res = w.notify('swinging', w, {})
      expect(res).to eq([{:internal=>true}])
    end

    it "should post information to all matching webhooks" do 
      u = User.create
      h = Webhook.create(:user => u)
      h.settings = {
        'notifications' => {
          '*' => [
            {'callback' => 'http://www.example.com/1'},
            {'callback' => 'http://www.example.com/2'}
          ],
          'bacon' => [
            {'callback' => 'http://www.example.com/3'}
          ],
          'friend' => [
            {'callback' => 'http://www.example.com/4'}
          ]
        },
        'callback_token' => 'abcdefg'
      }
      
      token = 'abcdefg'
      res = OpenStruct.new(code: 200, body: 'asdf')
      expect(Typhoeus).to receive(:post).with('http://www.example.com/1', body: {token: token, notification: 'friend', record: h.record_code}, timeout: 10).and_return(res)
      expect(Typhoeus).to receive(:post).with('http://www.example.com/2', body: {token: token, notification: 'friend', record: h.record_code}, timeout: 10).and_return(res)
      expect(Typhoeus).to receive(:post).with('http://www.example.com/4', body: {token: token, notification: 'friend', record: h.record_code}, timeout: 10).and_return(res)
      expect(Typhoeus).to_not receive(:post).with('http://www.example.com/3', body: {token: token, notification: 'friend', record: h.record_code}, timeout: 10)
      res = h.notify('friend', h, {})
      expect(res.length).to eq(3)
      expect(res[0]).to eq({:url => 'http://www.example.com/4', :response_code => 200, :response_body => 'asdf'})
      expect(res[1]).to eq({:url => 'http://www.example.com/1', :response_code => 200, :response_body => 'asdf'})
      expect(res[2]).to eq({:url => 'http://www.example.com/2', :response_code => 200, :response_body => 'asdf'})
      
      expect(h.settings['callback_attempts']).to_not eq(nil)
      expect(h.settings['callback_attempts'].length).to eq(3)
      expect(h.settings['callback_attempts'][0]['url']).to eq('http://www.example.com/4')
      expect(h.settings['callback_attempts'][0]['code']).to eq(200)
      expect(h.settings['callback_attempts'][1]['url']).to eq('http://www.example.com/1')
      expect(h.settings['callback_attempts'][1]['code']).to eq(200)
      expect(h.settings['callback_attempts'][2]['url']).to eq('http://www.example.com/2')
      expect(h.settings['callback_attempts'][2]['code']).to eq(200)
    end
    
    it "should include content if specified" do
      u = User.create
      h = Webhook.create(:user => u)
      h.settings = {
        'notifications' => {
          'bacon' => [
            {'callback' => 'http://www.example.com/3', 'include_content' => true}
          ],
          'friend' => [
            {'callback' => 'http://www.example.com/4'}
          ]
        },
        'callback_token' => 'abcdefg'
      }
      
      token = 'abcdefg'
      res = OpenStruct.new
      expect(Typhoeus).to receive(:post).with('http://www.example.com/3', body: {token: token, notification: 'bacon', record: h.record_code, content: h.webhook_content(nil, nil, nil)}, timeout: 10).and_return(res)
      h.notify('bacon', h, {})
    end

    it "should update parameterized url if available from the content" do
      u = User.create
      h = Webhook.create(:user => u)
      h.settings = {
        'notifications' => {
          'bacon' => [
            {'callback' => 'http://www.example.com/{code}/3', 'include_content' => true}
          ],
          'friend' => [
            {'callback' => 'http://www.example.com/4'}
          ]
        },
        'callback_token' => 'abcdefg'
      }
      json = {action: 'baconator'}.to_json
      expect(h).to receive(:webhook_content).with('bacon', nil, {}).and_return(json)
      
      token = 'abcdefg'
      res = OpenStruct.new
      expect(Typhoeus).to receive(:post).with('http://www.example.com/baconator/3', body: {token: token, notification: 'bacon', record: h.record_code, content: json}, timeout: 10).and_return(res)
      h.notify('bacon', h, {})
    end
    
    it "should include api_url if defined" do
      u = User.create
      h = Webhook.create(:user => u)
      h.settings = {
        'notifications' => {
          'friend' => [
            {'callback' => 'http://www.example.com/4'}
          ]
        },
        'callback_token' => 'abcdefg'
      }
      expect(h).to receive(:api_url).and_return("http://www.example.com/record/1")
      
      token = 'abcdefg'
      res = OpenStruct.new
      expect(Typhoeus).to receive(:post).with('http://www.example.com/4', body: {token: token, notification: 'friend', record: h.record_code, url: "http://www.example.com/record/1"}, timeout: 10).and_return(res)
      h.notify('friend', h, {})
    end
    
    it "should run all listeners for a test notification" do
      u = User.create
      h = Webhook.create(:user => u)
      h.settings = {
        'notifications' => {
          '*' => [
            {'callback' => 'http://www.example.com/1'},
            {'callback' => 'http://www.example.com/2'}
          ],
          'bacon' => [
            {'callback' => 'http://www.example.com/3', 'include_content' => true}
          ],
          'friend' => [
            {'callback' => 'http://www.example.com/4'}
          ]
        },
        'callback_token' => 'abcdefg'
      }
      
      token = 'abcdefg'
      res = OpenStruct.new
      expect(Typhoeus).to receive(:post).with('http://www.example.com/1', body: {token: token, notification: 'test', record: h.record_code}, timeout: 10).and_return(res)
      expect(Typhoeus).to receive(:post).with('http://www.example.com/2', body: {token: token, notification: 'test', record: h.record_code}, timeout: 10).and_return(res)
      expect(Typhoeus).to receive(:post).with('http://www.example.com/4', body: {token: token, notification: 'test', record: h.record_code}, timeout: 10).and_return(res)
      expect(Typhoeus).to receive(:post).with('http://www.example.com/3', body: {token: token, notification: 'test', record: h.record_code, content: h.webhook_content(nil, nil, nil)}, timeout: 10).and_return(res)
      h.notify('test', h, {})
    end
  end
  
  describe "process_params" do
    it "should require user record" do
      expect { Webhook.process_new({}, {}) }.to raise_error("user required")
    end
    
    it "should process settings" do
      u = User.create
      h = Webhook.process_new({'name' => 'webhooky'}, {'user' => u})
      expect(h).to_not eq(nil)
      expect(h.id).to_not eq(nil)
      expect(h.settings['name']).to eq('webhooky')
      expect(h.user).to eq(u)
    end
    
    it "should process webhooks" do
      u = User.create
      h = Webhook.process_new({
        'webhooks' => ['new_session', 'new_board'],
        'url' => 'http://www.example.com/callback',
        'include_content' => true,
        'webhook_type' => 'user'
      }, {'user' => u})
      expect(h).to_not eq(nil)
      expect(h.settings).to_not eq(nil)
      expect(h.settings['include_content']).to eq(true)
      expect(h.settings['url']).to eq('http://www.example.com/callback')
      expect(h.settings['webhook_type']).to eq('user')
      expect(h.settings['notifications']).to eq({
        'new_session' => [
          {'callback' => 'http://www.example.com/callback', 'include_content' => true, 'content_type' => nil}
        ]
      })
    end

    it "should allow for advance configurations" do
      u = User.create
      h = Webhook.process_new({
        'webhook_type' => 'user'
      }, {
        'user' => u,
        'notifications' => {
          '*' => {
            'callback' => 'http://www.example.com/1',
            'include_content' => true,
            'content_type' => 'asdf'
          },
          'bacon' => {
            'callback' => 'http://www.example.com/2',
            'include_content' => false
          },
          'new_session' => {
            'callback' => 'http://www.example.com/3'
          }
        }
        
      })
      expect(h.settings).to_not eq(nil)
      expect(h.settings['notifications']).to eq({
        '*' => [
          'callback' => 'http://www.example.com/1',
          'include_content' => true,
          'content_type' => 'asdf'
        ],
        'new_session' => [
          'callback' => 'http://www.example.com/3',
          'include_content' => nil,
          'content_type' => nil
        ]
      })
    end
    
    it "should sanitize fields" do
      u = User.create
      h = Webhook.process_new({'name' => '<b>webhooky</b><br/>'}, {'user' => u})
      expect(h).to_not eq(nil)
      expect(h.id).to_not eq(nil)
      expect(h.settings['name']).to eq('webhooky')
      expect(h.user).to eq(u)
    end
  end
  
  describe "generate_defaults" do
    it "should generate a callback token" do
      u = User.create
      h = Webhook.create(:user => u)
      expect(h.settings).to_not eq(nil)
      expect(h.settings['callback_token']).to_not eq(nil)
    end
  end
  
  describe "delete_user_integration" do
    it "should delete the user integration on destroy" do
      u = User.create
      ui = UserIntegration.create(:user => u)
      wh = Webhook.create(:user_integration => ui)
      expect(ui.id).to_not eq(nil)
      expect(wh.user_integration_id).to eq(ui.id)
      wh.destroy
      expect(UserIntegration.find_by(:id => ui.id)).to eq(nil)
    end
  end
end
