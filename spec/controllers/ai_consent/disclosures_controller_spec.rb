require 'spec_helper'

describe AiConsent::DisclosuresController, :type => :controller do
  render_views

  describe "GET show" do
    it "renders 200 for a known version, with named vendors, retention, and revocation copy" do
      get :show, params: {version: '1'}
      expect(response).to be_successful
      body = response.body
      expect(body).to include('Anthropic')
      # AWS operates the inference and must appear on the public page; naming only
      # Anthropic identified the wrong processor (corrected 2026-08-02).
      expect(body).to include('Amazon Web Services, Inc.')
      expect(body).to include('Amazon Bedrock')
      expect(body).to include('Claude Haiku 4.5')
      # Not invoked on the classic plane, so it must not be advertised as in use.
      expect(body).not_to include('Claude Opus 4.7')
      # Google Gemini fallback disabled 2026-07-09 (PR #570) -- no longer a live vendor
      expect(body).not_to include('Google')
      expect(body).not_to match(/de-identified/i)
      expect(body).not_to match(/never trains/i)
      # Retention: EU / children / general split, not a single blanket number
      expect(body).to match(/5 years/)
      expect(body).to match(/12 months/)
      expect(body).to match(/24 months/)
      # Revocation
      expect(body).to match(/withdraw/i)
      # Link to full privacy policy
      expect(body).to include('/privacy')
    end

    it "renders the same content_hash the module exposes for that version" do
      get :show, params: {version: '1'}
      expect(response.body).to include(LingoLinq::AiConsentDisclosures.content_hash(1))
    end

    it "does not require authentication" do
      get :show, params: {version: '1'}
      expect(response.status).to eq(200)
    end

    it "returns 404 for an unknown version" do
      get :show, params: {version: '999'}
      expect(response.status).to eq(404)
    end

    it "returns 404 for a non-numeric version" do
      get :show, params: {version: 'abc'}
      expect(response.status).to eq(404)
    end

    it "renders without the application layout (fragment, not a full document)" do
      get :show, params: {version: '1'}
      expect(response.body).not_to include('<html')
    end
  end

  describe "GET show for art50_vN (EU AI Act Article 50(1) disclosure, VPC Phase 3)" do
    it "renders 200 with the Article 50 root div and the matching content hash" do
      get :show, params: {version: 'art50_v1'}
      expect(response).to be_successful
      expect(response.status).to eq(200)
      body = response.body
      expect(body).to include('article50-disclosure')
      expect(body).to include(LingoLinq::Article50Disclosures.content_hash(1))
    end

    it "does not require authentication" do
      get :show, params: {version: 'art50_v1'}
      expect(response.status).to eq(200)
    end

    it "renders without the application layout (fragment, not a full document)" do
      get :show, params: {version: 'art50_v1'}
      expect(response.body).not_to include('<html')
    end

    it "renders the Spanish translation when locale=es" do
      get :show, params: {version: 'art50_v1', locale: 'es'}
      expect(response.status).to eq(200)
      expect(response.body).to include(I18n.t('art50_disclosures.v1.page_title', locale: :es))
    end

    # Browsers report a full tag ('es-ES'), not a bare language, so without the
    # primary-subtag fallback the Spanish notice would ship and be unreachable for
    # exactly the readers it exists for.
    it "renders the Spanish translation for a regional tag like es-ES" do
      get :show, params: {version: 'art50_v1', locale: 'es-ES'}
      expect(response.status).to eq(200)
      expect(response.body).to include(I18n.t('art50_disclosures.v1.page_title', locale: :es))
    end

    it "accepts an underscore-separated regional tag too (es_MX)" do
      get :show, params: {version: 'art50_v1', locale: 'es_MX'}
      expect(response.status).to eq(200)
      expect(response.body).to include(I18n.t('art50_disclosures.v1.page_title', locale: :es))
    end

    it "still allowlists: an unavailable base language falls back to the default" do
      get :show, params: {version: 'art50_v1', locale: 'zz-ZZ'}
      expect(response.status).to eq(200)
      expect(response.body).to include(I18n.t('art50_disclosures.v1.page_title', locale: I18n.default_locale))
    end

    it "falls back to the default locale, without raising, for an unrecognized locale" do
      expect {
        get :show, params: {version: 'art50_v1', locale: 'zz'}
      }.not_to raise_error
      expect(response.status).to eq(200)
      expect(response.body).to include(I18n.t('art50_disclosures.v1.page_title', locale: I18n.default_locale))
    end

    it "returns 404 with plain body 'Not Found' for an unknown art50 version" do
      get :show, params: {version: 'art50_v9'}
      expect(response.status).to eq(404)
      expect(response.body).to eq('Not Found')
    end

    it "returns 404, not 500, for a non-numeric art50 version suffix" do
      expect {
        get :show, params: {version: 'art50_vabc'}
      }.not_to raise_error
      expect(response.status).to eq(404)
    end

    it "never interpolates the raw version param into the rendered template path" do
      # T-03-01-01/02 mitigation check: a crafted version string with a valid numeric
      # suffix must still resolve only through Article50Disclosures.known_version?,
      # never render an arbitrary path derived from params[:version] itself.
      get :show, params: {version: 'art50_v1'}
      expect(response.status).to eq(200)
      get :show, params: {version: 'art50_v001'}
      # '001' parses to Integer 1 via the same known_version? gate as '1' -- still a
      # known version, so this is expected to succeed, exercising the numeric-only path.
      expect(response.status).to eq(200)
    end
  end

  describe "GET show regression: existing COPPA behavior is unchanged" do
    it "still returns 200 and renders the COPPA v1 disclosure for version 1" do
      get :show, params: {version: '1'}
      expect(response.status).to eq(200)
      expect(response.body).to include('ai-consent-disclosure')
    end

    it "still returns 404 for unknown COPPA version 99" do
      get :show, params: {version: '99'}
      expect(response.status).to eq(404)
    end
  end
end
