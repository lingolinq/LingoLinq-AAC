# Drops a client-supplied X-Forwarded-Host. No proxy in front of the deployed
# app sets it (Cloud Run and the production load balancer do not), so any value
# came from the client, and Rails would otherwise take it as the request's host.
# Deleting the env key also covers the underscore spelling, which Puma maps to
# the same key.
class ForwardedHostFilter
  def initialize(app)
    @app = app
  end

  def call(env)
    env.delete('HTTP_X_FORWARDED_HOST')
    @app.call(env)
  end
end
