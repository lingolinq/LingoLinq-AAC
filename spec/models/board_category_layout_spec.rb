require 'spec_helper'

# The board's Fitzgerald category layout lives on the BOARD, not on the user.
#
# That is the whole design: a curated arrangement is a property of the board it was
# designed for, so it has to ship with that board, survive being copied, and reach a user
# who has never opened the Categorize panel. The user preference it replaced could do none
# of those — it was per-account, so it never followed a copy and never reached a new user.
#
# `board.settings` is governed by three INDEPENDENT allowlists (write, serialize, copy) and
# a key missing from any one of them fails silently. This file pins all three, because the
# repo already carries two settings broken exactly that way: `hide_empty` is written and
# has an Ember attr but is not serialized, so it reads back nil forever; `board_style` is
# serialized and consumed client-side but written nowhere in Rails.
describe Board, :type => :model do
  describe "category_layout" do
    def layout_for(val)
      u = User.create
      b = Board.create(:user => u)
      b.process({'category_layout' => val}, {:user => u})
      b.reload.settings['category_layout']
    end

    describe "sanitization on write" do
      it "keeps a well-formed order and per-button overrides" do
        g = layout_for({'order' => ['people', 'actions'], 'buttons' => {'72' => 'yes', '59' => 'words'}})
        expect(g['order']).to eq(['people', 'actions'])
        expect(g['buttons']).to eq({'72' => 'yes', '59' => 'words'})
      end

      # Same drift guard as the user preference had: an unknown key silently stripped on
      # every save and re-appended at the END by normalize_order on the next read would
      # permanently push that category to the back of the board.
      it "drops unknown category keys from order and de-duplicates" do
        g = layout_for({'order' => ['people', 'not_a_category', 'people']})
        expect(g['order']).to eq(['people'])
      end

      it "drops an override naming a category that is not in the registry" do
        g = layout_for({'buttons' => {'72' => 'yes', '73' => 'not_a_category'}})
        expect(g['buttons']).to eq({'72' => 'yes'})
      end

      # Button ids are what settings['grid']['order'] references, so they are always
      # integers. Anything else is a malformed or hostile payload.
      it "rejects button references that do not look like ids" do
        g = layout_for({'buttons' => {
          '72' => 'yes', 'a/b' => 'yes', '../etc' => 'yes', ('9' * 20) => 'yes'
        }})
        expect(g['buttons'].keys).to eq(['72'])
      end

      it "accepts an integer button id and normalizes it to a string key" do
        g = layout_for({'buttons' => {72 => 'yes'}})
        expect(g['buttons']).to eq({'72' => 'yes'})
      end

      it "caps the override map so a client cannot grow the row without limit" do
        many = {}
        (1..(Board::MAX_CATEGORY_BUTTON_OVERRIDES + 50)).each { |i| many[i.to_s] = 'yes' }
        g = layout_for({'buttons' => many})
        expect(g['buttons'].size).to eq(Board::MAX_CATEGORY_BUTTON_OVERRIDES)
      end

      # Presentation must never cost the edit: a junk layout degrades to empty rather than
      # raising and taking down an otherwise valid board save.
      it "degrades junk to an empty layout rather than raising" do
        expect { layout_for('nope') }.not_to raise_error
        expect(layout_for('nope')).to eq({})
        expect(layout_for({'order' => 'nope', 'buttons' => 'nope'})).to eq({'order' => [], 'buttons' => {}})
      end
    end

    describe "serialization" do
      it "reaches the client in the board JSON" do
        u = User.create
        b = Board.create(:user => u)
        b.process({'category_layout' => {'order' => ['people'], 'buttons' => {'72' => 'yes'}}}, {:user => u})
        json = JsonApi::Board.build_json(b.reload)
        expect(json['category_layout']).to eq({'order' => ['people'], 'buttons' => {'72' => 'yes'}})
      end
    end

    # THE POINT OF THE WHOLE REDESIGN. BoardCloner starts from `settings: {}` and names each
    # carried key explicitly, so an unlisted key is dropped on copy. A layout that does not
    # survive this is a layout that never reaches the users who copy the board — which is
    # precisely the failure the user-preference version had.
    describe "copy propagation" do
      it "travels to a copy of the board" do
        author = User.create
        copier = User.create
        b = Board.create(:user => author)
        b.process({'category_layout' => {'order' => ['actions', 'people'], 'buttons' => {'72' => 'yes'}}}, {:user => author})
        copy = b.reload.copy_for(copier)
        expect(copy.settings['category_layout']).to eq(
          {'order' => ['actions', 'people'], 'buttons' => {'72' => 'yes'}}
        )
      end

      it "leaves a copy of an unlaid-out board with no layout" do
        author = User.create
        copier = User.create
        b = Board.create(:user => author)
        copy = b.reload.copy_for(copier)
        expect(copy.settings['category_layout']).to eq(nil)
      end
    end
  end
end
