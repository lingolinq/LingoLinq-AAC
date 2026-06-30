# Audited-console control (LL-7f7372e3eb).
#
# config/boot is loaded from bin/rails, which has already required the guard,
# set ::ARGV_COMMAND / ::INIT_ARGS, and refused an un-keyed console/runner (or
# HIPAA db-console) in production *before* boot. Here we (a) attribute writes via
# PaperTrail and (b) register the session-open AuditEvent hooks.
#
# The old per-command Readline monkeypatch was removed: Ruby 3.4's IRB uses
# Reline, which never calls Readline, so the patch wrote nothing. The Rails
# `console`/`runner` hooks below are line-editor agnostic and fire once per
# session (session-open auditing), which is what the control requires.
#
# Required again here (idempotent; the file is excluded from Zeitwerk) so
# Audit::SessionLogger is loaded wherever these hooks execute.
require_relative '../../lib/audit/console_guard'

unless ENV['SKIP_VALIDATIONS']
  if Audit::ConsoleGuard.key_present?(ENV)
    PaperTrail.request.whodunnit = "admin:#{ENV['USER_KEY']}"
  end

  init_args = defined?(INIT_ARGS) ? INIT_ARGS : []

  # Reline-safe session-open auditing. The console hook fires before the IRB
  # REPL starts; the runner hook before the runner payload runs. Each hook first
  # runs the authoritative, parser-free production refusal (Rails.env is fully
  # resolved by now, so it catches any -e/--environment form the pre-boot parser
  # might miss), then records the session-open AuditEvent. In production a
  # fail-closed audit write also aborts the session before any work happens.
  open_audited_session = lambda do |kind|
    begin
      Audit::ConsoleGuard.enforce_runtime!(kind, ENV)
    rescue Audit::ConsoleGuard::Error => e
      abort("refused: #{e.message}")
    end
    Audit::SessionLogger.record!(kind, ENV['USER_KEY'], init_args)
  end

  Rails.application.console { open_audited_session.call('console') }
  Rails.application.runner  { open_audited_session.call('runner') }
end
