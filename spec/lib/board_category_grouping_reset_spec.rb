require 'spec_helper'

describe BoardCategoryGroupingReset do
  # Writes the stored preference directly, the way rows saved before the guard look.
  # User#save does not run sanitize_board_category_grouping! (only process_params does).
  def user_with_grouping(value)
    u = User.create
    u.settings['preferences']['board_category_grouping'] = value
    u.save
    u
  end

  def grouping(u)
    u.reload.settings['preferences']['board_category_grouping']
  end

  it "turns enabled off and keeps every other sub-preference" do
    u = user_with_grouping({'enabled' => true, 'order' => ['people'], 'show_category_names' => false,
                            'vertical_scroll' => false, 'boards' => {'a/b' => {'vertical_scroll' => false}}})
    BoardCategoryGroupingReset.run
    expect(grouping(u)).to eq({'enabled' => false, 'order' => ['people'], 'show_category_names' => false,
                               'vertical_scroll' => false, 'boards' => {'a/b' => {'vertical_scroll' => false}}})
  end

  it "turns off a legacy string value" do
    u = user_with_grouping({'enabled' => 'true'})
    BoardCategoryGroupingReset.run
    expect(grouping(u)['enabled']).to eq(false)
  end

  it "leaves users who are already off, never set it, or hold a non-hash untouched" do
    off = user_with_grouping({'enabled' => false})
    absent = user_with_grouping({'order' => []})
    junk = user_with_grouping('nope')
    stamps = [off, absent, junk].map { |u| u.reload.updated_at }
    result = BoardCategoryGroupingReset.run
    expect([off, absent, junk].map { |u| u.reload.updated_at }).to eq(stamps)
    expect(grouping(absent)).to eq({'order' => []})
    expect(grouping(junk)).to eq('nope')
    expect(result[:reset]).to eq(0)
  end

  it "reports how many users it reset and is a no-op the second time" do
    user_with_grouping({'enabled' => true})
    user_with_grouping({'enabled' => true})
    expect(BoardCategoryGroupingReset.run).to eq({reset: 2, failed: []})
    expect(BoardCategoryGroupingReset.run).to eq({reset: 0, failed: []})
  end

  it "records a version with its own whodunnit, which a migrate Job would not set" do
    u = user_with_grouping({'enabled' => true})
    expect { BoardCategoryGroupingReset.run }.to change { PaperTrail::Version.where(item_type: 'User', item_id: u.id).count }.by(1)
    expect(PaperTrail::Version.where(item_type: 'User', item_id: u.id).last.whodunnit).to eq(BoardCategoryGroupingReset::WHODUNNIT)
  end

  # A real database error, not a Ruby raise: Postgres aborts the enclosing transaction, so
  # without a savepoint per user every later save would fail too.
  it "counts a user whose save fails and carries on with the rest" do
    bad = user_with_grouping({'enabled' => true})
    good = user_with_grouping({'enabled' => true})
    allow_any_instance_of(User).to receive(:save).and_wrap_original do |m, *args|
      m.receiver.id == bad.id ? ActiveRecord::Base.connection.execute('SELECT 1/0') : m.call(*args)
    end
    result = BoardCategoryGroupingReset.run
    expect(result).to eq({reset: 1, failed: [bad.global_id]})
    expect(grouping(good)['enabled']).to eq(false)
  end
end
