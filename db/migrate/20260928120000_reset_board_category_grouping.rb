# Data only, no schema change. See lib/board_category_grouping_reset.rb. Remove with it once the
# Categories feature ships.
class ResetBoardCategoryGrouping < ActiveRecord::Migration[7.2]
  def up
    result = BoardCategoryGroupingReset.run
    say "board_category_grouping turned off for #{result[:reset]} user(s); #{result[:failed].length} failed #{result[:failed].inspect}"
  end

  # The previous per-user value is not restored: grouping is unreachable while the flag is off.
  def down
  end
end
