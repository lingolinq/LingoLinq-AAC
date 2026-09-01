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

    def create_from_google_signup!(profile, user_name:, registration_type:, terms_agree:, product_improvement_opt_in: false, country: nil, under_16: false, signup_name: nil, locale: nil, birth_month: nil, birth_year: nil)
      raise GoogleOAuth::Error, 'terms_required' unless ActiveModel::Type::Boolean.new.cast(terms_agree)
      user_name = user_name.to_s.strip
      raise GoogleOAuth::Error, 'username_required' if user_name.blank?
      product_improvement_opt_in = ActiveModel::Type::Boolean.new.cast(product_improvement_opt_in)
      under_16 = ActiveModel::Type::Boolean.new.cast(under_16)
      trusted_country = LingoLinq::Jurisdiction.trusted_country(country)
      classified_under_13 = User.age_under_threshold?(
        birth_month: birth_month,
        birth_year: birth_year,
        age: JsonApi::Json::DEFAULT_COPPA_CONSENT_AGE
      )
      if JsonApi::Json.coppa_parental_consent_enabled?
        raise GoogleOAuth::Error, 'birthdate_required' if classified_under_13.nil?
        raise GoogleOAuth::Error, 'coppa_age' if classified_under_13
      end
      classified_under_16 = User.age_under_threshold?(
        birth_month: birth_month,
        birth_year: birth_year,
        age: 16
      )
      under_16 = classified_under_16 unless classified_under_16.nil?
      eu_under_16 = !!(trusted_country && LingoLinq::Jurisdiction.eu?(trusted_country) && under_16)
      product_improvement_opt_in = false if eu_under_16

      email = profile[:email].to_s.strip
      form_name = signup_name.to_s.gsub(/[\x00-\x1F\x7F]/, '').strip
      form_name = form_name[0, 200]
      name = form_name.presence || profile[:name].presence || email.split('@').first
      locale_code = locale.to_s.strip.downcase
      locale_code = 'en' unless locale_code.match?(/\A[a-z]{2,8}\z/)
      password = GoSecure.nonce('google_pw')
      params = {
        'name' => name,
        'email' => email,
        'password' => password,
        'terms_agree' => true,
        'country' => trusted_country,
        'under_16' => under_16,
        'birth_month' => birth_month,
        'birth_year' => birth_year,
        'preferences' => {
          'registration_type' => registration_type.presence || 'communicator',
          'locale' => locale_code,
          'cookies' => product_improvement_opt_in,
          'google_signup' => true,
          'telemetry_opt_in' => product_improvement_opt_in,
          'comms_log_opt_in' => product_improvement_opt_in
        }
      }
      # user_name is passed through as-is here: sanitization is delegated to
      # clean_path (processable.rb), which User.process_new → generate_user_name
      # applies (strips everything but [a-zA-Z0-9_-]). Don't assume this method
      # sanitizes — a future refactor must keep going through clean_path.
      params['user_name'] = user_name
      user = User.process_new(params, { pending: true, allow_password_change: true })
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
