# CORS for local development: allows API calls when frontend and backend run on different ports
# (e.g. Ember on 8184, Rails on 5000). Not loaded in production.
if Rails.env.development? || Rails.env.test?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins(
        %r{\Ahttps?://localhost(:\d+)?\z},
        %r{\Ahttps?://127\.0\.0\.1(:\d+)?\z}
      )
      resource '/api/v1/*',
        headers: :any,
        methods: [:get, :post, :put, :patch, :delete, :options],
        credentials: false
      resource '/token',
        headers: :any,
        methods: [:post, :options],
        credentials: false
      resource '/oauth2/*',
        headers: :any,
        methods: [:get, :post, :delete, :options],
        credentials: false
      resource '/saml/*',
        headers: :any,
        methods: [:get, :post, :options],
        credentials: false
      resource '/auth/*',
        headers: :any,
        methods: [:post, :options],
        credentials: false
    end
  end
end
