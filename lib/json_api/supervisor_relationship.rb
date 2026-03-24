module JsonApi::SupervisorRelationship
  extend JsonApi::Json

  TYPE_KEY = 'supervisor_relationship'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50

  def self.build_json(rel, args={})
    json = {}
    json['id'] = rel.global_id
    json['status'] = rel.status
    json['permission_level'] = rel.permission_level
    json['permission_description'] = ::SupervisorRelationship::PERMISSION_DESCRIPTIONS[rel.permission_level]
    json['initiated_by'] = rel.initiated_by
    json['creation_method'] = rel.creation_method
    json['supervisor_created_account'] = rel.supervisor_created_account
    json['created'] = rel.created_at && rel.created_at.iso8601
    json['consent_requested_at'] = rel.consent_requested_at && rel.consent_requested_at.iso8601
    json['consent_responded_at'] = rel.consent_responded_at && rel.consent_responded_at.iso8601
    json['activated_at'] = rel.activated_at && rel.activated_at.iso8601
    json['revoked_at'] = rel.revoked_at && rel.revoked_at.iso8601
    json['revocation_reason'] = rel.revocation_reason

    if rel.supervisor_user
      json['supervisor'] = JsonApi::User.build_json(rel.supervisor_user, limited_identity: true)
    end
    if rel.communicator_user
      json['communicator'] = JsonApi::User.build_json(rel.communicator_user, limited_identity: true)
    end
    if rel.organization
      json['organization_id'] = rel.organization.global_id
    end

    json
  end
end
