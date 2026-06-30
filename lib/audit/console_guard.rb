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

    # Short aliases Rails accepts for environment names.
    ENV_ALIASES = { 'dev' => 'development', 'prod' => 'production' }.freeze

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
      args = Array(init_args).join(' ')

      if db_command?(command) && prod
        raise ForbiddenCommand,
              %(db/dbconsole is not allowed in production (HIPAA): "#{args}")
      end

      if (console_command?(command) || runner_command?(command)) && prod && !key_present?(env)
        raise UnauthorizedConsole,
              %(ENV['USER_KEY'] is required to open an audited console/runner in production: "#{args}")
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

    # True when the session will run in production, resolved the way Rails will
    # resolve it: an explicit -e/--environment flag (or, for `console`, a
    # positional environment arg) overrides ENV['RAILS_ENV']/ENV['RACK_ENV'].
    def production?(command, init_args, env = ENV)
      effective_environment(command, init_args, env) == 'production'
    end

    def effective_environment(command, init_args, env = ENV)
      name = cli_environment(command, Array(init_args)) ||
             env['RAILS_ENV'] || env['RACK_ENV'] || 'development'
      expand_environment(name)
    end

    def expand_environment(name)
      n = name.to_s.strip
      ENV_ALIASES.fetch(n, n)
    end

    # Extract the environment named on the command line, or nil. Handles
    # `-e VALUE`, `-e=VALUE`, `--environment VALUE`, `--environment=VALUE`, and
    # (console only) a bare positional environment token such as
    # `rails console production`. Runner takes its code positionally, so a
    # positional token there is NOT treated as an environment.
    def cli_environment(command, args)
      args.each_with_index do |arg, i|
        case arg
        when '-e', '--environment'
          nxt = args[i + 1]
          return expand_environment(nxt) if nxt && !nxt.start_with?('-')
        when /\A--environment=(.+)\z/, /\A-e=(.+)\z/
          return expand_environment(Regexp.last_match(1))
        end
      end

      if console_command?(command)
        positional = args.drop(1).find { |a| !a.start_with?('-') }
        return expand_environment(positional) if positional
      end

      nil
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
      AuditEvent.create!(user_key: user_key, data: attrs)
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
