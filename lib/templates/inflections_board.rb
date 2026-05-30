module InflectionsBoard
  IMAGE_URL = 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/verb.png'.freeze

  MODIFIERS = [
    {id: 1, label: 's', vocalization: ':plural'},
    {id: 2, label: 'singular', vocalization: ':singular'},
    {id: 3, label: "'s", vocalization: ":'s"},
    {id: 4, label: 'ed', vocalization: ':ed'},
    {id: 5, label: 'ing', vocalization: ':ing'},
    {id: 6, label: "n't", vocalization: ':verb-negation'},
    {id: 7, label: 'er', vocalization: ':er'},
    {id: 8, label: 'est', vocalization: ':est'},
    {id: 9, label: '.', vocalization: '+.'},
    {id: 10, label: '?', vocalization: '+?'},
    {id: 11, label: ',', vocalization: '+,'},
    {id: 12, label: '!', vocalization: '+!'}
  ].freeze

  def self.generate(user, board=nil)
    raise 'missing user' unless user

    buttons = MODIFIERS.map do |spec|
      {
        id: spec[:id],
        label: spec[:label],
        vocalization: spec[:vocalization],
        image_url: IMAGE_URL
      }
    end

    options = [{
      name: 'Inflections',
      grid: {
        rows: 3,
        columns: 4,
        order: [
          [1, 2, 3, 4],
          [5, 6, 7, 8],
          [9, 10, 11, 12]
        ]
      },
      buttons: buttons,
      public: true
    }, {
      user: user,
      key: 'inflections'
    }]

    if board
      board.process(*options)
      board
    else
      Board.process_new(*options)
    end
  end
end
