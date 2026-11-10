require 'spec_helper'
require 'yaml'
require 'open3'
require 'tmpdir'
require 'json'

# The migrate Job is also the Job operators run one-off rake tasks through. Its env used to be a
# literal without REDIS_NAMESPACE_SUFFIX, so in nonprod (where web, worker and scheduler use
# `-dev`) every job it enqueued went to the `lingolinq` namespace, which no worker reads
# (config/initializers/resque.rb). These run the workflow's own step scripts in bash against a
# stub `gcloud`, so they test the shell that runs, not a grep of it.
describe 'deploy-cloudrun.yml migrate Job env' do
  let(:path) { Rails.root.join('.github', 'workflows', 'deploy-cloudrun.yml') }
  let(:workflow) { YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: true) }
  let(:prod_env) { 'RACK_ENV=production,RAILS_ENV=production,REDIS_TLS_VERIFY_HOSTNAME=false' }

  def step(name)
    found = workflow['jobs'].values.flat_map { |j| j['steps'] || [] }.select { |s| s['name'] == name }
    expect(found.length).to eq(1)
    found.first['run']
  end

  # A stub gcloud: logs each call, answers describe calls from the JSON files the example writes.
  def with_stub(dir)
    File.write(File.join(dir, 'gcloud'), <<~'SH')
      #!/bin/bash
      printf '%s\n' "$*" >> "$STUB_DIR/calls.log"
      case "$*" in
        "secrets versions list"*) echo "projects/p/secrets/x/versions/1" ;;
        "run jobs deploy"*) ;;
        "run jobs execute"*) ;;
        "run jobs describe"*) cat "$STUB_DIR/job.json" ;;
        "beta run worker-pools describe"*)
          if [ -f "$STUB_DIR/pool.json" ]; then cat "$STUB_DIR/pool.json"; else cat "$STUB_DIR/pool.err" >&2; exit 1; fi ;;
        "run services describe"*) [ -f "$STUB_DIR/web.json" ] && cat "$STUB_DIR/web.json" || exit 1 ;;
        *) echo "stub gcloud: unexpected $*" >&2; exit 2 ;;
      esac
    SH
    File.chmod(0o755, File.join(dir, 'gcloud'))
  end

  def run_step(script, env, dir)
    with_stub(dir)
    full_env = {'PATH' => "#{dir}:#{ENV['PATH']}", 'STUB_DIR' => dir}.merge(env)
    out, status = Open3.capture2e(full_env, 'bash', '-c', script, unsetenv_others: false)
    [out, status, File.exist?(File.join(dir, 'calls.log')) ? File.read(File.join(dir, 'calls.log')) : '']
  end

  # Cloud Run JSON shapes: a Job nests its containers deeper than a service or worker pool.
  def job_json(env)
    {'spec' => {'template' => {'spec' => {'template' => {'spec' => {'containers' => [
      {'env' => env.map { |k, v| {'name' => k, 'value' => v} }}
    ]}}}}}}.to_json
  end

  def surface_json(env)
    {'spec' => {'template' => {'spec' => {'containers' => [
      {'env' => env.map { |k, v| {'name' => k, 'value' => v} }}
    ]}}}}.to_json
  end

  describe 'the assemble step' do
    def assemble(suffix)
      Dir.mktmpdir do |dir|
        github_env = File.join(dir, 'github_env')
        File.write(github_env, '')
        env = {
          'GITHUB_ENV' => github_env, 'ENV_NAME' => 'staging', 'GCP_PROJECT_ID' => 'p',
          'BOOT_SECRETS' => 'A=a:latest', 'NON_BOOT_SECRETS' => 'B=b:latest',
          'APP_ENV_VARS_STATIC' => 'X=1',
          'V_UPLOADS_S3_BUCKET' => 'u', 'V_STATIC_S3_BUCKET' => 's', 'V_SENTRY_ENVIRONMENT' => 'e'
        }
        env['V_REDIS_NAMESPACE_SUFFIX'] = suffix unless suffix.nil?
        out, status, = run_step(step('Assert referenced secrets exist + assemble runtime env'), env, dir)
        expect(status.success?).to eq(true), out
        return File.read(github_env).lines.map(&:chomp).select { |l| l.start_with?('MIGRATE_ENV_VARS=') }
      end
    end

    it 'writes the production string unchanged when no suffix is configured' do
      expect(assemble(nil)).to eq(["MIGRATE_ENV_VARS=#{prod_env}"])
    end

    it 'never writes an empty suffix, which the initializer would read as set' do
      expect(assemble('')).to eq(["MIGRATE_ENV_VARS=#{prod_env}"])
    end

    it "adds the workers' suffix when one is configured" do
      expect(assemble('-dev')).to eq(["MIGRATE_ENV_VARS=#{prod_env},REDIS_NAMESPACE_SUFFIX=-dev"])
    end
  end

  describe 'the migrate step' do
    def migrate(job_env:, pool_env: nil, pool_err: 'ERROR: (gcloud.beta.run.worker-pools.describe) NOT_FOUND', worker_pool: 'lingolinq-worker-staging', deploy_worker: 'true', configured: '-dev', migrate_env: :default)
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, 'job.json'), job_json(job_env))
        File.write(File.join(dir, 'pool.json'), surface_json(pool_env)) if pool_env
        File.write(File.join(dir, 'pool.err'), pool_err)
        env = {
          'MIGRATE_JOB' => 'lingolinq-migrate-staging', 'WORKER_POOL' => worker_pool,
          'WEB_SERVICE' => 'lingolinq-web-staging', 'IMAGE' => 'img', 'GCP_REGION' => 'r',
          'RUNTIME_SA' => 'sa', 'GCP_CLOUDSQL_INSTANCE' => 'i', 'GCP_VPC_NETWORK' => 'n',
          'GCP_VPC_SUBNET' => 's', 'BOOT_SECRETS' => 'A=a:latest',
          'DEPLOY_WORKER_EFFECTIVE' => deploy_worker
        }
        env['V_REDIS_NAMESPACE_SUFFIX'] = configured unless configured.nil?
        if migrate_env == :default
          env['MIGRATE_ENV_VARS'] = configured.to_s.empty? ? prod_env : "#{prod_env},REDIS_NAMESPACE_SUFFIX=#{configured}"
        elsif migrate_env
          env['MIGRATE_ENV_VARS'] = migrate_env
        end
        out, status, calls = run_step(step('Run database migration (Cloud Run Job)'), env, dir)
        return {out: out, ok: status.success?, calls: calls}
      end
    end

    let(:dev_job) { {'RAILS_ENV' => 'production', 'REDIS_NAMESPACE_SUFFIX' => '-dev'} }

    it 'deploys the Job with the assembled env, not a literal' do
      r = migrate(job_env: dev_job, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-dev'})
      deploy = r[:calls].lines.find { |l| l.start_with?('run jobs deploy') }
      expect(deploy).to include("--set-env-vars #{prod_env},REDIS_NAMESPACE_SUFFIX=-dev ")
    end

    it 'runs the Job when its suffix matches the draining worker pool' do
      r = migrate(job_env: dev_job, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-dev'})
      expect(r[:ok]).to eq(true), r[:out]
      expect(r[:calls]).to include('run jobs execute')
    end

    it 'runs the production Job when neither has a suffix' do
      r = migrate(job_env: {'RAILS_ENV' => 'production'}, pool_env: {'RAILS_ENV' => 'production'}, configured: nil)
      expect(r[:ok]).to eq(true), r[:out]
      expect(r[:calls]).to include('run jobs execute')
    end

    it 'refuses to run the Job when the worker pool reads another namespace' do
      r = migrate(job_env: dev_job, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-other'})
      expect(r[:ok]).to eq(false)
      expect(r[:calls]).not_to include('run jobs execute')
      expect(r[:out]).to include('::error::')
    end

    it 'refuses to run the Job when what landed differs from what was configured' do
      # The Job and the pool agree with each other, but not with the configured suffix.
      r = migrate(job_env: {'RAILS_ENV' => 'production'}, pool_env: {'RAILS_ENV' => 'production'})
      expect(r[:ok]).to eq(false)
      expect(r[:calls]).not_to include('run jobs execute')
    end

    # Dev deploys no worker pool; staging's pool drains the shared Redis for both, so dev's Job is
    # compared with that pool, not with dev's own web service (which only echoes dev's variable).
    it 'compares with the shared staging pool in an environment that does not deploy a worker pool' do
      ok = migrate(job_env: dev_job, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-dev'}, worker_pool: 'lingolinq-worker-dev', deploy_worker: 'false')
      expect(ok[:ok]).to eq(true), ok[:out]
      expect(ok[:calls]).to include('beta run worker-pools describe lingolinq-worker-staging ')
      expect(ok[:calls]).not_to include('run services describe')
      bad = migrate(job_env: dev_job, pool_env: {'RAILS_ENV' => 'production'}, worker_pool: 'lingolinq-worker-dev', deploy_worker: 'false')
      expect(bad[:ok]).to eq(false)
      expect(bad[:calls]).not_to include('run jobs execute')
    end

    it 'checks only the configured suffix when the pool does not exist yet' do
      r = migrate(job_env: dev_job)
      expect(r[:ok]).to eq(true), r[:out]
      expect(r[:out]).to include('does not exist yet')
      expect(r[:calls]).to include('run jobs execute')
    end

    it 'refuses to run the Job when the pool cannot be read for another reason' do
      r = migrate(job_env: dev_job, pool_err: 'ERROR: (gcloud.beta.run.worker-pools.describe) PERMISSION_DENIED')
      expect(r[:ok]).to eq(false)
      expect(r[:calls]).not_to include('run jobs execute')
    end

    it 'says how to recover when the pool still reads the previous suffix' do
      r = migrate(job_env: dev_job, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-old'})
      expect(r[:ok]).to eq(false)
      expect(r[:out]).to include('worker-pools update')
    end

    it 'refuses to run a Job whose RAILS_ENV is not production' do
      r = migrate(job_env: {'RAILS_ENV' => 'staging', 'REDIS_NAMESPACE_SUFFIX' => '-dev'}, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-dev'})
      expect(r[:ok]).to eq(false)
      expect(r[:calls]).not_to include('run jobs execute')
    end

    it 'fails before deploying when the assembled env is missing' do
      r = migrate(job_env: dev_job, pool_env: {'REDIS_NAMESPACE_SUFFIX' => '-dev'}, migrate_env: nil)
      expect(r[:ok]).to eq(false)
      expect(r[:calls]).not_to include('run jobs deploy')
    end
  end

  # The dedupe utility Job copies its config from a live web service but wrote the same
  # three-variable literal, so it too ran outside the workers' namespace.
  describe 'scripts/gcp/dedupe-utility-boards-dryrun.sh' do
    def dedupe(web_env)
      Dir.mktmpdir do |dir|
        service = {'spec' => {'template' => {
          'metadata' => {'annotations' => {'run.googleapis.com/cloudsql-instances' => 'lingolinq-nonprod:r:db'}},
          'spec' => {'serviceAccountName' => 'sa', 'containers' => [{'image' => 'img', 'env' => web_env}]}
        }}}
        File.write(File.join(dir, 'service.json'), service.to_json)
        File.write(File.join(dir, 'gcloud'), <<~'SH')
          #!/bin/bash
          printf '%s\n' "$*" >> "$STUB_DIR/calls.log"
          case "$*" in
            "config get-value project"*) echo lingolinq-nonprod ;;
            "run services describe"*) cat "$STUB_DIR/service.json" ;;
            "run jobs deploy"*|"run jobs execute"*) ;;
            *) echo "stub gcloud: unexpected $*" >&2; exit 2 ;;
          esac
        SH
        File.chmod(0o755, File.join(dir, 'gcloud'))
        script = Rails.root.join('scripts', 'gcp', 'dedupe-utility-boards-dryrun.sh').to_s
        out, status = Open3.capture2e({'PATH' => "#{dir}:#{ENV['PATH']}", 'STUB_DIR' => dir},
                                      'bash', script, '--web', 'lingolinq-web-staging', chdir: dir)
        calls = File.exist?(File.join(dir, 'calls.log')) ? File.read(File.join(dir, 'calls.log')) : ''
        return {out: out, ok: status.success?, deploy: calls.lines.find { |l| l.start_with?('run jobs deploy') }}
      end
    end

    it "copies the web service's plain namespace suffix" do
      r = dedupe([{'name' => 'REDIS_NAMESPACE_SUFFIX', 'value' => '-dev'}])
      expect(r[:ok]).to eq(true), r[:out]
      expect(r[:deploy][/--set-env-vars (\S+)/, 1]).to eq("#{prod_env},REDIS_NAMESPACE_SUFFIX=-dev")
    end

    it 'keeps the literal when the web service has no suffix, or an empty one' do
      [[], [{'name' => 'REDIS_NAMESPACE_SUFFIX', 'value' => ''}]].each do |env|
        r = dedupe(env)
        expect(r[:ok]).to eq(true), r[:out]
        expect(r[:deploy][/--set-env-vars (\S+)/, 1]).to eq(prod_env)
      end
    end

    it 'refuses a suffix that is not a plain token, since its flags file is sourced' do
      r = dedupe([{'name' => 'REDIS_NAMESPACE_SUFFIX', 'value' => '-dev;touch x'}])
      expect(r[:ok]).to eq(false)
      expect(r[:deploy]).to eq(nil)
    end

    it 'leaves a secret-backed suffix to the copied secrets, not the plain env' do
      r = dedupe([{'name' => 'REDIS_NAMESPACE_SUFFIX', 'valueFrom' => {'secretKeyRef' => {'name' => 'S', 'key' => 'latest'}}}])
      expect(r[:ok]).to eq(true), r[:out]
      expect(r[:deploy][/--set-env-vars (\S+)/, 1]).to eq(prod_env)
      expect(r[:deploy][/--set-secrets (\S+)/, 1]).to eq('REDIS_NAMESPACE_SUFFIX=S:latest')
    end
  end
end
