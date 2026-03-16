class DeletedBoard < ActiveRecord::Base
  include SecureSerialize
  include GlobalId
  secure_serialize :settings
  before_save :generate_defaults
  belongs_to :user
  belongs_to :board, optional: true
  include Replicate
  
  def generate_defaults
    self.cleared ||= false
    true
  end
  
  def board_global_id
    related_global_id(self.board_id)
  end
  
  def restore!
    version = PaperTrail::Version.where(item_type: 'Board', item_id: self.board_id).order('created_at DESC')[0]
    if version
      board = Board.load_version(version)
      board.key = self.key
      new_key = board.generate_unique_key(self.key)
      if new_key != board.key
        board.rename_to(new_key)
      end
      board.load_secure_object if !board.settings || board.settings.is_a?(String)
      board.settings['undeleted'] = true
      board.instance_variable_set('@buttons_changed', 'undeleted')
      board.save!
      self.cleared = true
      self.save
      return board
    else
      raise "no valid version found"
    end
  end
  
  def self.find_by_path(path)
    if path && path.match(/\//)
      DeletedBoard.where(:key => path).order('id DESC').first
    else
      hash = id_pieces(path)
      DeletedBoard.find_by(:board_id => hash[:id])
    end
  end
  
  def self.process(board)
    db = DeletedBoard.find_or_create_by(key: board.key)
    prior_board_id = db.board_id if db.board_id
    db.board_id = board.id
    db.user_id = board.user_id
    db.settings ||= {}
    db.settings[:stats] = board.settings['stats']
    db.settings[:board_ids] ||= []
    db.settings[:board_ids] << prior_board_id if prior_board_id
    db.cleared = false
    db.save
    db
  end
  
  def self.flush_old_records
    count = 0
    DeletedBoard.where(['cleared = ? AND created_at < ?', false, 300.days.ago]).each do |db|
      # TODO: Flusher assumes the board object still exists, which is a bad assumption here
      Flusher.flush_board_by_db_id(db.board_id, db.key) rescue nil
      db.cleared = true
      db.save
      count += 1
    end
    count
  end
end
