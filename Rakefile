# Add your own tasks in files placed in lib/tasks ending in .rake,
# for example lib/tasks/capistrano.rake, and they will automatically be available to Rake.

# TODO: there's probably a cleaner way to do this, but this code prevents
# failure on heroku calling rake assets:precompile which it does without
# the environment variables, even though it's still loading the application state
ENV['SKIP_VALIDATIONS'] = "true"

require File.expand_path('../config/application', __FILE__)

LingoLinq::Application.load_tasks

