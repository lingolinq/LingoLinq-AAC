# Save-time check for admin-edited email bodies. The text may use only the placeholders
# SystemEmailPlaceholders allows (for this email when a key is given); it is never run as
# code. Raises SystemEmailPlaceholders::InvalidTemplate, an ArgumentError.
module SystemEmailTemplateSecurity
  def self.validate!(template_string, key = nil)
    SystemEmailPlaceholders.validate!(template_string, key)
  end
end
