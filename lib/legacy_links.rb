# Addresses on the mylingolinq.com domain are leftovers from the fork rename.
# Clients running older code still send them as a license author_url, so they
# are swapped for the current address when stored.
module LegacyLinks
  LEGACY_HOST = /(\A|\.)mylingolinq\.com\z/i
  AUTHOR_URL = 'https://www.lingolinq.com'

  def self.legacy_url?(url)
    return false unless url.is_a?(String)
    host = URI.parse(url.strip).host rescue nil
    !!(host && host.match?(LEGACY_HOST))
  end

  def self.normalize_license(license)
    if license.is_a?(Hash) && legacy_url?(license['author_url'])
      license['author_url'] = AUTHOR_URL
    end
    license
  end
end
