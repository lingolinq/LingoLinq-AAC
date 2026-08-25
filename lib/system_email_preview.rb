module SystemEmailPreview
  SampleUser = Struct.new(:global_id, :user_name, :name, :email, keyword_init: true) do
    def settings
      {'name' => name, 'email' => email}
    end

    def display_user_name
      user_name
    end

    # Mirrors User#display_name, and must keep mirroring it. This struct stands in
    # for a real User while rendering an email preview -- the controller assigns it
    # as @user (see api/system_email_templates_controller#preview_binding_for), so
    # every method a mailer view calls on @user has to exist here too. Sixteen
    # views now call `.display_name`; without this the preview raises NoMethodError
    # rather than rendering, which is how it broke when display_name was rolled out
    # across the mailers. When you add a User method that a mail view uses, add it
    # here in the same change.
    def placeholder_name?
      name.blank? || name == User::PLACEHOLDER_NAME
    end

    def display_name
      return display_user_name if placeholder_name?
      name
    end

    def registration_code
      'preview-registration-code'
    end

    def user_token
      'preview-user-token'
    end

    def grace_period?
      false
    end

    def expires_at
      30.days.from_now
    end

    def registration_type
      'preview'
    end
  end

  def self.sample_user
    SampleUser.new(
      global_id: '#1#_preview-user',
      user_name: 'preview_user',
      name: 'Preview User',
      email: 'preview@example.com'
    )
  end
end
