namespace :db do
  desc "Seed a sample organization with users and relationships"
  task seed_organization: :environment do
    load Rails.root.join('lib', 'seed_organization.rb')
    seed_organization(
      org_name: ENV['ORG_NAME'] || "Sample Organization",
      total_licenses: ENV['TOTAL_LICENSES']&.to_i || 50,
      total_eval_licenses: ENV['TOTAL_EVAL_LICENSES']&.to_i || 10,
      total_supervisor_licenses: ENV['TOTAL_SUPERVISOR_LICENSES']&.to_i || 20,
      manager_count: ENV['MANAGER_COUNT']&.to_i || 2,
      supervisor_count: ENV['SUPERVISOR_COUNT']&.to_i || 5,
      user_count: ENV['USER_COUNT']&.to_i || 10,
      eval_count: ENV['EVAL_COUNT']&.to_i || 3
    )
  end

  desc "Verify or set password for a user (e.g. sampleorganization_manager_2). Usage: rake db:verify_user_password USER_NAME=sampleorganization_manager_2 PASSWORD=password123"
  task verify_user_password: :environment do
    user_name = ENV['USER_NAME']
    password = ENV['PASSWORD'] || 'password123'
    unless user_name
      puts "Usage: rake db:verify_user_password USER_NAME=sampleorganization_manager_2 [PASSWORD=password123]"
      exit 1
    end
    user = User.find_by(user_name: user_name)
    unless user
      puts "User #{user_name} not found."
      exit 1
    end
    has_password = user.settings && user.settings['password'].present?
    puts "User: #{user.user_name} (id: #{user.global_id})"
    puts "Has password set: #{has_password}"
    if has_password && user.valid_password?(password)
      puts "Password verification: OK"
    elsif has_password
      puts "Password verification: FAILED (user has a password but the provided password is incorrect)"
    else
      puts "Setting password..."
      user.generate_password(password)
      user.save!
      puts "Password set successfully."
    end
  end

  desc "Seed session logs for a user to test reporting (word cloud, heat map). Default: sampleorganization_user_1"
  task seed_reporting_logs: :environment do
    load Rails.root.join('lib', 'seed_reporting_logs.rb')
    user_name = ENV['USER_NAME'] || 'sampleorganization_user_1'
    sessions_count = (ENV['SESSIONS'] || '5').to_i
    puts "Seeding reporting logs for #{user_name} (#{sessions_count} sessions)..."
    seed_reporting_logs(user_name, sessions_count: sessions_count)
  end
end
