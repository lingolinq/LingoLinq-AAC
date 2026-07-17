module SystemEmailPreview
  SampleUser = Struct.new(:global_id, :user_name, :name, :email, keyword_init: true) do
    def settings
      {'name' => name, 'email' => email}
    end

    def display_user_name
      user_name
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
