require 'spec_helper'

# Writes a curated category layout (lib/category_layouts/*.json) onto a board through the
# board's own validated save path (2026-10-05; docs/task-management/2026-10-05_category-layout-on-board.md).
describe CategoryLayoutSeeder do
  def board_with(labels)
    u = User.create
    b = Board.create(:user => u)
    buttons = labels.flatten.each_with_index.map { |label, i| {'id' => i + 1, 'label' => label} }
    b.process({
      'buttons' => buttons,
      'grid' => {'rows' => labels.length, 'columns' => labels[0].length,
                 'order' => labels.each_with_index.map { |row, r| row.each_index.map { |c| r * row.length + c + 1 } }}
    })
    b
  end

  let(:data) do
    {
      'rows' => 1, 'columns' => 3,
      'order' => [[3, 1, 2]],
      'cells' => [[1, 0, 0]],
      'blocks' => [{'category' => 'people'}, {'category' => 'actions'}],
      'labels' => [['go', 'I', 'you']]
    }
  end

  it "writes the layout onto a board whose buttons match its labels" do
    b = board_with([['I', 'you', 'go']])
    res = CategoryLayoutSeeder.apply(b.key, data)
    expect(res[:ok]).to eq(true)
    layout = b.reload.settings['category_layout']
    expect(layout['order']).to eq([[3, 1, 2]])
    expect(layout['cells']).to eq([[1, 0, 0]])
    expect(layout['blocks']).to eq([{'category' => 'people'}, {'category' => 'actions'}])
  end

  it "refuses, and writes nothing, when a cell's label does not match the board" do
    b = board_with([['I', 'you', 'went']])
    res = CategoryLayoutSeeder.apply(b.key, data)
    expect(res[:ok]).to eq(false)
    expect(res[:errors].join).to include('went')
    expect(b.reload.settings['category_layout']).to eq(nil)
  end

  it "refuses a board that does not exist" do
    res = CategoryLayoutSeeder.apply('nobody/no-such-board', data)
    expect(res[:ok]).to eq(false)
  end

  it "ships a Vocal Flair 112 layout that places all 112 buttons once, in valid blocks" do
    file = JSON.parse(File.read(Rails.root.join('lib/category_layouts/vocal_flair_112.json')))
    expect(file['board_key']).to eq('lingolinq/vocal-flair-112')
    expect([file['rows'], file['columns']]).to eq([8, 14])
    ids = file['order'].flatten
    expect(ids.compact.length).to eq(112)
    expect(ids.compact.uniq.length).to eq(112)
    expect(file['cells'].flatten.all? { |b| b.is_a?(Integer) && b < file['blocks'].length }).to eq(true)
    expect(file['blocks'].map { |b| b['category'] } - User::BOARD_CATEGORY_KEYS).to eq([])
  end
end
