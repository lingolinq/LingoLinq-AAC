require 'spec_helper'

describe JsonApi::UserVersion do
  it "should have defined pagination defaults" do
    expect(JsonApi::UserVersion::TYPE_KEY).to eq('userversion')
    expect(JsonApi::UserVersion::DEFAULT_PAGE).to eq(25)
    expect(JsonApi::UserVersion::MAX_PAGE).to eq(50)
  end

  it "should have return correct attributes" do
    a = User.create
    PaperTrail.request.whodunnit = "user:#{a.global_id}"
    u = User.create
    v = PaperTrail::Version.last
    json = JsonApi::UserVersion.build_json(v)
    expect(json['id']).to eq(v.id)
    expect(json['action']).to eq('created')
    expect(json['created']).to eq(v.created_at.iso8601)
    expect(json['modifier']).to eq({
      'description' => a.user_name,
      'user_name' => a.user_name,
      'image' => a.generated_avatar_url
    })
  end

  it "should have return admin modifier" do
    a = User.create
    PaperTrail.request.whodunnit = 'admin:bob'
    u = User.create
    v = PaperTrail::Version.last
    json = JsonApi::UserVersion.build_json(v)
    expect(json['id']).to eq(v.id)
    expect(json['action']).to eq('created')
    expect(json['created']).to eq(v.created_at.iso8601)
    expect(json['modifier']).to eq({
      'description' => "LingoLinq Admin",
      'image' => "https://www.mylingolinq.com/images/logo-new.png"
    })
  end

  it "should have fallback modifier" do
    a = User.create
    PaperTrail.request.whodunnit = 'something'
    u = User.create
    v = PaperTrail::Version.last
    json = JsonApi::UserVersion.build_json(v)
    expect(json['id']).to eq(v.id)
    expect(json['action']).to eq('created')
    expect(json['created']).to eq(v.created_at.iso8601)
    expect(json['modifier']).to eq({
      'description' => 'Unknown User',
      'image' => "https://#{ENV['STATIC_S3_BUCKET'] || "lingolinq"}.s3.amazonaws.com/avatars/avatar-0.png"
    })
  end
end
