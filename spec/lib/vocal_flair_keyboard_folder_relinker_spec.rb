require 'spec_helper'

describe VocalFlairKeyboardFolderRelinker do
  def make_user(name)
    User.create(user_name: name)
  end

  def make_board(user, key, buttons)
    ids = buttons.map { |b| b['id'] }
    Board.process_new({
      'name' => key,
      'public' => true,
      'buttons' => buttons,
      'grid' => {'rows' => 1, 'columns' => ids.length, 'order' => [ids]}
    }, {user: user, key: key})
  end

  def folder_buttons
    [
      {'id' => 44, 'label' => 'questions'},
      {'id' => 45, 'label' => 'people'},
      {'id' => 48, 'label' => 'places'},
      {'id' => 1, 'label' => 'I'}
    ]
  end

  it "links missing VF84-w-keyboard folders to the matching VF84 category boards" do
    owner = make_user('lingolinq')
    questions = make_board(owner, 'vocal-flair-84-questions', [{'id' => 1, 'label' => 'who'}])
    people = make_board(owner, 'vocal-flair-84-people', [{'id' => 1, 'label' => 'mom'}])
    places = make_board(owner, 'vocal-flair-84-places2', [{'id' => 1, 'label' => 'home'}])
    root = make_board(owner, 'vocal-flair-84-w-keyboard', folder_buttons)

    result = described_class.relink!(root)
    expect(result[:changed]).to eq(true)
    expect(result[:linked]).to eq(%w[questions people places])

    by_label = root.reload.buttons.index_by { |b| b['label'] }
    expect(by_label['questions']['load_board']).to eq({'id' => questions.global_id, 'key' => questions.key})
    expect(by_label['people']['load_board']).to eq({'id' => people.global_id, 'key' => people.key})
    expect(by_label['places']['load_board']).to eq({'id' => places.global_id, 'key' => places.key})
    expect(by_label['I']['load_board']).to eq(nil)
  end

  it "prefers the board owner's VF84 category copy over the lingolinq original" do
    library = make_user('lingolinq')
    user = make_user('meltest')
    make_board(library, 'vocal-flair-84-questions', [{'id' => 1, 'label' => 'who'}])
    mine = make_board(user, 'vocal-flair-84-questions', [{'id' => 1, 'label' => 'who'}])
    root = make_board(user, 'vocal-flair-84-w-keyboard', [
      {'id' => 44, 'label' => 'questions'}
    ])

    described_class.relink!(root)
    expect(root.reload.buttons[0]['load_board']['key']).to eq(mine.key)
  end

  it "does not overwrite a folder that already has a resolvable load_board" do
    owner = make_user('lingolinq')
    questions = make_board(owner, 'vocal-flair-84-questions', [{'id' => 1, 'label' => 'who'}])
    other = make_board(owner, 'other-questions', [{'id' => 1, 'label' => 'who'}])
    root = make_board(owner, 'vocal-flair-84-w-keyboard', [
      {'id' => 44, 'label' => 'questions', 'load_board' => {'id' => other.global_id, 'key' => other.key}}
    ])

    result = described_class.relink!(root)
    expect(result[:changed]).to eq(false)
    expect(root.reload.buttons[0]['load_board']['key']).to eq(other.key)
    expect(root.buttons[0]['load_board']['id']).to eq(other.global_id)
    expect(questions).to be_present
  end

  it "skips a folder when no matching category board exists" do
    owner = make_user('lingolinq')
    root = make_board(owner, 'vocal-flair-84-w-keyboard', [
      {'id' => 44, 'label' => 'questions'}
    ])

    result = described_class.relink!(root)
    expect(result[:changed]).to eq(false)
    expect(root.reload.buttons[0]['load_board']).to eq(nil)
  end

  it "does not touch boards that are not the VF84 keyboard variant" do
    owner = make_user('lingolinq')
    questions = make_board(owner, 'vocal-flair-84-questions', [{'id' => 1, 'label' => 'who'}])
    root = make_board(owner, 'vocal-flair-84', [
      {'id' => 44, 'label' => 'questions'}
    ])

    result = described_class.relink!(root)
    expect(result[:changed]).to eq(false)
    expect(root.reload.buttons[0]['load_board']).to eq(nil)
    expect(questions).to be_present
  end
end
