class EvalProtocol < ApplicationRecord
  include GlobalId
  include Permissions
  include Processable
  include SecureSerialize

  protect_global_id

  belongs_to :user, optional: true
  belongs_to :organization, optional: true

  has_paper_trail only: [:settings, :public_protocol_id, :population_profile],
    if: Proc.new{|b| PaperTrail.request.whodunnit && !PaperTrail.request.whodunnit.match(/^job/) }

  add_permissions('view', ['*']) { (self.settings || {})['public'] != false }
  add_permissions('view', 'edit', 'delete') {|user| self.user_id == user.id || (self.user && self.user.allows?(user, 'edit')) }
  add_permissions('view', 'edit') {|user| self.organization && self.organization.allows?(user, 'edit') }

  before_save :generate_defaults
  secure_serialize :settings

  STATIC_PROFILES = %w[early-comm peds-emerging peds-established adult-motor adult-progressive].freeze

  POPULATION_RULES = [
    { profile: 'early-comm',         match: ->(i) { i['current_comm'] == 'pre_symbolic' || i['current_comm'] == 'none_observable' } },
    { profile: 'peds-emerging',      match: ->(i) { %w[<3 3-5 6-12].include?(i['age_band']) && i['current_comm'] == 'single_symbol' } },
    { profile: 'peds-established',   match: ->(i) { %w[6-12 13-21].include?(i['age_band']) && %w[phrase sentence].include?(i['current_comm']) } },
    { profile: 'adult-progressive',  match: ->(i) { i['etiology'] == 'progressive' } },
    { profile: 'adult-motor',        match: ->(i) { %w[22-64 65+].include?(i['age_band']) || i['etiology'] == 'acquired' } }
  ].freeze

  def generate_defaults
    self.settings ||= {}
    self.settings['protocol'] ||= {}
    self.settings['protocol'].delete('results')
    self.settings['public'] = true if self.settings['public'].nil?
    self.protocol_version ||= '1.0'
    if self.settings['public'] == false
      self.public_protocol_id = nil
    end
    true
  end

  def self.profile_for_intake(intake)
    intake = (intake || {}).each_with_object({}) {|(k, v), h| h[k.to_s] = v }
    rule = POPULATION_RULES.find {|r| r[:match].call(intake) }
    rule ? rule[:profile] : 'peds-emerging'
  end

  def self.find_by_code(code)
    return nil unless code
    res = nil
    if !code.to_s.match(/^\d+_/)
      res = EvalProtocol.find_by(public_protocol_id: code)
      res = nil if res && res.settings && res.settings['public'] == false
    end
    res ||= EvalProtocol.find_by_global_id(code)
    res ||= EvalProtocol.static_template(code)
    res
  end

  def self.static_templates
    STATIC_PROFILES.map {|code| static_template(code) }.compact
  end

  def self.static_template(code)
    return nil unless STATIC_PROFILES.include?(code)
    template = EvalProtocol.new
    template.public_protocol_id = code
    template.population_profile = code
    template.protocol_version = '1.0'
    template.settings = {
      'public' => true,
      'protocol' => static_protocol_definition(code)
    }
    template
  end

  # Static protocol definitions for the five baseline population profiles.
  # Items use stable ids (cm_l3_01 etc) so log analysis stays interpretable across versions.
  def self.static_protocol_definition(code)
    case code
    when 'early-comm'
      {
        'name' => 'Early Communicator Quick Screen',
        'description' => 'Communication Matrix-aligned probe for pre-symbolic and emerging communicators.',
        'duration_target_s' => 300,
        'subtests' => [
          { 'id' => 'stage_probe',         'duration_s' => 75, 'item_count' => 4 },
          { 'id' => 'access_snapshot',     'duration_s' => 90, 'item_count' => 6 },
          { 'id' => 'choice_probe',        'duration_s' => 60, 'item_count' => 4 },
          { 'id' => 'wrap',                'duration_s' => 15, 'item_count' => 0 }
        ],
        'item_bank_ref' => 'early-comm-v1'
      }
    when 'peds-emerging'
      {
        'name' => 'Pediatric Emerging Quick Screen',
        'description' => 'Single-symbol probes, core-word find, 4-9-16 grid sweep for symbolic-emerging pediatric communicators.',
        'duration_target_s' => 300,
        'subtests' => [
          { 'id' => 'stage_probe',         'duration_s' => 60, 'item_count' => 4 },
          { 'id' => 'access_snapshot',     'duration_s' => 90, 'item_count' => 6 },
          { 'id' => 'library_compare',     'duration_s' => 60, 'item_count' => 6 },
          { 'id' => 'vocab_probe',         'duration_s' => 60, 'item_count' => 3 },
          { 'id' => 'wrap',                'duration_s' => 15, 'item_count' => 0 }
        ],
        'item_bank_ref' => 'peds-emerging-v1'
      }
    when 'peds-established'
      {
        'name' => 'Pediatric Established Quick Screen',
        'description' => 'Categories, simple syntax, fringe vocabulary, literacy probe for phrase-level+ pediatric communicators.',
        'duration_target_s' => 300,
        'subtests' => [
          { 'id' => 'stage_probe',         'duration_s' => 45, 'item_count' => 3 },
          { 'id' => 'access_snapshot',     'duration_s' => 75, 'item_count' => 6 },
          { 'id' => 'library_compare',     'duration_s' => 60, 'item_count' => 6 },
          { 'id' => 'vocab_probe',         'duration_s' => 75, 'item_count' => 4 },
          { 'id' => 'literacy_probe',      'duration_s' => 30, 'item_count' => 2 },
          { 'id' => 'wrap',                'duration_s' => 15, 'item_count' => 0 }
        ],
        'item_bank_ref' => 'peds-established-v1'
      }
    when 'adult-motor'
      {
        'name' => 'Adult Acquired Motor Screen',
        'description' => 'Multi-access weighted probe with adult fringe, fast cognitive check, fatigue-aware item pacing.',
        'duration_target_s' => 300,
        'subtests' => [
          { 'id' => 'access_snapshot',     'duration_s' => 120, 'item_count' => 8 },
          { 'id' => 'cognitive_probe',     'duration_s' => 60,  'item_count' => 4 },
          { 'id' => 'library_compare',     'duration_s' => 45,  'item_count' => 4 },
          { 'id' => 'vocab_probe',         'duration_s' => 60,  'item_count' => 3 },
          { 'id' => 'wrap',                'duration_s' => 15,  'item_count' => 0 }
        ],
        'item_bank_ref' => 'adult-motor-v1'
      }
    when 'adult-progressive'
      {
        'name' => 'Adult Progressive Screen',
        'description' => 'Gaze-first multi-access trial, predictive layout probes, life-participation vocabulary.',
        'duration_target_s' => 300,
        'subtests' => [
          { 'id' => 'access_snapshot',     'duration_s' => 150, 'item_count' => 10 },
          { 'id' => 'cognitive_probe',     'duration_s' => 60,  'item_count' => 4 },
          { 'id' => 'vocab_probe',         'duration_s' => 75,  'item_count' => 4 },
          { 'id' => 'wrap',                'duration_s' => 15,  'item_count' => 0 }
        ],
        'item_bank_ref' => 'adult-progressive-v1'
      }
    end
  end

  def process_params(params, non_user_params)
    self.settings ||= {}
    self.user ||= non_user_params[:user]
    self.organization = non_user_params[:organization] if non_user_params[:organization]
    self.settings['public'] = true  if params['public'] == true || params['public'] == 'true'
    self.settings['public'] = false if params['public'] == false || params['public'] == 'false'
    self.population_profile = params['population_profile'] if params['population_profile']
    self.protocol_version = params['protocol_version'] if params['protocol_version']
    if params['public_protocol_id'] && params['public_protocol_id'] != self.public_protocol_id
      if self.settings['public'] == false
        self.public_protocol_id = nil
      else
        existing = EvalProtocol.find_by(public_protocol_id: params['public_protocol_id'])
        if !existing || (self.id && existing.id == self.id)
          self.public_protocol_id = params['public_protocol_id']
        else
          add_processing_error("public_protocol_id \"#{params['public_protocol_id']}\" already in use")
          return false
        end
      end
    end
    self.settings['protocol'] = params['protocol'] if params['protocol']
    true
  end
end
