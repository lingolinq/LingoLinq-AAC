require 'spec_helper'

describe AiConsent::DisclosuresController, :type => :controller do
  render_views

  describe "GET show" do
    it "renders 200 for a known version, with named vendors, retention, and revocation copy" do
      get :show, params: {version: '1'}
      expect(response).to be_successful
      body = response.body
      expect(body).to include('Anthropic')
      expect(body).to include('Claude Haiku 4.5')
      expect(body).to include('Claude Opus 4.7')
      expect(body).to include('Google')
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
end
