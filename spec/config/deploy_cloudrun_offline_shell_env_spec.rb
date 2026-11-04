require 'spec_helper'
require 'open3'
require 'tmpdir'

# The offline app shell's setting (lib/offline_shell.rb) reaches each Cloud Run service from the
# GitHub environment variable APP_OFFLINE_APP_SHELL. The deploy uses --set-env-vars, which replaces
# the whole env set, so a value set by hand on the service would be dropped by the next deploy; the
# workflow has to carry it. Runs the real assemble step with a stub gcloud.
describe 'deploy-cloudrun.yml offline app shell setting' do
  let(:path) { Rails.root.join('.github', 'workflows', 'deploy-cloudrun.yml') }
  let(:workflow) { YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true) }
  let(:step_name) { 'Assert referenced secrets exist + assemble runtime env' }

  def assemble_step
    found = workflow['jobs'].values.flat_map { |j| j['steps'] || [] }.select { |s| s['name'] == step_name }
    expect(found.length).to eq(1)
    found.first
  end

  def assemble(value)
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, 'gcloud'), "#!/bin/bash\necho projects/p/secrets/x/versions/1\n")
      File.chmod(0o755, File.join(dir, 'gcloud'))
      github_env = File.join(dir, 'github_env')
      File.write(github_env, '')
      env = {
        'PATH' => "#{dir}:#{ENV['PATH']}",
        'GITHUB_ENV' => github_env, 'ENV_NAME' => 'staging', 'GCP_PROJECT_ID' => 'p',
        'BOOT_SECRETS' => 'A=a:latest', 'NON_BOOT_SECRETS' => 'B=b:latest',
        'APP_ENV_VARS_STATIC' => 'X=1',
        'V_UPLOADS_S3_BUCKET' => 'u', 'V_STATIC_S3_BUCKET' => 's', 'V_SENTRY_ENVIRONMENT' => 'e'
      }
      env['V_OFFLINE_APP_SHELL'] = value unless value.nil?
      out, status = Open3.capture2e(env, 'bash', '-c', assemble_step['run'])
      app_env = File.read(github_env).lines.map(&:chomp).find { |l| l.start_with?('APP_ENV_VARS=') }
      return [status.success?, out, app_env && app_env.delete_prefix('APP_ENV_VARS=').split(',')]
    end
  end

  it 'reads the value from the GitHub environment variable' do
    expect(assemble_step['env']['V_OFFLINE_APP_SHELL']).to eq('${{ vars.APP_OFFLINE_APP_SHELL }}')
  end

  it 'passes the setting to the service when it is set' do
    ok, out, vars = assemble('on')
    expect(ok).to eq(true), out
    expect(vars).to include('OFFLINE_APP_SHELL=on')
  end

  it 'passes an explicit off too, so a service can be switched off without deleting the variable' do
    ok, out, vars = assemble('off')
    expect(ok).to eq(true), out
    expect(vars).to include('OFFLINE_APP_SHELL=off')
  end

  it 'leaves it out entirely when the variable is blank or unset, which means off' do
    [nil, ''].each do |value|
      ok, out, vars = assemble(value)
      expect(ok).to eq(true), out
      expect(vars.grep(/\AOFFLINE_APP_SHELL=/)).to eq([])
    end
  end

  it 'refuses a value with a comma or whitespace, which would split into other variables' do
    ['on,EVIL=1', 'on x'].each do |value|
      ok, out, = assemble(value)
      expect(ok).to eq(false)
      expect(out).to include('APP_OFFLINE_APP_SHELL')
    end
  end
end
