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

    # True when the session will run in production, resolved the way Rails will
    # resolve it: an explicit -e/--environment flag (or, for `console`, a
    # positional environment arg) overrides ENV['RAILS_ENV']/ENV['RACK_ENV'].
    def production?(command, init_args, env = ENV)
      effective_environment(command, init_args, env) == 'production'
    end

    # Resolve the effective environment exactly the way railties does, so no
    # invocation can boot production while the guard believes it is not:
    #   * a CLI -e/--environment value is prefix-expanded (Rails expands any
    #     abbreviation of production/development/test) and wins when present;
    #   * otherwise ENV['RAILS_ENV'] then ENV['RACK_ENV'] are used VERBATIM --
    #     Rails does NOT abbreviation-expand the env vars -- treating a blank /
    #     whitespace value as absent (Rails uses String#presence);
    #   * otherwise 'development'.
    def effective_environment(command, init_args, env = ENV)
      cli = cli_environment(command, Array(init_args))
      return cli if cli

      presence(env['RAILS_ENV']) || presence(env['RACK_ENV']) || 'development'
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
    def cli_environment(command, args)
      args = args_before_double_dash(args)

      args.each_with_index do |arg, i|
        case arg
        when '-e', '--environment'
          nxt = args[i + 1]
          return expand_environment(nxt) if nxt && !nxt.start_with?('-')
        when /\A--environment=(.+)\z/, /\A-e=(.+)\z/
          return expand_environment(Regexp.last_match(1))
        when /\A-e(.+)\z/ # glued short form, e.g. -eprod
          return expand_environment(Regexp.last_match(1))
        end
      end

      if console_command?(command)
        positional = args.drop(1).find { |a| !a.start_with?('-') }
        return expand_environment(positional) if positional
      end

      nil
    end

    def args_before_double_dash(args)
      idx = args.index('--')
      idx ? args[0...idx] : args
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
