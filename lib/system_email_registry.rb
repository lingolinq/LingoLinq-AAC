module SystemEmailRegistry
  COMMON_VARS = ['app_name', 'company_name', 'support_url', 'email_signature', 'domain_settings'].freeze

  PARENTAL_CONSENT_I18N_BLOCKS = [
    { key: 'parental_consent_mailer.subject', label: 'Subject line', placeholders: ['app_name'] },
    { key: 'parental_consent_mailer.greeting', label: 'Greeting' },
    { key: 'parental_consent_mailer.intro', label: 'Introduction', placeholders: ['app_name', 'consent_age'] },
    { key: 'parental_consent_mailer.safety_notice', label: 'Safety notice' },
    { key: 'parental_consent_mailer.ready_heading', label: 'Ready-to-approve heading' },
    { key: 'parental_consent_mailer.action_prompt', label: 'Action prompt' },
    { key: 'parental_consent_mailer.cta_label', label: 'Approve link label' },
    { key: 'parental_consent_mailer.privacy_notice', label: 'Privacy notice' },
    { key: 'parental_consent_mailer.privacy_link_label', label: 'Privacy Policy link label' },
    { key: 'parental_consent_mailer.unexpected_heading', label: 'Unexpected-email heading' },
    { key: 'parental_consent_mailer.footer', label: 'Footer' }
  ].freeze

  PARENTAL_CONSENT_DYNAMIC_VARS = [
    { name: '@consent_url', description: 'One-time parental consent approval link sent to the parent.' },
    { name: '@privacy_url', description: 'Link to the Privacy Policy for COPPA direct notice.' },
    { name: '@consent_age', description: 'Applicable consent age (13 or 16) for this account.' },
    { name: '@user', description: 'The child user account awaiting consent.' },
    { name: '@child_name', description: 'Display name of the child user, if provided at signup.' },
    { name: '@parent_email', description: 'Parent or guardian email address the message is sent to.' }
  ].freeze

  PARENTAL_CONSENT_CONFIRMATION_I18N_BLOCKS = [
    { key: 'parental_consent_confirmation_mailer.subject', label: 'Subject line', placeholders: ['app_name'] },
    { key: 'parental_consent_confirmation_mailer.greeting', label: 'Greeting' },
    { key: 'parental_consent_confirmation_mailer.intro', label: 'Introduction', placeholders: ['app_name', 'child_username', 'registered_at'] },
    { key: 'parental_consent_confirmation_mailer.privacy_notice', label: 'Privacy notice' },
    { key: 'parental_consent_confirmation_mailer.privacy_link_label', label: 'Privacy Policy link label' },
    { key: 'parental_consent_confirmation_mailer.revoke_heading', label: 'Changed-your-mind heading' },
    { key: 'parental_consent_confirmation_mailer.revoke_notice', label: 'Revoke-anytime notice' },
    { key: 'parental_consent_confirmation_mailer.revoke_prompt', label: 'Revoke link prompt' },
    { key: 'parental_consent_confirmation_mailer.revoke_cta_label', label: 'Revoke link label' },
    { key: 'parental_consent_confirmation_mailer.footer', label: 'Footer' },
    { key: 'parental_consent_confirmation_mailer.contact_link_label', label: 'Contact Page link label' }
  ].freeze

  PARENTAL_CONSENT_CONFIRMATION_DYNAMIC_VARS = [
    { name: '@revoke_url', description: 'Link for the parent to withdraw consent at any time.' },
    { name: '@privacy_url', description: 'Link to the Privacy Policy.' },
    { name: '@contact_url', description: 'Link to contact support.' },
    { name: '@user', description: 'The child user account.' },
    { name: '@child_name', description: 'Display name of the child user.' },
    { name: '@child_username', description: 'Username of the child account.' },
    { name: '@registered_at', description: 'Account registration date.' },
    { name: '@granted_at', description: 'Timestamp when consent was recorded.' },
    { name: '@parent_email', description: 'Parent or guardian email address.' }
  ].freeze

  PARENTAL_CONSENT_REVOKED_I18N_BLOCKS = [
    { key: 'parental_consent_revoked_mailer.subject', label: 'Subject line', placeholders: ['app_name'] },
    { key: 'parental_consent_revoked_mailer.greeting', label: 'Greeting' },
    { key: 'parental_consent_revoked_mailer.intro', label: 'Introduction', placeholders: ['app_name'] },
    { key: 'parental_consent_revoked_mailer.details', label: 'Account details', placeholders: ['child_name', 'child_username', 'revoked_at'] },
    { key: 'parental_consent_revoked_mailer.footer', label: 'Footer' },
    { key: 'parental_consent_revoked_mailer.contact_link_label', label: 'Contact Page link label' }
  ].freeze

  PARENTAL_CONSENT_REVOKED_DYNAMIC_VARS = [
    { name: '@privacy_url', description: 'Link to the Privacy Policy.' },
    { name: '@contact_url', description: 'Link to contact support.' },
    { name: '@user', description: 'The child user account.' },
    { name: '@child_name', description: 'Display name of the child user.' },
    { name: '@child_username', description: 'Username of the child account.' },
    { name: '@revoked_at', description: 'Timestamp when consent was withdrawn.' },
    { name: '@parent_email', description: 'Parent or guardian email address.' }
  ].freeze

  EU_AI_PARENTAL_CONSENT_I18N_BLOCKS = [
    { key: 'eu_ai_parental_consent_mailer.subject', label: 'Subject line', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_mailer.greeting', label: 'Greeting' },
    { key: 'eu_ai_parental_consent_mailer.intro', label: 'Introduction', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_mailer.aac_notice', label: 'AAC-still-available notice', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_mailer.action_prompt', label: 'Action prompt' },
    { key: 'eu_ai_parental_consent_mailer.privacy_notice', label: 'Privacy notice' },
    { key: 'eu_ai_parental_consent_mailer.footer', label: 'Footer' }
  ].freeze

  EU_AI_PARENTAL_CONSENT_DYNAMIC_VARS = [
    { name: '@consent_url', description: 'One-time EU AI parental consent approval link.' },
    { name: '@privacy_url', description: 'Link to the Privacy Policy.' },
    { name: '@user', description: 'The user account awaiting AI parental consent.' },
    { name: '@child_name', description: 'Display name of the account holder.' },
    { name: '@parent_email', description: 'Parent or guardian email address.' }
  ].freeze

  EU_AI_PARENTAL_CONSENT_CONFIRMATION_I18N_BLOCKS = [
    { key: 'eu_ai_parental_consent_confirmation_mailer.subject', label: 'Subject line', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_confirmation_mailer.greeting', label: 'Greeting' },
    { key: 'eu_ai_parental_consent_confirmation_mailer.intro', label: 'Introduction', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_confirmation_mailer.details', label: 'Account details', placeholders: ['child_name', 'child_username', 'granted_at'] },
    { key: 'eu_ai_parental_consent_confirmation_mailer.privacy_notice', label: 'Privacy notice' },
    { key: 'eu_ai_parental_consent_confirmation_mailer.revoke_notice', label: 'Revoke-anytime notice' },
    { key: 'eu_ai_parental_consent_confirmation_mailer.revoke_prompt', label: 'Revoke link prompt' },
    { key: 'eu_ai_parental_consent_confirmation_mailer.footer', label: 'Footer', placeholders: ['contact_url'] }
  ].freeze

  EU_AI_PARENTAL_CONSENT_CONFIRMATION_DYNAMIC_VARS = [
    { name: '@revoke_url', description: 'Link for the parent to withdraw AI consent.' },
    { name: '@privacy_url', description: 'Link to the Privacy Policy.' },
    { name: '@contact_url', description: 'Link to contact support.' },
    { name: '@user', description: 'The user account.' },
    { name: '@child_name', description: 'Display name of the account holder.' },
    { name: '@child_username', description: 'Username of the account.' },
    { name: '@granted_at', description: 'Timestamp when AI consent was recorded.' },
    { name: '@parent_email', description: 'Parent or guardian email address.' }
  ].freeze

  EU_AI_PARENTAL_CONSENT_REVOKED_I18N_BLOCKS = [
    { key: 'eu_ai_parental_consent_revoked_mailer.subject', label: 'Subject line', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_revoked_mailer.greeting', label: 'Greeting' },
    { key: 'eu_ai_parental_consent_revoked_mailer.intro', label: 'Introduction', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_revoked_mailer.details', label: 'Account details', placeholders: ['child_name', 'child_username', 'revoked_at'] },
    { key: 'eu_ai_parental_consent_revoked_mailer.aac_notice', label: 'AAC-still-available notice', placeholders: ['app_name'] },
    { key: 'eu_ai_parental_consent_revoked_mailer.footer', label: 'Footer', placeholders: ['contact_url'] }
  ].freeze

  EU_AI_PARENTAL_CONSENT_REVOKED_DYNAMIC_VARS = [
    { name: '@privacy_url', description: 'Link to the Privacy Policy.' },
    { name: '@contact_url', description: 'Link to contact support.' },
    { name: '@user', description: 'The user account.' },
    { name: '@child_name', description: 'Display name of the account holder.' },
    { name: '@child_username', description: 'Username of the account.' },
    { name: '@revoked_at', description: 'Timestamp when AI consent was withdrawn.' },
    { name: '@parent_email', description: 'Parent or guardian email address.' }
  ].freeze

  ENTRIES = [
    { mailer: 'user_mailer', action: 'confirm_registration', name: 'Welcome / confirm registration', category: 'Account', recipient_type: 'user', default_subject: 'Welcome!', variables: COMMON_VARS + ['@user'] },
    { mailer: 'user_mailer', action: 'forgot_password', name: 'Forgot password', category: 'Account', recipient_type: 'user', default_subject: 'Forgot Password Confirmation', variables: COMMON_VARS + ['@user', '@users'] },
    { mailer: 'user_mailer', action: 'password_changed', name: 'Password changed', category: 'Account', recipient_type: 'user', default_subject: 'Password Changed', variables: COMMON_VARS + ['@user'] },
    { mailer: 'user_mailer', action: 'email_changed', name: 'Email changed', category: 'Account', recipient_type: 'user', default_subject: 'Email Changed', variables: COMMON_VARS + ['@user', '@old_email'] },
    { mailer: 'user_mailer', action: 'login_no_user', name: 'Login help (unknown email)', category: 'Account', recipient_type: 'user', default_subject: 'Login Help', variables: COMMON_VARS + ['@email', '@full_domain'] },
    { mailer: 'user_mailer', action: 'new_user_registration', name: 'New user registration alert', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'New Registration', variables: COMMON_VARS + ['@user', '@location'] },
    {
      mailer: 'user_mailer',
      action: 'parental_consent_request',
      name: 'Parental consent request',
      category: 'Account',
      recipient_type: 'parent',
      default_subject: 'Parental Consent',
      variables: COMMON_VARS + ['@consent_url', '@privacy_url', '@user', '@child_name', '@parent_email'],
      i18n_blocks: PARENTAL_CONSENT_I18N_BLOCKS,
      dynamic_variables: PARENTAL_CONSENT_DYNAMIC_VARS,
      uses_i18n_subject: true
    },
    {
      mailer: 'user_mailer',
      action: 'parental_consent_confirmation',
      name: 'Parental consent confirmation',
      category: 'Account',
      recipient_type: 'parent',
      default_subject: 'Parental Consent Confirmed',
      variables: COMMON_VARS + ['@revoke_url', '@privacy_url', '@contact_url', '@user', '@child_name', '@child_username', '@granted_at', '@parent_email'],
      i18n_blocks: PARENTAL_CONSENT_CONFIRMATION_I18N_BLOCKS,
      dynamic_variables: PARENTAL_CONSENT_CONFIRMATION_DYNAMIC_VARS,
      uses_i18n_subject: true
    },
    {
      mailer: 'user_mailer',
      action: 'parental_consent_revoked',
      name: 'Parental consent withdrawn',
      category: 'Account',
      recipient_type: 'parent',
      default_subject: 'Parental Consent Withdrawn',
      variables: COMMON_VARS + ['@privacy_url', '@contact_url', '@user', '@child_name', '@child_username', '@revoked_at', '@parent_email'],
      i18n_blocks: PARENTAL_CONSENT_REVOKED_I18N_BLOCKS,
      dynamic_variables: PARENTAL_CONSENT_REVOKED_DYNAMIC_VARS,
      uses_i18n_subject: true
    },
    {
      mailer: 'user_mailer',
      action: 'eu_ai_parental_consent_request',
      name: 'EU AI parental consent request',
      category: 'Account',
      recipient_type: 'parent',
      default_subject: 'AI Feature Parental Consent',
      variables: COMMON_VARS + ['@consent_url', '@privacy_url', '@user', '@child_name', '@parent_email'],
      i18n_blocks: EU_AI_PARENTAL_CONSENT_I18N_BLOCKS,
      dynamic_variables: EU_AI_PARENTAL_CONSENT_DYNAMIC_VARS,
      uses_i18n_subject: true
    },
    {
      mailer: 'user_mailer',
      action: 'eu_ai_parental_consent_confirmation',
      name: 'EU AI parental consent confirmation',
      category: 'Account',
      recipient_type: 'parent',
      default_subject: 'AI Feature Consent Confirmed',
      variables: COMMON_VARS + ['@revoke_url', '@privacy_url', '@contact_url', '@user', '@child_name', '@child_username', '@granted_at', '@parent_email'],
      i18n_blocks: EU_AI_PARENTAL_CONSENT_CONFIRMATION_I18N_BLOCKS,
      dynamic_variables: EU_AI_PARENTAL_CONSENT_CONFIRMATION_DYNAMIC_VARS,
      uses_i18n_subject: true
    },
    {
      mailer: 'user_mailer',
      action: 'eu_ai_parental_consent_revoked',
      name: 'EU AI parental consent withdrawn',
      category: 'Account',
      recipient_type: 'parent',
      default_subject: 'AI Feature Consent Withdrawn',
      variables: COMMON_VARS + ['@privacy_url', '@contact_url', '@user', '@child_name', '@child_username', '@revoked_at', '@parent_email'],
      i18n_blocks: EU_AI_PARENTAL_CONSENT_REVOKED_I18N_BLOCKS,
      dynamic_variables: EU_AI_PARENTAL_CONSENT_REVOKED_DYNAMIC_VARS,
      uses_i18n_subject: true
    },
    { mailer: 'user_mailer', action: 'badge_awarded', name: 'Badge awarded', category: 'Reports & engagement', recipient_type: 'user', default_subject: 'Badge Awarded', variables: COMMON_VARS + ['@recipient', '@user', '@badge', '@goal', '@for_self'] },
    { mailer: 'user_mailer', action: 'log_message', name: 'New log message', category: 'Reports & engagement', recipient_type: 'user', default_subject: 'New Message', variables: COMMON_VARS + ['@user', '@log'] },
    { mailer: 'user_mailer', action: 'log_summary', name: 'Communication log summary', category: 'Reports & engagement', recipient_type: 'user', default_subject: 'Communication Report', variables: COMMON_VARS + ['@user'] },
    { mailer: 'user_mailer', action: 'usage_reminder', name: 'Usage reminder', category: 'Reports & engagement', recipient_type: 'user', default_subject: 'Usage Reminder', variables: COMMON_VARS + ['@user'] },
    { mailer: 'user_mailer', action: 'utterance_share', name: 'Utterance share', category: 'Reports & engagement', recipient_type: 'user', default_subject: 'Shared Utterance', variables: COMMON_VARS + ['@user'] },
    { mailer: 'user_mailer', action: 'lesson_assigned', name: 'Lesson assigned', category: 'Organization', recipient_type: 'user', default_subject: 'New Lesson Assigned', variables: COMMON_VARS + ['@lesson', '@users'] },
    { mailer: 'user_mailer', action: 'organization_assigned', name: 'Organization assigned', category: 'Organization', recipient_type: 'user', default_subject: 'Organization Assigned', variables: COMMON_VARS + ['@user', '@org'] },
    { mailer: 'user_mailer', action: 'organization_unassigned', name: 'Organization unassigned', category: 'Organization', recipient_type: 'user', default_subject: 'Organization Unassigned', variables: COMMON_VARS + ['@user', '@org'] },
    { mailer: 'user_mailer', action: 'valet_password_enabled', name: 'Valet password enabled', category: 'Account', recipient_type: 'user', default_subject: 'Valet Password Enabled', variables: COMMON_VARS + ['@user'] },
    { mailer: 'user_mailer', action: 'valet_password_used', name: 'Valet password used', category: 'Account', recipient_type: 'user', default_subject: 'Valet Password Used', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'purchase_confirmed', name: 'Purchase confirmed', category: 'Subscription', recipient_type: 'user', default_subject: 'Purchase Confirmed', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'eval_purchase_confirmed', name: 'Eval purchase confirmed', category: 'Subscription', recipient_type: 'user', default_subject: 'Eval Purchase Confirmed', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'supporter_purchase_confirmed', name: 'Supporter purchase confirmed', category: 'Subscription', recipient_type: 'user', default_subject: 'Supporter Purchase Confirmed', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'purchase_bounced', name: 'Purchase bounced', category: 'Subscription', recipient_type: 'user', default_subject: 'Purchase Bounced', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'new_subscription', name: 'New subscription alert', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'New Subscription', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'unsubscribe_reason', name: 'Unsubscribe reason', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'User Unsubscribed', variables: COMMON_VARS + ['@user', '@reason'] },
    { mailer: 'subscription_mailer', action: 'chargeback_created', name: 'Chargeback created', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'Chargeback Created', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'subscription_pause_failed', name: 'Subscription pause failed', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'Subscription Pause Failed', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'subscription_resume_failed', name: 'Subscription resume failed', category: 'Subscription', recipient_type: 'user', default_subject: 'Subscription Resume Failed', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'subscription_expiring', name: 'Subscription expiring', category: 'Subscription', recipient_type: 'user', default_subject: 'Subscription Expiring', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'subscription_expired', name: 'Subscription expired', category: 'Subscription', recipient_type: 'user', default_subject: 'Subscription Expired', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'expiration_approaching', name: 'Expiration approaching', category: 'Subscription', recipient_type: 'user', default_subject: 'Expiration Approaching', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'one_week_until_expiration', name: 'One week until expiration', category: 'Subscription', recipient_type: 'user', default_subject: 'One Week Until Expiration', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'one_day_until_expiration', name: 'One day until expiration', category: 'Subscription', recipient_type: 'user', default_subject: 'One Day Until Expiration', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'gift_created', name: 'Gift created', category: 'Subscription', recipient_type: 'user', default_subject: 'Gift Created', variables: COMMON_VARS + ['@gift'] },
    { mailer: 'subscription_mailer', action: 'gift_redeemed', name: 'Gift redeemed', category: 'Subscription', recipient_type: 'user', default_subject: 'Gift Redeemed', variables: COMMON_VARS + ['@gift'] },
    { mailer: 'subscription_mailer', action: 'gift_seconds_added', name: 'Gift seconds added', category: 'Subscription', recipient_type: 'user', default_subject: 'Gift Seconds Added', variables: COMMON_VARS + ['@gift'] },
    { mailer: 'subscription_mailer', action: 'gift_updated', name: 'Gift updated', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'Gift Updated', variables: COMMON_VARS + ['@gift', '@action'] },
    { mailer: 'subscription_mailer', action: 'extras_purchased', name: 'Extras purchased', category: 'Subscription', recipient_type: 'user', default_subject: 'Extras Purchased', variables: COMMON_VARS + ['@user'] },
    { mailer: 'subscription_mailer', action: 'deletion_warning', name: 'Account deletion warning', category: 'Account', recipient_type: 'user', default_subject: 'Deletion Warning', variables: COMMON_VARS + ['@user', '@attempts'] },
    { mailer: 'subscription_mailer', action: 'account_deleted', name: 'Account deleted', category: 'Account', recipient_type: 'user', default_subject: 'Account Deleted', variables: COMMON_VARS + ['@user'] },
    { mailer: 'supervisor_mailer', action: 'consent_request', name: 'Supervisor consent request', category: 'Supervisor', recipient_type: 'communicator', default_subject: 'Supervisor Consent Request', variables: COMMON_VARS + ['@relationship', '@supervisor', '@communicator'] },
    { mailer: 'supervisor_mailer', action: 'consent_approved', name: 'Supervisor consent approved', category: 'Supervisor', recipient_type: 'supervisor', default_subject: 'Consent Approved', variables: COMMON_VARS + ['@relationship', '@supervisor', '@communicator'] },
    { mailer: 'supervisor_mailer', action: 'consent_denied', name: 'Supervisor consent denied', category: 'Supervisor', recipient_type: 'supervisor', default_subject: 'Consent Denied', variables: COMMON_VARS + ['@relationship', '@supervisor', '@communicator'] },
    { mailer: 'supervisor_mailer', action: 'supervisor_revoked', name: 'Supervisor revoked', category: 'Supervisor', recipient_type: 'user', default_subject: 'Supervisor Revoked', variables: COMMON_VARS + ['@relationship', '@revoker'] },
    { mailer: 'admin_mailer', action: 'message_sent', name: 'Contact us message', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'Contact Us Message Received', variables: COMMON_VARS + ['@message'] },
    { mailer: 'admin_mailer', action: 'beta_feedback_sent', name: 'Beta feedback sent', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'Beta Feedback', variables: COMMON_VARS + ['@message'] },
    { mailer: 'admin_mailer', action: 'opt_out', name: 'Opt-out request', category: 'Admin notifications', recipient_type: 'admin', default_subject: 'Opt-Out Requested', variables: COMMON_VARS + ['@user', '@reason'] }
  ].freeze

  def self.all
    ENTRIES.map do |e|
      e.merge(
        key: "#{e[:mailer]}/#{e[:action]}",
        description: e[:description] || ''
      )
    end
  end

  def self.find(key)
    all.detect { |e| e[:key] == key }
  end

  def self.slug_for(key)
    key.to_s.gsub('/', '.')
  end

  def self.key_from_slug(slug)
    slug.to_s.gsub('.', '/')
  end

  def self.categories
    all.map { |e| e[:category] }.uniq.sort
  end
end
