require 'spec_helper'

# Email-template overrides are filled from a list of allowed values; stored text is
# never run as code. See docs/task-management/2026-11-10_email-template-placeholders.md.
module SystemEmailPlaceholdersSpecProbe
  def self.calls
    @calls ||= 0
  end

  def self.touch
    @calls = calls + 1
    'probe-output'
  end
end

describe SystemEmailPlaceholders do
  def with_env(values)
    allow(ENV).to receive(:[]).and_call_original
    values.each { |k, v| allow(ENV).to receive(:[]).with(k).and_return(v) }
    yield
  end

  def preview_context(key)
    entry = SystemEmailRegistry.find(key)
    user = SystemEmailPreview.sample_user
    ctx = SystemEmailPlaceholders::Context.new(template_key: key, values: {
      '@user' => user,
      '@consent_url' => 'https://app.example.com/consent?token=sample',
      '@child_name' => 'Test Student',
      '@child_username' => 'test_student',
      '@granted_at' => Time.utc(2026, 1, 2),
      '@revoked_at' => Time.utc(2026, 1, 3)
    })
    [entry, ctx]
  end

  after(:each) do
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
  end

  describe '.validate!' do
    it 'refuses an output tag that is not on the allowed list' do
      expect {
        described_class.validate!("<%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %>", 'user_mailer/confirm_registration')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /disallowed/)
      expect {
        described_class.validate!('<%= SystemEmailPlaceholdersSpecProbe.touch %>', 'user_mailer/confirm_registration')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /disallowed/)
    end

    it 'refuses a record variable on its own and names its fields' do
      expect {
        described_class.validate!('<%= @user %>', 'user_mailer/confirm_registration')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /@user\.user_name/)
    end

    it 'refuses a field that is not listed for the variable' do
      expect {
        described_class.validate!('<%= @user.destroy %>', 'user_mailer/confirm_registration')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /disallowed/)
    end

    it 'refuses code blocks, comments and unclosed tags' do
      ['<% if @user %>x<% end %>', '<%# note %>', '<%- x %>', '<%== app_name %>', '<%= app_name'].each do |text|
        expect { described_class.validate!('<%= @user.registration_code %> ' + text, 'user_mailer/confirm_registration') }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
      end
    end

    it 'allows the email address only where the record is the recipient or the default view shows it' do
      expect { described_class.validate!('<%= @user.email %> <%= @user.registration_code %>', 'user_mailer/confirm_registration') }.not_to raise_error
      expect { described_class.validate!("<%= @user.settings['email'] %>", 'admin_mailer/opt_out') }.not_to raise_error
      # In badge_awarded the email goes to @recipient; @user is the badge owner.
      expect { described_class.validate!('<%= @user.email %>', 'user_mailer/badge_awarded') }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
      # Parent-facing: @user is the child.
      expect { described_class.validate!('<%= @user.email %> <%= @consent_url %>', 'user_mailer/parental_consent_request') }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
    end

    it 'allows email-specific fields only in emails whose default view uses them' do
      expect { described_class.validate!('<%= @user.registration_code %>', 'user_mailer/confirm_registration') }.not_to raise_error
      expect { described_class.validate!('<%= @user.registration_code %> <%= @consent_url %>', 'user_mailer/parental_consent_request') }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
    end

    # A required value counts only where it prints: a date of it prints nothing, and a
    # translation argument prints only if the message text keeps its %{name}.
    it 'does not count a required value that is written only where it does not print' do
      key = 'user_mailer/confirm_registration'
      expect {
        described_class.validate!('<%= long_ordinal_date(@user.registration_code) %>', key)
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /does not work without/)
      expect {
        described_class.validate!("<%= mailer_t('parental_consent_mailer.intro', app_name: @consent_url, consent_age: @consent_age) %>", 'user_mailer/parental_consent_request')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /does not work without/)
      expect {
        described_class.validate!('<%= @user.user_name.presence || @user.registration_code %>', key)
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /does not work without/)
      expect { described_class.validate!('<%= @user.registration_code %>', key) }.not_to raise_error
    end

    it 'treats @message as plain text in utterance_share and as a record in admin emails' do
      expect { described_class.validate!('<%= @message %>', 'user_mailer/utterance_share') }.not_to raise_error
      expect { described_class.validate!('<%= @message %>', 'admin_mailer/message_sent') }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
      expect { described_class.validate!("<%= @message.settings['name'] %>", 'admin_mailer/message_sent') }.not_to raise_error
    end

    it 'refuses an over-long expression before parsing it, without exhausting the stack' do
      nested = "<%= #{'long_ordinal_date(' * 20_000}@user.expires_at#{')' * 20_000} %>"
      expect {
        described_class.validate!(nested, 'user_mailer/confirm_registration')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /disallowed/)
      expect {
        described_class.validate!("<%= #{' ' * 600}app_name %>", 'user_mailer/confirm_registration')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /disallowed/)
    end

    it 'keeps <%% as a literal' do
      expect { described_class.validate!('<%% foo %>', nil) }.not_to raise_error
    end

    it 'accepts every output-only default view for its own email' do
      checked = 0
      SystemEmailRegistry.all.each do |entry|
        %w[html text].each do |format|
          body = SystemEmailTemplates.default_body(entry[:key], format)
          next if body.nil? || body.match?(/<%(?![%=])/)

          expect { described_class.validate!(body, entry[:key]) }.not_to raise_error, "#{entry[:key]} #{format}"
          checked += 1
        end
      end
      expect(checked).to be > 40
    end
  end

  describe '.render' do
    it 'never calls a method or reads the environment named in the text' do
      _entry, ctx = preview_context('user_mailer/confirm_registration')
      before_calls = SystemEmailPlaceholdersSpecProbe.calls
      with_env('SYSTEM_EMAIL_SPEC_CANARY' => 'canary-value-7f3') do
        ["<%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %>", '<%= SystemEmailPlaceholdersSpecProbe.touch %>'].each do |text|
          expect { described_class.render(text + ' <%= @user.registration_code %>', 'user_mailer/confirm_registration', 'html', ctx) }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
        end
      end
      expect(SystemEmailPlaceholdersSpecProbe.calls).to eq(before_calls)
    end

    it 'escapes values in html and leaves text bodies unescaped' do
      key = 'user_mailer/confirm_registration'
      ctx = SystemEmailPlaceholders::Context.new(template_key: key, values: {
        '@user' => SystemEmailPreview::SampleUser.new(global_id: '1_1', user_name: 'test_student', name: 'A & <B>', email: 'a@example.com')
      })
      expect(described_class.render('<p><%= @user.display_name %></p>', key, 'html', ctx, require_links: false)).to eq('<p>A &amp; &lt;B&gt;</p>')
      expect(described_class.render('<%= @user.display_name %>', key, 'text', ctx, require_links: false)).to eq('A & <B>')
      expect(described_class.render('a <%% b', key, 'text', ctx, require_links: false)).to eq('a <% b')
    end

    it 'renders a missing value as empty text' do
      key = 'user_mailer/confirm_registration'
      ctx = SystemEmailPlaceholders::Context.new(template_key: key, values: {})
      expect(described_class.render('[<%= @user.user_name %>]', key, 'text', ctx, require_links: false)).to eq('[]')
    end

    it 'renders the consent defaults with their values' do
      key = 'user_mailer/eu_ai_parental_consent_request'
      _entry, ctx = preview_context(key)
      out = described_class.render(SystemEmailTemplates.default_body(key, 'html'), key, 'html', ctx)
      expect(out).to include('https://app.example.com/consent?token=sample')
      expect(out).not_to include('<%')
    end
  end

  describe 'SystemEmailTemplates.set_template!' do
    it 'refuses a stored body that reads the environment or calls a method' do
      ["<%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %>", '<%= SystemEmailPlaceholdersSpecProbe.touch %>', '<%= @user %>'].each do |text|
        expect {
          SystemEmailTemplates.set_template!(nil, 'user_mailer/confirm_registration', {html_body: text + ' <%= @user.registration_code %>'})
        }.to raise_error(ArgumentError)
      end
      expect(SystemEmailTemplates.lookup('user_mailer/confirm_registration')).to be_nil
    end

    it 'saves a body that uses allowed placeholders' do
      SystemEmailTemplates.set_template!(nil, 'user_mailer/confirm_registration', {
        html_body: '<p>Welcome <%= @user.user_name %> to <%= app_name %></p><p><%= @user.registration_code %></p>'
      })
      expect(SystemEmailTemplates.lookup('user_mailer/confirm_registration')['html_body']).to include('@user.user_name')
    end
  end

  describe 'emails with a second recipient, required links and message blocks' do
    it 'refuses the account email in email_changed, which also goes to the previous address' do
      expect {
        described_class.validate!('<%= @user.email %>', 'user_mailer/email_changed')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
    end

    # consent_request goes to relationship.consent_email_sent_to, which is the owner or
    # guardian address when one is set (app/services/supervisor_consent_service.rb), so
    # @communicator is not always the recipient.
    it 'refuses the communicator email in consent_request, which may go to a guardian' do
      ['<%= @communicator.email %>', "<%= @communicator.settings['email'] %>"].each do |text|
        expect {
          described_class.validate!("#{text} <%= @approve_url %> <%= @deny_url %>", 'supervisor_mailer/consent_request')
        }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /disallowed/), text
      end
      expect(described_class.allowed_for('supervisor_mailer/consent_request')).not_to include('@communicator.email')
    end

    # Reset codes, lesson nonces and share tokens and gift verifiers are only ever written
    # as whole links built in code, so an edited body cannot place them anywhere else.
    let(:secret_parts) do
      %w[
        @user.password_reset_code @user.lesson_share_token @lesson.global_id @lesson.nonce
        @gift.code_verifier @recipient.password_reset_code @supervisor.lesson_share_token
      ]
    end
    let(:links) do
      {
        '@password_reset_url' => 'user_mailer/forgot_password',
        '@lesson_url' => 'user_mailer/lesson_assigned',
        '@gift_redeem_url' => 'subscription_mailer/gift_created'
      }
    end

    it 'refuses the bare parts of the reset, lesson and gift links in every email' do
      keys = SystemEmailRegistry.all.map { |entry| entry[:key] } + [nil]
      keys.each do |key|
        secret_parts.each do |part|
          expect {
            described_class.validate!("<%= #{part} %>", key, require_links: false)
          }.to raise_error(SystemEmailPlaceholders::InvalidTemplate), "#{key}: #{part}"
        end
        expect(described_class.allowed_for(key) & secret_parts).to eq([]) if key
      end
    end

    it 'accepts each link placeholder only in its own email' do
      SystemEmailRegistry.all.each do |entry|
        links.each do |link, own_key|
          check = expect { described_class.validate!("<%= #{link} %>", entry[:key], require_links: false) }
          if entry[:key] == own_key
            check.not_to raise_error
            expect(described_class.allowed_for(entry[:key])).to include(link)
          else
            check.to raise_error(SystemEmailPlaceholders::InvalidTemplate), "#{entry[:key]}: #{link}"
            expect(described_class.allowed_for(entry[:key])).not_to include(link)
          end
        end
      end
      expect { described_class.validate!('<%= @lesson_url.presence || app_name %>', nil) }.to raise_error(SystemEmailPlaceholders::InvalidTemplate)
    end

    it 'requires the reset and lesson links in their emails' do
      expect {
        described_class.validate!('<p>Reset your password, <%= @user.user_name %></p>', 'user_mailer/forgot_password')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /@password_reset_url/)
      expect {
        described_class.validate!("<%= @lesson.settings['title'] %>", 'user_mailer/lesson_assigned')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /@lesson_url/)
      expect { described_class.validate!('<a href="<%= @password_reset_url %>">reset</a>', 'user_mailer/forgot_password') }.not_to raise_error
      expect { described_class.validate!('<%= @lesson_url %>', 'user_mailer/lesson_assigned') }.not_to raise_error
    end

    describe 'link placeholders' do
      before(:each) { JsonApi::Json.load_domain('default') }

      it 'renders the reset link the default view builds' do
        user = User.create(settings: {'email' => 'test-student@example.com'})
        user.generate_password_reset
        ctx = SystemEmailPlaceholders::Context.new(template_key: 'user_mailer/forgot_password', values: {'@user' => user})
        out = described_class.render('<%= @password_reset_url %>', 'user_mailer/forgot_password', 'text', ctx)
        expect(user.password_reset_code).to be_present
        expect(out).to eq("#{JsonApi::Json.absolute_host}/#{user.user_name}/password_reset/#{user.password_reset_code}")
      end

      it 'renders the lesson link the default view builds' do
        user = User.create(settings: {'email' => 'test-student@example.com'})
        lesson = Lesson.create
        allow(user).to receive(:lesson_share_token).and_return('spec-share-token')
        ctx = SystemEmailPlaceholders::Context.new(template_key: 'user_mailer/lesson_assigned', values: {'@user' => user, '@lesson' => lesson})
        out = described_class.render('<%= @lesson_url %>', 'user_mailer/lesson_assigned', 'html', ctx)
        expect(out).to eq("#{JsonApi::Json.absolute_host}/lessons/#{lesson.global_id}/#{lesson.nonce}/spec-share-token")
      end

      it 'renders the gift link the default view builds' do
        giver = User.create(settings: {'email' => 'test-giver@example.com'})
        gift = GiftPurchase.process_new({}, {'giver' => giver, 'email' => 'test-giver@example.com', 'seconds' => 2.years.to_i})
        ctx = SystemEmailPlaceholders::Context.new(template_key: 'subscription_mailer/gift_created', values: {'@gift' => gift})
        out = described_class.render('<%= @gift_redeem_url %>', 'subscription_mailer/gift_created', 'text', ctx, require_links: false)
        expect(gift.code_verifier).to be_present
        expect(out).to eq("#{JsonApi::Json.absolute_host}/redeem/#{gift.code}::#{gift.code_verifier}")
      end

      it 'refuses to render a link whose parts are missing, so the send falls back' do
        user = User.create(settings: {'email' => 'test-student@example.com'})
        expect(user.password_reset_code).to be_nil
        ctx = SystemEmailPlaceholders::Context.new(template_key: 'user_mailer/forgot_password', values: {'@user' => user})
        expect {
          described_class.render('<%= @password_reset_url %>', 'user_mailer/forgot_password', 'text', ctx)
        }.to raise_error(SystemEmailPlaceholders::MissingValue)
      end
    end

    it 'requires the link that is the purpose of the email' do
      {
        'user_mailer/forgot_password' => '<%= @password_reset_url %>',
        'user_mailer/lesson_assigned' => '<%= @lesson_url %>',
        'subscription_mailer/gift_created' => '<%= @gift.code %> <%= @gift_redeem_url %>',
        'user_mailer/confirm_registration' => '<%= @user.registration_code %>',
        'user_mailer/parental_consent_request' => '<%= @consent_url %>',
        'supervisor_mailer/consent_request' => '<%= @approve_url %> <%= @deny_url %>',
        'user_mailer/eu_ai_parental_consent_request' => '<%= @consent_url %>',
        'user_mailer/parental_consent_confirmation' => '<%= @revoke_url %>',
        'user_mailer/eu_ai_parental_consent_confirmation' => '<%= @revoke_url %>'
      }.each do |key, required|
        expect { described_class.validate!("<p>#{required}</p>", key) }.not_to raise_error, key
        expect { described_class.validate!('<p><%= app_name %></p>', key) }.to raise_error(SystemEmailPlaceholders::InvalidTemplate), key
      end
    end

    it 'does not require links in a preview' do
      expect {
        described_class.validate!('<p><%= app_name %></p>', 'user_mailer/forgot_password', require_links: false)
      }.not_to raise_error
    end

    it 'refuses a message block call that leaves one of its placeholders without a value' do
      expect {
        described_class.validate!("<%= mailer_t('parental_consent_revoked_mailer.details') %>", 'user_mailer/parental_consent_revoked')
      }.to raise_error(SystemEmailPlaceholders::InvalidTemplate, /child_name/)
      expect {
        described_class.validate!("<%= mailer_t('parental_consent_revoked_mailer.intro', app_name: app_name) %>", 'user_mailer/parental_consent_revoked')
      }.not_to raise_error
    end

    it 'lists only placeholders that are accepted, including message blocks and dates from the defaults' do
      listed = described_class.allowed_for('user_mailer/parental_consent_revoked')
      expect(listed.any? { |ph| ph.start_with?("mailer_t('parental_consent_revoked_mailer.details'") }).to eq(true)
      SystemEmailRegistry.all.each do |entry|
        described_class.allowed_for(entry[:key]).each do |ph|
          expect {
            described_class.validate!("<%= #{ph} %>", entry[:key], require_links: false)
          }.not_to raise_error, "#{entry[:key]}: #{ph}"
        end
      end
    end

    it 'lists the links an email requires' do
      expect(described_class.required_for('user_mailer/forgot_password')).to eq(['@password_reset_url'])
      expect(described_class.required_for('user_mailer/lesson_assigned')).to eq(['@lesson_url'])
      expect(described_class.required_for('subscription_mailer/gift_created')).to eq(['@gift.code', '@gift_redeem_url'])
      expect(described_class.required_for('user_mailer/log_message')).to eq([])
    end
  end
end
