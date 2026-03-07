require 'spec_helper'

describe ApiCall, :type => :model do
  it "should not error on insufficient data" do
    expect { ApiCall.log(nil, nil, nil, nil, nil) }.not_to raise_error
    req = OpenStruct.new
    expect { ApiCall.log(nil, nil, req, nil, nil) }.not_to raise_error
    c = ApiCall.last
    expect(c).to eq(nil)
  end
  
  it "should generate a log entry for the api call" do
    req = OpenStruct.new({
      :path => "/api/v1/bacon",
      :method => "post", 
      :url => "http://www.example.com/api/v1/bacon"
    })
    expect(req).to receive(:method).and_return('post')
    u = User.create
    res = OpenStruct.new({
      :code => '1234'
    })
    expect(ApiCall.log('asdf', u, req, res, 1.351)).to eq(true)
    c = ApiCall.last
    expect(c).not_to eq(nil)
    expect(c.user_id).to eq(u.id)
    expect(c.data).to eq({
      'url' => 'http://www.example.com/api/v1/bacon',
      'method' => 'post',
      'access_token_prefix' => 'asdf'[0..7],
      'access_token_hash' => Digest::SHA256.hexdigest('asdf'),
      'status' => '1234',
      'time' => 1.351
    })
  end
  
  it "should not generate a log entry for non-api calls" do
    req = OpenStruct.new({
      :path => "/bacon",
      :method => "post", 
      :url => "http://www.example.com/api/v1/bacon"
    })
    u = User.create
    res = OpenStruct.new({
      :code => '1234'
    })
    expect(ApiCall.log('asdf', u, req, res, 1.351)).to eq(false)
    c = ApiCall.last
    expect(c).to eq(nil)
  end
  
  it "should not generate a log entry for non-authenticated calls" do
    req = OpenStruct.new({
      :path => "/api/v1/bacon",
      :method => "post", 
      :url => "http://www.example.com/api/v1/bacon"
    })
    u = User.create
    res = OpenStruct.new({
      :code => '1234'
    })
    expect(ApiCall.log(nil, u, req, res, 1.351)).to eq(false)
    c = ApiCall.last
    expect(c).to eq(nil)

    expect(ApiCall.log('asdf', nil, req, res, 1.351)).to eq(false)
    c = ApiCall.last
    expect(c).to eq(nil)
  end
end
