class OldKey < ApplicationRecord
  self.inheritance_column = nil
  include Replicate
  
  def record
    if self.type == 'board'
      Board.find_by_path(self.record_id)
    elsif self.type == 'user'
      User.find_by_path(self.record_id)
    else
      nil
    end
  end
end
