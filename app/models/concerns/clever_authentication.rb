module CleverAuthentication
  extend ActiveSupport::Concern

  class_methods do
    def clever_id_record_code(clever_id)
      "ext:#{GoSecure.sha512(clever_id.to_s, 'clever_auth_user_id')}"
    end

    def find_by_clever_id(clever_id)
      find_all_by_clever_id(clever_id).first
    end

    def find_all_by_clever_id(clever_id)
      return [] unless clever_id.present?
      code = clever_id_record_code(clever_id)
      user_ids = UserLink.where(record_code: code).select { |l| l.data['type'] == 'clever_auth' }.map(&:user_id).uniq
      user_ids.map { |id| User.find_by(id: id) }.compact
    end

    def clever_users_matching_email_in_org(email, org)
      return [] if email.blank? || org.blank?
      users_by_verified_email(email).select { |user| clever_user_in_org?(user, org) }
    end

    def clever_user_in_org?(user, org)
      return false unless user && org
      Organization.attached_orgs(user).any? { |entry| entry['id'] == org.global_id }
    end
  end

  def link_clever!(clever_id, attrs = {})
    return false unless clever_id.present?
    record_code = GoSecure.sha512(clever_id.to_s, 'clever_auth_user_id')
    state = {
      'clever_id' => clever_id.to_s,
      'email' => attrs[:email],
      'name' => attrs[:name],
      'org_id' => attrs[:org_id],
      'district_id' => attrs[:district_id],
      'roles' => Array(attrs[:roles]),
      'schools' => Array(attrs[:schools]),
      'clever_archived' => false
    }
    ul = UserLink.generate_external(self, record_code, 'clever_auth', state)
    ul.save
    ul
  end

  def clever_link
    UserLink.links_for(self).detect { |l| l['type'] == 'clever_auth' }
  end

  def clever_linked?
    !!clever_link
  end

  def clever_archived?
    link = clever_link
    !!(link && link['state'] && link['state']['clever_archived'])
  end

  def clever_sso_blocked?
    org = Organization.external_auth_for(self, true)
    return false unless org
    return false if org.settings && org.settings['clever_district_id'].present?
    org.settings['saml_metadata_url'] && org.settings['saml_enforced']
  end
end
