class BoardButtonImage < ApplicationRecord
  belongs_to :board
  belongs_to :button_image
  include Replicate
  
  def self.images_for_board(board_id)
    BoardButtonImage.includes(:button_image).where(:board_id => board_id).map(&:button_image)
  end
  
  def self.disconnect(board_id, image_refs)
    return if image_refs.blank?
    images = ButtonImage.find_all_by_global_id(image_refs.map{|i| i[:id] })
    BoardButtonImage.where(:board_id => board_id, :button_image_id => images.map(&:id)).delete_all
  end
  
  def self.connect(board_id, image_refs, options={})
    return if image_refs.blank?
    images_to_track = []
    board = Board.find_by(id: board_id)
    found_images = ButtonImage.find_all_by_global_id(image_refs.map{|r| r[:id] })
    image_refs.each do |i|
      image_id = i[:id]
      image = found_images.detect{|i| i.global_id == image_id }
      if image
        bbi = BoardButtonImage.find_or_create_by!(:board_id => board_id, :button_image_id => image.id) 
        if options[:user_id]
          images_to_track << {
            :label => i[:label],
            :external_id => image.settings['external_id'],
            :locale => (board && board.settings['locale']) || 'en',
            :user_id => options[:user_id]
          }
        end
      end
    end
    # We stopped tracking image uses for board copies, 
    # and only add points when users add a new image
    # the interface
#    ButtonImage.schedule(:track_images, images_to_track)
    true
  end
end
