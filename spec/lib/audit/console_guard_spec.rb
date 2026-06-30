require 'spec_helper'
require 'open3'

# lib/audit is excluded from Zeitwerk (loaded pre-boot from bin/rails and from
# the auditing initializer), so require it explicitly here.
require Rails.root.join('lib/audit/console_guard')

describe Audit::ConsoleGuard do
  # Pure-Ruby guard: every example passes env as an explicit Hash so nothing
  # depends on the process ENV or the test database.
  def prod(extra = {})
    { 'RAILS_ENV' => 'production' }.merge(extra)
  end

  def dev(extra = {})
    { 'RAILS_ENV' => 'development' }.merge(extra)
  end

  describe 'exception hierarchy' do
    it 'defines UnauthorizedConsole and ForbiddenCommand under a shared base' do
      expect(Audit::ConsoleGuard::UnauthorizedConsole).to be < Audit::ConsoleGuard::Error
      expect(Audit::ConsoleGuard::ForbiddenCommand).to be < Audit::ConsoleGuard::Error
      expect(Audit::ConsoleGuard::Error).to be < StandardError
    end
  end

  describe '.enforce_pre_boot!' do
    context 'in production' do
      it 'refuses an un-keyed console' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], prod) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses an un-keyed runner' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('runner', %w[runner Foo.bar], prod) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses a blank or whitespace USER_KEY (presence is not enough)' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], prod('USER_KEY' => '')) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], prod('USER_KEY' => '   ')) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'allows a keyed console and returns its classification' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], prod('USER_KEY' => 'scot')))
          .to eq(:console)
      end

      it 'allows a keyed runner and returns its classification' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('runner', %w[runner Foo.bar], prod('USER_KEY' => 'scot')))
          .to eq(:runner)
      end

      it 'forbids db/dbconsole (HIPAA)' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('dbconsole', %w[dbconsole], prod) }
          .to raise_error(Audit::ConsoleGuard::ForbiddenCommand)
      end

      it 'treats the c/r aliases like console/runner' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('c', %w[c], prod) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
        expect { Audit::ConsoleGuard.enforce_pre_boot!('r', %w[r Foo.bar], prod) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end
    end

    context 'when production is selected on the command line (RAILS_ENV unset)' do
      # The guard must see the environment the way Rails will resolve it, or
      # `bin/rails console -e production` bypasses the refusal.
      it 'refuses `-e production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -e production], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses `--environment=production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console --environment=production], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses a positional `console production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console production], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses runner `-e production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('runner', %w[runner -e production Foo.bar], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'allows the same keyed CLI-production console' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -e production], { 'USER_KEY' => 'scot' }))
          .to eq(:console)
      end
    end

    context 'when production is abbreviated on the command line (railties expands prefixes)' do
      # Rails::Command::EnvironmentArgument#expand_environment_name resolves any
      # prefix of production/development/test to the full name, so an un-keyed
      # `console -e p` boots production. The guard must expand the same way or
      # the refusal is defeated with a two-character argument.
      %w[p pr pro prod produ produc product producti productio].each do |abbr|
        it "refuses an un-keyed `console -e #{abbr}`" do
          expect { Audit::ConsoleGuard.enforce_pre_boot!('console', ['console', '-e', abbr], {}) }
            .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
        end
      end

      it 'refuses `--environment=p`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console --environment=p], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses the glued short form `-eprod`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -eprod], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses the long-option abbreviation `--env=production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console --env=production], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses `--env production` and `--env=p`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console --env production], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console --env=p], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'forbids `dbconsole --env=p` (HIPAA refusal sees the long abbreviation)' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('dbconsole', %w[dbconsole --env=p], {}) }
          .to raise_error(Audit::ConsoleGuard::ForbiddenCommand)
      end

      it 'refuses an abbreviated positional `console pro`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console pro], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'forbids `dbconsole -e p` (HIPAA refusal must also see the abbreviation)' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('dbconsole', %w[dbconsole -e p], {}) }
          .to raise_error(Audit::ConsoleGuard::ForbiddenCommand)
      end

      it 'does NOT over-refuse a non-production abbreviation (`-e d` is development)' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -e d], {})).to eq(:console)
      end
    end

    context 'when the environment flag is repeated (Thor/railties use the last occurrence)' do
      # `-e development -e production` boots production (last wins). Returning on
      # the first flag would let this slip past the refusal.
      it 'refuses an un-keyed `console -e development -e production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -e development -e production], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses the abbreviated repeat `console -e d -e p`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -e d -e p], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'refuses `runner -e d -e p` and forbids `dbconsole -e development -e production`' do
        expect { Audit::ConsoleGuard.enforce_pre_boot!('runner', %w[runner -e d -e p Foo.bar], {}) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
        expect { Audit::ConsoleGuard.enforce_pre_boot!('dbconsole', %w[dbconsole -e development -e production], {}) }
          .to raise_error(Audit::ConsoleGuard::ForbiddenCommand)
      end

      it 'honors a production-then-development repeat as development (last wins, not refused)' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -e production -e development], {}))
          .to eq(:console)
      end
    end

    context 'when RAILS_ENV is blank (Rails falls through to RACK_ENV via .presence)' do
      # Rails::Command.environment is RAILS_ENV.presence || RACK_ENV.presence,
      # so an empty RAILS_ENV must NOT mask a production RACK_ENV.
      it 'refuses an un-keyed console with RAILS_ENV="" and RACK_ENV=production' do
        env = { 'RAILS_ENV' => '', 'RACK_ENV' => 'production' }
        expect { Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], env) }
          .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
      end

      it 'allows the same session when keyed' do
        env = { 'RAILS_ENV' => '  ', 'RACK_ENV' => 'production', 'USER_KEY' => 'scot' }
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], env)).to eq(:console)
      end

      it 'does NOT expand an abbreviated RAILS_ENV (env vars are verbatim, only -e expands)' do
        # Rails boots the literal env named in RAILS_ENV; `prod` is not production.
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], { 'RAILS_ENV' => 'prod' }))
          .to eq(:console)
      end
    end

    context 'when args appear after a `--` terminator (Rails forwards them to the REPL)' do
      it 'does not treat `console -- -e production` as a production console' do
        # Rails strips everything after `--` for IRB, so this is a development
        # console; the guard must not over-refuse it.
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console -- -e production], {}))
          .to eq(:console)
      end
    end

    context 'in development' do
      it 'allows an un-keyed console (local-dev DX preserved)' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('console', %w[console], dev)).to eq(:console)
      end

      it 'allows an un-keyed runner' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('runner', %w[runner Foo.bar], dev)).to eq(:runner)
      end

      it 'does not forbid db/dbconsole' do
        expect(Audit::ConsoleGuard.enforce_pre_boot!('dbconsole', %w[dbconsole], dev)).to eq(:other)
      end
    end

    it 'passes non-console commands straight through' do
      expect(Audit::ConsoleGuard.enforce_pre_boot!('server', %w[server], prod)).to eq(:other)
      expect(Audit::ConsoleGuard.enforce_pre_boot!('db:migrate', %w[db:migrate], prod)).to eq(:other)
    end
  end

  describe '.session_attrs' do
    it 'builds the console payload' do
      expect(Audit::ConsoleGuard.session_attrs('console', %w[console]))
        .to eq('type' => 'rails/console', 'command' => 'console')
    end

    it 'builds the runner payload with the full command line' do
      expect(Audit::ConsoleGuard.session_attrs('runner', %w[runner Foo.bar]))
        .to eq('type' => 'rails/runner', 'command' => 'runner Foo.bar')
    end
  end

  describe '.key_present?' do
    it 'is false for nil, empty, and whitespace' do
      expect(Audit::ConsoleGuard.key_present?({})).to be(false)
      expect(Audit::ConsoleGuard.key_present?('USER_KEY' => '')).to be(false)
      expect(Audit::ConsoleGuard.key_present?('USER_KEY' => "  \t")).to be(false)
    end

    it 'is true for a real key' do
      expect(Audit::ConsoleGuard.key_present?('USER_KEY' => 'scot')).to be(true)
    end
  end

  describe '.enforce_runtime! (authoritative in-hook backstop)' do
    def prod_env!
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('production'))
    end

    it 'raises for an un-keyed production console (no CLI parsing involved)' do
      prod_env!
      expect { Audit::ConsoleGuard.enforce_runtime!('console', {}) }
        .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
    end

    it 'raises for an un-keyed production runner' do
      prod_env!
      expect { Audit::ConsoleGuard.enforce_runtime!('runner', { 'USER_KEY' => '  ' }) }
        .to raise_error(Audit::ConsoleGuard::UnauthorizedConsole)
    end

    it 'allows a keyed production session' do
      prod_env!
      expect { Audit::ConsoleGuard.enforce_runtime!('console', { 'USER_KEY' => 'scot' }) }
        .not_to raise_error
    end

    it 'allows an un-keyed non-production session' do
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('development'))
      expect { Audit::ConsoleGuard.enforce_runtime!('console', {}) }.not_to raise_error
    end
  end
end

describe Audit::SessionLogger do
  describe '.record!' do
    it 'does not write a row for a blank key' do
      expect(AuditEvent).not_to receive(:create!)
      expect(Audit::SessionLogger.record!('console', '', %w[console])).to be_nil
    end

    it 'writes a session-open row with the right payload for a keyed session' do
      expect(AuditEvent).to receive(:create!)
        .with(hash_including(user_key: 'scot', data: { 'type' => 'rails/console', 'command' => 'console' }))
      Audit::SessionLogger.record!('console', 'scot', %w[console])
    end

    it 'keeps the runner command line out of the plaintext (non-encrypted) summary' do
      # AuditEvent#data is secure_serialize'd (encrypted) but #summary is a
      # plaintext column. The full runner argv must stay in data only.
      captured = nil
      allow(AuditEvent).to receive(:create!) { |attrs| captured = attrs }
      Audit::SessionLogger.record!('runner', 'scot', ['runner', 'User.find_by(email: "child@school.edu")'])
      expect(captured[:data]['command']).to include('child@school.edu')
      expect(captured[:summary]).not_to include('child@school.edu')
      expect(captured[:summary]).to include('rails/runner')
    end

    context 'when the audit write fails' do
      before do
        allow(AuditEvent).to receive(:create!).and_raise(StandardError.new('db down'))
      end

      it 'is fail-closed in production (re-raises so the session does not proceed)' do
        allow(Audit::SessionLogger).to receive(:production_runtime?).and_return(true)
        expect { Audit::SessionLogger.record!('console', 'scot', %w[console]) }
          .to raise_error(StandardError, 'db down')
      end

      it 'is fail-open-but-loud in non-production (warns and proceeds)' do
        allow(Audit::SessionLogger).to receive(:production_runtime?).and_return(false)
        expect(Audit::SessionLogger).to receive(:warn)
        expect { Audit::SessionLogger.record!('console', 'scot', %w[console]) }.not_to raise_error
      end
    end

    context 'end-to-end row creation' do
      # AuditEvent.create! commits outside the per-example transaction, so clean
      # up explicitly inside this context rather than relying on rollback.
      before { AuditEvent.delete_all }
      after  { AuditEvent.delete_all }

      it 'persists a real rails/runner AuditEvent' do
        Audit::SessionLogger.record!('runner', 'scot', %w[runner Foo.bar])
        row = AuditEvent.last
        expect(row.user_key).to eq('scot')
        expect(row.data['type']).to eq('rails/runner')
        expect(row.data['command']).to eq('runner Foo.bar')
      end

      it 'does not persist runner argv into the plaintext summary column' do
        Audit::SessionLogger.record!('runner', 'scot', ['runner', 'User.find_by(email: "child@school.edu")'])
        row = AuditEvent.last
        expect(row.data['command']).to include('child@school.edu') # retained in encrypted data
        expect(row.summary).not_to include('child@school.edu')     # but not in the plaintext column
        expect(row.summary).to include('rails/runner')
      end
    end
  end
end

describe 'bin/rails audited-console guard (integration)' do
  # The refusal path aborts in bin/rails BEFORE `require config/boot`, so this
  # never loads Rails or touches the database -- it is fast and side-effect-free.
  let(:bin_rails) { Rails.root.join('bin/rails').to_s }

  it 'exits 1 and writes nothing for an un-keyed production console' do
    out, status = Open3.capture2e(
      { 'RAILS_ENV' => 'production', 'USER_KEY' => '' },
      RbConfig.ruby, bin_rails, 'console'
    )
    expect(status.exitstatus).to eq(1)
    expect(out).to match(/refused/)
  end

  it 'exits 1 for `console -e production` even when RAILS_ENV is unset' do
    env = { 'USER_KEY' => '' }
    env['RAILS_ENV'] = nil # unset, so production must come from the CLI flag
    out, status = Open3.capture2e(env, RbConfig.ruby, bin_rails, 'console', '-e', 'production')
    expect(status.exitstatus).to eq(1)
    expect(out).to match(/refused/)
  end
end

describe 'auditing initializer hook wiring' do
  # config/initializers/auditing.rb registers the session-open hooks via
  # Rails.application.runner / .console. This guards that wiring: if the
  # registration regresses (typo, wrong receiver, removed block), console and
  # runner sessions would silently go unaudited again -- the exact failure mode
  # of LL-7f7372e3eb. The runner hook is the only registered runner block, so
  # running it is isolated and side-effect-free (record! is stubbed, no
  # AuditEvent is written). The console hook uses the identical registration
  # mechanism one line above it in the initializer.
  it 'routes the registered runner hook to SessionLogger.record!' do
    expect(Audit::SessionLogger).to receive(:record!).with('runner', anything, anything)
    Rails.application.send(:run_runner_blocks, Rails.application)
  end
end
