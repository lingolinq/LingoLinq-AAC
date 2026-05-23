# globals.js.erb uses //= depend_on feature_flags.rb so Sprockets recompiles when
# ENABLED_FRONTEND_FEATURES changes. lib/ is not on the asset load path by default.
Rails.application.config.assets.paths << Rails.root.join('lib')
