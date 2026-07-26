# frozen_string_literal: true

module Compliance
  # Derives compliance_segment: b2c | school | clinical from entry path / org settings.
  # Org settings.compliance_segment wins when present and valid.
  module SegmentResolver
    SEGMENTS = %w[b2c school clinical].freeze

    module_function

    # @param user [User, nil]
    # @param opts [Hash] :authored_organization_id, :start_code_org, :org (Organization)
    # @return [String] one of SEGMENTS
    def resolve(user = nil, opts = {})
      org = opts[:org] || org_for(user, opts)
      from_org = org_segment(org)
      return from_org if from_org

      return 'school' if school_path?(user, opts)

      'b2c'
    end

    def org_segment(org)
      return nil unless org.respond_to?(:settings) && org.settings.is_a?(Hash)

      raw = org.settings['compliance_segment'] || org.settings.dig('compliance', 'segment')
      code = raw.to_s.strip.downcase
      SEGMENTS.include?(code) ? code : nil
    end

    def school_path?(user, opts)
      return true if opts[:authored_organization_id].present?
      return true if opts[:start_code_org].present?
      return true if user && user.respond_to?(:settings) && user.settings.is_a?(Hash) &&
                     (user.settings['authored_organization_id'].present? ||
                      user.settings['school_authorization'].is_a?(Hash))

      false
    end

    def org_for(user, opts)
      return opts[:org] if opts[:org]
      return nil unless user && user.respond_to?(:managing_organization)

      begin
        user.managing_organization
      rescue StandardError
        nil
      end
    end
    private_class_method :org_for
  end
end
