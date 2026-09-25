# Decides who may connect an account to an organization's SAML identity
# provider, and which account (if any) a SAML assertion may sign in.
#
# Sign-in only ever follows a saml_auth link that was recorded by the linking
# step (SessionController#saml_consume with a user_id in its config). Any other
# state, including links created before that step recorded itself, signs no
# one in.
module SamlLoginPolicy
  LINK_METHOD = 'deliberate'
  MEMBER_LINK_TYPES = ['org_user', 'org_supervisor', 'org_manager'].freeze

  # Org-created accounts (authored by this org) may be linked by the account,
  # a site admin, or a full manager of the org. Any other account may be linked
  # only by the account itself.
  def self.may_link?(org, user, linker)
    return false unless org && user && linker
    member_eligible?(org, user) && linker_authorized?(org, user, linker)
  end

  def self.linker_authorized?(org, user, linker)
    return false unless linker
    return true if linker.id == user.id
    return false unless org_created?(org, user)
    Organization.admin_manager?(linker) || org.manager?(linker)
  end

  # True when +external_id+ is already linked to a different account for this
  # org; a link request must not move it.
  def self.identity_linked_elsewhere?(org, external_id, user)
    saml_auth_links(org, external_id).any?{|link| link.user_id != user.id }
  end

  # The org with enforced external auth that password, OAuth and Google
  # sign-in should defer to, or nil. Accounts SSO can never sign in keep
  # their other sign-in methods.
  def self.enforced_org_for(user)
    user = User.find_by_path(user) if user.is_a?(String)
    return nil unless user
    org = Organization.external_auth_for(user)
    return nil unless org && member_eligible?(org, user)
    org
  end

  def self.record_link!(link, linker)
    link.data['state']['link_method'] = LINK_METHOD
    link.data['state']['linked_by'] = linker.global_id
    link.data['state']['linked_at'] = Time.now.iso8601
    link.save!
    link
  end

  # The account a verified assertion for +external_id+ may sign in, or nil.
  def self.user_for_assertion(org, external_id)
    return nil unless org && external_id.present? && org.settings['saml_metadata_url']
    links = saml_auth_links(org, external_id)
    return nil unless links.length == 1
    state = links[0].data['state']
    return nil unless state['link_method'] == LINK_METHOD && state['linked_by'].present?
    user = links[0].user
    return nil unless user && member_eligible?(org, user)
    # The linker must still be allowed to link this account.
    linker = User.find_by_global_id(state['linked_by'])
    return nil unless linker_authorized?(org, user, linker)
    user
  end

  def self.saml_auth_links(org, external_id)
    return [] unless org && external_id.present?
    record_code = "ext:#{GoSecure.sha512(external_id, 'external_auth_user_id')}"
    UserLink.where(record_code: record_code).select do |link|
      state = link.data['state']
      link.data['type'] == 'saml_auth' && state.is_a?(Hash) && state['org_id'] == org.global_id
    end
  end

  # Attached to the org now, and either created by it or attached by a link
  # the holder accepted (pending explicitly false). Never a site-admin or
  # LingoLinq team account.
  def self.member_eligible?(org, user)
    return false if team_account?(user)
    links = member_links(org, user)
    return false if links.empty?
    return true if org_created?(org, user)
    links.any? do |link|
      ['org_user', 'org_supervisor'].include?(link['type']) && link['state'].is_a?(Hash) && link['state']['pending'] == false
    end
  end

  def self.team_account?(user)
    return true if user.admin?
    admin_org = Organization.admin
    return false unless admin_org
    admin_code = Webhook.get_record_code(admin_org)
    UserLink.links_for(user).any?{|link| link['record_code'] == admin_code }
  end

  def self.org_created?(org, user)
    authored = user.settings && user.settings['authored_organization_id']
    authored.present? && authored == org.global_id
  end

  def self.member_links(org, user)
    org_code = Webhook.get_record_code(org)
    UserLink.links_for(user).select{|link| MEMBER_LINK_TYPES.include?(link['type']) && link['record_code'] == org_code }
  end

  # Mirrors the parental-consent refusals SessionController#token applies to
  # password sign-in.
  def self.parental_consent_blocked?(user)
    user.coppa_parental_consent_revoked? || user.coppa_parental_consent_declined? ||
      user.coppa_needs_parent_email? || user.coppa_parental_consent_pending?
  end
end
