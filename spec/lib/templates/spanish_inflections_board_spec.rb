require 'spec_helper'
require Rails.root.join('lib', 'templates', 'spanish_inflections_board')

describe SpanishInflectionsBoard do
  it "builds a 4x4 Flexiones board with Spanish modifier vocalizations" do
    user = User.create
    board = described_class.generate(user)

    expect(board.settings['locale']).to eq('es')
    expect(board.settings['name']).to eq('Flexiones')
    expect(board.public).to eq(true)
    expect(board.key).to eq("#{user.user_name}/inflections-es")
    expect(board.settings['grid']['rows']).to eq(4)
    expect(board.settings['grid']['columns']).to eq(4)

    by_label = board.buttons.index_by { |b| b['label'] }
    expect(by_label['yo']['vocalization']).to eq(':es-yo')
    expect(by_label['tú']['vocalization']).to eq(':es-tu')
    expect(by_label['él']['vocalization']).to eq(':es-el')
    expect(by_label['nosotros']['vocalization']).to eq(':es-nosotros')
    expect(by_label['ellos']['vocalization']).to eq(':es-ellos')
    expect(by_label['s']['vocalization']).to eq(':es-plural')
    expect(by_label['a']['vocalization']).to eq(':es-feminine')
    expect(by_label['no']['vocalization']).to eq(':es-negation')
    expect(by_label['ndo']['vocalization']).to eq(':es-gerund')
    expect(by_label['ado']['vocalization']).to eq(':es-participle')
    expect(by_label['más']['vocalization']).to eq(':es-mas')
    expect(by_label['ísimo']['vocalization']).to eq(':es-isimo')
    expect(by_label['.']['vocalization']).to eq('+.')
    expect(by_label['¿?']['vocalization']).to eq(':es-question')
    expect(by_label[',']['vocalization']).to eq('+,')
    expect(by_label['¡!']['vocalization']).to eq(':es-exclaim')
  end
end
