require 'spec_helper'
require 'yaml'

# RedisInit.init reads CACHE_TOKEN at every Rails boot (config/initializers/resque.rb,
# resolved_cache_token), so every Cloud Run surface that boots Rails must mount it, the
# migrate Job included: Jobs get no K_REVISION, so without it the Job and every one-off
# runner through it fall back to the shared static token (GitHub #423).
describe 'deploy-cloudrun.yml secrets' do
  let(:path) { Rails.root.join('.github', 'workflows', 'deploy-cloudrun.yml') }
  let(:workflow) { YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true) }

  def env_values(node, key, found = [])
    case node
    when Hash
      found << node['env'][key] if node['env'].is_a?(Hash) && node['env'].key?(key)
      node.each_value { |v| env_values(v, key, found) }
    when Array
      node.each { |v| env_values(v, key, found) }
    end
    found
  end

  def names(list)
    list.to_s.split(',').map { |pair| pair.split('=').first }
  end

  let(:boot) { env_values(workflow, 'BOOT_SECRETS') }
  let(:non_boot) { env_values(workflow, 'NON_BOOT_SECRETS') }

  it 'defines each secret set exactly once' do
    expect(boot.length).to eq(1)
    expect(non_boot.length).to eq(1)
  end

  it 'puts CACHE_TOKEN in the boot set, once, and not in the non-boot set' do
    expect(names(boot.first).count('CACHE_TOKEN')).to eq(1)
    expect(names(non_boot.first)).not_to include('CACHE_TOKEN')
  end

  it 'mounts the boot set on the migrate Job' do
    migrate = File.read(path)[/gcloud run jobs deploy "\$MIGRATE_JOB".*?--set-secrets "([^"]+)"/m, 1]
    expect(migrate).to eq('$BOOT_SECRETS')
  end
end
