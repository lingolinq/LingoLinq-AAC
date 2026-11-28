require 'spec_helper'

describe "DELETE /api/v1/token", type: :request do
  let(:user) { User.create }
  let(:device) { Device.create(user: user, device_key: 'test browser') }
  let(:token) { device.generate_token!; device.tokens[0] }

  it "ends the token, so it no longer reaches the account" do
    headers = { 'Authorization' => "Bearer #{token}" }
    get '/api/v1/users/self', headers: headers
    expect(response).to be_successful

    delete '/api/v1/token', headers: headers
    expect(response).to be_successful
    expect(device.reload.settings['keys']).to eq([])

    get '/api/v1/users/self', headers: headers
    expect(response.status).to eq(400)
    expect(JSON.parse(response.body)['error']).to eq('Invalid token')
  end

  it "leaves the user's other devices signed in" do
    other = Device.create(user: user, device_key: 'communication tablet')
    other.generate_token!
    other_headers = { 'Authorization' => "Bearer #{other.tokens[0]}" }

    delete '/api/v1/token', headers: { 'Authorization' => "Bearer #{token}" }
    expect(response).to be_successful

    get '/api/v1/users/self', headers: other_headers
    expect(response).to be_successful
  end

  it "leaves other sessions on the same device row signed in" do
    first = token
    device.generate_token!
    second = device.reload.tokens[0]
    expect(second).not_to eq(first)

    delete '/api/v1/token', headers: { 'Authorization' => "Bearer #{first}" }
    expect(response).to be_successful

    get '/api/v1/users/self', headers: { 'Authorization' => "Bearer #{second}" }
    expect(response).to be_successful
    get '/api/v1/users/self', headers: { 'Authorization' => "Bearer #{first}" }
    expect(response.status).to eq(400)
  end

  it "refuses a revoked token even if a request in flight caches it again" do
    headers = { 'Authorization' => "Bearer #{token}" }
    get '/api/v1/users/self', headers: headers
    cached = RedisInit.permissions.get("user_token/#{token}")
    expect(cached).not_to eq(nil)

    delete '/api/v1/token', headers: headers
    RedisInit.permissions.setex("user_token/#{token}", 60, cached)

    get '/api/v1/users/self', headers: headers
    expect(response.status).to eq(400)
  end

  it "refuses a revoked token even if a stale save restores its key" do
    headers = { 'Authorization' => "Bearer #{token}" }
    keys = device.reload.settings['keys'].dup
    delete '/api/v1/token', headers: headers
    RedisInit.permissions.del("user_token/#{token}")
    device.reload
    device.settings['keys'] = keys
    device.save

    get '/api/v1/users/self', headers: headers
    expect(response.status).to eq(400)
  end

  it "keeps an active session's cached check alive without being able to recreate it" do
    headers = { 'Authorization' => "Bearer #{token}" }
    get '/api/v1/users/self', headers: headers
    RedisInit.permissions.expire("user_token/#{token}", 100)
    expect(Permissions).not_to receive(:setex).with(anything, "user_token/#{token}", anything, anything)

    get '/api/v1/users/self', headers: headers

    expect(response).to be_successful
    expect(RedisInit.permissions.ttl("user_token/#{token}")).to be > 1000
  end

  it "keeps the marker at least as long as a cached check can last" do
    short = Device.create(user: user, device_key: 'temporary', settings: { 'temporary_device' => true })
    short.generate_token!
    temporary_token = short.tokens[0]
    short.revoke_token!(temporary_token)
    expect(RedisInit.permissions.ttl("revoked_token/#{temporary_token}")).to be > 12.hours.to_i
  end

  it "reports a revoked token as invalid at token_check" do
    headers = { 'Authorization' => "Bearer #{token}" }
    delete '/api/v1/token', headers: headers

    get '/api/v1/token_check', headers: headers
    expect(JSON.parse(response.body)['authenticated']).to eq(false)
  end

  it "still ends the token when the marker cannot be written" do
    allow(Permissions).to receive(:setex).and_call_original
    allow(Permissions).to receive(:setex).with(anything, "revoked_token/#{token}", anything, anything).and_return(nil)
    expect(Rails.logger).to receive(:warn).with(/no marker written/).at_least(:once)
    allow(Rails.logger).to receive(:warn)

    delete '/api/v1/token', headers: { 'Authorization' => "Bearer #{token}" }

    expect(response).to be_successful
    expect(device.reload.settings['keys']).to eq([])
  end

  it "logout! also ends a token that has a cached check" do
    headers = { 'Authorization' => "Bearer #{token}" }
    get '/api/v1/users/self', headers: headers
    expect(RedisInit.permissions.get("user_token/#{token}")).not_to eq(nil)

    device.reload.logout!

    expect(RedisInit.permissions.get("user_token/#{token}")).to eq(nil)
    get '/api/v1/users/self', headers: headers
    expect(response.status).to eq(400)
  end

  it "requires a token" do
    delete '/api/v1/token'
    expect(response.status).to eq(400)
    expect(JSON.parse(response.body)['error']).to match(/Access token required/)
  end
end
