class BoardButtonSound < ApplicationRecord
  belongs_to :board
  belongs_to :button_sound
  include Replicate
  
  def self.sounds_for_board(board_id)
    BoardButtonSound.includes(:button_sound).where(:board_id => board_id).map(&:button_sound)
  end
  
  def self.disconnect(board_id, sound_refs)
    return if sound_refs.blank?
    sounds = ButtonSound.find_all_by_global_id(sound_refs.map{|s| s[:id] })
    BoardButtonSound.where(:board_id => board_id, :button_sound_id => sounds.map(&:id)).delete_all
  end
  
  def self.connect(board_id, sound_refs, options={})
    return if sound_refs.blank?
    sound_refs.each do |s|
      sound_id = s[:id]
      sound = ButtonSound.find_by_global_id(sound_id)
      if sound
        BoardButtonSound.find_or_create_by(:board_id => board_id, :button_sound_id => sound.id) 
      end
    end
  end
end
