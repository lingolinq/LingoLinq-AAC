# frozen_string_literal: true

# Audited-console boot-path guard (LL-7f7372e3eb).
#
# Pure-Ruby, no Rails dependency, so it can be required at the very top of
# bin/rails *before* the Rails environment boots. It does two jobs:
#
#   1. Audit::ConsoleGuard.enforce_pre_boot! refuses an un-keyed console or
#      runner -- and the HIPAA-sensitive db/dbconsole -- in production *before*
#      Rails loads, so no privileged session ever reaches a database connection
#      unattributed.
#   2. Audit::SessionLogger.record! writes the session-open AuditEvent from the
#      Rails `console do` / `runner do` hooks once the environment is loaded. It
#      is fail-closed in production (a failed write aborts the session) so the
#      audited-console control cannot silently degrade to unaudited access.
#
# Boot order: bin/rails requires this file, sets ::ARGV_COMMAND / ::INIT_ARGS,
# and calls enforce_pre_boot!. config/initializers/auditing.rb requires it again
# (idempotent) so SessionLogger is loaded wherever the hooks run. This file is
# deliberately excluded from Zeitwerk (config/application.rb autoload_lib ignore)
# because it must be loadable before the autoloader exists.
module Audit
  # Pre-boot command classification + refusal. No Rails dependency.
  module ConsoleGuard
    class Error < StandardError; end
    # Raised when a console/runner is started without a USER_KEY in production.
    class UnauthorizedConsole < Error; end
    # Raised for HIPAA-sensitive db/dbconsole access in production.
    class ForbiddenCommand < Error; end

    CONSOLE_COMMANDS = %w[console c].freeze
    RUNNER_COMMANDS  = %w[runner r].freeze
    DB_COMMANDS      = %w[db dbconsole].freeze

    module_function

    def console_command?(command)
      CONSOLE_COMMANDS.include?(command)
    end

    def runner_command?(command)
      RUNNER_COMMANDS.include?(command)
    end

    def db_command?(command)
      DB_COMMANDS.include?(command)
    end

    def key_present?(env = ENV)
      !env['USER_KEY'].to_s.strip.empty?
    end

    # Refuse un-keyed console/runner and HIPAA db-console in production, before
    # Rails boots. Returns the command classification (:console/:runner/:other)
    # when the call is allowed to proceed.
    def enforce_pre_boot!(command, init_args, env = ENV)
      prod = production?(command, init_args, env)

      # The refusal message must never echo the invoked argv: a `runner`
      # command line is arbitrary Ruby that routinely contains identifiers or
      # secrets, and this message is printed to stderr (bin/rails `abort`),
      # which Render/Cloud Run capture as plaintext logs. Reference only the
      # command class.
      if db_command?(command) && prod
        raise ForbiddenCommand,
              'db/dbconsole is not allowed in production (HIPAA)'
      end

      if (console_command?(command) || runner_command?(command)) && prod && !key_present?(env)
        raise UnauthorizedConsole,
              "ENV['USER_KEY'] is required to open an audited #{classify(command)} in production"
      end

      classify(command)
    end

    def classify(command)
      return :console if console_command?(command)
      return :runner  if runner_command?(command)

      :other
    end

    # AuditEvent payload for a session-open row. `kind` is 'console' or 'runner'.
    def session_attrs(kind, init_args)
      { 'type' => "rails/#{kind}", 'command' => Array(init_args).join(' ') }
    end

    # Production-sensitive when the CLI names production OR the ambient deployment
    # is production. BOTH must gate the refusal, because the database a session
    # reaches is bound to whatever Rails.env resolves to, NOT to the name on the
    # command line: ActiveRecord merges DATABASE_URL (or the discrete prod
    # params) into the config for the resolved env, so `bin/rails console
    # -e development` on a prod box (where DATABASE_URL points at prod) still
    # connects to the production database. The ambient check is read here at
    # pre-boot, BEFORE railties applies any -e override to ENV['RAILS_ENV'], so a
    # -e flag can ADD production (ambient unset, `-e production`) but can never
    # CLEAR a production deployment.
    #
    # Residual, tracked as a follow-up on LL-7f7372e3eb: a deployment that
    # reaches the prod DB while ambient RAILS_ENV/RACK_ENV is not 'production'
    # (e.g. only DATABASE_URL set, RAILS_ENV unset) is not detected here; the
    # fully robust fix gates on the resolved connection target. Both real prod
    # deployments (Render and Cloud Run) set RAILS_ENV=production, so the
    # realistic `-e development` dodge is covered.
    def production?(command, init_args, env = ENV)
      cli_production?(command, init_args) || ambient_production?(env)
    end

    # The CLI-named environment resolves to production. A repeated flag uses the
    # last occurrence; abbreviations are prefix-expanded the way railties does.
    def cli_production?(command, init_args)
      cli_environment(command, Array(init_args)) == 'production'
    end

    # The ambient deployment is production: RAILS_ENV then RACK_ENV, verbatim
    # (Rails does not abbreviation-expand the env vars) with String#presence
    # semantics (a blank/whitespace value is treated as absent).
    def ambient_production?(env = ENV)
      (presence(env['RAILS_ENV']) || presence(env['RACK_ENV'])) == 'production'
    end

    def presence(value)
      s = value.to_s.strip
      s.empty? ? nil : s
    end

    # Expand a CLI environment token the way
    # Rails::Command::EnvironmentArgument#expand_environment_name does: a token
    # that is not already an on-disk environment is resolved to the first of
    # production/development/test it is a prefix of -- so `-e p`, `-e pro`,
    # `-e produc` etc. all resolve to production and cannot slip past the guard.
    EXPANDABLE_ENVIRONMENTS = %w[production development test].freeze

    def expand_environment(name)
      n = name.to_s.strip
      return n if n.empty?
      # Fail-safe: a token that is a prefix of "production" always resolves to
      # production, even if a same-named custom env file exists on disk. This
      # takes precedence over the on-disk short-circuit so that adding, say,
      # config/environments/pro.rb can never silently reopen the abbreviation
      # bypass, and so the result does not depend on the process cwd (railties
      # reads config/environments relative to cwd; we cannot match that exactly
      # pre-boot, so we err toward refusal for the production case).
      return 'production' if 'production'.start_with?(n)
      return n if available_environments.include?(n)

      EXPANDABLE_ENVIRONMENTS.find { |full| full.start_with?(n) } || n
    end

    # Environment names defined on disk (config/environments/*.rb). Anchored to
    # this file rather than the process cwd, so it resolves however bin/rails was
    # invoked. A read failure is non-fatal: an empty list just makes every token
    # eligible for prefix-expansion (more refusals, never fewer).
    def available_environments(dir = nil)
      dir ||= File.expand_path('../../config/environments', __dir__)
      Dir[File.join(dir, '*.rb')].map { |f| File.basename(f, '.*') }
    rescue StandardError
      []
    end

    # Extract the environment named on the command line, or nil. Handles
    # `-e VALUE`, `-eVALUE`, `-e=VALUE`, `--environment VALUE`,
    # `--environment=VALUE`, and (console only) a bare positional environment
    # token such as `rails console production`. Runner takes its code
    # positionally, so a positional token there is NOT treated as an
    # environment. Tokens after a `--` terminator are ignored, matching how
    # Rails forwards them to the REPL instead of parsing them as options.
    #
    # When the flag is repeated (`-e development -e production`) the LAST
    # occurrence wins, matching Thor/railties option parsing. Returning on the
    # first match would let `-e development -e production` boot production while
    # the guard believed it was development.
    def cli_environment(command, args)
      args = args_before_double_dash(args)
      explicit = nil

      args.each_with_index do |arg, i|
        if env_flag?(arg)
          nxt = args[i + 1]
          explicit = nxt if nxt && !nxt.start_with?('-')
        else
          value = inline_env_value(arg)
          explicit = value if value
        end
      end

      return expand_environment(explicit) if explicit

      if console_command?(command)
        positional = args.drop(1).find { |a| !a.start_with?('-') }
        return expand_environment(positional) if positional
      end

      nil
    end

    # True for the bare environment flag whose value is the FOLLOWING token:
    # `-e`, `--environment`, or any unambiguous long abbreviation
    # (`--e`..`--environmen`). Thor accepts long-option prefixes, and none of
    # console/runner/dbconsole define another `--e...` option, so every such
    # prefix means the environment.
    def env_flag?(arg)
      arg == '-e' || (arg.start_with?('--e') && '--environment'.start_with?(arg))
    end

    # Value for an inline environment form, or nil: `-e=v`, glued `-ev`,
    # `--environment=v`, and the abbreviated `--env=v`. (Long options require
    # `=` or a space, so there is no glued `--envv` form.)
    def inline_env_value(arg)
      if (m = arg.match(/\A-e=(.+)\z/))
        m[1]
      elsif (m = arg.match(/\A(--e[a-z]*)=(.+)\z/)) && '--environment'.start_with?(m[1])
        m[2]
      elsif (m = arg.match(/\A-e(.+)\z/)) # glued short form, e.g. -eprod
        m[1]
      end
    end

    def args_before_double_dash(args)
      idx = args.index('--')
      idx ? args[0...idx] : args
    end

    # Authoritative, parser-free backstop, run from the Rails console/runner
    # hooks AFTER railties has resolved and applied the environment (so
    # Rails.env is correct for any -e/--environment form, including ones the
    # pre-boot parser might not model). Refuses an un-keyed console/runner in
    # production before the REPL or runner payload executes. dbconsole has no
    # such hook, so its refusal stays in the pre-boot guard.
    def enforce_runtime!(kind, env = ENV)
      return unless defined?(Rails) && Rails.respond_to?(:env) && Rails.env.production?
      return if key_present?(env)

      raise UnauthorizedConsole,
            "ENV['USER_KEY'] is required to open an audited #{kind} in production"
    end
  end

  # Writes the session-open AuditEvent from the Rails console/runner hooks.
  #
  # Deliberately separate from AuditEvent.log_command, which is fail-open for
  # general accounting-of-disclosure side effects (it must never break the
  # authorized read/action the caller is performing). The audited-console
  # control has the opposite requirement: in production a privileged session
  # must NOT proceed if its session-open row cannot be written, otherwise the
  # control silently degrades to unaudited access. So this path uses create!
  # and re-raises in production.
  module SessionLogger
    module_function

    # kind: 'console' or 'runner'. Returns nil (no audit row) for a blank key --
    # only keyed sessions are logged, and an un-keyed production session has
    # already been refused pre-boot by ConsoleGuard.
    def record!(kind, user_key, init_args)
      return if user_key.to_s.strip.empty?

      attrs = Audit::ConsoleGuard.session_attrs(kind, init_args)
      # Pass an explicit, PII-free summary. AuditEvent#generate_summary would
      # otherwise copy data['command'] -- which for a runner is arbitrary Ruby
      # that can contain identifiers or secrets -- into the `summary` column,
      # which is NOT secure_serialize'd (it is plaintext at rest). The full
      # command line stays only in the encrypted `data`.
      AuditEvent.create!(
        user_key: user_key,
        data: attrs,
        summary: "#{user_key}: rails/#{kind} session opened"
      )
    rescue StandardError => e
      # Fail-closed in production: refuse the session rather than allow
      # unaudited privileged access. In non-production, never block local work.
      raise if production_runtime?

      warn("[audit] session-open AuditEvent could not be written " \
           "(non-production, proceeding): #{e.class}")
      nil
    end

    def production_runtime?
      defined?(Rails) && Rails.respond_to?(:env) && Rails.env.production?
    end
  end
end
