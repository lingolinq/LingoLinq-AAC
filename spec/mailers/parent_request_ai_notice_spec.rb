# frozen_string_literal: true

require 'spec_helper'

# #1136: a parent's or guardian's approval through the emailed link also records the AI
# data-sharing consent for the account (ParentalConsentsController#complete,
# EuAiParentalConsentsController#complete). So the email that carries the link has to say
# so, and link the disclosure, BEFORE the parent clicks.
describe 'parent approval emails say that approving covers AI data sharing (#1136)', type: :mailer do
  let(:disclosure_path) { "/ai_consent/disclosures/#{LingoLinq::AiConsentDisclosures::CURRENT_VERSION}" }

  after do
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
  end

  it 'the under-13 approval request names AI data sharing and links the disclosure, in html and text' do
    allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
    JsonApi::Json.load_domain('test.host')
    u = User.process_new({ 'name' => 'ai_mail_kid', 'email' => 'ai_kid_m@example.com', 'password' => 'abcdefgh',
                           'terms_agree' => true, 'coppa_under_13' => true,
                           'parent_consent_email' => 'ai_parent_m@example.com' }, { pending: true })
    m = UserMailer.parental_consent_request(u.global_id)
    [:html, :text].each do |part|
      body = message_body(m, part)
      expect(body).to include(I18n.t('parental_consent_mailer.ai_notice'))
      expect(body).to include(disclosure_path)
    end
  end

  it 'the EU under-16 AI approval request links the disclosure, in html and text' do
    JsonApi::Json.load_domain('test.host')
    u = User.create
    u.settings['email'] = 'eu_teen_m@example.com'
    u.settings['registration'] = { 'under_16' => true, 'eu_under_16' => true }
    u.save!
    u.request_eu_ai_parental_consent!('eu_parent_m@example.com', requested_features: { 'ai_features_enabled' => true })
    m = UserMailer.eu_ai_parental_consent_request(u.global_id)
    [:html, :text].each do |part|
      body = message_body(m, part)
      expect(body).to include(I18n.t('eu_ai_parental_consent_mailer.ai_notice'))
      expect(body).to include(disclosure_path)
    end
  end

  # An edited email keeps the sentence the consent rests on. The notice is not one of the
  # strings an edit can replace, and it is added to an edited body that leaves it out.
  describe 'an edited email' do
    def under_13_request
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      JsonApi::Json.load_domain('test.host')
      u = User.process_new({ 'name' => 'ai_mail_kid2', 'email' => 'ai_kid_m2@example.com', 'password' => 'abcdefgh',
                             'terms_agree' => true, 'coppa_under_13' => true,
                             'parent_consent_email' => 'ai_parent_m2@example.com' }, { pending: true })
      UserMailer.parental_consent_request(u.global_id)
    end

    it 'adds the AI notice to an edited under-13 body that only kept the link, in html and text' do
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        html_body: '<p>Edited body</p><p><%= @consent_url %> <%= @privacy_url %> <%= @decline_url %> <%= @ai_disclosure_url %></p>',
        text_body: 'Edited body <%= @consent_url %> <%= @privacy_url %> <%= @decline_url %> <%= @ai_disclosure_url %>'
      })
      m = under_13_request
      notice = I18n.t('parental_consent_mailer.ai_notice')
      expect(message_body(m, :html)).to include('Edited body')
      expect(message_body(m, :html)).to include(ERB::Util.html_escape(notice))
      expect(message_body(m, :text)).to include('Edited body')
      expect(message_body(m, :text)).to include(notice)
    end

    it 'does not repeat the notice when the edited body already carries it' do
      notice = I18n.t('parental_consent_mailer.ai_notice')
      SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
        text_body: "Edited body <%= @consent_url %> <%= @privacy_url %> <%= @decline_url %> #{notice} <%= @ai_disclosure_url %>"
      })
      expect(message_body(under_13_request, :text).scan(notice).length).to eq(1)
    end

    it 'does not let a string edit replace the AI notice' do
      expect {
        SystemEmailTemplates.set_template!(nil, 'user_mailer/parental_consent_request', {
          i18n_overrides: { 'parental_consent_mailer.ai_notice' => 'Nothing else changes.' }
        })
      }.to raise_error(SystemEmailTemplates::InvalidOverride)
      expect(message_body(under_13_request, :text)).to include(I18n.t('parental_consent_mailer.ai_notice'))
    end

    it 'adds the AI notice to an edited EU under-16 body that only kept the link' do
      JsonApi::Json.load_domain('test.host')
      SystemEmailTemplates.set_template!(nil, 'user_mailer/eu_ai_parental_consent_request', {
        text_body: 'Edited EU body <%= @consent_url %> <%= @privacy_url %> <%= @ai_disclosure_url %>'
      })
      u = User.create
      u.settings['email'] = 'eu_teen_m2@example.com'
      u.settings['registration'] = { 'under_16' => true, 'eu_under_16' => true }
      u.save!
      u.request_eu_ai_parental_consent!('eu_parent_m2@example.com', requested_features: { 'ai_features_enabled' => true })
      body = message_body(UserMailer.eu_ai_parental_consent_request(u.global_id), :text)
      expect(body).to include('Edited EU body')
      expect(body).to include(I18n.t('eu_ai_parental_consent_mailer.ai_notice'))
    end
  end
end
