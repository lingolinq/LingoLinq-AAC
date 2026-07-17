class TelemetryEvent < ApplicationRecord
  include SecureSerialize

  secure_serialize :data

  EVENT_TYPES = %w[
    route_visit feature_interaction page_tap board_activation non_activation_tap
    gaze_activation gaze_point
  ].freeze

  DATA_KEYS = %w[
    board_id button_id percent_x percent_y prior_percent_x prior_percent_y
    percent_travel input_method source duration_ms session_id viewport_width
    viewport_height system browser orientation path cohort reason target_type
    event_count
  ].freeze

  CONTENT_KEYS = %w[
    label vocalization utterance sentence text note email name user_name
    raw camera frame image audio video
  ].freeze

  before_validation :generate_defaults
  before_validation :sanitize_data

  validates :event_type, inclusion: { in: EVENT_TYPES }
  validates :occurred_at, presence: true

  def self.organization_id_for(user)
    return nil unless user
    return user.managing_organization_id if user.managing_organization_id

    org = Organization.attached_orgs(user).detect do |attached|
      attached['type'] == 'user' && !attached['pending']
    end
    Organization.find_by_global_id(org['id'])&.id if org && org['id']
  end

  def self.process_new(attrs, context={})
    attrs = attrs.to_unsafe_h if attrs.respond_to?(:to_unsafe_h)
    attrs ||= {}
    data = attrs['data'] || attrs[:data] || {}
    data = data.to_unsafe_h if data.respond_to?(:to_unsafe_h)

    event = TelemetryEvent.new
    event.user_id = context[:user]&.id
    event.device_id = context[:device]&.id
    event.organization_id = context[:organization]&.id || organization_id_for(context[:user])
    event.event_type = attrs['event_type'] || attrs[:event_type]
    event.route = attrs['route'] || attrs[:route]
    event.feature_area = attrs['feature_area'] || attrs[:feature_area]
    event.occurred_at = parse_time(attrs['occurred_at'] || attrs[:occurred_at])
    event.data = data
    event.save
    event
  end

  def self.flush
    TelemetryEvent.where(['occurred_at < ?', 6.months.ago]).delete_all
  end

  def self.parse_time(value)
    if value.is_a?(Numeric)
      Time.at(value.to_f)
    elsif value.present?
      Time.parse(value.to_s) rescue Time.now
    else
      Time.now
    end
  end

  def generate_defaults
    self.data ||= {}
    self.occurred_at ||= Time.now
    self.event_type = event_type.to_s
    self.route = route.to_s[0, 120] if route
    self.feature_area = feature_area.to_s[0, 80] if feature_area
    true
  end

  def sanitize_data
    clean = {}
    (data || {}).each do |key, value|
      key = key.to_s
      next if CONTENT_KEYS.include?(key)
      next unless DATA_KEYS.include?(key)

      clean[key] = sanitize_value(value)
    end
    self.data = clean
  end

  def sanitize_value(value)
    if value.is_a?(Numeric) || value == true || value == false || value.nil?
      value
    elsif value.is_a?(String)
      value[0, 120]
    else
      value.to_s[0, 120]
    end
  end
end
