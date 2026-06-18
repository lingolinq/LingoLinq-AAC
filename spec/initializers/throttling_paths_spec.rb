require 'spec_helper'

# Unit-level guard on the rate-limit path classification. The feature spec in
# spec/features/throttling_spec.rb exercises the live 429 behavior end to end;
# this spec asserts which paths fall under the stricter PROTECTED_CUTOFF by
# matching Throttling::PROTECTED_RE directly, so each newly protected endpoint
# is locked in without booting Rack::Attack or hammering a real route.
describe Throttling do
  def protected?(path)
    !path.match(Throttling::PROTECTED_RE).nil?
  end

  describe 'PROTECTED_RE' do
    it 'still protects the pre-existing sensitive paths' do
      expect(protected?('/oauth2/token')).to eq(true)
      expect(protected?('/api/v1/forgot_password')).to eq(true)
      expect(protected?('/api/v1/users/1_2/rename')).to eq(true)
      expect(protected?('/api/v1/purchase_gift')).to eq(true)
    end

    it 'does not protect ordinary unguarded paths' do
      expect(protected?('/')).to eq(false)
      expect(protected?('/api/v1/users/1_2/stats/daily')).to eq(false)
      expect(protected?('/api/v1/boards/1_2/stats')).to eq(false)
    end

    # LL-ca38d4d99e: supervisor/parent consent decision endpoints.
    it 'protects the supervisor consent endpoints' do
      expect(protected?('/api/v1/supervisor_relationships/consent_response')).to eq(true)
      expect(protected?('/api/v1/supervisor_relationships/1_2/consent_response')).to eq(true)
      expect(protected?('/api/v1/supervisor_relationships/1_2/approve')).to eq(true)
      expect(protected?('/api/v1/supervisor_relationships/1_2/deny')).to eq(true)
    end

    # LL-e65d34f109: org bulk user-claim endpoint.
    it 'protects the organization claim_user endpoint' do
      expect(protected?('/api/v1/organizations/1_2/claim_user')).to eq(true)
    end

    # LL-56f0f19fca: registration, 2FA, and SAML assertion consumption.
    it 'protects registration, 2FA, and SAML consume endpoints' do
      expect(protected?('/api/v1/users')).to eq(true)
      expect(protected?('/api/v1/users.json')).to eq(true)
      expect(protected?('/api/v1/users/1_2/confirm_registration')).to eq(true)
      expect(protected?('/api/v1/users/1_2/2fa')).to eq(true)
      expect(protected?('/saml/consume')).to eq(true)
    end

    # Regression guard for the anchored 'api/v1/users' entry: protecting the
    # collection must NOT broaden the throttle to every per-user member route.
    it 'does not over-throttle ordinary per-user member endpoints' do
      expect(protected?('/api/v1/users/1_2')).to eq(false)
      expect(protected?('/api/v1/users/1_2/stats/daily')).to eq(false)
      expect(protected?('/api/v1/users/1_2/board_tags/ensure')).to eq(false)
    end
  end
end
