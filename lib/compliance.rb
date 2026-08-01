# frozen_string_literal: true

# Compliance Kernel — single entry for segment, jurisdiction, digital-consent age,
# and highest-common-denominator rule merge. Feature-gated by
# FeatureFlags.compliance_workflow_kernel_enabled? so OFF leaves existing
# registration / EuJurisdiction / coppa_consent_age behavior unchanged.
module Compliance
  module_function

  def enabled?
    FeatureFlags.compliance_workflow_kernel_enabled?
  end

  # Convenience: Compliance::Profile.for(user_or_request_context)
  def profile_for(subject, request: nil)
    Profile.for(subject, request: request)
  end
end
