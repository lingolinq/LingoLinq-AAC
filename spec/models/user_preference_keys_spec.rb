require 'spec_helper'

describe User, 'saves that name the preference keys they changed' do
  # A device that saves one small change (a tour marked as shown, the Prediction
  # toggle) sends the WHOLE preferences object it holds, and process_params writes
  # every key it receives. A tablet holding an old copy of the account could
  # therefore switch AI consent back on after a parent or SLP turned it off, or
  # drop a tour finished on another device (Scot's review of #1141, 2026-10-15;
  # issue #1134). Such a save now lists the keys it changed in `preference_keys`,
  # and on an existing account only those keys are applied.
  def existing_user(prefs = {})
    u = User.create
    u.settings['preferences'].merge!(prefs)
    u.save
    u.reload
  end

  def stale_copy_of(user)
    JSON.parse(user.settings['preferences'].to_json)
  end

  it 'applies only the listed key, so a stale copy cannot turn AI back on' do
    u = existing_user('ai_features_enabled' => true, 'ai_word_prediction' => true, 'word_suggestions' => false)
    stale = stale_copy_of(u)
    # A parent turns AI off from another device.
    u.process_params({ 'preferences' => { 'ai_features_enabled' => false, 'ai_word_prediction' => false } }, {})
    u.save
    # The old tablet saves the Prediction toggle with the copy it loaded earlier.
    stale['word_suggestions'] = true
    u.process_params({ 'preferences' => stale, 'preference_keys' => ['word_suggestions'] }, {})
    u.save
    u.reload
    expect(u.settings['preferences']['word_suggestions']).to eq(true)
    expect(u.settings['preferences']['ai_features_enabled']).to eq(false)
    expect(u.settings['preferences']['ai_word_prediction']).to eq(false)
  end

  it 'leaves every other preference as it is stored' do
    u = existing_user('skin' => 'default', 'word_suggestions' => false)
    stale = stale_copy_of(u)
    u.process_params({ 'preferences' => { 'skin' => 'dark' } }, {})
    u.save
    stale['word_suggestions'] = true
    u.process_params({ 'preferences' => stale, 'preference_keys' => ['word_suggestions'] }, {})
    expect(u.settings['preferences']['skin']).to eq('dark')
    expect(u.settings['preferences']['word_suggestions']).to eq(true)
  end

  it 'merges a listed tour map with the stored one, and keeps the other progress keys' do
    u = existing_user('progress' => {
      'guided_tours_completed' => { 'home_gentle' => true },
      'guided_tours_autoshown' => { 'home_gentle' => true }
    })
    stale = stale_copy_of(u)
    # Another device finishes and auto-shows a second tour.
    u.process_params({ 'preferences' => { 'progress' => {
      'guided_tours_completed' => { 'home_gentle' => true, 'boards' => true },
      'guided_tours_autoshown' => { 'home_gentle' => true, 'boards' => true }
    } } }, {})
    u.save
    # The stale device records that it offered the tour.
    stale['progress']['guided_tours_autoshown'] = stale['progress']['guided_tours_autoshown'].merge('tour_offer' => true)
    u.process_params({ 'preferences' => stale, 'preference_keys' => ['progress.guided_tours_autoshown'] }, {})
    progress = u.settings['preferences']['progress']
    expect(progress['guided_tours_autoshown']).to eq({ 'home_gentle' => true, 'boards' => true, 'tour_offer' => true })
    expect(progress['guided_tours_completed']).to eq({ 'home_gentle' => true, 'boards' => true })
  end

  it 'merges the tour maps on a whole save without the list too' do
    u = existing_user('progress' => { 'guided_tours_completed' => { 'home_gentle' => true } })
    stale = stale_copy_of(u)
    u.process_params({ 'preferences' => { 'progress' => { 'guided_tours_completed' => { 'home_gentle' => true, 'boards' => true } } } }, {})
    u.save
    u.process_params({ 'preferences' => stale }, {})
    expect(u.settings['preferences']['progress']['guided_tours_completed']).to eq({ 'home_gentle' => true, 'boards' => true })
  end

  it 'still caps a merged tour map' do
    many = (1..User::GUIDED_TOUR_MAX_KEYS).map { |i| ["tour_#{i}", true] }.to_h
    u = existing_user('progress' => { 'guided_tours_completed' => many })
    u.process_params({ 'preferences' => { 'progress' => { 'guided_tours_completed' => { 'one_more' => true } } },
                       'preference_keys' => ['progress.guided_tours_completed'] }, {})
    kept = u.settings['preferences']['progress']['guided_tours_completed']
    expect(kept.size).to eq(User::GUIDED_TOUR_MAX_KEYS)
    expect(kept).to have_key("tour_#{User::GUIDED_TOUR_MAX_KEYS}")
    expect(kept).to_not have_key('one_more')
  end

  it 'applies a listed AI key' do
    u = existing_user('ai_features_enabled' => false)
    u.process_params({ 'preferences' => { 'ai_features_enabled' => true }, 'preference_keys' => ['ai_features_enabled'] }, {})
    expect(u.settings['preferences']['ai_features_enabled']).to eq(true)
  end

  it 'applies nothing from preferences for an empty list' do
    u = existing_user('word_suggestions' => false)
    u.process_params({ 'preferences' => { 'word_suggestions' => true }, 'preference_keys' => [] }, {})
    expect(u.settings['preferences']['word_suggestions']).to eq(false)
  end

  it 'keeps the old behaviour for a save without the list' do
    u = existing_user('word_suggestions' => false, 'ai_features_enabled' => false)
    u.process_params({ 'preferences' => { 'word_suggestions' => true, 'ai_features_enabled' => true } }, {})
    expect(u.settings['preferences']['word_suggestions']).to eq(true)
    expect(u.settings['preferences']['ai_features_enabled']).to eq(true)
  end

  it 'ignores a list that is not an array of names' do
    u = existing_user('word_suggestions' => false)
    u.process_params({ 'preferences' => { 'word_suggestions' => true }, 'preference_keys' => 'word_suggestions' }, {})
    expect(u.settings['preferences']['word_suggestions']).to eq(true)
  end

  # CONFIRMATION_PREFERENCE_PARAMS (logging, cookies, ...) are recorded in confirmation_log when a save
  # changes them. A key the request leaves out was compared as nil and logged as changed, so every
  # reduced save (and every other partial save) added false entries for each stored value.
  it 'records no logging or cookie change for a save that does not send those keys' do
    u = existing_user('logging' => true, 'cookies' => true, 'word_suggestions' => false)
    before = (u.settings['confirmation_log'] || []).length
    u.process_params({ 'preferences' => stale_copy_of(u).merge('word_suggestions' => true), 'preference_keys' => ['word_suggestions'] }, {})
    u.process_params({ 'preferences' => { 'word_suggestions' => false } }, {})
    expect((u.settings['confirmation_log'] || []).length).to eq(before)
  end

  it 'still records a logging change that a save sends' do
    u = existing_user('logging' => true)
    before = (u.settings['confirmation_log'] || []).length
    u.process_params({ 'preferences' => { 'logging' => false } }, {})
    log = u.settings['confirmation_log'] || []
    expect(log.length).to eq(before + 1)
    expect(log.last['setting']).to eq('logging')
  end

  it 'does not reduce a new account' do
    u = User.new
    u.process_params({ 'user_name' => 'pkeys_new', 'preferences' => { 'word_suggestions' => true, 'skin' => 'dark' },
                       'preference_keys' => ['skin'] }, {})
    expect(u.settings['preferences']['word_suggestions']).to eq(true)
    expect(u.settings['preferences']['skin']).to eq('dark')
  end
end
