# Fills admin-edited system email bodies from a list of allowed values.
#
# Stored template text is never run as code. Each <%= ... %> tag is parsed by the small
# grammar below, and every form it accepts maps to a lambda written here. Instance
# variables are read only by names in this file, record fields only through the FIELDS
# table, and a value is turned into text only when it is a string, number, symbol,
# boolean, date or time. In HTML bodies every value is HTML-escaped.
#
# Forms (each also limited per email, see .check!):
#   app_name, company_name, support_url, email_signature
#   JsonApi::Json.absolute_host
#   domain_settings['youtube_url']
#   @name                         a plain value the email sets
#   @password_reset_url, @lesson_url, @gift_redeem_url   a whole link built in code (LINKS)
#   @name.field, @name.settings['key'], @name.data['key']   a listed field of a record
#   long_ordinal_date(<value>)
#   <value>.presence || <value>
#   mailer_t('key', name: <value>, ...)   a message block this email uses
#   a few whole expressions copied from the default views (FIXED_EXPRESSIONS)
# Outside tags text is literal, and <%% is written as <%, as ERB does.
#
# Trust boundary: only platform staff reach the editor (site admins and managers of the admin
# organization, Api::SystemSettingsAccess#require_system_settings_access). This file stops stored
# text from running code. It does not limit where in a body an editor places a link or code the
# email carries; editors are trusted with those.
module SystemEmailPlaceholders
  class InvalidTemplate < SystemEmailTemplates::InvalidOverride; end
  # A value a link needs is missing at send time; the send falls back to the default view.
  class MissingValue < StandardError; end

  CODE_BLOCK_MESSAGE = 'Email templates may only use <%= ... %> output tags, not Ruby code blocks (<% ... %>)'.freeze
  UNCLOSED_MESSAGE = 'Email template has a <%= tag that is not closed with %>'.freeze

  HELPERS = {
    'app_name' => ->(ctx) { ctx.app_name },
    'company_name' => ->(ctx) { ctx.company_name },
    'support_url' => ->(ctx) { ctx.support_url },
    'email_signature' => ->(ctx) { ctx.email_signature }
  }.freeze

  SITE_URL = 'JsonApi::Json.absolute_host'.freeze
  DOMAIN_SETTING_KEYS = %w[youtube_url].freeze

  SCALAR_VARS = %w[
    @action_type @approve_url @attempt @author_name @child_name @child_username @consent_age
    @consent_url @contact_url @decline_url @deletion_at @deny_url @email @export_url @for_self
    @full_domain @granted_at @location @log_duration @log_period @old_email @parent_email
    @permission_description @privacy_url @reason @registered_at @reply_url @revoke_url
    @revoked_at @revoker_type @sender
  ].freeze

  RECORD_VARS = {
    '@user' => :user, '@recipient' => :user, '@supervisor' => :user, '@communicator' => :user,
    '@revoker' => :user, '@target' => :user, '@gift' => :gift, '@badge' => :badge,
    '@message' => :contact_message, '@org' => :org, '@lesson' => :lesson, '@goal' => :goal
  }.freeze

  # The same name holds a different kind of value in some emails.
  KIND_OVERRIDES = {
    'user_mailer/utterance_share' => {'@message' => :scalar}
  }.freeze

  ALL_VARS = (SCALAR_VARS + RECORD_VARS.keys).freeze

  RECORD_CLASSES = {
    user: -> { [User, SystemEmailPreview::SampleUser] },
    gift: -> { [GiftPurchase] },
    badge: -> { [UserBadge] },
    contact_message: -> { [ContactMessage] },
    org: -> { [Organization] },
    lesson: -> { [Lesson] },
    goal: -> { [UserGoal] }
  }.freeze

  def self.hash_read(record, attr, key)
    hash = record.public_send(attr)
    hash.is_a?(Hash) ? hash[key] : nil
  end

  def self.setting(key)
    ->(record) { hash_read(record, :settings, key) }
  end

  # scope: :common (wherever the variable is set), :recipient (only where the record is
  # the person the email is addressed to, or the default view shows it), or :scoped (only
  # where the email's own default view uses it). Secret link parts (reset codes, lesson
  # nonces and share tokens, gift verifiers) are not fields: they reach a body only inside
  # a whole link (LINKS).
  FIELDS = {
    user: {
      'user_name' => [:common, ->(r) { r.user_name }],
      'display_name' => [:common, ->(r) { r.display_name }],
      'display_user_name' => [:common, ->(r) { r.display_user_name }],
      'email' => [:recipient, setting('email')],
      "settings['email']" => [:recipient, setting('email')],
      'registration_code' => [:scoped, ->(r) { r.registration_code }],
      'expires_at' => [:scoped, ->(r) { r.expires_at }]
    },
    gift: {
      'code' => [:scoped, ->(r) { r.code }],
      'duration' => [:scoped, ->(r) { r.duration }],
      "settings['organization']" => [:scoped, setting('organization')],
      "settings['email']" => [:scoped, setting('email')],
      "settings['amount']" => [:scoped, setting('amount')],
      "settings['licenses']" => [:scoped, setting('licenses')],
      "settings['gift_name']" => [:scoped, setting('gift_name')]
    },
    badge: {
      'level' => [:scoped, ->(r) { r.level }],
      "data['name']" => [:scoped, ->(r) { hash_read(r, :data, 'name') }]
    },
    contact_message: %w[name email subject recipient message].to_h { |k| ["settings['#{k}']", [:scoped, setting(k)]] },
    org: {"settings['name']" => [:scoped, setting('name')]},
    lesson: %w[title description due_at time_estimate].to_h { |k| ["settings['#{k}']", [:scoped, setting(k)]] },
    goal: {"settings['summary']" => [:scoped, setting('summary')]}
  }.freeze

  # Each value must be present, or the link is not built (MissingValue).
  def self.link_parts(*parts)
    raise MissingValue unless parts.all? { |part| part.is_a?(String) || part.is_a?(Numeric) } && parts.all?(&:present?)

    parts
  end

  # Whole links, built in code the same way the default views build them, each accepted
  # only in its own email. The secret parts inside them are never placeholders of their own.
  LINKS = {
    '@password_reset_url' => {
      email: 'user_mailer/forgot_password',
      build: lambda { |ctx|
        user = ctx.record('@user', :user)
        name, code = link_parts(user&.user_name, user&.password_reset_code)
        "#{JsonApi::Json.absolute_host}/#{name}/password_reset/#{code}"
      }
    },
    '@lesson_url' => {
      email: 'user_mailer/lesson_assigned',
      build: lambda { |ctx|
        lesson = ctx.record('@lesson', :lesson)
        user = ctx.record('@user', :user)
        id, nonce, token = link_parts(lesson&.global_id, lesson&.nonce, user&.lesson_share_token)
        "#{JsonApi::Json.absolute_host}/lessons/#{id}/#{nonce}/#{token}"
      }
    },
    '@gift_redeem_url' => {
      email: 'subscription_mailer/gift_created',
      build: lambda { |ctx|
        gift = ctx.record('@gift', :gift)
        code, verifier = link_parts(gift&.code, gift&.code_verifier)
        "#{JsonApi::Json.absolute_host}/redeem/#{code}::#{verifier}"
      }
    }
  }.freeze

  def self.links_for(key)
    LINKS.select { |_name, link| link[:email] == key }.keys
  end

  # Whole expressions from the default views, matched as text (whitespace collapsed) and
  # filled by the lambda beside them. Accepted only in an email whose default view has them.
  FIXED_EXPRESSIONS = {
    '@user.grace_period? ? "free trial" : "premium cloud extras access"' => lambda { |ctx|
      user = ctx.record('@user', :user)
      user && user.grace_period? ? 'free trial' : 'premium cloud extras access'
    },
    "@recipient ? @recipient.user_name : 'unknown'" => lambda { |ctx|
      recipient = ctx.record('@recipient', :user)
      recipient ? recipient.user_name : 'unknown'
    },
    "@attempt == 1 ? 'first' : 'final'" => ->(ctx) { ctx.value('@attempt') == 1 ? 'first' : 'final' },
    '@user.purchase_credit_duration / 1.month.to_i' => lambda { |ctx|
      user = ctx.record('@user', :user)
      duration = user.respond_to?(:purchase_credit_duration) ? user.purchase_credit_duration : nil
      duration.is_a?(Numeric) ? duration / 1.month.to_i : nil
    }
  }.freeze

  # The variable holding the person each email is addressed to (mailer code, e.g.
  # app/mailers/user_mailer.rb badge_awarded sends to @recipient, not @user). An email that
  # also goes to someone else is left out: email_changed is sent to the previous address
  # too (app/models/concerns/notifiable.rb channels_for), and supervisor_mailer/consent_request
  # goes to the owner or guardian address when one is set, not to @communicator
  # (app/services/supervisor_consent_service.rb consent_email_sent_to).
  RECIPIENT_VARS = {
    '@user' => %w[
      user_mailer/confirm_registration user_mailer/forgot_password user_mailer/password_changed
      user_mailer/log_message user_mailer/log_summary
      user_mailer/usage_reminder user_mailer/lesson_assigned user_mailer/organization_assigned
      user_mailer/organization_unassigned user_mailer/valet_password_enabled
      user_mailer/valet_password_used
      subscription_mailer/subscription_resume_failed subscription_mailer/purchase_bounced
      subscription_mailer/purchase_confirmed subscription_mailer/eval_purchase_confirmed
      subscription_mailer/supporter_purchase_confirmed subscription_mailer/expiration_approaching
      subscription_mailer/one_day_until_expiration subscription_mailer/one_week_until_expiration
      subscription_mailer/subscription_expired subscription_mailer/subscription_expiring
      subscription_mailer/extras_purchased subscription_mailer/deletion_warning
      subscription_mailer/account_deleted
    ],
    '@recipient' => %w[user_mailer/badge_awarded supervisor_mailer/supervisor_revoked subscription_mailer/gift_seconds_added],
    '@supervisor' => %w[supervisor_mailer/consent_approved supervisor_mailer/consent_denied]
  }.freeze

  # Values an edited body must keep because the email does not work without them.
  REQUIRED_PLACEHOLDERS = {
    'user_mailer/forgot_password' => %w[@password_reset_url],
    'user_mailer/lesson_assigned' => %w[@lesson_url],
    'subscription_mailer/gift_created' => %w[@gift.code @gift_redeem_url],
    'user_mailer/confirm_registration' => %w[@user.registration_code],
    # Consent requests: COPPA 16 CFR 312.4(c)(1)(v) requires the link to the privacy notice; the
    # parental request also keeps its decline link, so refusing is as easy as consenting.
    'user_mailer/parental_consent_request' => %w[@consent_url @privacy_url @decline_url],
    'supervisor_mailer/consent_request' => %w[@approve_url @deny_url],
    'user_mailer/eu_ai_parental_consent_request' => %w[@consent_url @privacy_url],
    'user_mailer/parental_consent_confirmation' => %w[@revoke_url],
    'user_mailer/eu_ai_parental_consent_confirmation' => %w[@revoke_url]
  }.freeze

  # Sends the default view instead of an edited body when the edited body cannot carry
  # what this send needs: one reset link per login, or a bulk gift's details. Reads the
  # mailer's own variables by fixed names.
  OVERRIDE_CONDITIONS = {
    'user_mailer/forgot_password' => lambda { |mailer|
      users = mailer.instance_variable_get(:@users)
      users.respond_to?(:size) && users.size == 1
    },
    'subscription_mailer/gift_created' => lambda { |mailer|
      gift = mailer.instance_variable_get(:@gift)
      gift.is_a?(GiftPurchase) && !gift.bulk_purchase?
    }
  }.freeze

  def self.override_applies?(key, mailer)
    condition = OVERRIDE_CONDITIONS[key]
    condition.nil? || !!condition.call(mailer)
  end

  def self.required_for(key)
    REQUIRED_PLACEHOLDERS[key] || []
  end

  Helper = Struct.new(:name)
  SiteUrl = Struct.new(:unused)
  DomainSetting = Struct.new(:key)
  Var = Struct.new(:name)
  Field = Struct.new(:var, :field)
  DateValue = Struct.new(:arg)
  Presence = Struct.new(:lhs, :rhs)
  MailerT = Struct.new(:key, :args)
  Fixed = Struct.new(:expr)

  # Values an email is filled from. Holds only variables named in ALL_VARS.
  class Context
    include MailerHelper

    attr_reader :template_key

    def self.from_object(template_key, source, i18n_overrides: nil, domain_settings: nil, links: nil)
      values = ALL_VARS.each_with_object({}) do |name, memo|
        memo[name] = source.instance_variable_get(name) if source.instance_variable_defined?(name)
      end
      new(template_key: template_key, values: values, i18n_overrides: i18n_overrides, domain_settings: domain_settings, links: links)
    end

    # i18n_overrides, domain_settings and links (sample whole links) stand in for the
    # stored or computed ones in an email preview.
    def initialize(template_key:, values:, i18n_overrides: nil, domain_settings: nil, links: nil)
      @template_key = template_key
      @values = values.slice(*ALL_VARS)
      @i18n_overrides = i18n_overrides
      @domain_settings = domain_settings
      @links = links
    end

    def link(name)
      return @links[name] if @links

      LINKS.fetch(name)[:build].call(self)
    end

    def domain_settings
      @domain_settings || super
    end

    def value(name)
      @values[name]
    end

    def record(name, kind)
      val = @values[name]
      RECORD_CLASSES[kind].call.any? { |klass| val.is_a?(klass) } ? val : nil
    end

    def mailer_t(key, interpolations = {})
      text = @i18n_overrides && @i18n_overrides[key].presence
      return SystemEmailI18n.resolve(@template_key, key, interpolations) unless text

      interpolations.present? ? I18n.interpolate(text, interpolations.symbolize_keys) : text
    end
  end

  # Splits an expression into tokens; anything outside these forms is refused.
  TOKEN = /\s*(?:(@[a-z_][a-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*\??)|'([^'\\#]*)'|(\d+)|(::|\|\||[.,()\[\]:]))/

  def self.tokenize(expr)
    tokens = []
    pos = 0
    while pos < expr.length
      break if expr[pos..].strip.empty?

      match = TOKEN.match(expr, pos)
      return nil unless match && match.begin(0) == pos

      tokens << if match[1] then [:ivar, match[1]]
                elsif match[2] then [:ident, match[2]]
                elsif match[3] then [:string, match[3]]
                elsif match[4] then [:int, match[4]]
                else [:punct, match[5]]
                end
      pos = match.end(0)
    end
    tokens
  end

  class Parser
    def initialize(tokens)
      @tokens = tokens
      @pos = 0
    end

    def parse
      node = parse_or
      @pos == @tokens.length ? node : nil
    end

    private

    def peek(offset = 0)
      @tokens[@pos + offset]
    end

    def accept(type, text = nil)
      tok = peek
      return nil unless tok && tok[0] == type && (text.nil? || tok[1] == text)

      @pos += 1
      tok[1]
    end

    def expect(type, text = nil)
      accept(type, text) || throw(:invalid)
    end

    def parse_or
      lhs = parse_value
      if peek == [:punct, '.'] && peek(1) == [:ident, 'presence']
        @pos += 2
        expect(:punct, '||')
        return Presence.new(lhs, parse_value)
      end
      lhs
    end

    def parse_value
      if (name = accept(:ivar))
        return parse_field(name)
      end

      ident = expect(:ident)
      case ident
      when *HELPERS.keys
        Helper.new(ident)
      when 'JsonApi'
        expect(:punct, '::')
        expect(:ident, 'Json')
        expect(:punct, '.')
        expect(:ident, 'absolute_host')
        SiteUrl.new(nil)
      when 'domain_settings'
        expect(:punct, '[')
        key = expect(:string)
        expect(:punct, ']')
        throw(:invalid) unless DOMAIN_SETTING_KEYS.include?(key)
        DomainSetting.new(key)
      when 'long_ordinal_date'
        expect(:punct, '(')
        arg = parse_value
        expect(:punct, ')')
        DateValue.new(arg)
      when 'mailer_t'
        parse_mailer_t
      else
        throw(:invalid)
      end
    end

    def parse_field(name)
      return Var.new(name) unless peek == [:punct, '.'] && peek(1) && peek(1)[0] == :ident && peek(1)[1] != 'presence'

      @pos += 1
      attr = expect(:ident)
      if %w[settings data].include?(attr)
        expect(:punct, '[')
        key = expect(:string)
        expect(:punct, ']')
        attr = "#{attr}['#{key}']"
      end
      Field.new(name, attr)
    end

    def parse_mailer_t
      expect(:punct, '(')
      key = expect(:string)
      args = {}
      while accept(:punct, ',')
        name = expect(:ident)
        expect(:punct, ':')
        args[name] = parse_or
      end
      expect(:punct, ')')
      MailerT.new(key, args)
    end
  end

  # The longest expression in a shipped view is under 200 characters. Anything longer is
  # refused before parsing: deep nesting would otherwise exhaust the stack
  # (SystemStackError, which is not a StandardError).
  MAX_EXPRESSION_LENGTH = 512

  def self.parse_expression(expr)
    return nil if expr.to_s.length > MAX_EXPRESSION_LENGTH

    normalized = expr.to_s.strip.gsub(/\s+/, ' ')
    return Fixed.new(normalized) if FIXED_EXPRESSIONS.key?(normalized)

    tokens = tokenize(normalized)
    return nil unless tokens && tokens.any?

    catch(:invalid) { Parser.new(tokens).parse }
  end

  # Splits text into literal strings and [expression] pairs.
  def self.scan(text)
    parts = []
    pos = 0
    while (start = text.index('<%', pos))
      parts << text[pos...start] if start > pos
      case text[start + 2]
      when '%'
        parts << '<%'
        pos = start + 3
      when '='
        close = text.index('%>', start + 3)
        raise InvalidTemplate, UNCLOSED_MESSAGE unless close

        parts << [text[(start + 3)...close]]
        pos = close + 2
      else
        raise InvalidTemplate, CODE_BLOCK_MESSAGE
      end
    end
    parts << text[pos..] if pos < text.length
    parts
  end

  # What an email's own default views use; only narrows what FIELDS and
  # FIXED_EXPRESSIONS already allow.
  def self.default_usage(key)
    usage = {vars: [], fields: [], fixed: [], mailer_t: {}}
    entry = key && SystemEmailRegistry.find(key)
    return usage unless entry

    usage[:vars] |= Array(entry[:variables]).grep(/\A@/)
    %w[html text].each do |format|
      body = SystemEmailTemplates.default_body(key, format)
      next unless body

      usage[:vars] |= body.scan(/@[a-z_][a-z0-9_]*/)
      body.scan(/<%=([\s\S]*?)%>/) { collect_usage(parse_expression(Regexp.last_match(1)), usage) }
    end
    Array(entry[:i18n_blocks]).each do |block|
      names = usage[:mailer_t][block[:key].to_s] ||= []
      names.concat(Array(block[:placeholders]).map(&:to_s))
    end
    usage
  end

  def self.collect_usage(node, usage)
    case node
    when Field then usage[:fields] << "#{node.var}.#{node.field}"
    when Fixed then usage[:fixed] << node.expr
    when DateValue then collect_usage(node.arg, usage)
    when Presence
      collect_usage(node.lhs, usage)
      collect_usage(node.rhs, usage)
    when MailerT
      (usage[:mailer_t][node.key] ||= []).concat(node.args.keys)
      node.args.each_value { |arg| collect_usage(arg, usage) }
    end
  end

  def self.kind_for(key, name)
    override = KIND_OVERRIDES.dig(key, name)
    return override if override
    return RECORD_VARS[name] if RECORD_VARS.key?(name)

    SCALAR_VARS.include?(name) ? :scalar : nil
  end

  def self.field_allowed?(key, usage, var, field, scope)
    case scope
    when :common then true
    when :recipient
      Array(RECIPIENT_VARS[var]).include?(key) ||
        (usage[:fields] & ["#{var}.email", "#{var}.settings['email']"]).any?
    else
      usage[:fields].include?("#{var}.#{field}")
    end
  end

  def self.disallowed(expr)
    shown = expr.to_s.strip
    shown = "#{shown[0, 80]}..." if shown.length > 80
    InvalidTemplate.new("Email template contains a disallowed placeholder: <%= #{shown} %>. Use only the placeholders listed under Variables.")
  end

  # Raises InvalidTemplate unless every part of node is allowed in this email. With no
  # key (no email to compare against) only plain values and common fields are allowed.
  def self.check!(node, key, usage, expr)
    case node
    when Helper, SiteUrl, DomainSetting then true
    when Fixed
      raise disallowed(expr) unless usage[:fixed].include?(node.expr)
    when Var
      if LINKS.key?(node.name)
        raise disallowed(expr) unless key && LINKS[node.name][:email] == key

        return true
      end
      raise disallowed(expr) unless var_available?(key, usage, node.name)

      kind = kind_for(key, node.name)
      raise disallowed(expr) unless kind
      unless kind == :scalar
        options = allowed_fields(key, usage, node.name).map { |f| "<%= #{node.name}.#{f} %>" }
        raise InvalidTemplate, "<%= #{node.name} %> cannot be used on its own. Use one of: #{options.join(', ')}"
      end
    when Field
      raise disallowed(expr) unless var_available?(key, usage, node.var)
      raise disallowed(expr) unless allowed_fields(key, usage, node.var).include?(node.field)
    when DateValue then check!(node.arg, key, usage, expr)
    when Presence
      check!(node.lhs, key, usage, expr)
      check!(node.rhs, key, usage, expr)
    when MailerT
      names = key && usage[:mailer_t][node.key]
      raise disallowed(expr) unless names
      raise disallowed(expr) unless (node.args.keys - names).empty?

      missing = mailer_t_required_args(node.key, key) - node.args.keys
      if missing.any?
        raise InvalidTemplate, "<%= #{expr.to_s.strip} %> needs a value for #{missing.map { |n| "#{n}:" }.join(', ')}"
      end

      node.args.each_value { |arg| check!(arg, key, usage, expr) }
    else
      raise disallowed(expr)
    end
  end

  # Every %{name} the message text can contain must get a value, or the text cannot be
  # filled. Stored message overrides may use only the block's listed placeholders
  # (SystemEmailTemplates.validate_i18n_placeholders!), so the list plus the shipped text
  # covers them.
  def self.mailer_t_required_args(i18n_key, key)
    entry = SystemEmailRegistry.find(key)
    block = Array(entry && entry[:i18n_blocks]).find { |b| b[:key].to_s == i18n_key }
    names = Array(block && block[:placeholders]).map(&:to_s)
    text = I18n.t(i18n_key, default: '').to_s
    text.scan(Regexp.union(I18n.config.interpolation_patterns)) do
      name = Regexp.last_match.captures.compact.first
      names << name if name.present?
    end
    names.uniq
  end

  def self.var_available?(key, usage, name)
    return ALL_VARS.include?(name) if key.nil?

    usage[:vars].include?(name)
  end

  def self.allowed_fields(key, usage, var)
    kind = kind_for(key, var)
    fields = FIELDS[kind] || {}
    fields.select do |field, (scope, _)|
      key.nil? ? scope == :common : field_allowed?(key, usage, var, field, scope)
    end.keys
  end

  # Text split into literal strings and checked expression nodes.
  def self.compile(text, key, require_links: true)
    usage = default_usage(key)
    parts = scan(text.to_s).map do |part|
      next part if part.is_a?(String)

      node = parse_expression(part[0])
      raise disallowed(part[0]) unless node

      check!(node, key, usage, part[0])
      node
    end
    check_required!(parts, key) if require_links
    parts
  end

  def self.check_required!(parts, key)
    used = []
    parts.each { |part| collect_refs(part, used) unless part.is_a?(String) }
    missing = required_for(key) - used
    return if missing.empty?

    raise InvalidTemplate, "This email does not work without #{missing.map { |m| "<%= #{m} %>" }.join(', ')}. Keep it in the body."
  end

  # Skips forms that cannot print the value: a date of a link or code resolves to '' (resolve,
  # DateValue), a translation argument prints only while the message text keeps its %{name}, and
  # the right side of `.presence ||` prints only when the left is blank. Placement in the HTML (a
  # comment, a hidden element) is not checked; editors are trusted, see the header.
  def self.collect_refs(node, used)
    case node
    when Var then used << node.name
    when Field then used << "#{node.var}.#{node.field}"
    when Presence then collect_refs(node.lhs, used)
    end
  end

  # require_links: false for a preview, so a draft can be looked at before it is complete.
  def self.validate!(text, key = nil, require_links: true)
    return if text.blank?

    compile(text, key, require_links: require_links)
    nil
  end

  def self.render(text, key, format, ctx, require_links: true)
    return '' if text.blank?

    compile(text, key, require_links: require_links).map do |part|
      next part if part.is_a?(String)

      value = to_text(resolve(part, ctx))
      format.to_s == 'html' ? ERB::Util.html_escape(value) : value
    end.join
  end

  def self.resolve(node, ctx)
    case node
    when Helper then HELPERS.fetch(node.name).call(ctx)
    when SiteUrl then JsonApi::Json.absolute_host
    when DomainSetting then ctx.domain_settings[node.key]
    when Fixed then FIXED_EXPRESSIONS.fetch(node.expr).call(ctx)
    when Var then LINKS.key?(node.name) ? ctx.link(node.name) : ctx.value(node.name)
    when Field
      kind = kind_for(ctx.template_key, node.var)
      record = ctx.record(node.var, kind)
      record && FIELDS.fetch(kind).fetch(node.field)[1].call(record)
    when DateValue
      date = resolve(node.arg, ctx)
      date.respond_to?(:strftime) && date.respond_to?(:day) ? ctx.long_ordinal_date(date) : ''
    when Presence then resolve(node.lhs, ctx).presence || resolve(node.rhs, ctx)
    when MailerT
      ctx.mailer_t(node.key, node.args.transform_values { |arg| to_text(resolve(arg, ctx)) })
    end
  end

  def self.to_text(value)
    case value
    when String then String.new(value)
    when Symbol, Numeric, TrueClass, FalseClass, Date, Time, ActiveSupport::TimeWithZone then value.to_s
    else ''
    end
  end

  # The placeholders an email accepts, for the editor's Variables tab.
  def self.allowed_for(key)
    usage = default_usage(key)
    list = HELPERS.keys + [SITE_URL] + DOMAIN_SETTING_KEYS.map { |k| "domain_settings['#{k}']" } + links_for(key)
    usage[:vars].sort.each do |name|
      kind = kind_for(key, name)
      next unless kind

      if kind == :scalar
        list << name
      else
        list.concat(allowed_fields(key, usage, name).map { |f| "#{name}.#{f}" })
      end
    end
    list + default_examples(key, list)
  end

  # Longer forms (message blocks, dates, fallbacks, fixed expressions) as this email's
  # default views write them, when they are accepted here.
  def self.default_examples(key, already)
    examples = []
    %w[html text].each do |format|
      body = SystemEmailTemplates.default_body(key, format)
      next unless body

      body.scan(/<%=([\s\S]*?)%>/) do
        expr = Regexp.last_match(1).strip.gsub(/\s+/, ' ')
        next if already.include?(expr) || examples.include?(expr)

        begin
          validate!("<%= #{expr} %>", key, require_links: false)
          examples << expr
        rescue InvalidTemplate
          next
        end
      end
    end
    examples
  end
end
