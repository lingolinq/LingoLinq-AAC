module JsonApi
  class License < Json
    def self.as_json(license, opts={})
      res = {
        id: license.global_id,
        organization_id: license.related_global_id(license.organization_id),
        seat_type: license.seat_type,
        status: license.status,
        granted_at: license.granted_at&.iso8601,
        expires_at: license.expires_at&.iso8601,
        external_reference: license.external_reference
      }
      if license.user_id
        res[:user_id] = license.related_global_id(license.user_id)
        res[:user_name] = license.user&.user_name
      end
      res[:metadata] = license.metadata if license.metadata.present?
      
      res = {license: res} if opts[:wrapper]
      res
    end
  end
end
