require 'spec_helper'

describe "filter_parameter_logging" do
  let(:filter) { ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters) }

  it "should filter location parameters, top-level and nested" do
    res = filter.filter('latitude' => '12.5', 'longitude' => '-3.25', 'geo' => {'latitude' => '1', 'longitude' => '2'}, 'locale' => 'en')
    expect(res['latitude']).to eq('[FILTERED]')
    expect(res['longitude']).to eq('[FILTERED]')
    expect(res['geo']['latitude']).to eq('[FILTERED]')
    expect(res['geo']['longitude']).to eq('[FILTERED]')
    expect(res['locale']).to eq('en')
  end

  it "filters a typed lookup inside a supervisor_relationship hash" do
    res = filter.filter('supervisor_relationship' => {
      'lookup_key' => 'typed-name',
      'communicator_lookup' => 'typed-name',
      'owner_email' => 'a@example.com',
      'permission_level' => 'view_only'
    })
    nested = res['supervisor_relationship']
    expect(nested['lookup_key']).to eq('[FILTERED]')
    expect(nested['communicator_lookup']).to eq('[FILTERED]')
    expect(nested['owner_email']).to eq('[FILTERED]')
    expect(nested['permission_level']).to eq('view_only')
  end

  it "filters the sentence sent to ws_encrypt, and only a param named exactly text" do
    res = filter.filter('text' => '[{"label":"hello"}]', 'user_id' => '1_1', 'context' => 'a', 'next_text' => 'b')
    expect(res['text']).to eq('[FILTERED]')
    expect(res['context']).to eq('a')
    expect(res['next_text']).to eq('b')
  end
end
