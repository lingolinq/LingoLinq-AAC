require 'spec_helper'

# Stored email-template overrides are filled from a list of allowed values
# (lib/system_email_placeholders.rb); the stored text is never run as code.
# These examples store rows directly, the way a row written before the save-time
# check existed would look, and then send the email.
module SystemEmailOverrideSpecProbe
  def self.calls
    @calls ||= 0
  end

  def self.touch
    @calls = calls + 1
    'probe-output'
  end
end

describe SystemEmailOverride, type: :mailer do
  def with_env(values)
    allow(ENV).to receive(:[]).and_call_original
    values.each { |k, v| allow(ENV).to receive(:[]).with(k).and_return(v) }
    yield
  end

  def store_default_override(key, attrs)
    Setting.set(SystemEmailTemplates::DEFAULT_KEY, {key => attrs}, true)
  end

  before(:each) do
    @mailer_spec_host = JsonApi::Json.current_host
    JsonApi::Json.load_domain('default')
  end

  after(:each) do
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
    JsonApi::Json.set_host(@mailer_spec_host) if @mailer_spec_host
    JsonApi::Json.load_domain('default')
  end

  let(:user) { User.create(settings: {'email' => 'test-student@example.com', 'name' => 'Test <b>Student</b>'}) }

  it 'does not run an environment read written in a stored html override, and sends the default view' do
    store_default_override('user_mailer/confirm_registration', {
      'html_body' => "<p>canary:<%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %></p><p><%= @user.registration_code %></p>"
    })
    with_env('SYSTEM_EMAIL_SPEC_CANARY' => 'canary-value-7f3') do
      m = UserMailer.confirm_registration(user.global_id)
      html = message_body(m, :html)
      expect(html).not_to include('canary-value-7f3')
      expect(html).not_to include('canary:')
      expect(html).to include(user.user_name)
    end
  end

  it 'does not call a method written in a stored text override, and sends the default view' do
    store_default_override('user_mailer/confirm_registration', {
      'text_body' => 'probe:<%= SystemEmailOverrideSpecProbe.touch %> <%= @user.registration_code %>'
    })
    before_calls = SystemEmailOverrideSpecProbe.calls
    m = UserMailer.confirm_registration(user.global_id)
    text = message_body(m, :text)
    expect(SystemEmailOverrideSpecProbe.calls).to eq(before_calls)
    expect(text).not_to include('probe-output')
    expect(text).not_to include('probe:')
    expect(text).to include(user.user_name)
  end

  it 'fills allowed placeholders and HTML-escapes their values in the html body' do
    store_default_override('user_mailer/confirm_registration', {
      'html_body' => '<p>Hi <%= @user.display_name %> (<%= @user.user_name %>)</p><p><%= email_signature %></p><p><%= @user.registration_code %></p>',
      'text_body' => 'Hi <%= @user.display_name %> from <%= app_name %> <%= @user.registration_code %>'
    })
    allow_any_instance_of(SystemEmailPlaceholders::Context).to receive(:domain_settings).and_return(
      JsonApi::Json.current_domain['settings'].merge('email_signature' => 'Test & <i>Team</i>')
    )
    m = UserMailer.confirm_registration(user.global_id)
    html = message_body(m, :html)
    text = message_body(m, :text)
    expect(html).to include('Hi Test &lt;b&gt;Student&lt;/b&gt;')
    expect(html).not_to include('<b>Student</b>')
    expect(html).to include("(#{user.user_name})")
    expect(html).to include('<p>Test &amp; &lt;i&gt;Team&lt;/i&gt;</p>')
    expect(text).to include('Hi Test <b>Student</b> from LingoLinq')
  end

  # No stub: the values come from the loaded domain's own settings, the way a send does.
  it 'fills the branding helpers from the real domain settings' do
    org = Organization.create(custom_domain: true)
    org.settings['hosts'] = ['branding-mail.example.test']
    org.settings['host_settings'] = {
      'app_name' => 'Test App', 'company_name' => 'Test Company',
      'support_url' => 'https://support.example.com/help', 'email_signature' => 'Signed, Test Team'
    }
    org.save
    Worker.process_queues
    JsonApi::Json.load_domain('branding-mail.example.test')
    expect(JsonApi::Json.current_domain['settings']['app_name']).to eq('Test App')
    store_default_override('user_mailer/password_changed', {
      'text_body' => 'A=<%= app_name %>|C=<%= company_name %>|S=<%= support_url %>|E=<%= email_signature %>'
    })
    m = UserMailer.password_changed(user.global_id)
    expect(message_body(m, :text)).to include('A=Test App|C=Test Company|S=https://support.example.com/help|E=Signed, Test Team')
  end

  it 'logs only the template key when a stored override falls back' do
    store_default_override('user_mailer/confirm_registration', {
      'html_body' => "<p><%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %> secret-looking-content <%= @user.registration_code %></p>"
    })
    logged = []
    allow(Rails.logger).to receive(:warn) { |msg| logged << msg.to_s }
    UserMailer.confirm_registration(user.global_id).message
    expect(logged.join("\n")).to include('user_mailer/confirm_registration')
    expect(logged.join("\n")).not_to include('secret-looking-content')
    expect(logged.join("\n")).not_to include('SYSTEM_EMAIL_SPEC_CANARY')
  end

  it 'still sends an email that has only an html view when an html override is stored' do
    store_default_override('admin_mailer/opt_out', {
      'html_body' => '<p>Opt-out for <%= @user.user_name %>: <%= @reason %></p>'
    })
    with_env('NEW_REGISTRATION_EMAIL' => 'admin-notices@example.com') do
      allow_any_instance_of(AdminMailer).to receive(:full_domain_enabled).and_return(true)
      m = AdminMailer.opt_out(user.global_id, 'testing')
      expect(m.to).to eq(['admin-notices@example.com'])
      html = (m.html_part || m).body.decoded
      expect(html).to include("Opt-out for #{user.user_name}: testing")
    end
  end

  describe 'password reset overrides' do
    let(:reset_body) { 'Reset <%= @user.user_name %>: <%= @password_reset_url %>' }

    it 'fills the reset link with the code of the account' do
      user.generate_password_reset
      store_default_override('user_mailer/forgot_password', {'text_body' => reset_body})
      m = UserMailer.forgot_password([user.global_id])
      text = message_body(m, :text)
      expect(text).to include("Reset #{user.user_name}: #{JsonApi::Json.absolute_host}/#{user.user_name}/password_reset/#{user.reload.password_reset_code}")
    end

    it 'sends the default view when a stored body still writes the reset code on its own' do
      user.generate_password_reset
      store_default_override('user_mailer/forgot_password', {
        'text_body' => 'Old-style <%= @password_reset_url %> <%= @user.password_reset_code %>'
      })
      m = UserMailer.forgot_password([user.global_id])
      text = message_body(m, :text)
      expect(text).not_to include('Old-style')
      expect(text).to include("/password_reset/#{user.reload.password_reset_code}")
    end

    it 'sends the default view when the address has more than one login' do
      other = User.create(settings: {'email' => 'test-student@example.com'})
      [user, other].each(&:generate_password_reset)
      store_default_override('user_mailer/forgot_password', {'text_body' => reset_body})
      m = UserMailer.forgot_password([user.global_id, other.global_id])
      text = message_body(m, :text)
      expect(text).not_to include('Reset ')
      expect(text).to include(other.user_name)
    end
  end

  it 'fills the lesson link in a stored lesson_assigned body' do
    lesson = Lesson.create
    lesson.settings['title'] = 'Test Lesson'
    lesson.save
    allow_any_instance_of(User).to receive(:lesson_share_token).and_return('spec-share-token')
    store_default_override('user_mailer/lesson_assigned', {
      'html_body' => "<p><%= @lesson.settings['title'] %>: <a href=\"<%= @lesson_url %>\">start</a></p>"
    })
    m = UserMailer.lesson_assigned(lesson.global_id, [user.global_id])
    html = message_body(m, :html)
    expect(html).to include("<p>Test Lesson: <a href=\"#{JsonApi::Json.absolute_host}/lessons/#{lesson.global_id}/#{lesson.reload.nonce}/spec-share-token\">start</a></p>")
  end

  it 'fills the gift link in a stored gift_created body' do
    gift = GiftPurchase.process_new({}, {'giver' => user, 'email' => 'test-giver@example.com', 'seconds' => 2.years.to_i})
    allow_any_instance_of(SubscriptionMailer).to receive(:full_domain_enabled).and_return(true)
    store_default_override('subscription_mailer/gift_created', {
      'text_body' => 'Code <%= @gift.code %> or <%= @gift_redeem_url %>'
    })
    m = SubscriptionMailer.gift_created(gift.global_id)
    text = message_body(m, :text)
    expect(text).to include("Code #{gift.code} or #{JsonApi::Json.absolute_host}/redeem/#{gift.code}::#{gift.code_verifier}")
  end

  # A bulk purchase's email lists licenses and details one edited body cannot carry
  # (SystemEmailPlaceholders::OVERRIDE_CONDITIONS), so it always goes out as the default view.
  it 'sends the default view for a bulk gift even when a gift_created body is stored' do
    gift = GiftPurchase.process_new({
      'licenses' => 4, 'amount' => '1234', 'organization' => 'Test Org', 'email' => 'test-buyer@example.com'
    }, {'giver' => user})
    expect(gift.bulk_purchase?).to eq(true)
    allow_any_instance_of(SubscriptionMailer).to receive(:full_domain_enabled).and_return(true)
    store_default_override('subscription_mailer/gift_created', {
      'html_body' => '<p>Edited <%= @gift.code %> <%= @gift_redeem_url %></p>',
      'text_body' => 'Edited <%= @gift.code %> <%= @gift_redeem_url %>'
    })
    m = SubscriptionMailer.gift_created(gift.global_id)
    html = message_body(m, :html)
    expect(html).to match(/Below are the details of your purchase:/)
    expect(html).not_to include('Edited')
  end
end
