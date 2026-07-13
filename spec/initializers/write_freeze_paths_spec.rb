require 'spec_helper'

# Unit-level guard on the cutover write-freeze classification. The feature spec
# in spec/features/write_freeze_spec.rb exercises the live 503 behavior end to
# end; this spec locks in WHICH method/path combinations are rejected vs allowed
# by calling WriteFreeze directly, without booting the Rack stack. See
# scripts/gcp/PHASE5-CUTOVER-RUNBOOK.md step 1.
describe WriteFreeze do
  describe '.enabled?' do
    it 'is false when WRITE_FREEZE is unset (default, normal operation)' do
      expect(ENV).to receive(:[]).with('WRITE_FREEZE').and_return(nil)
      expect(WriteFreeze.enabled?).to eq(false)
    end

    it 'is true for truthy on-values and false otherwise' do
      %w[1 true yes on TRUE On YES].each do |val|
        allow(ENV).to receive(:[]).with('WRITE_FREEZE').and_return(val)
        expect(WriteFreeze.enabled?).to eq(true), "expected #{val.inspect} to enable"
      end
      ['0', 'false', 'off', 'no', '', '  '].each do |val|
        allow(ENV).to receive(:[]).with('WRITE_FREEZE').and_return(val)
        expect(WriteFreeze.enabled?).to eq(false), "expected #{val.inspect} to NOT enable"
      end
    end
  end

  describe '.mutating?' do
    it 'treats POST/PUT/PATCH/DELETE as mutating (case-insensitive)' do
      %w[POST PUT PATCH DELETE post put patch delete].each do |m|
        expect(WriteFreeze.mutating?(m)).to eq(true), "#{m} should be mutating"
      end
    end

    it 'treats GET/HEAD/OPTIONS as non-mutating' do
      %w[GET HEAD OPTIONS get head options].each do |m|
        expect(WriteFreeze.mutating?(m)).to eq(false), "#{m} should not be mutating"
      end
    end
  end

  describe '.allowlisted?' do
    it 'allowlists the auth/session routes that must stay writable' do
      expect(WriteFreeze.allowlisted?('/token')).to eq(true)
      expect(WriteFreeze.allowlisted?('/wait/token')).to eq(true)
      expect(WriteFreeze.allowlisted?('/oauth2/token')).to eq(true)
      expect(WriteFreeze.allowlisted?('/oauth2/token/login')).to eq(true)
      expect(WriteFreeze.allowlisted?('/api/v1/token/refresh')).to eq(true)
      expect(WriteFreeze.allowlisted?('/api/v1/auth/admin')).to eq(true)
      expect(WriteFreeze.allowlisted?('/auth/lookup')).to eq(true)
      expect(WriteFreeze.allowlisted?('/auth/google/link')).to eq(true)
      expect(WriteFreeze.allowlisted?('/saml/tmp_token')).to eq(true)
      expect(WriteFreeze.allowlisted?('/saml/consume')).to eq(true)
    end

    it 'does NOT allowlist new-account-creation, data-write, or password-reset paths' do
      # new-account creation must NOT write to the abandoned DB during the soak
      expect(WriteFreeze.allowlisted?('/auth/google/signup')).to eq(false)
      expect(WriteFreeze.allowlisted?('/api/v1/boards/1_2')).to eq(false)
      expect(WriteFreeze.allowlisted?('/api/v1/logs')).to eq(false)
      expect(WriteFreeze.allowlisted?('/api/v1/users/1_2')).to eq(false)
      expect(WriteFreeze.allowlisted?('/api/v1/forgot_password')).to eq(false)
      expect(WriteFreeze.allowlisted?('/api/v1/users/1_2/password_reset')).to eq(false)
      expect(WriteFreeze.allowlisted?('/api/v1/images')).to eq(false)
    end
  end

  describe '.side_effect_get?' do
    it 'flags GET routes that mutate state despite being GET' do
      expect(WriteFreeze.side_effect_get?('/api/v1/images/1_2/upload_success')).to eq(true)
      expect(WriteFreeze.side_effect_get?('/api/v1/sounds/1_2/upload_success')).to eq(true)
      expect(WriteFreeze.side_effect_get?('/api/v1/videos/1_2/upload_success')).to eq(true)
      expect(WriteFreeze.side_effect_get?('/goal_status/1_2/abc')).to eq(true)
      expect(WriteFreeze.side_effect_get?('/parental_consent/complete')).to eq(true)
      expect(WriteFreeze.side_effect_get?('/parental_consent/revoke')).to eq(true)
    end

    it 'does not flag ordinary read GETs' do
      expect(WriteFreeze.side_effect_get?('/api/v1/boards/1_2')).to eq(false)
      expect(WriteFreeze.side_effect_get?('/api/v1/status/heartbeat')).to eq(false)
      expect(WriteFreeze.side_effect_get?('/')).to eq(false)
    end
  end

  describe '.reject?' do
    context 'when the freeze is OFF (default)' do
      before { allow(WriteFreeze).to receive(:enabled?).and_return(false) }

      it 'passes every verb on every path (zero behavior change)' do
        expect(WriteFreeze.reject?('POST', '/api/v1/boards')).to eq(false)
        expect(WriteFreeze.reject?('DELETE', '/api/v1/boards/1_2')).to eq(false)
        expect(WriteFreeze.reject?('GET', '/api/v1/boards/1_2')).to eq(false)
      end
    end

    context 'when the freeze is ON' do
      before { allow(WriteFreeze).to receive(:enabled?).and_return(true) }

      it 'passes reads (GET/HEAD/OPTIONS) on any path' do
        expect(WriteFreeze.reject?('GET', '/api/v1/boards/1_2')).to eq(false)
        expect(WriteFreeze.reject?('HEAD', '/api/v1/boards/1_2')).to eq(false)
        expect(WriteFreeze.reject?('OPTIONS', '/api/v1/boards/1_2')).to eq(false)
      end

      it 'rejects data-mutating requests' do
        expect(WriteFreeze.reject?('POST', '/api/v1/boards')).to eq(true)
        expect(WriteFreeze.reject?('PUT', '/api/v1/boards/1_2')).to eq(true)
        expect(WriteFreeze.reject?('PATCH', '/api/v1/users/1_2')).to eq(true)
        expect(WriteFreeze.reject?('DELETE', '/api/v1/boards/1_2')).to eq(true)
        expect(WriteFreeze.reject?('POST', '/api/v1/log_sessions')).to eq(true)
      end

      it 'still allows mutating auth/session requests for existing users' do
        expect(WriteFreeze.reject?('POST', '/token')).to eq(false)
        expect(WriteFreeze.reject?('POST', '/oauth2/token')).to eq(false)
        expect(WriteFreeze.reject?('POST', '/api/v1/token/refresh')).to eq(false)
        expect(WriteFreeze.reject?('DELETE', '/oauth2/token')).to eq(false)
        expect(WriteFreeze.reject?('POST', '/saml/consume')).to eq(false)
        expect(WriteFreeze.reject?('POST', '/auth/google/link')).to eq(false)
      end

      it 'rejects new-account creation (no new user persisted to the abandoned DB)' do
        expect(WriteFreeze.reject?('POST', '/auth/google/signup')).to eq(true)
      end

      it 'rejects side-effect GETs (writes that bypass a verb-only denylist)' do
        expect(WriteFreeze.reject?('GET', '/api/v1/images/1_2/upload_success')).to eq(true)
        expect(WriteFreeze.reject?('GET', '/api/v1/sounds/1_2/upload_success')).to eq(true)
        expect(WriteFreeze.reject?('GET', '/api/v1/videos/1_2/upload_success')).to eq(true)
        expect(WriteFreeze.reject?('GET', '/goal_status/1_2/abc')).to eq(true)
        expect(WriteFreeze.reject?('GET', '/parental_consent/complete')).to eq(true)
        expect(WriteFreeze.reject?('GET', '/parental_consent/revoke')).to eq(true)
      end

      it 'still passes ordinary read GETs' do
        expect(WriteFreeze.reject?('GET', '/api/v1/boards/1_2')).to eq(false)
        expect(WriteFreeze.reject?('GET', '/api/v1/users/1_2/stats/daily')).to eq(false)
      end
    end
  end
end
