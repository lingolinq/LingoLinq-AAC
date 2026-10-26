# Shared by the e2e seed scripts in this folder: the local-database guard and the synthetic
# user helper. LOCAL DEV DATABASE ONLY: the specs these scripts serve click real buttons.
# Every value the helpers write is made up.
#
# Each seed calls assert_local_e2e_database! itself, before its first write: a require only
# runs this file once per process, so a check at load time would not cover a second seed run
# in the same process after the connection changed.
def assert_local_e2e_database!
  raise 'refusing to run outside development' unless Rails.env.development?
  # The environment name alone does not say which database this is: a shell can still hold a
  # DATABASE_URL for a shared or deployed one. Only a local database whose name says it is for
  # development or e2e testing.
  # Read from the open connection, not the config: PGHOST and friends can point a host-less
  # config somewhere else.
  pg = ActiveRecord::Base.connection.raw_connection
  host = pg.host.to_s
  local_host = host.empty? || host.start_with?('/') || %w[localhost 127.0.0.1 ::1].include?(host)
  raise "refusing to run against database #{pg.db.inspect} on #{host.inspect}" unless local_host && pg.db.to_s =~ /\Alingolinq-(development|e2e[\w-]*)\z/
end

def e2e_user(user_name, prefs)
  assert_local_e2e_database!
  u = User.find_by(user_name: user_name) || User.process_new({
    'name' => user_name.tr('_', ' '), 'user_name' => user_name, 'email' => "#{user_name}@example.com",
    'password' => 'password', 'public' => false
  }, {})
  u.settings['subscription'] ||= {}
  u.settings['subscription']['never_expires'] = true
  u.settings['subscription']['plan_id'] = 'slp_monthly_granted'
  u.settings['terms_agreed'] ||= Time.now.to_i
  u.settings['preferences'] ||= {}
  u.settings['preferences'].merge!(prefs)
  u.settings['preferences']['progress'] = {
    'setup_done' => true, 'intro_watched' => true, 'speak_mode_intro_done' => true, 'modeling_intro_done' => true
  }
  u.save!
  u
end
