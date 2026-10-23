# Named *_backfill.rake so scripts/codex-review-path-classifier.sh treats it as a data task
# (it writes synthetic rows for demo users); see .claude/rules/data-bearing-paths.md.
namespace :demo do
  # Manual run of the daily Demo School District refresh (scheduler:dispatch runs it at 6 AM
  # UTC). Safe to repeat: days that already hold a rolling session are skipped.
  #   bundle exec rake demo:refresh
  #   ORG_ID=1_2 bundle exec rake demo:refresh   # target one org; refused unless flagged
  desc "Extend the flagged demo organization's synthetic activity through yesterday"
  task refresh: :environment do
    require_relative '../demo_district'
    org = nil
    if ENV['ORG_ID'].present?
      org = Organization.find_by_path(ENV['ORG_ID'])
      abort("organization #{ENV['ORG_ID']} not found") unless org
    end
    res = DemoDistrict.refresh!(organization: org)
    puts JSON.pretty_generate(res)
  end
end
