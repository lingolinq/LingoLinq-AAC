require 'spec_helper'

describe Api::IntegrationsController, :type => :controller do
  describe "get 'index'" do
    it "should require an api token" do
      get 'index', params: {'user_id' => 'asdf'}
      assert_missing_token
    end
    
    it "should error if the user doesn't exist" do
      token_user
      get 'index', params: {'user_id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should error if not authorized" do
      token_user
      u = User.create
      get 'index', params: {'user_id' => u.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list" do
      token_user
      ui = UserIntegration.create(:user_id => @user.id)
      get 'index', params: {'user_id' => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['integration']).to_not eq(nil)
      expect(json['integration'].length).to eq(1)
      expect(json['integration'][0]['id']).to eq(ui.global_id)
      expect(json['meta']).to_not eq(nil)
    end
  end
  
  describe "post 'create'" do
    it "should require an api token" do
      post 'create'
      assert_missing_token
    end
    
    it "should error if the user doesn't exist" do
      token_user
      post 'create', params: {'integration' => {'user_id' => 'asdf'}}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      post 'create', params: {'integration' => {'user_id' => u.global_id}}
      assert_unauthorized
    end
    
    it "should create the record" do
      token_user
      post 'create', params: {'integration' => {'user_id' => @user.global_id, 'name' => 'test integration'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['integration']['id']).to_not eq(nil)
      expect(json['integration']['name']).to eq('test integration')
    end
    
    it 'should update an existing integration if already set for user/key pair' do
      token_user
      template = UserIntegration.create(template: true, integration_key: 'something_cool', settings: {'icon_url' => 'http://www.example.com/icon.png'})
      ui = UserIntegration.create(user: @user, template_integration: template)
      post 'create', params:{'integration' => {'user_id' => @user.global_id, 'name' => 'good stuff', 'integration_key' => 'something_cool'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['integration']['id']).to eq(ui.global_id)
      expect(json['integration']['name']).to eq('good stuff')
      expect(json['integration']['icon_url']).to eq('http://www.example.com/icon.png')
      expect(json['integration']['template_key']).to eq('something_cool')
    end
    
    it "should error if the integration's settings don't work" do
      token_user
      starting_count = UserIntegration.count
      template = UserIntegration.create(template: true, integration_key: 'lessonpix', settings: {'icon_url' => 'http://www.example.com/icon.png', 'user_parameters' => [
        {'name' => 'username', 'type' => 'text'},
        {'name' => 'password', 'type' => 'password'}
      ]})
      expect(UserIntegration.count).to eq(starting_count + 1)
      expect(Uploader).to receive(:find_images){|str, library, loc, ui|
        expect(str).to eq('hat')
        expect(library).to eq('lessonpix')
        expect(ui).to_not eq(nil)
        expect(ui.id).to eq(nil)
      }.and_return(false)
      post 'create', params:{'integration' => {'user_id' => @user.global_id, 'integration_key' => 'lessonpix', 'user_parameters' => [
        {'name' => 'username', 'type' => 'text', 'value' => 'bacon'},
        {'name' => 'password', 'type' => 'password', 'value' => 'maple'}
      ]}}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('integration creation failed')
      expect(json['errors']).to eq(['invalid user credentials'])
      expect(UserIntegration.count).to eq(starting_count + 1)
    end
    
    it "should error if the integration's settings are already in use" do
      token_user
      starting_count = UserIntegration.count
      u = User.create
      template = UserIntegration.create(template: true, integration_key: 'lessonpix', settings: {'icon_url' => 'http://www.example.com/icon.png', 'user_parameters' => [
        {'name' => 'username', 'type' => 'text'},
        {'name' => 'password', 'type' => 'password'}
      ]})
      expect(Uploader).to_not receive(:find_images)
      ui = UserIntegration.create(user: u, template_integration: template, unique_key: GoSecure.sha512('bacon', 'lessonpix-username'))
      expect(UserIntegration.count).to eq(starting_count + 2)
      post 'create', params:{'integration' => {'user_id' => @user.global_id, 'integration_key' => 'lessonpix', 'user_parameters' => [
        {'name' => 'username', 'type' => 'text', 'value' => 'bacon'},
        {'name' => 'password', 'type' => 'password', 'value' => 'maple'}
      ]}}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('integration creation failed')
      expect(json['errors']).to eq(['account credentials already in use'])
      expect(UserIntegration.count).to eq(starting_count + 2)
    end
    
    it "should succeed if the integration settings do work" do
      token_user
      starting_count = UserIntegration.count
      template = UserIntegration.create(template: true, integration_key: 'lessonpix', settings: {'icon_url' => 'http://www.example.com/icon.png', 'user_parameters' => [
        {'name' => 'username', 'type' => 'text'},
        {'name' => 'password', 'type' => 'password'}
      ]})
      expect(UserIntegration.count).to eq(starting_count + 1)
      expect(Uploader).to receive(:find_images){|str, library, loc, ui|
        expect(str).to eq('hat')
        expect(library).to eq('lessonpix')
        expect(ui).to_not eq(nil)
        expect(ui.id).to eq(nil)
      }.and_return([])
      post 'create', params:{'integration' => {'user_id' => @user.global_id, 'integration_key' => 'lessonpix', 'user_parameters' => [
        {'name' => 'username', 'type' => 'text', 'value' => 'bacon'},
        {'name' => 'password', 'type' => 'password', 'value' => 'maple'}
      ]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(UserIntegration.count).to eq(starting_count + 2)
    end
  end
  
  describe "put 'update'" do
    it "should require an api token" do
      put 'update', params: {'id' => 'asdf'}
      assert_missing_token
    end
    
    it "should error if the record doesn't exist" do
      token_user
      put 'update', params: {'id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      ui = UserIntegration.create(:user_id => u.id)
      put 'update', params: {'id' => ui.global_id}
      assert_unauthorized
    end
    
    it "should update the record" do
      token_user
      ui = UserIntegration.create(:user_id => @user.id)
      put 'update', params: {'id' => ui.global_id, 'integration' => {'name' => 'new name'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['integration']['id']).to eq(ui.global_id)
      expect(json['integration']['name']).to eq('new name')
    end
  end
  
  describe "delete 'destroy'" do
    it "should require an api token" do
      delete 'destroy', params: {'id' => 'asdf'}
      assert_missing_token
    end
    
    it "should error if the record doesn't exist" do
      token_user
      delete 'destroy', params: {'id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      ui = UserIntegration.create(:user_id => u.id)
      delete 'destroy', params: {'id' => ui.global_id}
      assert_unauthorized
    end
    
    it "should delete the record" do
      token_user
      ui = UserIntegration.create(:user_id => @user.id)
      delete 'destroy', params: {'id' => ui.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to_not eq(nil)
      expect(json['integration']['id']).to eq(ui.global_id)
    end
  end
  
  describe "get 'show'" do
    it 'should not require an api token' do
      get 'show', params: {'id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should error if record doesn't exist" do
      token_user
      get 'show', params: {'id' => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      ui = UserIntegration.create
      get 'show', params: {'id' => ui.global_id}
      assert_unauthorized
    end
    
    it "should return the record" do
      token_user
      ui = UserIntegration.create(:user => @user, :settings => {
        'name' => 'good integration',
        'button_webhook_url' => 'asdf',
        'board_render_url' => 'qwer',
        'template_key' => 'ahem',
        'user_settings' => {
          'a' => {'type' => 'text', 'value' => 'aaa'}
        }
      }, integration_key: 'asdf')
      get 'show', params: {'id' => ui.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['integration']['id']).to eq(ui.global_id)
      expect(json['integration']['name']).to eq('good integration')
      expect(json['integration']['webhook']).to eq(true)
      expect(json['integration']['render']).to eq(true)
      expect(json['integration']['template_key']).to eq(nil)
      expect(json['integration']['integration_key']).to eq('asdf')
      expect(json['integration']['user_settings']).to eq([
        {'name' => 'a', 'label' => nil, 'value' => 'aaa'}
      ])
      expect(json['integration']['render_url']).to eq('qwer')
    end
    
    it "should return limited information if not fully authorized" do
      token_user
      ui = UserIntegration.create(:user => nil, :settings => {
        'global' => true,
        'name' => 'good integration',
        'button_webhook_url' => 'asdf',
        'board_render_url' => 'qwer',
        'template_key' => 'ahem',
        'user_settings' => {
          'a' => {'type' => 'text', 'value' => 'aaa'}
        }
      }, integration_key: 'asdf')
      get 'show', params: {'id' => ui.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['integration']['id']).to eq(ui.global_id)
      expect(json['integration']['name']).to eq('good integration')
      expect(json['integration']['webhook']).to eq(true)
      expect(json['integration']['render']).to eq(true)
      expect(json['integration']['template_key']).to eq(nil)
      expect(json['integration']['integration_key']).to eq('asdf')
      expect(json['integration']['user_settings']).to eq(nil)
      expect(json['integration']['render_url']).to eq('qwer')
    end
  end

  describe "focus_usage" do
    it 'should require authentication' do
      post 'focus_usage'
      assert_missing_token
    end

    it 'should schedule tracking' do
      token_user
      post 'focus_usage', params: {focus_id: 'abcdfg'}
      json = assert_success_json
      expect(json['accepted']).to eq(true)
      expect(Worker.scheduled?(UserIntegration, :perform_action, {:method => 'track_focus', :arguments => [@user.global_id, 'abcdfg']}))
    end
  end

  describe "focus_generate_words" do
    before(:each) do
      allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:feature_enabled_for?).with('ai_board_generation', anything).and_return(true)
      allow(PiiScrubber).to receive(:redact_for_ai).and_return({ payload: 'grinch lesson', pii_found: false, findings: [] })
    end

    it 'should require authentication' do
      post 'focus_generate_words'
      assert_missing_token
    end

    it 'should reject when the AI feature gate is off' do
      token_user
      expect(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_board_generation', anything).and_return(false)
      post 'focus_generate_words', params: { prompt: 'grinch lesson' }
      expect(response).to have_http_status(403)
      expect(JSON.parse(response.body)['error']).to eq('Feature not available')
    end

    it 'should require a prompt' do
      token_user
      post 'focus_generate_words', params: { prompt: '   ' }
      expect(response).to have_http_status(400)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('prompt required')
    end

    it 'should reject non-object JSON bodies' do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post 'focus_generate_words', params: {}, body: '[]'
      expect(response).to have_http_status(400)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('JSON body must be an object')
    end

    it 'should return an exact library hit without calling the generator' do
      token_user
      focus_set = AiFocusWordSet.create!(
        scrubbed_prompt: 'grinch lesson',
        locale: 'en',
        include_core_words: true,
        title: 'Grinch Words',
        words: %w[go stop more help read]
      )
      expect(AiBoardGenerator).not_to receive(:generate_focus_words)

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }

      json = assert_success_json
      expect(json['words']).to eq('go, stop, more, help, read')
      expect(json['title']).to eq('Grinch Words')
      expect(json['cached']).to eq(true)
      expect(json['library_id']).to eq(focus_set.global_id)
      expect(focus_set.reload.cache_hit_count).to eq(1)
    end

    it 'should call the generator only for missing words on a partial library hit' do
      token_user
      focus_set = AiFocusWordSet.create!(
        scrubbed_prompt: 'grinch lesson',
        locale: 'en',
        include_core_words: true,
        title: 'Grinch Words',
        words: %w[go stop]
      )
      expect(AiBoardGenerator).to receive(:generate_focus_words).with(hash_including(
        prompt: 'grinch lesson',
        word_count: 5,
        existing_words: %w[go stop]
      )).and_return({ words: %w[more help read], title: 'Grinch Words', error: nil })

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }

      json = assert_success_json
      expect(json['words']).to eq('go, stop, more, help, read')
      expect(json['cached']).to eq(false)
      expect(focus_set.reload.words).to eq(%w[go stop more help read])
    end

    it 'should persist a new generated library row' do
      token_user
      expect(AiBoardGenerator).to receive(:generate_focus_words).and_return({ words: %w[go stop more help read], title: 'Grinch Words', error: nil })

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }

      json = assert_success_json
      expect(json['words']).to eq('go, stop, more, help, read')
      focus_set = AiFocusWordSet.find_by_global_id(json['library_id'])
      expect(focus_set.words).to eq(%w[go stop more help read])
      expect(focus_set.generated_count).to eq(1)
    end

    it 'exposes the Article 50(2) marker public view when the generator marks the output' do
      token_user
      marker = Art50Marker.build(provider: 'claude', model: 'claude-haiku-4-5-20251001')
      expect(AiBoardGenerator).to receive(:generate_focus_words).and_return(
        { words: %w[go stop more help read], title: 'Grinch Words', ai_generated: marker, error: nil }
      )

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }

      json = assert_success_json
      expect(json['ai_generated']['marked']).to eq(true)
      expect(json['ai_generated']['provider']).to eq('claude')
      # Non-secret provenance view: signature + content_id are withheld from the API.
      expect(json['ai_generated']).not_to have_key('signature')
      expect(json['ai_generated']).not_to have_key('content_id')
      # Persisted on the set and verifies server-side.
      focus_set = AiFocusWordSet.find_by_global_id(json['library_id'])
      expect(Art50Marker.verify(focus_set.ai_generated_marker)).to eq(true)
    end

    it 'exposes the stored marker on a cache hit without re-generating' do
      token_user
      marker = Art50Marker.build(provider: 'claude', model: 'claude-haiku-4-5-20251001')
      focus_set = AiFocusWordSet.create!(
        scrubbed_prompt: 'grinch lesson', locale: 'en', include_core_words: true,
        title: 'Grinch Words', words: %w[go stop more help read]
      )
      focus_set.ai_generated_marker = marker
      focus_set.save!
      expect(AiBoardGenerator).not_to receive(:generate_focus_words)

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }

      json = assert_success_json
      expect(json['cached']).to eq(true)
      expect(json['ai_generated']['marked']).to eq(true)
    end

    it 'returns a nil marker for an unmarked (e.g. curated) library hit' do
      token_user
      AiFocusWordSet.create!(
        scrubbed_prompt: 'grinch lesson', locale: 'en', include_core_words: true,
        title: 'Grinch Words', words: %w[go stop more help read]
      )

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true }

      json = assert_success_json
      expect(json['ai_generated']).to be_nil
    end

    it 'should return generator errors using the endpoint error shape' do
      token_user
      expect(AiBoardGenerator).to receive(:generate_focus_words).and_return({ words: nil, error: 'AI service unavailable' })

      post 'focus_generate_words', params: { prompt: 'grinch lesson', word_count: 5 }

      expect(response).to have_http_status(503)
      json = JSON.parse(response.body)
      expect(json['error']).to eq('AI service unavailable')
    end

    # Cache-hit consent gate (issue #762): AiFocusWordSet.find_for is global by
    # scrubbed prompt/locale/core flag, so a warmed row can serve any requester.
    # On a hit the controller used to return before AiBoardGenerator ran, skipping
    # ai_feature_enabled_for?. These examples assert 403 ON A CACHE HIT. A
    # cache-miss-only example passes against the broken code and proves nothing.
    # Stub surrounding layers; leave real ai_feature_enabled_for? running (except
    # where the Article 50 block stubs it true to isolate that backstop).
    describe "AI consent gate on cache hit" do
      def warm_focus_cache!
        AiFocusWordSet.create!(
          scrubbed_prompt: 'grinch lesson',
          locale: 'en',
          include_core_words: true,
          title: 'Grinch Words',
          words: %w[go stop more help read]
        )
      end

      def post_cached_focus
        post 'focus_generate_words', params: {
          prompt: 'grinch lesson', word_count: 5, locale: 'en', include_core_words: true
        }
      end

      # Drive real ai_feature_enabled_for?; stub only the layers around the
      # preference check (matches boards_controller "user preference gate").
      def stub_ai_layers_except_prefs
        allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
        allow(FeatureFlags).to receive(:feature_enabled_for?)
          .with('ai_board_generation', anything).and_return(true)
      end

      it "should 403 for an opted-out user even when the library is already warmed" do
        token_user
        focus_set = warm_focus_cache!
        stub_ai_layers_except_prefs
        @user.settings['preferences']['ai_features_enabled'] = false
        @user.save!
        expect(AiBoardGenerator).not_to receive(:generate_focus_words)
        post_cached_focus
        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)['error']).to eq('Feature not available')
        expect(focus_set.reload.cache_hit_count).to eq(0)
      end

      it "should 403 when the org has disable_ai_features even on a cache hit" do
        token_user
        focus_set = warm_focus_cache!
        allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(false)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
        allow(FeatureFlags).to receive(:feature_enabled_for?)
          .with('ai_board_generation', anything).and_return(true)
        expect(AiBoardGenerator).not_to receive(:generate_focus_words)
        post_cached_focus
        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)['error']).to eq('Feature not available')
        expect(focus_set.reload.cache_hit_count).to eq(0)
      end

      it "should 403 for a COPPA-blocked account even on a cache hit" do
        token_user
        focus_set = warm_focus_cache!
        allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(true)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
        allow(FeatureFlags).to receive(:feature_enabled_for?)
          .with('ai_board_generation', anything).and_return(true)
        expect(AiBoardGenerator).not_to receive(:generate_focus_words)
        post_cached_focus
        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)['error']).to eq('Feature not available')
        expect(focus_set.reload.cache_hit_count).to eq(0)
      end

      it "should 403 for an EU under-16 account without parental consent even on a cache hit" do
        token_user
        focus_set = warm_focus_cache!
        allow(FeatureFlags).to receive(:ai_enabled_for?).and_return(true)
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
        allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(true)
        allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
        allow(FeatureFlags).to receive(:feature_enabled_for?)
          .with('ai_board_generation', anything).and_return(true)
        expect(AiBoardGenerator).not_to receive(:generate_focus_words)
        post_cached_focus
        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)['error']).to eq('Feature not available')
        expect(focus_set.reload.cache_hit_count).to eq(0)
      end

      describe "article_50_disclosure backstop" do
        it "should proceed on a cache hit when feature_enabled_for? is false (code-default path, not the production state)" do
          token_user
          focus_set = warm_focus_cache!
          expect(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_board_generation', anything).and_return(true)
          # Pins the CODE-DEFAULT path: with no default_enabled_features row in the test
          # DB, feature_enabled_for? returns false unstubbed. This is NOT the production
          # state -- production enables article_50_disclosure via that DB Setting (verified
          # 2026-08-23, docs/legal/2026-08-23_article-50-production-flag-verification.md).
          # Jurisdiction/ack must not affect the response on this path.
          allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
          allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
          expect(AiBoardGenerator).not_to receive(:generate_focus_words)
          post_cached_focus
          json = assert_success_json
          expect(json['cached']).to eq(true)
          expect(focus_set.reload.cache_hit_count).to eq(1)
        end

        it "should return 403 with article_50_disclosure_required on a cache hit when the flag is on, in scope, and unacknowledged" do
          token_user
          focus_set = warm_focus_cache!
          expect(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_board_generation', anything).and_return(true)
          allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
          allow(FeatureFlags).to receive(:feature_enabled_for?).with('article_50_disclosure', anything).and_return(true)
          allow(EuJurisdiction).to receive(:disclosure_required?).and_return(true)
          allow_any_instance_of(User).to receive(:article_50_disclosure_shown?).and_return(false)
          expect(AiBoardGenerator).not_to receive(:generate_focus_words)
          post_cached_focus
          expect(response).to have_http_status(:forbidden)
          expect(JSON.parse(response.body)['error']).to eq('article_50_disclosure_required')
          expect(focus_set.reload.cache_hit_count).to eq(0)
        end
      end
    end
  end

  describe "focus_generated_words_usage" do
    before(:each) do
      allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:feature_enabled_for?).with('ai_board_generation', anything).and_return(true)
    end

    it 'should require authentication' do
      post 'focus_generated_words_usage'
      assert_missing_token
    end

    it 'should record final edited words' do
      token_user
      focus_set = AiFocusWordSet.create!(
        scrubbed_prompt: 'grinch lesson',
        locale: 'en',
        include_core_words: true,
        words: %w[go stop more]
      )

      post 'focus_generated_words_usage', params: {
        library_id: focus_set.global_id,
        words: 'go, stop, read',
        action: 'set_focus_words'
      }

      json = assert_success_json
      expect(json['accepted']).to eq(true)
      expect(focus_set.reload.applied_words).to eq(%w[go stop read])
      expect(focus_set.applied_count).to eq(1)
    end
  end

  describe "domain_settings coppa_consent_age injection" do
    it "does not inject coppa_consent_age when the flag is OFF (identical to today)" do
      request.headers['Accept-Language'] = 'pl-PL,pl;q=0.9'
      get 'domain_settings'
      json = JSON.parse(response.body)
      expect(json['settings']).not_to have_key('coppa_consent_age')
    end

    it "injects 16 for an EU (Poland) request when the flag is ON" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      request.headers['Accept-Language'] = 'pl-PL,pl;q=0.9'
      get 'domain_settings'
      json = JSON.parse(response.body)
      expect(json['settings']['coppa_consent_age']).to eq(16)
    end

    it "injects 13 for a non-EU (US) request when the flag is ON" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      request.headers['Accept-Language'] = 'en-US,en;q=0.9'
      get 'domain_settings'
      json = JSON.parse(response.body)
      expect(json['settings']['coppa_consent_age']).to eq(13)
    end

    it "does not mutate the cached per-host domain blob" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      request.headers['Accept-Language'] = 'pl-PL'
      get 'domain_settings'
      expect(JsonApi::Json.current_domain['settings']).not_to have_key('coppa_consent_age')
    end
  end

  describe "domain_settings compliance_kernel injection" do
    it "does not inject compliance_kernel when the flag is OFF" do
      get 'domain_settings'
      json = JSON.parse(response.body)
      expect(json['settings']).not_to have_key('compliance_kernel')
    end

    it "injects digital_consent_age for a declared jurisdiction when the flag is ON" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES',
                 FeatureFlags::ENABLED_FRONTEND_FEATURES + ['compliance_workflow_kernel'])
      get 'domain_settings', params: { jurisdiction: 'DE' }
      json = JSON.parse(response.body)
      ck = json['settings']['compliance_kernel']
      expect(ck).to be_a(Hash)
      expect(ck['digital_consent_age']).to eq(16)
      expect(ck['jurisdiction']['code']).to eq('DE')
      expect(ck['effective_rules']['frameworks']).to include('GDPR')
    end
  end

  # The layout (app/views/layouts/application.html.erb) injects window.domain_settings
  # via exactly these helpers; test them directly so the primary (server-render)
  # delivery path is covered, not only the JSON endpoint.
  describe "#coppa_consent_age_injection (layout data source)" do
    before(:each) { controller.instance_variable_set(:@domain_overrides, { 'settings' => {} }) }

    it "is empty when the flag is OFF (layout injection is a no-op)" do
      request.headers['Accept-Language'] = 'pl-PL,pl;q=0.9'
      expect(controller.send(:coppa_consent_age_injection)).to eq({})
    end

    it "returns 16 for an EU (Poland) request when the flag is ON" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      request.headers['Accept-Language'] = 'pl-PL,pl;q=0.9'
      expect(controller.send(:coppa_consent_age_injection)).to eq({ 'coppa_consent_age' => 16 })
    end

    it "returns 13 for a non-EU (US) request when the flag is ON" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      request.headers['Accept-Language'] = 'en-US,en;q=0.9'
      expect(controller.send(:coppa_consent_age_injection)).to eq({ 'coppa_consent_age' => 13 })
    end

    it "uses the Accept-Language header as the jurisdiction signal (no org/domain signal wired)" do
      request.headers['Accept-Language'] = 'pl-PL,pl;q=0.9'
      expect(controller.send(:jurisdiction_signal_for_request)).to eq('pl-PL,pl;q=0.9')
    end
  end
end
