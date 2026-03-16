require 'spec_helper'

describe MetaRecord, :type => :model do
  it "should create a valid meta record for an utterance" do
    author = User.create
    u = Utterance.create(:user => author, :data => {
      :button_list => [{label: 'ok'}],
      :sentence => 'ok'
    })
    expect(u).to be_respond_to(:meta_record)
    r = u.meta_record
    expect(r).not_to eq(nil)
    expect(r.title).to eq("Someone said: \"ok\"")
    expect(r.summary).to eq("That sentence came from using a speech app, which makes is easier for some people to communicate. Visit the site to learn more.")
    expect(r.image).to eq("https://opensymbols.s3.amazonaws.com/libraries/noun-project/Person-08e6d794b0.svg")
    expect(r.large_image).to eq("https://opensymbols.s3.amazonaws.com/libraries/noun-project/Person-08e6d794b0.svg")
    expect(r.link).to eq("#{JsonApi::Json.current_host}/utterances/#{u.global_id}")
    expect(Time.parse(r.created)).to be_within(2.seconds).of(u.created_at)
    expect(Time.parse(r.updated)).to be_within(2.seconds).of(u.updated_at)
  end

  it "should create a valid meta record for a board" do
    u = User.create
    b = Board.create(:user => u)
    expect(b).to be_respond_to(:meta_record)
    r = b.meta_record
    expect(r).not_to eq(nil)
    expect(r.title).to eq("Unnamed Board")
    expect(r.summary).to eq("Communication board \"Unnamed Board\", 2 x 4")
    expect(r.image).to eq("https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png")
    expect(r.link).to eq("#{JsonApi::Json.current_host}/#{b.key}")
    expect(Time.parse(r.created)).to be_within(2.seconds).of(b.created_at)
    expect(Time.parse(r.updated)).to be_within(2.seconds).of(b.updated_at)
  end

  it "should create a valid meta record for a user" do
    u = User.create(:settings => {'public' => true, 'name' => 'Fred Jones', 'description' => 'I am a good ma'})
    expect(u).to be_respond_to(:meta_record)
    r = u.meta_record
    expect(r).not_to eq(nil)
    expect(r.title).to eq("Fred Jones")
    expect(r.summary).to eq("I am a good ma")
    expect(r.image).to match(/avatars\/avatar-/)
    expect(r.link).to eq("#{JsonApi::Json.current_host}/#{u.user_name}")
    expect(Time.parse(r.created)).to be_within(2.seconds).of(u.created_at)
    expect(Time.parse(r.updated)).to be_within(2.seconds).of(u.updated_at)
  end
end
