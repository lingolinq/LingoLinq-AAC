require 'spec_helper'

describe JsonApi::Webhook do
  let(:u) { User.create }
  it "should have defined pagination defaults" do
    expect(JsonApi::Webhook::TYPE_KEY).to eq('webhook')
    expect(JsonApi::Webhook::DEFAULT_PAGE).to eq(10)
    expect(JsonApi::Webhook::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should not include unlisted settings" do
      i = Webhook.create(:user => u)
      i.settings['hat'] = 'black'
      expect(JsonApi::Webhook.build_json(i).keys).to_not be_include('hat')
    end
    
    it "should return appropriate attributes" do
      i = Webhook.create(:user => u)
      i.settings['name'] = 'something'
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['id']).to eq(i.global_id)
      expect(hash['name']).to eq('something')
      expect(hash.keys).to_not be_include('url')
      expect(hash.keys).to be_include('webhook_type')
      expect(hash['webhooks']).to eq([])
    end
    
    it "should return configuration type" do
      i = Webhook.create(:user => u)
      i.settings['url'] = 'http://www.example.com/callback'
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['custom_configuration']).to eq(true)
      expect(hash['advanced_configuration']).to eq(false)
      i.settings['advanced_configuration'] = true
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['custom_configuration']).to eq(true)
      expect(hash['advanced_configuration']).to eq(true)
      i.settings['url'] = nil
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['custom_configuration']).to eq(false)
      expect(hash['advanced_configuration']).to eq(true)
    end
    
    it "should specify if it includes content" do
      i = Webhook.create(:user => u)
      i.settings['url'] = 'http://www.example.com/callback'
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['include_content']).to eq(false)
      i.settings['notifications'] = {}
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['include_content']).to eq(false)
      i.settings['notifications']['*'] = []
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['include_content']).to eq(false)
      i.settings['notifications']['*'] << {
        'callback' => 'http://www.example.com/callback'
      }
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['include_content']).to eq(false)
      i.settings['notifications']['*'] << {
        'callback' => 'http://www.example.com/callback2',
        'include_content' => true
      }
      hash = JsonApi::Webhook.build_json(i)
      expect(hash['include_content']).to eq(true)
    end
  end
end
