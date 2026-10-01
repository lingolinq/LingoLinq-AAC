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
end
