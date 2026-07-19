# frozen_string_literal: true

# Best-effort boot-time validation of the EVAL_NARRATOR_MODEL override.
#
# The AUTHORITATIVE, fail-closed enforcement lives at call time in
# EvalNarrator.resolved_model, which refuses to egress to any model outside the
# exact ALLOWED_MODELS allowlist (falling back to the deterministic no-egress
# template). This boot check is a best-effort early warning: when EvalNarrator
# can be loaded here, a bad EVAL_NARRATOR_MODEL fails the boot so a misconfigured
# deploy is caught immediately instead of silently degrading to the template on
# every eval. When EvalNarrator cannot be loaded in this boot context (e.g. the
# Resque worker path where lib/ autoload is skipped), boot is allowed and the
# call-time check remains the guarantee. It is therefore NOT a hard boot-time
# guarantee on its own; it is boot-time best-effort plus call-time fail-closed.
#
# Eval narration egresses scrubbed eval data on the Anthropic HIPAA-Ready path
# (docs/legal/ANTHROPIC_BAA_ACCEPTED.md); the model must stay a vetted in-scope
# Claude model. The override must never point at a mandatory-retention Covered
# Model (Fable/Mythos, ZDR-excluded per CLAUDE.md) or any unrecognized model.
override = ENV['EVAL_NARRATOR_MODEL']
if override && !override.empty?
  validatable = true
  allowed =
    begin
      EvalNarrator.allowed_model?(override)
    rescue NameError
      # EvalNarrator not loadable in this boot context; defer entirely to the
      # call-time resolved_model check, which is fail-closed.
      validatable = false
      true
    end

  if validatable && !allowed
    raise "EVAL_NARRATOR_MODEL=#{override.inspect} is not a vetted in-scope Claude model " \
      "(allowed: #{EvalNarrator::ALLOWED_MODELS.join(', ')}). Refusing to boot: this override must " \
      "never point at a Covered Model (Fable/Mythos) or an unrecognized model."
  end
end
