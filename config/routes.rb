LingoLinq::RESERVED_ROUTES ||= [
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
]
require 'resque/server'
require 'admin_constraint'

LingoLinq::Application.routes.draw do
  # The priority is based upon order of creation: first created -> highest priority.
  # See how all your routes lay out with "rake routes".

  ember_handler = 'boards#index'
  board_id_regex = /[a-zA-Z0-9_-]+\/[a-zA-Z0-9_:%-]+|\d+_\d+(-\d+_\d+)?/
  user_id_regex = /[a-zA-Z0-9_-]+/

  # protected_resque = Rack::Auth::Basic.new(Resque::Server) do |username, password|
  #   u = User.find_by(:user_name => username)
  #   u && u.settings['admin'] && u.valid_password?(password)
  # end
  # mount protected_resque, :at => "/resque"
  
  mount Resque::Server, at: "/jobby", :constraints => AdminConstraint.new

  root ember_handler
  get '/goal_status/:goal_id/:goal_code' => 'boards#log_goal_status'
  get '/videos/:source/:id' => 'boards#video'
  get '/privacy' => 'boards#privacy'
  get '/privacy_practices' => redirect('/privacy')
  get '/terms' => 'boards#terms'
  get '/parental_consent/complete' => 'parental_consents#complete'
  # GET renders a confirmation page and MUTATES NOTHING. It is reached from a
  # link in the parent's inbox, and mail-security link scanners, link previews
  # and browser prefetch all follow those links unprompted -- a GET that declined
  # consent would let a scanner schedule deletion of a child's account with no
  # human ever clicking. The POST below is what actually declines.
  get '/parental_consent/decline' => 'parental_consents#decline'
  # Unnamed: the GET above already claims the `parental_consent_decline_path`
  # helper for this same path, and the form posts to that same URL.
  post '/parental_consent/decline' => 'parental_consents#decline_submit'
  get '/parental_consent/revoke' => 'parental_consents#revoke'
  get '/eu_ai_parental_consent/complete' => 'eu_ai_parental_consents#complete'
  get '/eu_ai_parental_consent/revoke' => 'eu_ai_parental_consents#revoke'
  get '/ai_consent/disclosures/:version' => 'ai_consent/disclosures#show'
  get '/jobs' => 'boards#jobs'
  get '/about' => 'boards#about'
  get '/inflections/:word_id/:locale' => ember_handler
  get '/start_codes/:code' => ember_handler
  
  get 'oauth2/token' => 'session#oauth'
  post 'oauth2/token/login' => 'session#oauth_login'
  post 'oauth2/token' => 'session#oauth_token'
  post 'api/v1/auth/admin' => 'session#auth_admin'
  delete 'oauth2/token' => 'session#oauth_logout'
  get 'oauth2/token/status' => 'session#oauth_local', :as => 'oauth_local'
  post 'auth/lookup' => 'session#auth_lookup'
  get 'auth' => redirect('/login')
  get 'auth/google/start' => 'session#google_start'
  post 'auth/google/start' => 'session#google_start'
  get 'auth/google/callback' => 'session#google_callback'
  get 'auth/google/link' => 'session#google_link_candidates'
  post 'auth/google/link' => 'session#google_link_complete'
  get 'auth/google/signup' => 'session#google_signup_candidates'
  post 'auth/google/signup' => 'session#google_signup_complete'
  get 'saml/init/:org_id' => 'session#saml_redirect'
  get 'saml/init' => 'session#saml_start'
  post 'saml/tmp_token' => 'session#saml_tmp_token'
  get 'saml/metadata' => 'session#saml_metadata'
  get 'saml/logout' => 'session#saml_idp_logout_request'
  post 'saml/consume' => 'session#saml_consume'

  post 'api/v1/token/refresh' => 'session#oauth_token_refresh'
  post 'token' => 'session#token'
  post 'wait/token' => 'session#token_wait'

  get 'lessons/:lesson_id/:lesson_code/:user_token' => 'boards#lesson'
  
  # Rack::Offline (rack-offline gem) removed: gem was abandoned (last release 2012),
  # HTML5 AppCache was removed from all modern browsers. Offline support is handled
  # by IndexedDB/SQLite in the Ember frontend.

  get 'profile' => ember_handler
  get 'profile/:user_id/:profile_id' => ember_handler
  get 'search/:query' => ember_handler
  get 'search/:locale/:query' => ember_handler
  get 'setup' => ember_handler
  get 'database' => ember_handler
  get 'system-settings' => ember_handler
  get 'system-settings/*path' => ember_handler
  get 'beta-feedback/admin' => ember_handler
  get 'beta-feedback/admin/:feedback_id' => ember_handler, :constraints => {:feedback_id => /[\w\-]+/}
  get 'u/:reply_code' => 'boards#utterance_redirect'
  get ':id/logs/:log_id' => ember_handler, :constraints => {:id => user_id_regex}
  get ':id/goals/:goal_id' => ember_handler, :constraints => {:id => user_id_regex}
  get ':id/board-detail/:boardname' => ember_handler, :constraints => {:id => user_id_regex}
  get ':id/board-detail/:boardname/edit' => ember_handler, :constraints => {:id => user_id_regex}
  
  get 'utterances/:id' => 'boards#utterance'  
  get ':id' => 'boards#user', :constraints => {:id => user_id_regex}
  get ':id' => 'boards#board', :constraints => {:id => board_id_regex}
  get ':id/icon' => 'boards#icon', :constraints => {:id => board_id_regex}
  get ':id/history' => 'boards#board', :constraints => {:id => board_id_regex}
    
  get 'login' => ember_handler
  get 'organizations/:org_id' => ember_handler
  get 'organizations/:org_id/:path' => ember_handler
  get 'organizations/:org_id/rooms/:room_id' => ember_handler
  get ':id/confirm_registration/:key' => ember_handler, :constraints => {:id => user_id_regex}
  get ':id/password_reset/:key' => ember_handler, :constraints => {:id => user_id_regex}
  post 'api/v1/status' => 'session#status'
  get 'api/v1/status' => 'session#status'
  get 'api/v1/token_check' => 'session#token_check'
  get 'api/v1/status/heartbeat' => 'session#heartbeat'
  get 'api/v1/health' => 'session#health'

  # CSP violation reports (browser -> Rails). Lives under Api::V1:: rather
  # than Api:: to keep the security surface cleanly separable from the
  # legacy Api:: controllers mounted via `scope 'api/v1', module: 'api'` below.
  namespace :api do
    namespace :v1 do
      post 'csp-reports' => 'csp_reports#create'
    end

    # Internal, machine-to-machine endpoints. Auth is a shared-secret header
    # (X-Internal-Token), not a user session, so these are mounted outside the
    # legacy api/v1 scope to keep the security boundary obvious.
    namespace :internal do
      get 'ai_api_logs/daily_summary' => 'ai_api_logs#daily_summary'
    end
  end

  scope 'api/v1', module: 'api' do
    get 'users/cache' => 'boards#cache'
    post 'forgot_password' => 'users#forgot_password'
    post 'users/resend_parental_consent' => 'users#resend_parental_consent'
    post 'users/submit_parental_consent_email' => 'users#submit_parental_consent_email'
    post 'messages' => 'messages#create'
    post 'beta_feedback_recordings' => 'beta_feedback_recordings#create'
    post 'beta_feedback_recordings/:id/upload' => 'beta_feedback_recordings#upload'
    post 'beta_feedback_recordings/:id/confirm' => 'beta_feedback_recordings#confirm'
    get 'beta_feedback_recordings/:id/download' => 'beta_feedback_recordings#download'
    get 'beta_feedback' => 'beta_feedback#index'
    patch 'beta_feedback/:id' => 'beta_feedback#update'
    get 'beta_feedback/:id' => 'beta_feedback#show'
    get 'database_schema' => 'database_schema#index'
    get 'database_contents' => 'database_contents#index'
    get 'system_features' => 'system_features#index'
    put 'system_features' => 'system_features#update'
    delete 'system_features' => 'system_features#destroy'
    get 'system_app_defaults' => 'system_app_defaults#show'
    put 'system_app_defaults' => 'system_app_defaults#update'
    get 'system_email_templates' => 'system_email_templates#index'
    get 'system_email_templates/:id' => 'system_email_templates#show', :constraints => {:id => /[\w\.]+/}
    put 'system_email_templates/:id' => 'system_email_templates#update', :constraints => {:id => /[\w\.]+/}
    delete 'system_email_templates/:id' => 'system_email_templates#destroy', :constraints => {:id => /[\w\.]+/}
    post 'system_email_templates/:id/preview' => 'system_email_templates#preview', :constraints => {:id => /[\w\.]+/}
    post 'callback' => 'callbacks#callback'
    get 'domain_settings' => 'integrations#domain_settings'
    get 'start_code' => 'organizations#start_code_lookup'
    post 'focus/usage' => 'integrations#focus_usage'
    post 'focus/generate_words' => 'integrations#focus_generate_words'
    post 'focus/generated_words_usage' => 'integrations#focus_generated_words_usage'
    get 'lang/:locale' => 'words#lang'

    resources :boards, :constraints => {:id => board_id_regex} do
      get 'stats' => 'boards#stats'
      get 'tree' => 'boards#tree'
      get 'simple.obf' => 'boards#simple_obf'
      post 'imports' => 'boards#import', on: :collection
      post 'from_html' => 'boards#from_html', on: :collection
      post 'from_json_bundle' => 'boards#from_json_bundle', on: :collection
      post 'generate_labels' => 'boards#generate_labels', on: :collection
      post 'unlink' => 'boards#unlink', on: :collection
      post 'bulk' => 'boards#bulk', on: :collection
      post 'stars' => 'boards#star'
      post 'slice_locales' => 'boards#slice_locales'
      delete 'stars' => 'boards#unstar'
      post 'download' => 'boards#download'
      post 'rename' => 'boards#rename'
      post 'share_response' => 'boards#share_response'
      get 'copies' => 'boards#copies'
      post 'translate' => 'boards#translate'
      post 'swap_images' => 'boards#swap_images'
      post 'privacy' => 'boards#update_privacy'
      post 'tag' => 'boards#tag'
      post 'rollback' => 'boards#rollback'
    end

    resources :tags
    resources :words do
      get 'reachable_core' => 'words#reachable_core', on: :collection
      post 'predict' => 'words#predict', on: :collection
    end
    post 'word_suggestions' => 'word_suggestions#create'
    resources :prediction_entries, only: [:index] do
      post 'sync', on: :collection
    end
    
    resources :users do
      get 'stats/daily' => 'users#daily_stats'
      get 'stats/hourly' => 'users#hourly_stats'
      get 'alerts' => 'users#alerts'
      get 'valet_credentials' => 'users#valet_credentials'
      post 'confirm_registration'
      post 'password_reset'
      post 'replace_board'
      post 'copy_board_links'
      post 'subscription' => 'users#subscribe'
      delete 'subscription' => 'users#unsubscribe'
      post 'verify_receipt' => 'users#verify_receipt'
      post 'flush/logs' => 'users#flush_logs'
      post 'flush/user' => 'users#flush_user'
      delete 'devices/:device_id' => 'users#hide_device'
      put 'devices/:device_id' => 'users#rename_device'
      get 'supervisors' => 'users#supervisors'
      get 'supervisees' => 'users#supervisees'
      post 'claim_voice' => 'users#claim_voice'
      post 'start_code' => 'users#start_code'
      post 'rename' => 'users#rename'
      post 'activate_button' => 'users#activate_button'
      get 'sync_stamp' => 'users#sync_stamp'
      post 'translate' => 'users#translate'
      get 'board_revisions' => 'users#board_revisions'
      get 'boards' => 'users#boards'
      get 'places' => 'users#places'
      get 'ws_settings' => 'users#ws_settings'
      get 'ws_lookup' => 'users#ws_lookup'
      post 'ws_encrypt' => 'users#ws_encrypt'
      post 'ws_decrypt' => 'users#ws_decrypt'
      get 'daily_use' => 'users#daily_use'
      get 'core_lists' => 'users#core_lists'
      put 'core_list' => 'users#update_core_list'
      get 'message_bank_suggestions' => 'users#message_bank_suggestions'
      get 'protected_image/:library/:image_id' => 'users#protected_image'
      get 'word_map' => 'users#word_map'
      get 'word_activities' => 'users#word_activities'
      post 'board_tags/ensure' => 'users#ensure_board_tag'
      post 'board_tags/rename' => 'users#rename_board_tag'
      post 'board_tags/delete' => 'users#delete_board_tag'
      post 'evals/transfer' => 'users#transfer_eval'
      post 'evals/reset' => 'users#reset_eval'
      post '2fa' => 'users#update_2fa'
      get 'external_nonce/:nonce_id' => 'users#external_nonce'
      post 'eu_ai_parental_consent' => 'users#request_eu_ai_parental_consent'
      post 'article_50_disclosure_ack' => 'users#article_50_disclosure_ack'
    end
    
    resources :images do
      get 'batch', on: :collection
      get 'upload_success'
    end
    
    # Board keys are "username/slug" (slash). :id must use the same constraint as
    # resources :boards — otherwise only the first segment matches and
    # POST .../buttonsets/user/slug/generate 404s.
    get "buttonsets/:id" => "button_sets#show", :constraints => {:id => board_id_regex}
    get "buttonsets" => "button_sets#index"
    post "buttonsets/:id/generate" => "button_sets#generate", :constraints => {:id => board_id_regex}
    get "boardversions" => "boards#history"
    get "userversions" => "users#history"
    
    get 'gifts/code_check' => 'purchasing#code_check'
    resources :gifts
    
    resources :sounds do
      get 'upload_success'
      post 'imports' => 'sounds#import', on: :collection
    end

    resources :videos do
      get 'upload_success'
    end
    
    resources :goals

    get "supervisor_relationships/consent_lookup" => "supervisor_relationships#consent_lookup"
    post "supervisor_relationships/consent_response" => "supervisor_relationships#consent_response"
    resources :supervisor_relationships, only: [:index, :show, :create, :destroy] do
      post :consent_response, on: :member
      member do
        put :approve
        put :deny
      end
    end

    resources :profiles do
      get 'latest', on: :collection
    end

    resources :eval_protocols, only: [:index, :show], param: :id
    # Per-user Quick Screen session actions live on a separate
    # EvalSessionsController so EvalProtocols stays read-only catalog.
    # The legacy `users/:user_id/eval_recommend` path is preserved as
    # an alias so anything that was already calling it keeps working.
    post 'users/:user_id/eval_sessions/recommend' => 'eval_sessions#recommend'
    post 'users/:user_id/eval_recommend' => 'eval_sessions#recommend'
    # Comprehensive Eval (Mode 3) AI narration. Gated by the
    # comprehensive_eval_ai feature flag inside the controller.
    post 'eval_sessions/narrate' => 'eval_sessions#narrate'
    
    resources :badges
    
    resources :units do
      get 'stats'
      get 'log_stats'
      get 'logs'
      post 'note'
    end
    resources :snapshots

    resources :lessons do
      get 'recent'
      post 'assign'
      post 'unassign'
      post 'complete'
    end

    resources :organizations do
      get 'managers'
      get 'evals'
      get 'users'
      get 'supervisors'
      get 'extras'
      get 'licenses'
      get 'logs'
      get 'stats'
      get 'telemetry' => 'telemetry#organization'
      get 'admin_reports'
      get 'blocked_emails'
      get 'blocked_cells'
      post 'extra_action'
      post 'alias'
      post 'claim_user'
      post 'start_code' => 'organizations#start_code'
      post 'status/:user_id' => 'organizations#set_status'
      put 'data_policy' => 'organizations#update_data_policy'
    end
    
    resources :utterances do
      post 'share'
      post 'reply'
    end
    
    get "search/symbols" => "search#symbols"
    get "search/protected_symbols" => "search#protected_symbols"
    get "search/external_resources" => "search#external_resources"
    get "search/proxy" => "search#proxy"
    get "search/parts_of_speech" => "search#parts_of_speech"
    get "search/batch_parts_of_speech" => "search#batch_parts_of_speech"
    get "search/apps" => "search#apps"
    get "search/audio" => "search#audio"
    get "search/focus" => "search#focuses"
    get "progress/:id" => "progress#progress"
    get "telemetry" => "telemetry#index"
    resources :telemetry_events, only: [:create]
    
    resources :logs do
      get 'lam'
      get 'eval_pdf'
      get 'obl', on: :collection
      post 'import' => 'logs#import', on: :collection
      post 'code_check' => 'logs#code_check', on: :collection

      get 'trends', on: :collection
      get 'trends_slice', on: :collection
      get 'anonymous_logs', on: :collection
    end
    resources :webhooks do
      post 'test'
    end
    resources :integrations
    
    post 'purchasing_event' => 'purchasing#event'
    post 'purchase_gift' => 'purchasing#purchase_gift'
  end

  # Example of regular route:
  #   get 'products/:id' => 'catalog#view'

  # Example of named route that can be invoked with purchase_url(id: product.id)
  #   get 'products/:id/purchase' => 'catalog#purchase', as: :purchase

  # Example resource route (maps HTTP verbs to controller actions automatically):
  #   resources :products

  # Example resource route with options:
  #   resources :products do
  #     member do
  #       get 'short'
  #       post 'toggle'
  #     end
  #
  #     collection do
  #       get 'sold'
  #     end
  #   end

  # Example resource route with sub-resources:
  #   resources :products do
  #     resources :comments, :sales
  #     resource :seller
  #   end

  # Example resource route with more complex sub-resources:
  #   resources :products do
  #     resources :comments
  #     resources :sales do
  #       get 'recent', on: :collection
  #     end
  #   end

  # Example resource route with concerns:
  #   concern :toggleable do
  #     post 'toggle'
  #   end
  #   resources :posts, concerns: :toggleable
  #   resources :photos, concerns: :toggleable

  # Example resource route within a namespace:
  #   namespace :admin do
  #     # Directs /admin/products/* to Admin::ProductsController
  #     # (app/controllers/admin/products_controller.rb)
  #     resources :products
  #   end
end
