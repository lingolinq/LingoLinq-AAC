require 'spec_helper'
require 'yaml'
require 'erb'

describe 'config/newrelic.yml COPPA attribute filters' do
  let(:config) do
    raw = File.read(Rails.root.join('config', 'newrelic.yml'))
    rendered = ERB.new(raw).result
    YAML.safe_load(rendered, aliases: true)
  end

  let(:excludes) { config.fetch('common').fetch('attributes').fetch('exclude') }

  it 'parses as valid yaml' do
    expect(config).to be_a(Hash)
  end

  it 'declares an attributes:exclude block in common defaults' do
    expect(config['common']).to have_key('attributes')
    expect(config['common']['attributes']).to have_key('exclude')
    expect(excludes).to be_an(Array)
  end

  it 'filters all request parameters' do
    expect(excludes).to include('request.parameters.*')
  end

  it 'filters request headers that can carry session or auth identity' do
    expect(excludes).to include(
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.referer'
    )
  end

  it 'filters forwarded-for header variants that leak client IP' do
    expect(excludes).to include('request.headers.x-forwarded-for')
    expect(excludes).to include('request.headers.x_forwarded_for')
  end

  it 'filters user identity custom attribute keys' do
    expect(excludes).to include('user.*', 'user_id', 'global_id')
  end

  it 'inherits the filter into every named environment via yaml anchor' do
    %w[development test production staging].each do |env|
      expect(config[env]).to be_a(Hash), "expected #{env} env to be defined"
      expect(config[env]['attributes']['exclude']).to include('request.parameters.*')
    end
  end
end
