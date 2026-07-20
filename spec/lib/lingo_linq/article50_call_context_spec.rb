require 'spec_helper'
require 'lingo_linq/article50_call_context'

describe LingoLinq::Article50CallContext do
  # Lightweight stand-ins mirroring spec/lib/eu_jurisdiction_spec.rb: the helper only
  # reads what EuJurisdiction + article_50_disclosure_shown? read, so no database needed.
  def org(settings = {})
    Struct.new(:settings).new(settings)
  end

  # `shown:` toggles the B3 read; the object answers article_50_disclosure_shown?
  # (ignoring the disclosures_version kwarg) so we can test the composed shape without
  # a persisted User.
  def user(prefs: nil, org_obj: nil, shown: false)
    u = Object.new
    s = prefs.nil? ? {} : { 'preferences' => prefs }
    u.define_singleton_method(:settings) { s }
    u.define_singleton_method(:managing_organization) { org_obj }
    u.define_singleton_method(:article_50_disclosure_shown?) { |**_kw| shown }
    u
  end

  describe '.for' do
    it 'returns EU jurisdiction and shown:false for a confirmed :eu user (default state)' do
      u = user(prefs: { 'jurisdiction' => 'FR' })
      expect(LingoLinq::Article50CallContext.for(u)).to eq(
        jurisdiction: 'EU', article_50_disclosure_shown: false
      )
    end

    it 'returns nil jurisdiction and shown:false for an authoritative :non_eu user' do
      u = user(prefs: { 'jurisdiction' => 'US' })
      expect(LingoLinq::Article50CallContext.for(u)).to eq(
        jurisdiction: nil, article_50_disclosure_shown: false
      )
    end

    it 'returns nil jurisdiction and shown:false for an :unknown user (D-01: NOT EU)' do
      u = user(prefs: { 'locale' => 'en' })
      expect(EuJurisdiction.status(u)).to eq(:unknown)
      expect(LingoLinq::Article50CallContext.for(u)).to eq(
        jurisdiction: nil, article_50_disclosure_shown: false
      )
    end

    it 'returns both keys with safe defaults for a nil user' do
      expect(LingoLinq::Article50CallContext.for(nil)).to eq(
        jurisdiction: nil, article_50_disclosure_shown: false
      )
    end

    it 'reflects a user whose disclosure has been shown at the current version' do
      u = user(prefs: { 'jurisdiction' => 'DE' }, shown: true)
      expect(LingoLinq::Article50CallContext.for(u)).to eq(
        jurisdiction: 'EU', article_50_disclosure_shown: true
      )
    end

    it 'ALWAYS returns a Hash carrying both keys' do
      res = LingoLinq::Article50CallContext.for(user(prefs: { 'locale' => 'en' }))
      expect(res).to be_a(Hash)
      expect(res.keys).to contain_exactly(:jurisdiction, :article_50_disclosure_shown)
    end
  end

  describe 'guarded fallback (Codex M2: degrade, but never silently)' do
    it 'degrades jurisdiction to nil and logs exactly one SCRUBBED warn while the disclosure field still resolves' do
      u = user(prefs: { 'jurisdiction' => 'FR' }, shown: true)
      allow(EuJurisdiction).to receive(:retention_stamp).and_raise(StandardError.new('boom-secret-value'))
      # Exactly one warn; message carries the exception CLASS only, never the message
      # text, the user, or any settings value.
      expect(Rails.logger).to receive(:warn).once do |msg|
        expect(msg).to include('StandardError')
        expect(msg).not_to include('boom-secret-value')
        expect(msg).not_to include('FR')
      end
      res = LingoLinq::Article50CallContext.for(u)
      expect(res[:jurisdiction]).to be_nil
      expect(res[:article_50_disclosure_shown]).to eq(true)
    end

    it 'degrades disclosure to false and logs exactly one SCRUBBED warn while jurisdiction still resolves' do
      u = user(prefs: { 'jurisdiction' => 'FR' })
      u.define_singleton_method(:article_50_disclosure_shown?) do |**_kw|
        raise StandardError, 'leak-me'
      end
      expect(Rails.logger).to receive(:warn).once do |msg|
        expect(msg).to include('StandardError')
        expect(msg).not_to include('leak-me')
      end
      res = LingoLinq::Article50CallContext.for(u)
      expect(res[:jurisdiction]).to eq('EU')
      expect(res[:article_50_disclosure_shown]).to eq(false)
    end
  end
end
