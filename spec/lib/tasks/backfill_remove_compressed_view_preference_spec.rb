require 'spec_helper'
require 'rake'

# Compressed View was removed on 2026-10-10 (requested: "remove the compressed view toggle and all
# of its settings -> we're removing it from the project", with its stored value cleared). This task
# strips `compressed_view` from every user's preferences. Like extras:clear_no_name_placeholder it
# is a one-shot sweep over the whole user table, which cannot be filtered in SQL because settings
# is encrypted at rest, so the same claims are pinned: the dry run writes nothing, the write
# removes only that key, no mail or job goes out, and one bad record does not stop the sweep.
describe 'extras:backfill_remove_compressed_view_preference rake task' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('extras:backfill_remove_compressed_view_preference')
  end

  before(:each) do
    Rake::Task['extras:backfill_remove_compressed_view_preference'].reenable
    @original_frd = ENV['FRD']
  end

  after(:each) do
    ENV['FRD'] = @original_frd
  end

  def run_task
    original = $stdout
    $stdout = StringIO.new
    begin
      Rake::Task['extras:backfill_remove_compressed_view_preference'].invoke
      $stdout.string
    ensure
      $stdout = original
    end
  end

  def user_with(prefs)
    u = User.create!
    u.settings['preferences'] ||= {}
    prefs.each { |k, v| u.settings['preferences'][k] = v }
    u.save!
    u
  end

  it "should change nothing without FRD=1" do
    ENV.delete('FRD')
    u = user_with('compressed_view' => true)
    out = run_task
    expect(u.reload.settings['preferences']['compressed_view']).to eq(true)
    expect(out).to match(/DRY RUN/)
    expect(out).to match(/Carrying the key: [1-9]/)
  end

  it "should remove the key with FRD=1, whatever its value" do
    ENV['FRD'] = '1'
    on = user_with('compressed_view' => true)
    off = user_with('compressed_view' => false)
    run_task
    expect(on.reload.settings['preferences']).not_to have_key('compressed_view')
    expect(off.reload.settings['preferences']).not_to have_key('compressed_view')
  end

  it "should leave every other preference alone" do
    ENV['FRD'] = '1'
    u = user_with('compressed_view' => true, 'dashboard_layout' => 'focused', 'board_view_style' => 'modern')
    run_task
    prefs = u.reload.settings['preferences']
    expect(prefs['dashboard_layout']).to eq('focused')
    expect(prefs['board_view_style']).to eq('modern')
  end

  it "should send no mail and queue no jobs" do
    ENV['FRD'] = '1'
    u = user_with('compressed_view' => true)
    expect(UserMailer).to_not receive(:schedule_delivery)
    expect(Worker).to_not receive(:schedule_for)
    run_task
    expect(u.reload.settings['preferences']).not_to have_key('compressed_view')
  end

  it "should keep going when one record raises" do
    ENV['FRD'] = '1'
    bad = user_with('compressed_view' => true)
    good = user_with('compressed_view' => true)
    allow_any_instance_of(User).to receive(:save!).and_wrap_original do |m, *args|
      raise 'boom' if m.receiver.global_id == bad.global_id
      m.call(*args)
    end
    out = run_task
    expect(out).to match(/ERROR on #{bad.global_id}/)
    expect(good.reload.settings['preferences']).not_to have_key('compressed_view')
  end
end
