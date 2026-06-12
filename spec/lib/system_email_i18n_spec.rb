require 'spec_helper'

describe SystemEmailI18n do
  after do
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
  end

  describe '.resolve' do
    it 'falls back to locale defaults' do
      text = SystemEmailI18n.resolve('user_mailer/parental_consent_request', 'parental_consent_mailer.greeting')
      expect(text).to eq(I18n.t('parental_consent_mailer.greeting'))
    end

    it 'uses stored overrides when present' do
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        i18n_overrides: {
          'parental_consent_mailer.greeting' => 'Hi there,'
        }
      })
      JsonApi::Json.load_domain('default')
      text = SystemEmailI18n.resolve('user_mailer/parental_consent_request', 'parental_consent_mailer.greeting')
      expect(text).to eq('Hi there,')
    end

    it 'interpolates placeholders' do
      text = SystemEmailI18n.resolve(
        'user_mailer/parental_consent_request',
        'parental_consent_mailer.subject',
        'app_name' => 'ExampleApp'
      )
      expect(text).to include('ExampleApp')
    end
  end
end
