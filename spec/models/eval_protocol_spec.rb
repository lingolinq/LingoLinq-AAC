require 'spec_helper'

describe EvalProtocol, type: :model do
  describe 'generate_defaults' do
    it 'sets default settings shape' do
      ep = EvalProtocol.new
      ep.generate_defaults
      expect(ep.settings).to_not eq(nil)
      expect(ep.settings['protocol']).to eq({})
      expect(ep.settings['public']).to eq(true)
      expect(ep.protocol_version).to eq('1.0')
    end

    it 'clears public_protocol_id for private protocols' do
      ep = EvalProtocol.new(settings: { 'public' => false }, public_protocol_id: 'abc')
      ep.generate_defaults
      expect(ep.public_protocol_id).to eq(nil)
    end
  end

  describe 'static_template' do
    it 'returns nil for unknown code' do
      expect(EvalProtocol.static_template('asdf')).to eq(nil)
    end

    it 'returns one of the five baseline profiles' do
      ep = EvalProtocol.static_template('peds-emerging')
      expect(ep).to be_a(EvalProtocol)
      expect(ep.public_protocol_id).to eq('peds-emerging')
      expect(ep.population_profile).to eq('peds-emerging')
      expect(ep.settings['protocol']['name']).to match(/Emerging/)
      expect(ep.settings['protocol']['subtests']).to be_a(Array)
      expect(ep.settings['protocol']['subtests'].length).to be > 0
    end

    it 'returns all five static profiles' do
      list = EvalProtocol.static_templates
      expect(list.length).to eq(5)
      expect(list.map(&:public_protocol_id)).to match_array(EvalProtocol::STATIC_PROFILES)
    end
  end

  describe 'profile_for_intake' do
    it 'routes pre-symbolic intake to early-comm' do
      profile = EvalProtocol.profile_for_intake('current_comm' => 'pre_symbolic', 'age_band' => '6-12')
      expect(profile).to eq('early-comm')
    end

    it 'routes pediatric single-symbol to peds-emerging' do
      profile = EvalProtocol.profile_for_intake('current_comm' => 'single_symbol', 'age_band' => '6-12')
      expect(profile).to eq('peds-emerging')
    end

    it 'routes pediatric phrase-level to peds-established' do
      profile = EvalProtocol.profile_for_intake('current_comm' => 'sentence', 'age_band' => '13-21')
      expect(profile).to eq('peds-established')
    end

    it 'routes adult progressive etiology to adult-progressive regardless of age' do
      profile = EvalProtocol.profile_for_intake('etiology' => 'progressive', 'age_band' => '22-64', 'current_comm' => 'sentence')
      expect(profile).to eq('adult-progressive')
    end

    it 'routes adult acquired to adult-motor' do
      profile = EvalProtocol.profile_for_intake('etiology' => 'acquired', 'age_band' => '22-64')
      expect(profile).to eq('adult-motor')
    end

    it 'falls back to peds-emerging when nothing matches' do
      expect(EvalProtocol.profile_for_intake({})).to eq('peds-emerging')
    end

    it 'tolerates symbol keys' do
      profile = EvalProtocol.profile_for_intake(current_comm: 'pre_symbolic', age_band: '6-12')
      expect(profile).to eq('early-comm')
    end
  end

  describe 'find_by_code' do
    it 'returns static template by code' do
      ep = EvalProtocol.find_by_code('adult-motor')
      expect(ep).to be_a(EvalProtocol)
      expect(ep.public_protocol_id).to eq('adult-motor')
    end

    it 'returns nil for unknown codes' do
      expect(EvalProtocol.find_by_code('bacon')).to eq(nil)
      expect(EvalProtocol.find_by_code(nil)).to eq(nil)
    end
  end
end
