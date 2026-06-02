namespace :lingolinq do
  desc 'Ensure the configured system board user has crisis-vocabulary from public/system-boards/crisis-vocabulary.obz'
  task ensure_crisis_vocabulary: :environment do
    owner = SystemBoardSources.owner
    raise "User not found: #{SystemBoardSources::USER_NAME}. Run db:seed first." unless owner

    board = SystemBoardSources.ensure_crisis_vocabulary!(owner)
    if board
      puts "OK: #{board.key} (#{board.global_id})"
    else
      puts 'SKIP: board not created (missing OBZ or import failed)'
      exit 1
    end
  end
end
