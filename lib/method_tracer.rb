# frozen_string_literal: true

# Drop-in replacement for the small slice of the NewRelic
# `MethodTracer` API the codebase actually uses. Preserves the
# `self.class.trace_execution_scoped(['some/metric/name']) { ... }`
# call sites left over from when NewRelic was the APM. Bridges to
# Sentry's `with_child_span` when Sentry is initialized; otherwise
# yields unchanged so dev / test runs without a SENTRY_DSN behave
# the same as before.
module MethodTracer
  def trace_execution_scoped(metric_names)
    name = Array(metric_names).first.to_s
    if defined?(Sentry) && Sentry.initialized?
      Sentry.with_child_span(op: name) { yield }
    else
      yield
    end
  end
end
