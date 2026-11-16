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

  # `env_name` and `ses` default to the staging run the offline-shell examples use; production needs the values it
  # requires (UPLOADS_S3_CDN, REMOTE_EXTRA_DATA, MEDIACONVERT_QUEUE_ARN).
  def assemble(value, env_name: 'staging', ses: nil)
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, 'gcloud'), "#!/bin/bash\necho projects/p/secrets/x/versions/1\n")
      File.chmod(0o755, File.join(dir, 'gcloud'))
      github_env = File.join(dir, 'github_env')
      File.write(github_env, '')
      env = {
        'PATH' => "#{dir}:#{ENV['PATH']}",
        'GITHUB_ENV' => github_env, 'ENV_NAME' => env_name, 'GCP_PROJECT_ID' => 'p',
        'BOOT_SECRETS' => 'A=a:latest', 'NON_BOOT_SECRETS' => 'B=b:latest',
        'APP_ENV_VARS_STATIC' => 'X=1',
        'V_UPLOADS_S3_BUCKET' => 'u', 'V_STATIC_S3_BUCKET' => 's', 'V_SENTRY_ENVIRONMENT' => 'e'
      }
      env['V_OFFLINE_APP_SHELL'] = value unless value.nil?
      env['V_SES_EVENTS_QUEUE_URL'] = ses unless ses.nil?
      if env_name == 'production'
        env.merge!('V_UPLOADS_S3_CDN' => 'cdn.example.com', 'V_REMOTE_EXTRA_DATA' => 'true', 'V_MEDIACONVERT_QUEUE_ARN' => 'arn:aws:mediaconvert:us-west-2:000000000000:queues/example')
      end
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

  # Merged from develop with this file's step (2026-11-13): the SES events queue is consumed by the production scheduler
  # only. Staging sends use the same SES configuration set and land on the same queue, so a second consumer there would
  # drain it and write email_disabled into the nonprod database; the step refuses rather than skips. Both settings must
  # survive the same assemble step together.
  describe 'with the SES events queue (production only)' do
    let(:queue) { 'https://sqs.us-west-2.amazonaws.com/000000000000/example-ses-events' }

    it 'refuses the queue in any environment other than production' do
      ok, out, = assemble('on', env_name: 'staging', ses: queue)
      expect(ok).to eq(false)
      expect(out).to include('APP_SES_EVENTS_QUEUE_URL')
    end

    it 'passes the queue and the offline shell setting together in production' do
      ok, out, vars = assemble('on', env_name: 'production', ses: queue)
      expect(ok).to eq(true), out
      expect(vars).to include("SES_EVENTS_QUEUE_URL=#{queue}")
      expect(vars).to include('OFFLINE_APP_SHELL=on')
    end
  end
end
