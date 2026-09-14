# Dry-run planner for collapsing identical imported utility pages
# (emoji / keyboard / numbers) on the content account.
#
# Does not write. APPLY is a separate follow-up: each cluster is one
# fingerprint (grid + sorted labels). Vocal Flair 66-key and Quick Core
# 30-key keyboards stay in different clusters.
class LibraryUtilityDeduper
  STEMS = %w[emoji emojis keyboard numbers].freeze
  BRAND_PREFIX = '(?:vocal-flair|quick-core|core|sequoia|communikate)'
  # Vocal Flair "with keyboard" roots are home boards, not utility pages.
  W_KEYBOARD_ROOT = /-w(?:ith)?-keyboard\z/.freeze

  Plan = Struct.new(
    :user_name,
    :clusters,
    :skipped,
    :user_refs,
    keyword_init: true
  )
  Cluster = Struct.new(
    :fingerprint,
    :shape,
    :button_count,
    :canonical,
    :extras,
    :relinks,
    :sidebar_slug_warning,
    keyword_init: true
  )
  Relink = Struct.new(:parent_key, :button_label, :from_key, :from_id, :to_key, :to_id, keyword_init: true)
  UserRef = Struct.new(:user_name, :kind, :key, keyword_init: true)

  def self.utility_page_key?(key, user_name)
    return false if key.blank? || user_name.blank?
    slug = key.to_s.sub(/\A#{Regexp.escape(user_name)}\//, '')
    return false if slug == key.to_s
    return false if slug.match?(W_KEYBOARD_ROOT)
    return true if slug.match?(/\A(?:#{STEMS.join('|')})(?:_\d+)?\z/)
    return true if slug.match?(/\A#{BRAND_PREFIX}-\d+-(?:#{STEMS.join('|')})\z/)
    false
  end

  def self.sidebar_slug?(key, user_name)
    key.to_s == "#{user_name}/keyboard"
  end

  def self.fingerprint(board)
    grid = BoardContent.load_content(board, 'grid') || board.settings['grid'] || {}
    buttons = board.buttons || []
    labels = buttons.map { |b| (b['label'] || '').to_s.strip.downcase }.sort.join('|')
    shape = "#{grid['rows']}x#{grid['columns']}"
    digest = Digest::MD5.hexdigest(labels)
    {
      fingerprint: "#{shape}|#{buttons.length}|#{digest}",
      shape: shape,
      button_count: buttons.length
    }
  end

  def self.pick_canonical(boards, user_name:)
    list = Array(boards).compact
    return nil if list.empty?

    namespaced = list.select { |b| b.key.to_s.match?(%r{\A#{Regexp.escape(user_name)}/#{BRAND_PREFIX}-\d+-}) }
    return namespaced.min_by(&:key) if namespaced.any?

    unsuffixed = list.reject { |b| b.key.to_s.match?(/_\d+\z/) }
    return unsuffixed.min_by(&:key) if unsuffixed.any?

    list.min_by(&:key)
  end

  def self.plan(user)
    raise ArgumentError, 'user required' unless user

    candidates = Board.where(user_id: user.id).find_each.select do |board|
      utility_page_key?(board.key, user.user_name)
    end

    grouped = candidates.group_by { |board| fingerprint(board)[:fingerprint] }
    skipped = []
    clusters = []

    grouped.each do |fp, boards|
      meta = fingerprint(boards.first)
      if boards.length < 2
        skipped << { key: boards.first.key, reason: 'unique fingerprint', fingerprint: fp }
        next
      end

      canonical = pick_canonical(boards, user_name: user.user_name)
      extras = boards.reject { |b| b.id == canonical.id }
      sidebar_warning = extras.any? { |b| sidebar_slug?(b.key, user.user_name) } ||
        sidebar_slug?(canonical.key, user.user_name)

      relinks = find_relinks(user, extras, canonical)
      clusters << Cluster.new(
        fingerprint: fp,
        shape: meta[:shape],
        button_count: meta[:button_count],
        canonical: canonical,
        extras: extras,
        relinks: relinks,
        sidebar_slug_warning: sidebar_warning
      )
    end

    Plan.new(
      user_name: user.user_name,
      clusters: clusters.sort_by { |c| [c.shape, c.button_count, c.canonical.key] },
      skipped: skipped.sort_by { |s| s[:key] },
      user_refs: find_user_refs(extras_keys(clusters))
    )
  end

  def self.format_report(plan)
    lines = []
    lines << "Library utility dedupe DRY RUN for #{plan.user_name}"
    lines << "Clusters that would share one board: #{plan.clusters.length}"
    lines << "Unique utility pages left alone: #{plan.skipped.length}"
    lines << ''

    plan.clusters.each do |cluster|
      lines << "Cluster #{cluster.shape} buttons=#{cluster.button_count} fp=#{cluster.fingerprint.split('|').last[0, 10]}"
      lines << "  CANONICAL: #{cluster.canonical.key} (#{cluster.canonical.global_id})"
      cluster.extras.each do |board|
        mark = sidebar_slug?(board.key, plan.user_name) ? ' [SIDEBAR SLUG — do not delete until sidebar is restored]' : ''
        lines << "  DELETE:    #{board.key} (#{board.global_id})#{mark}"
      end
      if cluster.sidebar_slug_warning
        lines << "  WARN: this cluster touches #{plan.user_name}/keyboard (default sidebar key)."
      end
      if cluster.relinks.empty?
        lines << "  RELINK:    none found on #{plan.user_name} boards"
      else
        cluster.relinks.each do |relink|
          lines << "  RELINK:    #{relink.parent_key} button #{relink.button_label.inspect} #{relink.from_key} -> #{relink.to_key}"
        end
      end
      lines << ''
    end

    unless plan.skipped.empty?
      lines << 'Left alone (only one board with this content):'
      plan.skipped.each { |row| lines << "  #{row[:key]} — #{row[:reason]}" }
      lines << ''
    end

    unless plan.user_refs.empty?
      lines << 'User home/sidebar refs pointing at a DELETE candidate:'
      plan.user_refs.each do |ref|
        lines << "  #{ref.user_name} #{ref.kind} #{ref.key}"
      end
      lines << ''
    end

    lines << 'No writes. Re-run after review to apply (not implemented in this rake).'
    lines.join("\n")
  end

  def self.find_relinks(user, extras, canonical)
    extra_ids = extras.map(&:global_id)
    extra_keys = extras.map(&:key)
    relinks = []

    Board.where(user_id: user.id).find_each do |parent|
      next if parent.id == canonical.id
      next if extras.any? { |b| b.id == parent.id }

      (parent.buttons || []).each do |button|
        lb = button['load_board']
        next unless lb.is_a?(Hash)
        hit = extra_ids.include?(lb['id']) || extra_keys.include?(lb['key'])
        next unless hit
        relinks << Relink.new(
          parent_key: parent.key,
          button_label: button['label'].to_s,
          from_key: lb['key'],
          from_id: lb['id'],
          to_key: canonical.key,
          to_id: canonical.global_id
        )
      end
    end
    relinks.sort_by { |r| [r.parent_key, r.button_label, r.from_key] }
  end

  def self.extras_keys(clusters)
    clusters.flat_map { |c| c.extras.map(&:key) }
  end

  def self.find_user_refs(delete_keys)
    return [] if delete_keys.empty?

    keys = delete_keys.to_set
    refs = []
    User.find_each do |user|
      prefs = (user.settings || {})['preferences'] || {}
      home = prefs['home_board']
      if home.is_a?(Hash) && keys.include?(home['key'])
        refs << UserRef.new(user_name: user.user_name, kind: 'home_board', key: home['key'])
      end
      Array(prefs['sidebar_boards']).each do |entry|
        next unless entry.is_a?(Hash) && keys.include?(entry['key'])
        refs << UserRef.new(user_name: user.user_name, kind: 'sidebar', key: entry['key'])
      end
    end
    refs.sort_by { |r| [r.user_name, r.kind, r.key] }
  end
  private_class_method :find_relinks, :extras_keys, :find_user_refs
end
