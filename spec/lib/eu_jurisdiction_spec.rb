require 'spec_helper'

describe EuJurisdiction do
  # Lightweight stand-ins: EuJurisdiction only reads .settings and .managing_organization,
  # so these specs need no database.
  def org(settings = {})
    Struct.new(:settings).new(settings)
  end

  def user(prefs: nil, org_obj: nil)
    u = Object.new
    s = prefs.nil? ? {} : { 'preferences' => prefs }
    u.define_singleton_method(:settings) { s }
    u.define_singleton_method(:managing_organization) { org_obj }
    u
  end

  describe ".status" do
    it "returns :unknown for a nil user (fail-safe)" do
      expect(EuJurisdiction.status(nil)).to eq(:unknown)
    end

    it "returns :unknown for an en-locale user with no authoritative signal" do
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'en' }))).to eq(:unknown)
    end

    it "resolves en-locale + EU org to :eu (org is authoritative)" do
      u = user(prefs: { 'locale' => 'en' }, org_obj: org('jurisdiction' => 'DE'))
      expect(EuJurisdiction.status(u)).to eq(:eu)
    end

    it "resolves en-locale + US org to :non_eu (authoritative exclusion)" do
      u = user(prefs: { 'locale' => 'en' }, org_obj: org('jurisdiction' => 'US'))
      expect(EuJurisdiction.status(u)).to eq(:non_eu)
    end

    it "honors an explicit user jurisdiction over locale" do
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'FR', 'locale' => 'en' }))).to eq(:eu)
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'US', 'locale' => 'de' }))).to eq(:non_eu)
    end

    it "treats the literal 'EU' code as EU" do
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'eu' }))).to eq(:eu)
    end

    it "infers EU from an EU region suffix on a broad language (en-IE)" do
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'en-IE' }))).to eq(:eu)
    end

    it "infers EU from a bare EU-primary language (de)" do
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'de' }))).to eq(:eu)
    end

    it "does NOT treat UK/en-GB as EU (post-Brexit)" do
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'en-GB' }))).to eq(:unknown)
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'GB' }))).to eq(:non_eu)
    end

    it "does not let locale EXCLUDE anyone (en falls through to :unknown, not :non_eu)" do
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'en-US' }))).to eq(:unknown)
    end

    it "does NOT treat an unrecognized explicit jurisdiction as authoritative non-EU (fail-safe)" do
      # garbage / full-name / non-allowlisted 2-letter values must fall through to
      # :unknown (disclose), never suppress the modal.
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'Atlantis', 'locale' => 'en' }))).to eq(:unknown)
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'United States', 'locale' => 'en' }))).to eq(:unknown)
      expect(EuJurisdiction.status(user(prefs: { 'jurisdiction' => 'XX', 'locale' => 'en' }))).to eq(:unknown)
      u = user(prefs: { 'locale' => 'en' }, org_obj: org('jurisdiction' => 'USA'))
      expect(EuJurisdiction.disclosure_required?(u)).to be(true)
    end

    it "resolves :eu when EITHER org or user indicates EU (a user pref cannot override an EU org)" do
      eu_org_us_user = user(prefs: { 'jurisdiction' => 'US', 'locale' => 'en' }, org_obj: org('jurisdiction' => 'DE'))
      expect(EuJurisdiction.status(eu_org_us_user)).to eq(:eu)

      us_org_eu_user = user(prefs: { 'jurisdiction' => 'FR' }, org_obj: org('jurisdiction' => 'US'))
      expect(EuJurisdiction.status(us_org_eu_user)).to eq(:eu)
    end

    it "handles region suffixes and underscore separators" do
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'de_DE' }))).to eq(:eu)
      expect(EuJurisdiction.status(user(prefs: { 'locale' => 'pt-PT' }))).to eq(:eu)
    end
  end

  describe ".disclosure_required?" do
    it "requires disclosure for EU" do
      expect(EuJurisdiction.disclosure_required?(user(prefs: { 'jurisdiction' => 'FR' }))).to be(true)
    end

    it "requires disclosure for UNKNOWN (fail-safe)" do
      expect(EuJurisdiction.disclosure_required?(user(prefs: { 'locale' => 'en' }))).to be(true)
      expect(EuJurisdiction.disclosure_required?(nil)).to be(true)
    end

    it "suppresses disclosure ONLY for an authoritative non-EU signal" do
      expect(EuJurisdiction.disclosure_required?(user(prefs: { 'jurisdiction' => 'US' }))).to be(false)
    end
  end

  describe ".eu?" do
    it "is true only for a positive EU resolution" do
      expect(EuJurisdiction.eu?(user(prefs: { 'jurisdiction' => 'IT' }))).to be(true)
      expect(EuJurisdiction.eu?(user(prefs: { 'locale' => 'en' }))).to be(false)
      expect(EuJurisdiction.eu?(nil)).to be(false)
    end
  end
end
