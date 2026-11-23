module ExternalTracker
  # HubSpot consent gate per FERPA/COPPA/GDPR:
  # 1. Only adult accounts, as defined by User#marketing_trackable? (#1123): an allowlisted account type (therapist, parent, teacher, other, eval, org-added supervisor, communicator), no child-consent record, not under 16, and 18 or over at signup
  # 2. Respect cookies preference - do not send when user opted out of analytics/tracking (GDPR consent)
  # 3. Org-managed users excluded via external_email_allowed?

  # The value sent in the HubSpot dropdown property lingolinq_account_type, by the app's
  # registration_type. HubSpot refuses a contact whose dropdown value is not one of the
  # property's options, so a type missing here sends no account type at all, never a raw
  # value. 'therapist' is the transition value until signup asks for slp or
  # other_therapist; the dropdown's slp, other_therapist and district_admin options have no
  # registration type yet. A communicator is 'personal_account', a neutral value, so the
  # contact record does not say the person uses AAC (Scot, 2026-11-23).
  HUBSPOT_ACCOUNT_TYPES = {
    'communicator' => 'personal_account',
    'therapist' => 'therapist',
    'parent' => 'parent',
    'teacher' => 'teacher',
    'other' => 'other_supporter',
    'eval' => 'at_specialist',
    'manually-added-supervisor' => 'org_added_supervisor'
  }.freeze

  def self.track_new_user(user)
    return unless user && user.external_email_allowed? && user.marketing_trackable?
    return if user.cookies_opted_out?
    Worker.schedule(ExternalTracker, :persist_new_user, user.global_id)
  end

  def self.persist_new_user(user_id)
    user = User.find_by_path(user_id)
    return false unless user && user.external_email_allowed? && user.marketing_trackable?
    return false if user.cookies_opted_out?
    return false unless ENV['HUBSPOT_ACCESS_TOKEN']
    return false unless user.settings && user.settings['email']

    d = user.devices[0]
    ip = d && d.settings['ip_address']
    location = nil
    if ip && ENV['IPLOCATE_API_KEY']
      url = "https://iplocate.io/api/lookup/#{ip}?apikey=#{ENV['IPLOCATE_API_KEY']}"
      begin
        res = Typhoeus.get(url, timeout: 5)
        location = JSON.parse(res.body)
      rescue => e
        Rails.logger.warn("ExternalTracker: iplocate lookup failed for user #{user.global_id}: #{e.class}: #{e.message}")
      end
    end
    email = user.settings['email']
    # Capture geolocation for every country, not just the US. iplocate returns
    # city / subdivision (region/state/province) / country globally, so non-US
    # trials (largely GDPR-region prospects) now get city + region populated too.
    # country lets HubSpot still tell US leads apart from international ones.
    city = location && location['city']
    state = location && location['subdivision']
    country = location && location['country']


    acct = HUBSPOT_ACCOUNT_TYPES[user.registration_type]

    name = (user.settings['name'] || '').split(/\s/, 2)
    json = {
      properties: [
        {property: 'email', value: email },
        {property: 'firstname', value: name[0]},
        {property: 'lastname', value: name[1]},
        {property: 'city', value: city},
        {property: 'lingolinq_username', value: user.user_name},
        # {property: 'hs_language', value: 'en'},
        {property: 'state', value: state},
        {property: 'country', value: country},
        (acct ? {property: 'lingolinq_account_type', value: acct} : nil),
        {property: 'hs_legal_basis', value: 'Legitimate interest – prospect/lead'}
      ].compact
    }
    # Marketing attribution captured at signup (see User#process: settings['referrer']
    # is document.referrer, the "source"; settings['ad_referrer'] is the ?ref= URL
    # param, the "ad key"). Sent to LingoLinq custom HubSpot contact properties.
    # referrer is truncated to scheme+host before egress so a referring URL that
    # happens to carry PII in its path/query (e.g. a webmail or tokenized link)
    # does not leave the platform; the attribution signal (origin) is preserved.
    source = referrer_origin(user.settings['referrer'])
    if source.present?
      json[:properties] << {property: 'lingolinq_referrer', value: source}
    end
    ad_key = ad_key_clean(user.settings['ad_referrer'])
    if ad_key.present?
      json[:properties] << {property: 'lingolinq_ad_referrer', value: ad_key}
    end
    if user && (user.settings['activations'] || []).length > 0
      json[:properties] << {
        property: 'lingolinq_start_code', value: user.settings['activations'].map{|a| a['code'] }.compact[-1]
      }
    end
  
    url = "https://api.hubapi.com/contacts/v1/contact/"
    begin
      res = Typhoeus.post(url, {body: json.to_json, headers: {
        'Content-Type' => 'application/json',
        'Authorization' => "Bearer #{ENV['HUBSPOT_ACCESS_TOKEN']}"
        }})
    rescue => e
      Rails.logger.error("ExternalTracker: HubSpot POST raised for user #{user.global_id}: #{e.class}: #{e.message}")
      return nil
    end
    # Only a 2xx answer means HubSpot holds the contact. Status 0 is "no HTTP answer"
    # (a timeout or a refused connection), so it is a failure, not a send.
    if (200..299).cover?(res.code.to_i)
      record_sent_email(user, email)
    else
      Rails.logger.error("ExternalTracker: HubSpot contact sync failed for user #{user.global_id}: status=#{res.code}")
    end
    res.code
  end

  # The addresses this app has sent to HubSpot for this account. Kept on the account
  # so that deletion can remove exactly those contacts (#384) and nothing else.
  def self.sent_emails(user)
    list = user && user.settings.is_a?(Hash) && user.settings['hubspot'].is_a?(Hash) ? user.settings['hubspot']['sent_emails'] : nil
    Array(list).select { |e| e.is_a?(String) && e.present? }.uniq
  end

  def self.record_sent_email(user, email)
    return if email.blank? || !user || !user.id
    # Written to a freshly read, locked row, never to the copy the caller loaded before
    # the HubSpot call: saving that copy would put back every setting as it was then,
    # and undo a change (turning AI off, say) made while the call was in flight.
    User.transaction do
      current = User.lock.find_by(id: user.id)
      next if current.nil? || sent_emails(current).include?(email)
      current.settings ||= {}
      current.settings['hubspot'] = { 'sent_emails' => sent_emails(current) + [email] }
      current.save!
    end
  rescue => e
    Rails.logger.error("ExternalTracker: could not record the sent address for user #{user.global_id}: #{e.class}")
  end

  REMOVE_CONTACT_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/gdpr-delete'
  REMOVE_CONTACT_ATTEMPTS = 3

  # Permanently deletes the HubSpot contacts for these addresses (#384). HubSpot
  # reference, read 2026-11-17:
  # https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/gdpr/gdpr-delete-contact
  #
  # Call this ONLY with addresses from sent_emails. HubSpot stores (blocklists) an
  # address it does not know, so passing an address that was never sent would hand
  # HubSpot a new one.
  #
  # The addresses are the arguments because the account row is already gone when this
  # runs. The worker (BoyBand) does not retry a failed job, so this method retries
  # itself: the addresses that failed are scheduled again, up to
  # REMOVE_CONTACT_ATTEMPTS in all. It never raises, and it logs a status and a count,
  # never an address.
  def self.remove_contact(emails, attempt = 1)
    return false unless ENV['HUBSPOT_ACCESS_TOKEN']
    emails = Array(emails).select { |e| e.is_a?(String) && e.present? }.uniq
    return true if emails.empty?
    failed = []
    statuses = []
    emails.each do |email|
      begin
        res = Typhoeus.post(REMOVE_CONTACT_URL, {
          body: {objectId: email, idProperty: 'email'}.to_json,
          headers: {
            'Content-Type' => 'application/json',
            'Authorization' => "Bearer #{ENV['HUBSPOT_ACCESS_TOKEN']}"
          },
          timeout: 10
        })
        code = res.code.to_i
        # 2xx: deleted. 404: HubSpot has no such contact, which is the state we want.
        next if (code >= 200 && code < 300) || code == 404
        statuses << code
      rescue => e
        # The class only: an exception message can carry the request, address included.
        statuses << e.class.name
      end
      failed << email
    end
    return true if failed.empty?
    attempt = attempt.to_i
    if attempt < REMOVE_CONTACT_ATTEMPTS
      Rails.logger.warn("ExternalTracker: HubSpot contact removal failed for #{failed.length} address(es), attempt #{attempt} of #{REMOVE_CONTACT_ATTEMPTS}, will retry: #{statuses.uniq.join(', ')}")
      Worker.schedule(ExternalTracker, :remove_contact, failed, attempt + 1)
    else
      Rails.logger.error("ExternalTracker: HubSpot contact removal gave up for #{failed.length} address(es) after #{REMOVE_CONTACT_ATTEMPTS} attempts: #{statuses.uniq.join(', ')}")
    end
    false
  end

  # Reduce a referring URL to just its scheme+host (origin) so any PII in the
  # path, query string, or userinfo is dropped before the value is sent to
  # HubSpot. Restricted to http(s) with a present host; returns nil for blank,
  # non-web, hostless, or unparseable values so the caller drops it rather than
  # leaking or polluting attribution with a non-origin string.
  def self.referrer_origin(referrer)
    return nil if referrer.blank?
    begin
      uri = URI.parse(referrer.to_s)
      return nil unless ['http', 'https'].include?(uri.scheme) && uri.host.present?
      "#{uri.scheme}://#{uri.host}"
    rescue URI::Error
      nil
    end
  end

  # The ad key comes straight from the ?ref= URL param (app.js), so it is fully
  # attacker-controllable and unbounded. Only let through a short campaign-token
  # shape (letters/digits/._-); anything else (URLs, PII, CSV/formula-injection
  # payloads, oversized blobs) is dropped rather than egressed to HubSpot.
  def self.ad_key_clean(ad_referrer)
    return nil if ad_referrer.blank?
    value = ad_referrer.to_s
    return nil unless value.match?(/\A[A-Za-z0-9._\-]{1,64}\z/)
    value
  end
end
