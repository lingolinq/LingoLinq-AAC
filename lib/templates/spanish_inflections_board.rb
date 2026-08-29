module SpanishInflectionsBoard
  IMAGE_URL = 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/verb.png'.freeze

  MODIFIERS = [
    {id: 1, label: 'yo', vocalization: ':es-yo'},
    {id: 2, label: 'tú', vocalization: ':es-tu'},
    {id: 3, label: 'él', vocalization: ':es-el'},
    {id: 4, label: 'nosotros', vocalization: ':es-nosotros'},
    {id: 5, label: 'ellos', vocalization: ':es-ellos'},
    {id: 6, label: 's', vocalization: ':es-plural'},
    {id: 7, label: 'a', vocalization: ':es-feminine'},
    {id: 8, label: 'no', vocalization: ':es-negation'},
    {id: 9, label: 'ndo', vocalization: ':es-gerund'},
    {id: 10, label: 'ado', vocalization: ':es-participle'},
    {id: 11, label: 'más', vocalization: ':es-mas'},
    {id: 12, label: 'ísimo', vocalization: ':es-isimo'},
    {id: 13, label: '.', vocalization: '+.'},
    {id: 14, label: '¿?', vocalization: ':es-question'},
    {id: 15, label: ',', vocalization: '+,'},
    {id: 16, label: '¡!', vocalization: ':es-exclaim'}
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
      name: 'Flexiones',
      locale: 'es',
      public: true,
      grid: {
        rows: 4,
        columns: 4,
        order: [
          [1, 2, 3, 4],
          [5, 6, 7, 8],
          [9, 10, 11, 12],
          [13, 14, 15, 16]
        ]
      },
      buttons: buttons
    }, {
      user: user,
      key: 'inflections-es'
    }]

    if board
      board.process(*options)
      board
    else
      Board.process_new(*options)
    end
  end
end
