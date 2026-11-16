module SystemEmailOverride
  extend ActiveSupport::Concern

  def mail(headers={}, &block)
    key = "#{mailer_name}/#{action_name}"
    override = SystemEmailTemplates.lookup(key)
    headers = headers.dup

    if override && override['subject'].present?
      entry = SystemEmailRegistry.find(key)
      if entry && entry[:uses_i18n_subject]
        headers[:subject] = override['subject']
      else
        headers[:subject] = "#{app_name} - #{override['subject']}"
      end
    end

    html_body = system_email_override_body(override, key, 'html')
    text_body = system_email_override_body(override, key, 'text')

    if html_body || text_body
      super(headers) do |format|
        # A format is declared only when there is a body for it: seven registered emails
        # have no plain-text view, and rendering a missing view stops the email.
        if html_body
          format.html { render html: html_body.html_safe, layout: 'email' }
        elsif SystemEmailTemplates.default_body(key, 'html')
          format.html { render "#{mailer_name}/#{action_name}" }
        end
        if text_body
          format.text { render plain: text_body }
        elsif SystemEmailTemplates.default_body(key, 'text')
          format.text { render "#{mailer_name}/#{action_name}" }
        end
      end
    else
      super(headers, &block)
    end
  end

  private

  # The stored body filled from allowed values (lib/system_email_placeholders.rb), or nil
  # to send the default view. A body that no longer fits, or a value that cannot be read,
  # falls back so the email still goes out; the log names only the template and format.
  def system_email_override_body(override, key, format)
    text = override.is_a?(Hash) ? override["#{format}_body"] : nil
    return nil if text.blank? || SystemEmailRegistry.find(key).nil?
    return nil unless SystemEmailPlaceholders.override_applies?(key, self)

    context = SystemEmailPlaceholders::Context.from_object(key, self)
    SystemEmailPlaceholders.render(text, key, format, context)
  rescue StandardError => e
    Rails.logger.warn("System email override not used for #{key} (#{format}): #{e.class}")
    nil
  end
end
