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
end
