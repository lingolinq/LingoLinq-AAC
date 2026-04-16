module JsonApi::License
  extend JsonApi::Json

  TYPE_KEY = 'license'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50

  def self.build_json(license, args = {})
    json = {}
    json['id'] = license.global_id
    json['organization_id'] = license.related_global_id(license.organization_id)
    json['seat_type'] = license.seat_type
    json['status'] = license.status
    json['granted_at'] = license.granted_at&.iso8601
    json['expires_at'] = license.expires_at&.iso8601
    json['external_reference'] = license.external_reference
    if license.user_id
      json['user_id'] = license.related_global_id(license.user_id)
      json['user_name'] = license.user&.user_name
    end
    json['metadata'] = license.metadata if license.metadata.present?
    json
  end
end
