require 'spec_helper'

describe ForwardedHostFilter do
  let(:seen) { {} }
  let(:app) { lambda { |env| seen.replace(env); [200, {}, ['ok']] } }

  it "should drop a client-supplied X-Forwarded-Host" do
    ForwardedHostFilter.new(app).call('HTTP_HOST' => 'app.lingolinq.com', 'HTTP_X_FORWARDED_HOST' => 'attacker.example')
    expect(seen.key?('HTTP_X_FORWARDED_HOST')).to eq(false)
    expect(seen['HTTP_HOST']).to eq('app.lingolinq.com')
  end

  it "should leave a request without the header untouched" do
    ForwardedHostFilter.new(app).call('HTTP_HOST' => 'app.lingolinq.com')
    expect(seen).to eq('HTTP_HOST' => 'app.lingolinq.com')
  end

  it "should be registered first, unconditionally, in the production config" do
    # Parsed rather than matched as text, so a commented-out or conditional
    # registration fails. `rails middleware` under RAILS_ENV=production lists it.
    tree = Prism.parse(File.read(Rails.root.join('config', 'environments', 'production.rb'))).value
    configure = tree.statements.body.find { |n| n.is_a?(Prism::CallNode) && n.name == :configure }
    registrations = configure.block.body.body.select do |n|
      n.is_a?(Prism::CallNode) && n.name == :insert_before && n.receiver&.slice == 'config.middleware'
    end
    expect(registrations.map { |n| n.arguments.arguments.map(&:slice) }).to include(['0', 'ForwardedHostFilter'])
  end
end
