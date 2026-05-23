module GoogleAuthentication
  extend ActiveSupport::Concern

  class_methods do
    def google_sub_record_code(sub)
      "ext:#{GoSecure.sha512(sub.to_s, 'google_auth_user_id')}"
    end

    def find_by_google_sub(sub)
      find_all_by_google_sub(sub).first
    end

    def find_all_by_google_sub(sub)
      return [] unless sub.present?
      code = google_sub_record_code(sub)
      user_ids = UserLink.where(record_code: code).select { |l| l.data['type'] == 'google_auth' }.map(&:user_id).uniq
      user_ids.map { |id| User.find_by(id: id) }.compact
    end

    def users_by_verified_email(email)
      return [] unless email.present?
      find_by_email(email.to_s.strip)
    end

    def create_from_google!(profile)
      email = profile[:email].to_s.strip
      name = profile[:name].presence || email.split('@').first
      password = GoSecure.nonce('google_pw')
      user = User.process_new({
        'name' => name,
        'email' => email,
        'password' => password,
        'terms_agree' => true,
        'preferences' => {
          'registration_type' => 'individual',
          'cookies' => false,
          'google_signup' => true
        }
      }, { pending: true, allow_password_change: true })
      raise GoogleOAuth::Error, 'user_creation_failed' if !user || user.errored?
      user.link_google!(profile[:sub], email: email, name: name)
      user
    end

    def create_from_google_signup!(profile, user_name:, registration_type:, terms_agree:)
      raise GoogleOAuth::Error, 'terms_required' unless ActiveModel::Type::Boolean.new.cast(terms_agree)
      user_name = user_name.to_s.strip
      raise GoogleOAuth::Error, 'username_required' if user_name.blank?

      email = profile[:email].to_s.strip
      name = profile[:name].presence || email.split('@').first
      password = GoSecure.nonce('google_pw')
      user = User.process_new({
        'name' => name,
        'user_name' => user_name,
        'email' => email,
        'password' => password,
        'terms_agree' => true,
        'preferences' => {
          'registration_type' => registration_type.presence || 'individual',
          'cookies' => false,
          'google_signup' => true
        }
      }, { pending: true, allow_password_change: true })
      raise GoogleOAuth::Error, 'user_creation_failed' if !user || user.errored?
      user.link_google!(profile[:sub], email: email, name: name)
      user
    end
  end

  def link_google!(sub, email: nil, name: nil)
    return false unless sub.present?
    record_code = GoSecure.sha512(sub.to_s, 'google_auth_user_id')
    state = {
      'sub' => sub,
      'email' => email,
      'name' => name
    }
    ul = UserLink.generate_external(self, record_code, 'google_auth', state)
    ul.save
    ul
  end

  def google_linked?
    UserLink.links_for(self).any? { |l| l['type'] == 'google_auth' }
  end

  def google_sso_blocked?
    org = Organization.external_auth_for(self, true)
    org && org.settings['saml_metadata_url'] && org.settings['saml_enforced']
  end
end
