require 'spec_helper'

describe SystemEmailTemplates do
  after do
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
  end

  describe 'default_body' do
    it 'reads file template for confirm_registration' do
      body = SystemEmailTemplates.default_body('user_mailer/confirm_registration', 'html')
      expect(body).to include('Welcome')
    end
  end

  describe 'set_template!' do
    it 'stores default site override' do
      SystemEmailTemplates.set_template!(nil, 'user_mailer/confirm_registration', {
        subject: 'Hi there',
        html_body: '<p>Custom</p>'
      })
      override = SystemEmailTemplates.lookup('user_mailer/confirm_registration')
      expect(override['subject']).to eq('Hi there')
      expect(override['html_body']).to eq('<p>Custom</p>')
    end

    it 'stores org override' do
      org = Organization.create
      SystemEmailTemplates.set_template!(org, 'user_mailer/confirm_registration', {
        subject: 'Org welcome'
      })
      expect(org.reload.settings['email_templates']['user_mailer/confirm_registration']['subject']).to eq('Org welcome')
    end

    it 'rejects html_body with Ruby code blocks' do
      expect {
        SystemEmailTemplates.set_template!(nil, 'user_mailer/confirm_registration', {
          html_body: '<% User.delete_all %>'
        })
      }.to raise_error(ArgumentError, /output tags/)
    end

    it 'stores i18n overrides without persisting unchanged default bodies' do
      default_html = SystemEmailTemplates.default_body('user_mailer/parental_consent_request', 'html')
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        html_body: default_html,
        i18n_overrides: {
          'parental_consent_mailer.greeting' => 'Howdy,'
        }
      })
      override = SystemEmailTemplates.lookup('user_mailer/parental_consent_request')
      expect(override['i18n_overrides']['parental_consent_mailer.greeting']).to eq('Howdy,')
      expect(override['html_body']).to be_nil
    end

    # A placeholder the mailer does not pass raises I18n::MissingInterpolationArgument
    # at send time, which would stop the parental-consent email going out (#1051).
    it 'rejects an i18n override with a placeholder the block does not list' do
      expect {
        SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
          i18n_overrides: {'parental_consent_mailer.intro' => 'Welcome to %{app_nam}'}
        })
      }.to raise_error(ArgumentError, /%\{app_nam\}/)
      expect(SystemEmailTemplates.lookup('user_mailer/parental_consent_request')).to be_nil
    end

    it 'rejects a placeholder in a block that takes none' do
      expect {
        SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
          i18n_overrides: {'parental_consent_mailer.greeting' => 'Hello %<child_name>s'}
        })
      }.to raise_error(ArgumentError, /child_name/)
    end

    it 'accepts the placeholders a block lists, and a literal %%' do
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        i18n_overrides: {'parental_consent_mailer.intro' => 'Welcome to %{app_name}. Under %{consent_age}, 100%% safe.'}
      })
      override = SystemEmailTemplates.lookup('user_mailer/parental_consent_request')
      expect(override['i18n_overrides']['parental_consent_mailer.intro']).to eq('Welcome to %{app_name}. Under %{consent_age}, 100%% safe.')
    end
  end
end
