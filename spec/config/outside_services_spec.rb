require 'spec_helper'

# The shared default answers in spec/support/outside_services.rb (kept out of spec/support because
# spec_helper.rb requires every file there). Each default covers only the methods app code sends to
# that host, so a spec that starts writing to it (a PUT or DELETE) fails with the URL it tried
# instead of quietly getting the default answer.
describe 'default answers for outside services' do
  it 'refuses a PUT to S3' do
    expect {
      Typhoeus.put('https://lingolinq-uploads.s3.us-west-2.amazonaws.com/spec/object.png', body: 'x')
    }.to raise_error(WebMock::NetConnectNotAllowedError)
  end

  it 'refuses a DELETE to S3' do
    expect {
      Typhoeus.delete('https://s3.amazonaws.com/coughdrop-usercontent/images/spec.png')
    }.to raise_error(WebMock::NetConnectNotAllowedError)
  end

  it 'refuses a PUT to example.com' do
    expect {
      Typhoeus.put('https://example.com/spec/object.png', body: 'x')
    }.to raise_error(WebMock::NetConnectNotAllowedError)
  end

  it 'answers a GET or HEAD to S3 with Access Denied' do
    url = 'https://s3.amazonaws.com/coughdrop-usercontent/images/spec.png'
    expect(Typhoeus.get(url).code).to eq(403)
    expect(Typhoeus.head(url).code).to eq(403)
  end

  it 'answers a GET or HEAD to example.com with not found and a POST with not allowed' do
    expect(Typhoeus.get('https://example.com/pic.png').code).to eq(404)
    expect(Typhoeus.head('http://www.example.com/pic.png').code).to eq(404)
    expect(Typhoeus.post('https://example.com/', body: {a: 1}).code).to eq(405)
  end
end

# SafeHttp resolves a hostname (Addrinfo.getaddrinfo, lib/safe_http.rb:67) before WebMock sees the
# request. The default resolver in spec/support/outside_services.rb answers public hostnames with a
# documentation address instead of asking real DNS, and leaves local names to the real resolver.
describe 'default hostname resolution' do
  def resolved_ips(host)
    Addrinfo.getaddrinfo(host, nil, Socket::AF_UNSPEC, Socket::SOCK_STREAM).map(&:ip_address)
  end

  it 'answers a public hostname without real DNS' do
    # .invalid never resolves for real (RFC 6761), so only the default answer can come back
    expect(resolved_ips('lingolinq-spec.invalid')).to eq(['203.0.113.10'])
    expect(resolved_ips('www.example.com')).to eq(['203.0.113.10'])
  end

  it 'leaves localhost and IP literals to the real resolver' do
    expect(resolved_ips('localhost')).to all(satisfy { |ip| IPAddr.new(ip).loopback? })
    expect(resolved_ips('127.0.0.1')).to eq(['127.0.0.1'])
  end

  it 'lets SafeHttp reach the WebMock default for a public hostname' do
    expect(SafeHttp.get('https://www.example.com/pic.png').code).to eq(404)
  end
end
