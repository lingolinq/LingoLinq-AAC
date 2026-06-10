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

    html_override = override && override['html_body'].present?
    text_override = override && override['text_body'].present?

    if html_override || text_override
      super(headers) do |format|
        if html_override
          format.html { render html: SystemEmailTemplates.render_string(override['html_body'], binding).html_safe }
        else
          format.html { render "#{mailer_name}/#{action_name}" }
        end
        if text_override
          format.text { render plain: SystemEmailTemplates.render_string(override['text_body'], binding) }
        else
          format.text { render "#{mailer_name}/#{action_name}" }
        end
      end
    else
      super(headers, &block)
    end
  end
end
