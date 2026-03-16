require 'spec_helper'

describe JsonApi::Utterance do
  it "should have defined pagination defaults" do
    expect(JsonApi::Utterance::TYPE_KEY).to eq('utterance')
    expect(JsonApi::Utterance::DEFAULT_PAGE).to eq(10)
    expect(JsonApi::Utterance::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should not include unlisted settings" do
      user = User.create
      u = Utterance.create(:user => user, :data => {'asdf' => '1234'})
      expect(JsonApi::Utterance.build_json(u).keys).not_to be_include('asdf')
    end
    
    it "should include appropriate attributes" do
      user = User.create
      u = Utterance.create(:user => user)
      ['id', 'link', 'button_list', 'sentence', 'image_url'].each do |key|
        expect(JsonApi::Utterance.build_json(u).keys).to be_include(key)
      end
    end
  end
end
