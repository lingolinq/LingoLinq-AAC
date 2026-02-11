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

  desc "Seed session logs for a user to test reporting (word cloud, heat map). Default: sampleorganization_user_1"
  task seed_reporting_logs: :environment do
    load Rails.root.join('lib', 'seed_reporting_logs.rb')
    user_name = ENV['USER_NAME'] || 'sampleorganization_user_1'
    sessions_count = (ENV['SESSIONS'] || '5').to_i
    puts "Seeding reporting logs for #{user_name} (#{sessions_count} sessions)..."
    seed_reporting_logs(user_name, sessions_count: sessions_count)
  end
end
