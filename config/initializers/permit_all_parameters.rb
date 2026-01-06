# Rails 7: Permit all parameters by default for API compatibility
# This allows the existing API code to work without requiring explicit parameter permitting
Rails.application.config.action_controller.permit_all_parameters = true


