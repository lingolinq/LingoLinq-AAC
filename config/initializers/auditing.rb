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

  # Reline-safe session-open auditing. run_console_blocks fires before the IRB
  # REPL starts; load_runner fires before the runner payload runs -- so in
  # production a fail-closed write aborts the session before any work happens.
  Rails.application.console do
    Audit::SessionLogger.record!('console', ENV['USER_KEY'], init_args)
  end

  Rails.application.runner do
    Audit::SessionLogger.record!('runner', ENV['USER_KEY'], init_args)
  end
end
