require 'spec_helper'

describe Api::MessagesController, :type => :controller do
  describe "create" do
    it "should require an api token if authenticate requests not allowed" do
      orig = ENV['ALLOW_UNAUTHENTICATED_TICKETS']
      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = nil
      
      post :create, params: {}
      expect(response.successful?).to eq(false)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('API token required')

      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = orig
    end
    
    it "should not require api token if authenticated requests allowed" do
      orig = ENV['ALLOW_UNAUTHENTICATED_TICKETS']
      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = 'true'

      post :create, params: {}
      expect(response.successful?).to eq(false)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('message creation failed')

      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = orig
    end
    
    it "should create a message" do
      orig = ENV['ALLOW_UNAUTHENTICATED_TICKETS']
      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = 'true'
      post :create, params: {:message => {'name' => 'fred'}}
      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = orig
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['received']).to eq(true)
      m = ContactMessage.find_by_global_id(json['id'])
      expect(m).not_to eq(nil)
      expect(m.settings['name']).to eq('fred')
    end
    
    it "should schedule a delivery for the created message" do
      orig = ENV['ALLOW_UNAUTHENTICATED_TICKETS']
      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = 'true'
      expect(AdminMailer).to receive(:schedule_delivery).with(:message_sent, /\d+_\d+/).and_return(true)
      post :create, params: {:message => {'name' => 'fred'}}
      ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = orig
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['received']).to eq(true)
    end
    
    it "should not schedule a message delivery for a remote message" do
      orig_zendesk = ENV['ZENDESK_DOMAIN']
      orig_tickets = ENV['ALLOW_UNAUTHENTICATED_TICKETS']
      begin
        ENV['ZENDESK_DOMAIN'] = 'asdf'
        ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = 'true'
        expect(AdminMailer).not_to receive(:schedule_delivery)
        post :create, params: {:message => {'name' => 'fred', 'recipient' => 'support', 'email' => 'bob@asdf.com'}}
        expect(response.successful?).to eq(true)
        json = JSON.parse(response.body)
        expect(json['received']).to eq(true)
        m = ContactMessage.last
        expect(Worker.scheduled?(ContactMessage, :perform_action, {'id' => m.id, 'method' => 'deliver_remotely', 'arguments' => []})).to eq(true)
      ensure
        ENV['ZENDESK_DOMAIN'] = orig_zendesk
        ENV['ALLOW_UNAUTHENTICATED_TICKETS'] = orig_tickets
      end
    end
  end
end
