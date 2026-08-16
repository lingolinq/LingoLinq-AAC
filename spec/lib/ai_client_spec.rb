# frozen_string_literal: true

require 'spec_helper'

describe AiClient do
  def with_env(overrides)
    previous = {}
    keys = %w[
      BEDROCK_AWS_REGION BEDROCK_AWS_KEY BEDROCK_AWS_SECRET BEDROCK_PLANE
      AWS_REGION AWS_DEFAULT_REGION
      AWS_KEY AWS_SECRET
      AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
      BEDROCK_EXPECTED_AWS_ACCOUNT
      AWS_ENDPOINT_URL AWS_ENDPOINT_URL_STS
    ]
    keys.each do |key|
      previous[key] = ENV[key]
      ENV.delete(key)
    end
    overrides.each { |key, value| ENV[key] = value }
    yield
  ensure
    keys.each do |key|
      if previous[key].nil?
        ENV.delete(key)
      else
        ENV[key] = previous[key]
      end
    end
  end

  describe '.aws_credentials' do
    it 'selects the dedicated Bedrock pair only when both halves are present' do
      with_env(
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret',
        'AWS_ACCESS_KEY_ID' => 'sdk-key',
        'AWS_SECRET_ACCESS_KEY' => 'sdk-secret'
      ) do
        expect(described_class.aws_credentials).to eq(
          access_key: 'bedrock-key',
          secret_access_key: 'bedrock-secret'
        )
      end
    end

    it 'does not mix a dedicated key with a generic secret during partial rollout' do
      with_env(
        'BEDROCK_AWS_KEY' => 'bedrock-key-only',
        'AWS_SECRET' => 's3-ses-secret',
        'AWS_ACCESS_KEY_ID' => 'sdk-key',
        'AWS_SECRET_ACCESS_KEY' => 'sdk-secret'
      ) do
        expect(described_class.aws_credentials).to eq(
          access_key: 'sdk-key',
          secret_access_key: 'sdk-secret'
        )
        expect(described_class.aws_key).to eq('sdk-key')
        expect(described_class.aws_secret).to eq('sdk-secret')
      end
    end

    it 'does not treat Cloud Run AWS_KEY/AWS_SECRET as Bedrock-ready' do
      with_env(
        'AWS_REGION' => 'us-west-2',
        'AWS_KEY' => 'cloudrun-s3-key',
        'AWS_SECRET' => 'cloudrun-s3-secret'
      ) do
        expect(described_class.aws_credentials).to be_nil
        expect(described_class.configured?).to eq(false)
      end
    end

    it 'accepts a complete standard SDK credential pair for local use' do
      with_env(
        'AWS_REGION' => 'us-west-2',
        'AWS_ACCESS_KEY_ID' => 'sdk-key',
        'AWS_SECRET_ACCESS_KEY' => 'sdk-secret'
      ) do
        expect(described_class.configured?).to eq(true)
        expect(described_class.aws_credentials).to eq(
          access_key: 'sdk-key',
          secret_access_key: 'sdk-secret'
        )
      end
    end
  end

  describe '.bedrock_plane' do
    it 'defaults to classic, the plane this account can actually invoke' do
      with_env({}) { expect(described_class.bedrock_plane).to eq('classic') }
    end

    it 'selects mantle only on an explicit, case-insensitive opt-in' do
      with_env('BEDROCK_PLANE' => 'Mantle') { expect(described_class.bedrock_plane).to eq('mantle') }
      with_env('BEDROCK_PLANE' => ' mantle ') { expect(described_class.bedrock_plane).to eq('mantle') }
    end

    it 'degrades an unrecognized value to classic rather than an unentitled plane' do
      with_env('BEDROCK_PLANE' => 'mantel') { expect(described_class.bedrock_plane).to eq('classic') }
      with_env('BEDROCK_PLANE' => '') { expect(described_class.bedrock_plane).to eq('classic') }
    end
  end

  describe '.build' do
    it 'returns nil when Bedrock is not configured' do
      with_env('AWS_REGION' => 'us-west-2') do
        expect(described_class.build).to be_nil
      end
    end

    it 'constructs BedrockClient with aws_secret_key (classic keyword) by default' do
      with_env(
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      ) do
        client = double('bedrock_client')
        expect(Anthropic::BedrockClient).to receive(:new).with(
          aws_region: 'us-west-2',
          aws_access_key: 'bedrock-key',
          aws_secret_key: 'bedrock-secret',
          base_url: 'https://bedrock-runtime.us-west-2.amazonaws.com'
        ).and_return(client)

        expect(described_class.build).to eq(client)
      end
    end

    it 'constructs BedrockMantleClient with aws_secret_access_key (Mantle keyword) when opted in' do
      with_env(
        'BEDROCK_PLANE' => 'mantle',
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      ) do
        client = double('bedrock_mantle_client')
        expect(Anthropic::BedrockMantleClient).to receive(:new).with(
          aws_region: 'us-west-2',
          aws_access_key: 'bedrock-key',
          aws_secret_access_key: 'bedrock-secret',
          base_url: 'https://bedrock-mantle.us-west-2.api.aws/anthropic'
        ).and_return(client)

        expect(described_class.build).to eq(client)
      end
    end

    # The two clients take DIFFERENT secret keywords; passing the wrong one
    # raises ArgumentError at construction. Assert the real signatures accept
    # what build actually sends, so a gem upgrade that renames either keyword
    # fails here rather than at the first live AI call in production.
    it 'sends keywords the real client signatures accept' do
      classic = Anthropic::BedrockClient.instance_method(:initialize).parameters.map(&:last)
      mantle = Anthropic::BedrockMantleClient.instance_method(:initialize).parameters.map(&:last)

      expect(classic).to include(:aws_region, :aws_access_key, :aws_secret_key)
      expect(mantle).to include(:aws_region, :aws_access_key, :aws_secret_access_key)
    end
  end

  # Finding LL-1b0d78dbe6. The AWS BAA is scoped to a single account and its operative
  # condition is that Bedrock calls run under that account; nothing enforced it.
  describe '.account_verified? (AWS BAA account assertion)' do
    # A method rather than a constant: assigning a constant inside a describe block
    # leaks it to Object.
    def bedrock_env(extra = {})
      {
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      }.merge(extra)
    end

    before { described_class.reset_account_verification! }
    after { described_class.reset_account_verification! }

    def stub_sts(account)
      sts = double('sts')
      allow(sts).to receive(:get_caller_identity).and_return(double('identity', account: account))
      allow(Aws::STS::Client).to receive(:new).and_return(sts)
      sts
    end

    context 'when no expected account is configured' do
      it 'skips the check entirely rather than blocking, and makes no STS call' do
        expect(Aws::STS::Client).not_to receive(:new)
        with_env(bedrock_env) do
          expect(described_class.account_verified?).to eq(true)
        end
      end
    end

    context 'when an expected account is configured' do
      it 'passes when the credential resolves to that account' do
        stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(true)
        end
      end

      # docs/legal quotes this id both as 239044785114 and as 2390-4478-5114. Comparing raw
      # strings would fail a correctly-configured deployment over punctuation.
      it 'normalizes the grouped form used in the compliance corpus' do
        stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '2390-4478-5114')) do
          expect(described_class.account_verified?).to eq(true)
        end
      end

      it 'fails when the credential belongs to a different account' do
        stub_sts('111122223333')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(false)
        end
      end

      # Fail CLOSED, not open. Failing open would mean a transient network error silently
      # disables the control instead of the feature, which is the whole finding.
      it 'fails closed when STS itself cannot be reached' do
        allow(Aws::STS::Client).to receive(:new).and_raise(StandardError, 'connection refused')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(false)
        end
      end

      it 'fails closed when no credential pair is present' do
        with_env('BEDROCK_AWS_REGION' => 'us-west-2',
                 'BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114') do
          expect(described_class.account_verified?).to eq(false)
        end
      end

      # Verifying the AMBIENT credential instead of the Bedrock one would assert the wrong
      # thing and still pass, which is worse than no check at all.
      it 'probes with the exact Bedrock credential, not the ambient AWS chain' do
        sts = double('sts')
        allow(sts).to receive(:get_caller_identity).and_return(double('identity', account: '239044785114'))
        expect(Aws::STS::Client).to receive(:new).with(
          hash_including(
            region: 'us-west-2',
            access_key_id: 'bedrock-key',
            secret_access_key: 'bedrock-secret'
          )
        ).and_return(sts)

        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(true)
        end
      end
    end

    describe 'caching' do
      it 'probes STS once per credential, not once per AI call' do
        sts = stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          3.times { expect(described_class.account_verified?).to eq(true) }
        end
        expect(sts).to have_received(:get_caller_identity).once
      end

      it 're-probes when the credential changes' do
        sts = stub_sts('239044785114')
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          described_class.account_verified?
        end
        with_env(bedrock_env('BEDROCK_AWS_KEY' => 'rotated-key',
                                   'BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          described_class.account_verified?
        end
        expect(sts).to have_received(:get_caller_identity).twice
      end

      # A permanently-cached failure would darken AI for the life of the process after one
      # transient blip, so the failure entry must expire while a success need not.
      # Stubs the MONOTONIC clock, not Time.now: wall clock would let an NTP step
      # backwards pin a cached failure, which is why the code moved off it.
      it 'retries a failed check after the retry window, without re-probing inside it' do
        now = 1_000.0
        # and_call_original first: without it, ANY other clock_gettime call inside the
        # example (added instrumentation, Rack::Timeout) raises "unexpected arguments"
        # rather than failing legibly.
        allow(Process).to receive(:clock_gettime).and_call_original
        allow(Process).to receive(:clock_gettime).with(Process::CLOCK_MONOTONIC) { now }

        sts = double('sts')
        allow(sts).to receive(:get_caller_identity).and_raise(StandardError, 'timeout')
        allow(Aws::STS::Client).to receive(:new).and_return(sts)

        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.account_verified?).to eq(false)
          expect(described_class.account_verified?).to eq(false)
          expect(sts).to have_received(:get_caller_identity).once

          now += AiClient::ACCOUNT_CHECK_RETRY_AFTER + 1
          expect(described_class.account_verified?).to eq(false)
          expect(sts).to have_received(:get_caller_identity).twice
        end
      end
    end

    # The control only matters if it actually stops the call.
    describe 'effect on .build' do
      it 'refuses to construct a client when the account does not match' do
        stub_sts('111122223333')
        expect(Anthropic::BedrockClient).not_to receive(:new)
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.build).to be_nil
        end
      end

      it 'constructs a client when the account matches' do
        stub_sts('239044785114')
        client = double('bedrock_client')
        allow(Anthropic::BedrockClient).to receive(:new).and_return(client)
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
          expect(described_class.build).to eq(client)
        end
      end
    end

    # Set-but-unparseable is NOT the same as unset. Collapsing them is a silent off
    # switch: `none`, `REDACTED` and an unexpanded `${VAR}` all normalize to empty.
    context 'when the expected account is set but malformed' do
      # '' and '   ' are in this list deliberately: `--set-env-vars NAME=` produces a
      # present-but-blank var that reads as configured on the revision. The only way
      # to skip the assertion is for the variable not to exist at all.
      ['none', 'REDACTED', '${BEDROCK_ACCOUNT}', '', '   ', 'account-2390', '23904478'].each do |bad|
        it "refuses rather than skipping for #{bad.inspect}" do
          expect(Aws::STS::Client).not_to receive(:new)
          with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => bad)) do
            expect(described_class.account_verified?).to eq(false)
            expect(described_class.build).to be_nil
          end
        end
      end
    end

    # The reviewer's point: every other test stubs Aws::STS::Client.new, so it proves
    # which kwargs were PASSED, not that the SDK honors them. These construct a REAL
    # client and read its resolved config. No network is involved.
    describe 'the real STS client configuration' do
      def real_sts_config(env = {})
        cfg = nil
        with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114').merge(env)) do
          allow(Aws::STS::Client).to receive(:new).and_wrap_original do |orig, *args, **kw|
            client = orig.call(*args, **kw)
            cfg = client.config
            raise StandardError, 'stop before any network call'
          end
          described_class.account_verified?
        end
        cfg
      end

      # The load-bearing one. aws-sdk-core resolves an unpinned client's host from
      # AWS_ENDPOINT_URL / AWS_ENDPOINT_URL_STS. Unpinned, anything that can set an
      # env var on the revision points GetCallerIdentity at a host that answers with
      # the expected account, the assertion passes, and build then calls the REAL
      # Bedrock endpoint with a NON-BAA credential. Green control, defeated control.
      # NAME MATTERS: this proves the endpoint URL is pinned, not that the verifier
      # is un-redirectable. http_proxy + AWS_CA_BUNDLE still defeat it; see the
      # scope note on AiClient.sts_endpoint. An earlier name claimed the broader
      # property and was wrong.
      it 'pins the endpoint URL against AWS_ENDPOINT_URL redirection' do
        expect(real_sts_config.endpoint.to_s).to eq('https://sts.us-west-2.amazonaws.com')
      end

      it 'stays pinned even when AWS_ENDPOINT_URL_STS is set' do
        cfg = real_sts_config('AWS_ENDPOINT_URL_STS' => 'https://evil-sts.example.com')
        expect(cfg.endpoint.to_s).to eq('https://sts.us-west-2.amazonaws.com')
      end

      it 'stays pinned even when the global AWS_ENDPOINT_URL is set' do
        cfg = real_sts_config('AWS_ENDPOINT_URL' => 'https://evil.example.com')
        expect(cfg.endpoint.to_s).to eq('https://sts.us-west-2.amazonaws.com')
      end

      # A blackholed endpoint measured 10.33s at the SDK default retry_limit of 1.
      # Word prediction is typing assistance; that budget is not acceptable inline.
      it 'bounds the inline latency budget' do
        cfg = real_sts_config
        expect(cfg.retry_limit).to eq(0)
        expect(cfg.http_open_timeout).to eq(2)
        expect(cfg.http_read_timeout).to eq(3)
      end
    end

    # A control that is silent when it passes cannot be distinguished from a control
    # that is switched off.
    it 'logs once on successful verification so the control is attestable' do
      stub_sts('239044785114')
      logger = double('logger').as_null_object
      allow(Rails).to receive(:logger).and_return(logger)
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        3.times { described_class.account_verified? }
      end
      expect(logger).to have_received(:info).with(/verified against AWS account 239044785114/).once
    end
  end

  # The region is interpolated into every endpoint hostname in this file, so an
  # unvalidated value escapes the host and defeats the STS pin AND classic_base_url
  # with one env var.
  describe '.bedrock_region validation' do
    # eusc-de-east-1 is AWS's European Sovereign Cloud region. A two-letter first
    # segment rejected it, which would have darkened AI with a wrong explanation.
    %w[us-west-2 eu-central-1 us-gov-west-1 ap-southeast-2 il-central-1 eusc-de-east-1].each do |good|
      it "accepts the well-formed region #{good}" do
        with_env('BEDROCK_AWS_REGION' => good) do
          expect(described_class.bedrock_region).to eq(good)
        end
      end
    end

    it 'strips surrounding whitespace rather than rejecting it' do
      with_env('BEDROCK_AWS_REGION' => '  us-west-2  ') do
        expect(described_class.bedrock_region).to eq('us-west-2')
      end
    end

    [
      'evil.example.com/',
      'us-west-2.evil.com',
      'us-west-2/../..',
      'us-west-2:8080',
      'US-WEST-2',
      'localhost',
      # Shape-valid but in a partition whose endpoints are not under amazonaws.com,
      # so accepting them would build a hostname that never resolves.
      'cn-north-1',
      'us-iso-east-1',
      'us-isob-east-1'
    ].each do |bad|
      it "refuses #{bad.inspect} and fails AI closed" do
        with_env('BEDROCK_AWS_REGION' => bad, 'BEDROCK_AWS_KEY' => 'k', 'BEDROCK_AWS_SECRET' => 's') do
          expect(described_class.bedrock_region).to eq('')
          expect(described_class.configured?).to eq(false)
          expect(described_class.build).to be_nil
        end
      end
    end

    # The concrete attack: the host of the "pinned" URL must never leave AWS.
    it 'cannot be used to move the STS or Bedrock host off amazonaws.com' do
      with_env('BEDROCK_AWS_REGION' => 'evil.example.com/',
               'BEDROCK_AWS_KEY' => 'k', 'BEDROCK_AWS_SECRET' => 's',
               'BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114') do
        expect(Aws::STS::Client).not_to receive(:new)
        expect(described_class.account_verified?).to eq(false)
        # The point is the host never leaves AWS. With the region refused it degrades
        # to an unresolvable amazonaws.com name, not to the attacker's host.
        expect(URI.parse(described_class.classic_base_url).host).to end_with('.amazonaws.com')
        expect(described_class.classic_base_url).not_to include('evil.example.com')
      end
    end
  end

  describe '.available? and .build!' do
    def bedrock_env(extra = {})
      {
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'bedrock-key',
        'BEDROCK_AWS_SECRET' => 'bedrock-secret'
      }.merge(extra)
    end

    before { described_class.reset_account_verification! }
    after { described_class.reset_account_verification! }

    def stub_sts(account)
      sts = double('sts')
      allow(sts).to receive(:get_caller_identity).and_return(double('identity', account: account))
      allow(Aws::STS::Client).to receive(:new).and_return(sts)
      sts
    end

    # configured? must stay a pure ENV read. Folding the account check into it would
    # hand a network call to every future caller by accident (a serializer, a health
    # endpoint, an admin page), and would make existing specs depend on STS stubbing.
    it 'keeps configured? pure and makes no STS call' do
      expect(Aws::STS::Client).not_to receive(:new)
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect(described_class.configured?).to eq(true)
      end
    end

    it 'is false when config is present but the account does not verify' do
      stub_sts('111122223333')
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect(described_class.configured?).to eq(true)
        expect(described_class.available?).to eq(false)
      end
    end

    it 'is true when config is present and the account verifies' do
      stub_sts('239044785114')
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect(described_class.available?).to eq(true)
      end
    end

    # Before the account assertion, `configured? => build != nil` held, so no seam
    # carried a nil guard. build! is the belt that keeps a future seam from
    # rediscovering that with a NoMethodError on nil.
    it 'raises a legible error instead of returning nil' do
      stub_sts('111122223333')
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect { described_class.build! }
          .to raise_error(AiClient::NotAvailableError, /No AI call was made/)
      end
    end

    it 'returns the client when one can be built' do
      stub_sts('239044785114')
      client = double('bedrock_client')
      allow(Anthropic::BedrockClient).to receive(:new).and_return(client)
      with_env(bedrock_env('BEDROCK_EXPECTED_AWS_ACCOUNT' => '239044785114')) do
        expect(described_class.build!).to eq(client)
      end
    end
  end

  describe '.bedrock_model' do
    context 'on the classic plane (default)' do
      it 'maps the logical alias to the inference-profile id that actually invokes' do
        with_env({}) do
          expect(described_class.bedrock_model('anthropic.claude-haiku-4-5'))
            .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0')
        end
      end

      it 'normalizes a missing anthropic. prefix before mapping' do
        with_env({}) do
          expect(described_class.bedrock_model('claude-haiku-4-5'))
            .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0')
        end
      end

      # Regression: the previous implementation tested start_with?('anthropic.')
      # and so turned an already-resolved profile id into
      # 'anthropic.us.anthropic.claude-...', which Bedrock rejects.
      it 'passes an already-resolved inference-profile id through untouched' do
        with_env({}) do
          %w[
            us.anthropic.claude-haiku-4-5-20251001-v1:0
            eu.anthropic.claude-haiku-4-5-20251001-v1:0
            apac.anthropic.claude-haiku-4-5-20251001-v1:0
          ].each do |id|
            expect(described_class.bedrock_model(id)).to eq(id)
          end
        end
      end

      it 'leaves an unmapped alias alone so it fails loudly instead of silently invoking another model' do
        with_env({}) do
          expect(described_class.bedrock_model('anthropic.claude-opus-4-7'))
            .to eq('anthropic.claude-opus-4-7')
        end
      end

      # A deployment configured off the PREVIOUS .env.example carries
      # ANTHROPIC_MODEL=claude-haiku-4-5-20251001. Without suffix-stripping that
      # normalizes to an unmapped alias and every AI call fails on classic, so the
      # plane switch would appear to work while that deployment stayed broken.
      it 'resolves legacy dated and versioned override forms to the profile id' do
        with_env({}) do
          %w[
            claude-haiku-4-5-20251001
            anthropic.claude-haiku-4-5-20251001
            anthropic.claude-haiku-4-5-20251001-v1:0
            anthropic.claude-haiku-4-5-v1:0
          ].each do |legacy|
            expect(described_class.bedrock_model(legacy))
              .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0'), "failed for #{legacy}"
          end
        end
      end

      it 'does not let suffix-stripping substitute a different model' do
        with_env({}) do
          # Base name is preserved, so an unrelated dated id misses the map twice
          # and comes back as the operator's ORIGINAL id, not a Haiku profile.
          expect(described_class.bedrock_model('anthropic.claude-opus-4-7-20260115'))
            .to eq('anthropic.claude-opus-4-7-20260115')
          expect(described_class.bedrock_model('anthropic.claude-sonnet-4-5-20250929-v1:0'))
            .to eq('anthropic.claude-sonnet-4-5-20250929-v1:0')
        end
      end
    end

    context 'on the mantle plane' do
      it 'returns the bare alias, which is Mantle wire form' do
        with_env('BEDROCK_PLANE' => 'mantle') do
          expect(described_class.bedrock_model('anthropic.claude-haiku-4-5'))
            .to eq('anthropic.claude-haiku-4-5')
          expect(described_class.bedrock_model('claude-haiku-4-5'))
            .to eq('anthropic.claude-haiku-4-5')
        end
      end
    end

    it 'returns an empty id unchanged' do
      with_env({}) do
        expect(described_class.bedrock_model('')).to eq('')
        expect(described_class.bedrock_model(nil)).to eq('')
      end
    end
  end

  describe '.runtime_model (Tier 1 ANTHROPIC_MODEL allowlist)' do
    def with_model(value, &blk)
      previous = ENV['ANTHROPIC_MODEL']
      value.nil? ? ENV.delete('ANTHROPIC_MODEL') : ENV['ANTHROPIC_MODEL'] = value
      with_env({}, &blk)
    ensure
      previous.nil? ? ENV.delete('ANTHROPIC_MODEL') : ENV['ANTHROPIC_MODEL'] = previous
    end

    it 'uses the vetted default when no override is set' do
      with_model(nil) do
        expect(described_class.runtime_model('anthropic.claude-haiku-4-5'))
          .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0')
      end
    end

    it 'accepts an allowlisted override' do
      with_model('anthropic.claude-haiku-4-5') do
        expect(described_class.runtime_model('anthropic.claude-haiku-4-5'))
          .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0')
      end
    end

    # The Covered Models CLAUDE.md bars from Tier 1 (mandatory 30-day retention),
    # plus a non-Anthropic vendor, which would also falsify the ledger's
    # "Anthropic-only runtime" claim.
    it 'refuses a Covered Model or foreign vendor and falls back to the vetted default' do
      [
        'anthropic.claude-fable-5',
        'anthropic.claude-mythos-5',
        'meta.llama3-70b-instruct-v1:0',
        'anthropic.claude-opus-4-7'
      ].each do |bad|
        with_model(bad) do
          expect(described_class.runtime_model('anthropic.claude-haiku-4-5'))
            .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0'), "leaked for #{bad}"
        end
      end
    end

    # The precise bypass flagged in review: bedrock_model passes an already-resolved
    # profile id through untouched, so an allowlist that only understood bare aliases
    # would never inspect this form.
    it 'refuses a Covered Model disguised as a regional inference-profile id' do
      [
        'us.anthropic.claude-fable-5-20260101-v1:0',
        'eu.anthropic.claude-mythos-5-20260101-v1:0',
        'apac.meta.llama3-70b-instruct-v1:0'
      ].each do |bad|
        with_model(bad) do
          expect(described_class.runtime_model('anthropic.claude-haiku-4-5'))
            .to eq('us.anthropic.claude-haiku-4-5-20251001-v1:0'), "leaked for #{bad}"
        end
      end
    end

    it 'canonicalizes profile, dated and bare forms to the same allowlist key' do
      expect(described_class.canonical_alias('us.anthropic.claude-haiku-4-5-20251001-v1:0'))
        .to eq('anthropic.claude-haiku-4-5')
      expect(described_class.canonical_alias('claude-haiku-4-5')).to eq('anthropic.claude-haiku-4-5')
      expect(described_class.allowed_runtime_model?('us.anthropic.claude-fable-5-20260101-v1:0')).to eq(false)
    end
  end

  describe 'endpoint pinning' do
    # Both gem clients resolve `base_url ||= ENV.fetch("ANTHROPIC_BEDROCK_BASE_URL", ...)`.
    # Passing base_url explicitly is what stops an env var redirecting Tier 1 egress
    # off the BAA'd AWS path.
    it 'pins the classic endpoint explicitly rather than letting ENV decide' do
      previous = ENV['ANTHROPIC_BEDROCK_BASE_URL']
      ENV['ANTHROPIC_BEDROCK_BASE_URL'] = 'https://attacker.example.com'
      with_env(
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'k',
        'BEDROCK_AWS_SECRET' => 's'
      ) do
        expect(Anthropic::BedrockClient).to receive(:new)
          .with(hash_including(base_url: 'https://bedrock-runtime.us-west-2.amazonaws.com'))
          .and_return(double)
        described_class.build
      end
    ensure
      previous.nil? ? ENV.delete('ANTHROPIC_BEDROCK_BASE_URL') : ENV['ANTHROPIC_BEDROCK_BASE_URL'] = previous
    end

    it 'pins the mantle endpoint explicitly, matching the gem derivation' do
      with_env(
        'BEDROCK_PLANE' => 'mantle',
        'BEDROCK_AWS_REGION' => 'us-west-2',
        'BEDROCK_AWS_KEY' => 'k',
        'BEDROCK_AWS_SECRET' => 's'
      ) do
        expect(Anthropic::BedrockMantleClient).to receive(:new)
          .with(hash_including(base_url: 'https://bedrock-mantle.us-west-2.api.aws/anthropic'))
          .and_return(double)
        described_class.build
      end
    end
  end

  describe '.client_defined?' do
    it 'reports on the active plane rather than one hardcoded constant' do
      with_env({}) { expect(described_class.client_defined?).to eq(true) }
      with_env('BEDROCK_PLANE' => 'mantle') { expect(described_class.client_defined?).to eq(true) }
    end
  end
end
