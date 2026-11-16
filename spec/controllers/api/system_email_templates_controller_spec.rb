require 'spec_helper'

describe Api::SystemEmailTemplatesController, type: :controller do
  def make_site_admin
    token_user
    @user.settings['admin'] = true
    @user.save
  end

  def make_support_manager
    admin_org = Organization.admin || Organization.create!(admin: true, settings: {'name' => 'Admin Org'})
    token_user
    admin_org.add_manager(@user.user_name, true)
    @user.reload
  end

  after do
    Setting.find_by(key: SystemEmailTemplates::DEFAULT_KEY)&.destroy
    RedisInit.default.del("setting/#{SystemEmailTemplates::DEFAULT_KEY}")
  end

  describe 'GET index' do
    it 'requires api token' do
      get :index, params: {org_id: 'default'}
      assert_missing_token
    end

    it 'returns templates for site admin' do
      make_site_admin
      get :index, params: {org_id: 'default'}
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['templates'].length).to eq(SystemEmailRegistry.all.length)
    end
  end

  describe 'PUT update' do
    it 'allows site admin to update default templates' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {subject: 'Custom welcome'}
      }
      expect(response).to have_http_status(:ok)
      expect(SystemEmailTemplates.lookup('user_mailer/confirm_registration')['subject']).to eq('Custom welcome')
    end

    it 'rejects support managers updating default templates' do
      make_support_manager
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {subject: 'Custom welcome'}
      }
      assert_error('Site admin required', 403)
    end

    it 'allows support managers to update org templates' do
      org = Organization.create
      make_support_manager
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: org.global_id,
        template: {subject: 'Org welcome'}
      }
      expect(response).to have_http_status(:ok)
      expect(org.reload.settings['email_templates']['user_mailer/confirm_registration']['subject']).to eq('Org welcome')
    end

    it 'rejects users without system settings access' do
      org = Organization.create
      token_user
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: org.global_id,
        template: {subject: 'Org welcome'}
      }
      assert_error('Not authorized', 403)
    end

    it 'rejects templates with Ruby code blocks' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {html_body: '<% if true %>nope<% end %>'}
      }
      assert_error('Email templates may only use <%= ... %> output tags, not Ruby code blocks (<% ... %>)', 400)
    end

    it 'rejects an i18n override with an unknown placeholder' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.parental_consent_request',
        org_id: 'default',
        template: {i18n_overrides: {'parental_consent_mailer.intro' => 'Welcome to %{app_nam}'}}
      }
      expect(response).to have_http_status(400)
      expect(JSON.parse(response.body)['error']).to include('%{app_nam}')
    end
  end

  describe 'POST preview' do
    it 'uses synthetic preview user data' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {html_body: '<p>Hello <%= @user.email %></p>'}
      }
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['html_body']).to include('preview@example.com')
      expect(json['note']).to include('synthetic')
    end

    it 'interpolates i18n placeholders in preview' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.parental_consent_request',
        org_id: 'default',
        template: {
          i18n_overrides: {
            'parental_consent_mailer.intro' => 'Welcome to %{app_name}!'
          }
        }
      }
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['html_body']).to include('Welcome to LingoLinq!')
      expect(json['html_body']).not_to include('%{app_name}')
    end

    it 'previews the payload the editor sends, with the default bodies included' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.parental_consent_request',
        org_id: 'default',
        template: {
          subject: '',
          html_body: SystemEmailTemplates.default_body('user_mailer/parental_consent_request', 'html'),
          text_body: SystemEmailTemplates.default_body('user_mailer/parental_consent_request', 'text'),
          i18n_overrides: {'parental_consent_mailer.greeting' => 'Howdy,'}
        }
      }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)['html_body']).to include('Howdy,')
    end

    it 'returns a 400 for a placeholder in a block the mailer does not interpolate' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.parental_consent_request',
        org_id: 'default',
        template: {i18n_overrides: {'parental_consent_mailer.greeting' => 'Hello %{app_name}'}}
      }
      expect(response).to have_http_status(400)
      expect(JSON.parse(response.body)['error']).to start_with('Greeting: %{app_name}')
    end

    it 'returns a 400, not a 500, for an unknown i18n placeholder' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.parental_consent_request',
        org_id: 'default',
        template: {i18n_overrides: {'parental_consent_mailer.intro' => 'Welcome to %{app_nam}'}}
      }
      expect(response).to have_http_status(400)
      expect(JSON.parse(response.body)['error']).to include('%{app_nam}')
    end
  end

  # Stored and previewed bodies are filled from a list of allowed values; the text is
  # never run as code (lib/system_email_placeholders.rb).
  describe 'placeholder-only bodies' do
      def with_env(values)
        allow(ENV).to receive(:[]).and_call_original
        values.each { |k, v| allow(ENV).to receive(:[]).with(k).and_return(v) }
        yield
      end

    it 'preview refuses a body that reads the environment, with a 400 and without the value' do
      make_site_admin
      with_env('SYSTEM_EMAIL_SPEC_CANARY' => 'canary-value-7f3') do
        post :preview, params: {
          id: 'user_mailer.confirm_registration',
          org_id: 'default',
          template: {html_body: "<p><%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %></p>"}
        }
      end
      expect(response).to have_http_status(400)
      expect(response.body).not_to include('canary-value-7f3')
      expect(JSON.parse(response.body)['error']).to include('disallowed')
    end

    it 'preview refuses a code block with a 400' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {text_body: '<% if true %>x<% end %>'}
      }
      expect(response).to have_http_status(400)
    end

    it 'preview HTML-escapes values in a custom html body' do
      make_site_admin
      allow(SystemEmailPreview).to receive(:sample_user).and_return(
        SystemEmailPreview::SampleUser.new(global_id: '1_preview', user_name: 'preview_user', name: 'Test <i>Student</i>', email: 'preview@example.com')
      )
      post :preview, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {html_body: '<p><%= @user.display_name %></p>'}
      }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)['html_body']).to eq('<p>Test &lt;i&gt;Student&lt;/i&gt;</p>')
    end

    it 'preview fills the reset, lesson and gift links with sample values, not real ones' do
      make_site_admin
      host = JsonApi::Json.absolute_host
      {
        'user_mailer.forgot_password' => ['<%= @password_reset_url %>', "#{host}/preview_user/password_reset/preview-reset-code"],
        'user_mailer.lesson_assigned' => ['<%= @lesson_url %>', "#{host}/lessons/preview-lesson/preview-lesson-nonce/preview-lesson-token"],
        'subscription_mailer.gift_created' => ['<%= @gift_redeem_url %>', "#{host}/redeem/preview-gift-code::preview-gift-verifier"]
      }.each do |id, (body, expected)|
        post :preview, params: {id: id, org_id: 'default', template: {html_body: "<p>#{body}</p>", text_body: "Link: #{body}"}}
        expect(response).to have_http_status(:ok), id
        expect(JSON.parse(response.body)['html_body']).to eq("<p>#{expected}</p>"), id
        expect(JSON.parse(response.body)['text_body']).to eq("Link: #{expected}"), id
      end
    end

    it 'preview refuses the bare reset code' do
      make_site_admin
      post :preview, params: {
        id: 'user_mailer.forgot_password',
        org_id: 'default',
        template: {text_body: 'Link: <%= @user.password_reset_code %>'}
      }
      expect(response).to have_http_status(400)
    end

    it 'update refuses a forgot_password body without the reset link' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.forgot_password',
        org_id: 'default',
        template: {text_body: 'Hello <%= @user.user_name %>'}
      }
      expect(response).to have_http_status(400)
      expect(JSON.parse(response.body)['error']).to include('@password_reset_url')
    end

    it 'show lists the links an email requires' do
      make_site_admin
      get :show, params: {id: 'user_mailer.forgot_password', org_id: 'default'}
      expect(JSON.parse(response.body)['template']['required_placeholders']).to eq(['@password_reset_url'])
    end

    it 'update refuses a body that reads the environment' do
      make_site_admin
      put :update, params: {
        id: 'user_mailer.confirm_registration',
        org_id: 'default',
        template: {text_body: "<%= ENV['SYSTEM_EMAIL_SPEC_CANARY'] %> <%= @user.registration_code %>"}
      }
      expect(response).to have_http_status(400)
      expect(SystemEmailTemplates.lookup('user_mailer/confirm_registration')).to be_nil
    end

    it 'show lists the placeholders this email accepts' do
      make_site_admin
      get :show, params: {id: 'user_mailer.confirm_registration', org_id: 'default'}
      placeholders = JSON.parse(response.body)['template']['placeholders']
      expect(placeholders).to include('app_name', '@user.user_name', '@user.email')
      expect(placeholders).not_to include('@user')
    end

    # A stored body that no longer fits (saved before the list existed, or before a value became
    # required) is not used at send; the editor must say so instead of showing it as live.
    it 'show reports a stored body that can no longer be used, per format' do
      make_site_admin
      Setting.set(SystemEmailTemplates::DEFAULT_KEY, {'user_mailer/confirm_registration' => {
        'text_body' => 'Welcome <%= @user.user_name %>',
        'html_body' => '<p><%= @user.user_name %> <%= @user.registration_code %></p>'
      }}, true)
      get :show, params: {id: 'user_mailer.confirm_registration', org_id: 'default'}
      errors = JSON.parse(response.body)['template']['override_errors']
      expect(errors['text']).to include('does not work without')
      expect(errors).not_to have_key('html')
    end

    it 'show reports no override errors for the shipped default bodies' do
      make_site_admin
      get :show, params: {id: 'user_mailer.confirm_registration', org_id: 'default'}
      expect(JSON.parse(response.body)['template']['override_errors']).to eq({})
    end

    # Many default views contain code blocks, which a stored body may not; an email with nothing
    # stored must never show the "can no longer be used" alert.
    it 'show reports no override errors for any email that has nothing stored' do
      make_site_admin
      SystemEmailRegistry.all.each do |entry|
        get :show, params: {id: entry[:key].tr('/', '.'), org_id: 'default'}
        expect(JSON.parse(response.body)['template']['override_errors']).to eq({}), entry[:key]
      end
    end

    # Every placeholder the Variables tab lists must also fill in a preview, for every email.
    it 'preview renders every listed placeholder of every email' do
      make_site_admin
      SystemEmailRegistry.all.each do |entry|
        body = SystemEmailPlaceholders.allowed_for(entry[:key]).map { |ph| "[<%= #{ph} %>]" }.join("\n")
        post :preview, params: {
          id: SystemEmailRegistry.slug_for(entry[:key]),
          org_id: 'default',
          template: {html_body: "<div>#{body}</div>", text_body: "text\n#{body}"}
        }
        expect(response).to have_http_status(:ok), "#{entry[:key]}: #{response.body[0, 300]}"
      end
    end

    # A deeply nested expression used to exhaust the stack (SystemStackError is not a
    # StandardError, so it became a 500). An over-long expression is refused before parsing.
    describe 'an over-long expression' do
      let(:nested_body) { "<%= #{'long_ordinal_date(' * 20_000}@user.expires_at#{')' * 20_000} %>" }

      it 'update refuses it with a 400 and stores nothing' do
        make_site_admin
        put :update, params: {id: 'user_mailer.confirm_registration', org_id: 'default', template: {text_body: nested_body}}
        expect(response).to have_http_status(400)
        expect(JSON.parse(response.body)['error']).to include('disallowed')
        expect(SystemEmailTemplates.lookup('user_mailer/confirm_registration')).to be_nil
      end

      it 'preview refuses it with a 400' do
        make_site_admin
        post :preview, params: {id: 'user_mailer.confirm_registration', org_id: 'default', template: {html_body: nested_body}}
        expect(response).to have_http_status(400)
        expect(JSON.parse(response.body)['error']).to include('disallowed')
      end
    end
  end
end
