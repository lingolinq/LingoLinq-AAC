# Top-level path segments that Processable#generate_unique_key suffixes when generating a user
# name or board key. Defined here, not in config/routes.rb, because Rails 8 draws routes lazily
# in development and test when eager_load is false (the test env and dev rake tasks, including
# Procfile workers), and this must exist at boot. Frozen so routes.rb cannot append to it.
# When adding a top-level route in config/routes.rb, add its first segment here.

LingoLinq::RESERVED_ROUTES = [
  'admin', 'database', 'etc', 'settings', 'status', 'reports', 'stats', 'search',
  'messages', 'inbox', 'log', 'logs', 'session', 'sessions', 'imports',
  'boards', 'users', 'groups', 'organizations', 'pages', 'people', 'videos',
  'root', 'www', 'add', 'self', 'files', 'feeds',
  'dev', 'auth', 'config', 'jobs', 'ssl', 'integration', 'integrations',
  'api', 'account', 'accounts', 'oauth', 'oauth_success', 'token',
  'login', 'logout', 'register', 'profile', 'forgot_password',
  'support', 'help', 'forum', 'talk', 'chat', 'feedback', 'faq',
  'about', 'contact', 'info', 'docs', 'purchase', 'pricing', 'careers',
  'news', 'styleguide', 'tour', 'compare', 'guides', 'partners',
  'privacy', 'terms', 'hipaa', 'accessibility', 'history', 'parental_consent',
  'eu_ai_parental_consent',
  'js', 'css', 'scripts', 'script', 'pics', 'images', 'lessons', 'lesson',
  'find', 'unknown', 'nobody', 'goals', 'notes', 'rooms', 'cough_drop',
  'mylingolinq', 'inflection', 'inflections', 'saml', 'eval', 'ai_consent'
].freeze
