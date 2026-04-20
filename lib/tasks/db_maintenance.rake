namespace :db do
  desc "Prune PaperTrail versions older than 30 days"
  task prune_versions: :environment do
    count = PaperTrail::Version.where('created_at < ?', 30.days.ago).delete_all
    puts "Pruned #{count} versions from PaperTrail."
  end
end
