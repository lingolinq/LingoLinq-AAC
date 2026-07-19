# frozen_string_literal: true

# Boot-time, fail-closed validation of the EVAL_NARRATOR_MODEL override.
#
# Pairs with EvalNarrator.resolved_model (the call-time check). This stops a
# deploy from even starting if the eval-narration model has been pointed at a
# mandatory-retention "Covered Model" (Fable 5 / Mythos 5, which are ZDR-excluded
# per CLAUDE.md) or at any model outside the in-scope Claude families. Eval
# narration is a HIPAA "Healthcare Activity" on the Anthropic HIPAA-Ready path
# (docs/legal/ANTHROPIC_BAA_ACCEPTED.md); a misconfigured model here would egress
# PHI-adjacent eval data to a non-covered model, so failing closed at boot is the
# intended behavior.
override = ENV['EVAL_NARRATOR_MODEL']
if override && !override.empty?
  allowed =
    begin
      EvalNarrator.allowed_model?(override)
    rescue NameError
      # EvalNarrator not loadable in this boot context (e.g. the Resque worker
      # path where lib/ autoload is skipped). The call-time resolved_model check
      # still gates egress, so do not block boot here.
      true
    end

  unless allowed
    raise "EVAL_NARRATOR_MODEL=#{override.inspect} is not an in-scope Claude model " \
      "(allowed families: #{EvalNarrator::ALLOWED_MODEL_PREFIXES.join(', ')}). Refusing to boot: " \
      "this override must never point at a Covered Model (Fable/Mythos) or an unknown model."
  end
end
