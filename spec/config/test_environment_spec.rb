require 'spec_helper'

# The committed .env.op.template holds unresolved 1Password references (`op://...`). In tests they
# must not count as configured values: a "configured?" check that passes on one sends the request to
# the real service (S3, OpenSymbols, Bedrock, ...) with a placeholder credential.
describe 'test environment settings' do
  it 'holds no unresolved 1Password references' do
    leftovers = ENV.select { |_key, value| value.to_s.start_with?('op://') }.keys.sort
    expect(leftovers).to eq([])
  end

  it 'still has every value the app requires at boot' do
    %w[DEFAULT_EMAIL_FROM SYSTEM_ERROR_EMAIL SECURE_NONCE_KEY].each do |key|
      expect(ENV[key]).to be_present, "#{key} is missing"
    end
  end

  # Outside rspec (a `rails` command in the test environment), dotenv's Rails hook loads
  # .env.test.local, .env.test and .env during `before_configuration`
  # (dotenv-3.1.8 lib/dotenv/rails.rb:107), which runs when config/application.rb defines the
  # Application class. A reference it adds there must still be dropped. The subprocess only loads
  # config/application.rb: no initializers, no database.
  it 'drops a 1Password reference that dotenv\'s Rails hook adds at boot' do
    require 'open3'
    require 'tempfile'
    Tempfile.create(['spec-probe', '.env']) do |file|
      # SPEC_PLAIN shows the hook really read this file; without it a nil SPEC_PROBE proves nothing.
      file.write("SPEC_PLAIN=plain\nSPEC_PROBE=op://vault/item/field\n")
      file.flush
      script = <<~RUBY
        require 'bundler/setup'
        require 'rails'
        require 'dotenv'
        require 'dotenv/rails'
        Dotenv::Rails.files = [#{file.path.inspect}]
        require #{Rails.root.join('config', 'application').to_s.inspect}
        print [ENV['SPEC_PLAIN'], ENV['SPEC_PROBE']].inspect
      RUBY
      env = { 'RAILS_ENV' => 'test', 'SPEC_PLAIN' => nil, 'SPEC_PROBE' => nil }
      Open3.popen3(env, RbConfig.ruby, '-e', script, chdir: Rails.root.to_s) do |stdin, stdout, stderr, wait|
        stdin.close
        out = Thread.new { stdout.read }
        err = Thread.new { stderr.read }
        unless wait.join(60)
          Process.kill('KILL', wait.pid)
          wait.join
          raise 'booting config/application.rb took longer than 60 seconds'
        end
        expect(wait.value).to be_success, err.value
        expect(out.value).to eq('["plain", nil]')
      end
    end
  end
end
