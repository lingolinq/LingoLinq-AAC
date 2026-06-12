class UserBoardConnection < ApplicationRecord
  before_save :generate_defaults
  belongs_to :board
  belongs_to :user
#  replicated_model
  
  def generate_defaults
    self.home ||= false
    if self.board && self.board.parent_board_id
      self.parent_board_id = self.board.parent_board_id
    end
    true
  end
  
  def root_board_id
    self.parent_board_id || self.board_id
  end
end
