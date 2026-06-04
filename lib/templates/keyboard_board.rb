module KeyboardBoard
  def self.generate(user, board=nil)
    letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
        'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', ' ']
    buttons = []
    letters.each do |letter|
      image_url = "https://opensymbols.s3.amazonaws.com/libraries/mulberry/#{letter}%20-%20lower%20case.svg"
      image_url = "https://opensymbols.s3.amazonaws.com/libraries/arasaac/square.png" if letter == ' '
      image = ButtonImage.where(:user_id => user.id).detect{|i| i.url == image_url }
      image ||= ButtonImage.process_new({
        url: image_url,
        public: true
      }, {:user => user})
      voc = letter == ' ' ? ':space' : "+#{letter}"
      buttons << {
        id: letter,
        label: letter,
        hide_label: true,
        vocalization: voc,
        image_id: image.global_id
      }
    end
    
    options = [{
      grid: {
        rows: 3,
        columns: 10,
        order: [
          ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
          ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', nil],
          [' ', 'z', 'x', 'c' ,'v', 'b', 'n', 'm', ' ', nil]
        ]
      },
      buttons: buttons,
      public: true,
      locale: 'en',
      word_suggestions: true
    }, {
      :user => user,
      :key => 'keyboard'
    }]
    if board
      board.process(*options)
      board
    else
      Board.process_new(*options)
    end
  end
end