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
end
