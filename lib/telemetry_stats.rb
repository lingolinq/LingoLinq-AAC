class TelemetryStats
  DEFAULT_DAYS = 14
  MAX_DAYS = 90

  def self.dashboard(args={})
    new(args).dashboard
  end

  def initialize(args={})
    @scope = args[:scope] || 'organization'
    @organization = args[:organization]
    @filter_user = args[:filter_user]
    @filter_device = args[:filter_device]
    @start_at = parse_range_boundary(args[:start_at], :start) || default_range_start
    @end_at = parse_range_boundary(args[:end_at], :end) || zone_now
    enforce_range!
  end

  def dashboard
    events = telemetry_scope
    sessions = session_scope
    {
      scope: scope_json,
      range: {
        start_at: @start_at.iso8601,
        end_at: @end_at.iso8601
      },
      summary: summary(events, sessions),
      routes: top_counts(events.group(:route).count),
      feature_areas: top_counts(events.group(:feature_area).count),
      input_methods: top_counts(input_method_counts(events)),
      heatmap: heatmap(sessions, events),
      recent_sessions: recent_sessions(sessions)
    }
  end

  private

  # HTML date inputs send YYYY-MM-DD. Time.parse treats that as midnight at the *start* of the day,
  # which excludes almost all sessions on the selected end date. Use inclusive calendar-day bounds.
  def parse_range_boundary(value, kind)
    return nil if value.blank?

    str = value.to_s.strip
    unless str.match?(/\A\d{4}-\d{2}-\d{2}\z/)
      return Time.zone ? (Time.zone.parse(str) rescue nil) : (Time.parse(str) rescue nil)
    end

    d = Date.iso8601(str) rescue nil
    return nil unless d

    z = Time.zone || ActiveSupport::TimeZone['UTC']
    if kind == :end
      d.in_time_zone(z).end_of_day
    else
      d.in_time_zone(z).beginning_of_day
    end
  end

  def default_range_start
    z = Time.zone || ActiveSupport::TimeZone['UTC']
    (z.now - DEFAULT_DAYS.days).beginning_of_day
  end

  def zone_now
    Time.zone ? Time.zone.now : Time.now
  end

  def enforce_range!
    now = zone_now
    @end_at = now if @end_at > now
    @start_at = @end_at - MAX_DAYS.days if @start_at < @end_at - MAX_DAYS.days
  end

  def telemetry_scope
    scope = TelemetryEvent.where(occurred_at: @start_at..@end_at)
    if @scope == 'organization'
      scope = scope.where(organization_id: @organization.id)
    elsif @scope == 'none'
      scope = scope.where(organization_id: nil)
    end
    scope = scope.where(user_id: @filter_user.id) if @filter_user
    scope = scope.where(device_id: @filter_device.id) if @filter_device
    scope
  end

  def session_scope
    sessions = LogSession.where(log_type: 'session').where(started_at: @start_at..@end_at)
    users = session_users
    return sessions.none if users.nil?

    users = users.is_a?(Array) ? users : users.to_a
    user_ids = users.map(&:id).compact.uniq
    return sessions.none if user_ids.empty?

    sessions = sessions.where(user_id: user_ids)
    sessions = sessions.where(device_id: @filter_device.id) if @filter_device
    sessions
  end

  def session_users
    if @scope == 'organization'
      if @filter_user
        return [] unless @organization.approved_users(true).where(id: @filter_user.id).exists?
        return [] if @filter_user.private_logging?

        [@filter_user]
      else
        users = (@organization.approved_users(false) + @organization.eval_users(false)).uniq(&:id)
        if users.count == 0
          users = @organization.downstream_orgs.map do |o|
            (o.approved_users(false) + o.eval_users(false)).uniq(&:id)
          end.flatten
        end
        users.reject{|user| user.private_logging? }
      end
    elsif @scope == 'none'
      user_ids = telemetry_scope.where.not(user_id: nil).distinct.pluck(:user_id)
      User.where(id: user_ids).select{|user| !user.private_logging? }
    elsif @scope == 'global'
      nil
    end
  end

  def scope_json
    if @scope == 'organization'
      {
        type: 'organization',
        organization_id: @organization.global_id,
        name: @organization.settings['name']
      }
    elsif @scope == 'none'
      { type: 'none', name: 'No organization' }
    else
      { type: 'global', name: 'All users' }
    end
  end

  def summary(events, sessions)
    {
      event_count: events.count,
      active_users: events.where.not(user_id: nil).distinct.count(:user_id),
      page_views: events.where(event_type: 'route_visit').count,
      board_activations: events.where(event_type: 'board_activation').count,
      possible_misclicks: events.where(event_type: 'non_activation_tap').count,
      clinical_sessions: sessions.count
    }
  end

  def input_method_counts(events)
    counts = {}
    events.where(event_type: ['board_activation', 'non_activation_tap', 'gaze_activation']).find_each do |event|
      method = event.data && (event.data['input_method'] || event.data['source'])
      method ||= 'unknown'
      counts[method] ||= 0
      counts[method] += 1
    end
    counts
  end

  def heatmap(sessions, events)
    stats = Stats.touch_stats(sessions)
    events.where(event_type: ['page_tap', 'non_activation_tap', 'board_activation']).find_each do |event|
      x = event.data && event.data['percent_x']
      y = event.data && event.data['percent_y']
      next if x.nil? || y.nil?

      key = "#{((x.to_f * 2).round / 2.0)},#{((y.to_f * 2).round / 2.0)}"
      stats[:touch_locations][key] ||= 0
      stats[:touch_locations][key] += 1
      stats[:max_touches] = [stats[:max_touches], stats[:touch_locations][key]].max
    end
    stats
  end

  def top_counts(counts)
    counts.reject{|key, _value| key.blank? }.sort_by{|key, value| [0 - value.to_i, key.to_s] }[0, 10].map do |key, value|
      { key: key, value: value }
    end
  end

  def recent_sessions(sessions)
    sessions.order(started_at: :desc).limit(10).map do |session|
      {
        id: session.global_id,
        started_at: session.started_at&.iso8601,
        button_count: session.data && session.data['button_count'],
        user: session.user && {
          id: session.user.global_id,
          user_name: session.user.user_name
        }
      }
    end
  end
end
