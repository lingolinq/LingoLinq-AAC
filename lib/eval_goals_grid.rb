module EvalGoalsGrid
  # DAGG-style IEP goal grid generator — Ruby mirror of
  # app/frontend/app/utils/eval_goals_grid.js. Maps a recommendation
  # to suggested IEP goals across Janice Light's four communicative
  # competencies (linguistic / operational / social / strategic),
  # producing the same output shape the frontend renders so server-
  # side exports (PDF) match the client view exactly.

  LINGUISTIC_TEMPLATES = {
    'emerging' => [
      { text: 'Increase single-symbol vocabulary by 5 words per week.',   evidence_field: 'vocab_recommendation.band' },
      { text: 'Combine two symbols to make a request.',                   evidence_field: 'communicator_stage' }
    ],
    'established' => [
      { text: 'Increase three-symbol utterances by 10% over baseline.',   evidence_field: 'vocab_recommendation.band' },
      { text: 'Use core vocabulary across at least 4 communication functions (request, comment, reject, ask).', evidence_field: 'vocab_recommendation.core' }
    ],
    'advanced' => [
      { text: 'Produce grammatically complete sentences using 4–5 word combinations.', evidence_field: 'vocab_recommendation.band' }
    ]
  }.freeze

  OPERATIONAL_TEMPLATES = {
    'touch' => [
      { text: 'Locate target buttons on a %{rows}×%{cols} grid with 80% accuracy.', evidence_field: 'grid_size' },
      { text: 'Navigate from home board to a category folder and back independently.', evidence_field: 'grid_size' }
    ],
    'scan' => [
      { text: 'Activate scanning switch with %{rows}×%{cols} grid layout, target accuracy 80% within 5 seconds.', evidence_field: 'grid_size' }
    ],
    'gaze' => [
      { text: 'Sustain gaze 1.5s for activation on %{rows}×%{cols} grid with 80% accuracy.', evidence_field: 'grid_size' }
    ]
  }.freeze

  SOCIAL_TEMPLATES = [
    { text: 'Initiate at least 3 communicative turns per 10-minute interaction.',             evidence_field: nil },
    { text: 'Respond to a partner question with at least 1 device-mediated turn within 10s.', evidence_field: nil }
  ].freeze

  STRATEGIC_TEMPLATES = [
    { text: 'Repair a communication breakdown using a second access method or symbol library.', evidence_field: 'access_secondary' },
    { text: 'Request help from a communication partner when an intended word is unavailable.',  evidence_field: nil }
  ].freeze

  def self.generate(recommendation)
    rec = recommendation || {}
    ling = LINGUISTIC_TEMPLATES[linguistic_band(rec)] || LINGUISTIC_TEMPLATES['emerging']
    op   = OPERATIONAL_TEMPLATES[operational_channel(rec)] || OPERATIONAL_TEMPLATES['touch']

    [
      build('linguistic', ling, rec),
      build('operational', op, rec),
      build('social', SOCIAL_TEMPLATES, rec),
      build('strategic', STRATEGIC_TEMPLATES, rec)
    ]
  end

  def self.build(category, templates, recommendation)
    {
      'category' => category,
      'goals' => templates.map do |t|
        {
          'text' => interpolate(t[:text], recommendation),
          'evidence_field' => t[:evidence_field]
        }
      end
    }
  end

  def self.interpolate(text, recommendation)
    text.gsub(/%\{([^}]+)\}/) do
      key = Regexp.last_match(1)
      if %w[rows cols].include?(key)
        grid = recommendation['grid_size'] || {}
        (grid[key] || '?').to_s
      else
        v = recommendation
        key.split('.').each do |seg|
          break if v.nil?
          v = v.is_a?(Hash) ? v[seg] : nil
        end
        v.nil? ? '' : v.to_s
      end
    end
  end

  def self.linguistic_band(rec)
    band = (rec['vocab_recommendation'] || {})['band']
    return 'advanced'    if %w[phrase sentence advanced].include?(band)
    return 'established' if %w[established expanded].include?(band)
    'emerging'
  end

  def self.operational_channel(rec)
    m = rec['access_method']
    return 'gaze' if %w[gaze eye_gaze].include?(m)
    return 'scan' if %w[scan switch].include?(m)
    'touch'
  end
end
