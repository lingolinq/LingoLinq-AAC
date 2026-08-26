require 'spec_helper'
require 'rake'

# A one-shot bulk mutation over the entire user table, with a dry-run default.
# It shipped with no coverage at all, and its comment makes three load-bearing
# claims -- that the dry run writes nothing, that the write clears the sentinel,
# and that neither after_save hook does anything (no mail, no queued jobs).
# Those are exactly the claims worth pinning: the failure mode of getting them
# wrong is a mass mail-out or a queue flood, on a table that cannot be filtered
# in SQL because settings is encrypted at rest.
describe 'extras:clear_no_name_placeholder rake task' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('extras:clear_no_name_placeholder')
  end

  before(:each) do
    Rake::Task['extras:clear_no_name_placeholder'].reenable
    @original_frd = ENV['FRD']
  end

  after(:each) do
    ENV['FRD'] = @original_frd
  end

  def run_task
    # The task prints a progress report; swallow it so spec output stays readable.
    original = $stdout
    $stdout = StringIO.new
    begin
      Rake::Task['extras:clear_no_name_placeholder'].invoke
      $stdout.string
    ensure
      $stdout = original
    end
  end

  it "should change nothing without FRD=1" do
    ENV.delete('FRD')
    u = User.create!
    u.settings['name'] = 'No name'
    u.save!
    out = run_task
    expect(u.reload.settings['name']).to eq('No name')
    expect(out).to match(/DRY RUN/)
  end

  it "should clear the placeholder with FRD=1" do
    ENV['FRD'] = '1'
    u = User.create!
    u.settings['name'] = 'No name'
    u.save!
    run_task
    expect(u.reload.settings['name']).to eq(nil)
    expect(u.reload.display_name).to eq(u.display_user_name)
  end

  it "should leave real names alone" do
    ENV['FRD'] = '1'
    u = User.create!
    u.settings['name'] = 'Ada Lovelace'
    u.save!
    run_task
    expect(u.reload.settings['name']).to eq('Ada Lovelace')
  end

  it "should not be fooled by a name that merely contains the placeholder" do
    ENV['FRD'] = '1'
    u = User.create!
    u.settings['name'] = 'No name Smith'
    u.save!
    run_task
    expect(u.reload.settings['name']).to eq('No name Smith')
  end

  # The comment in the task asserts this outright; a bulk sweep that queued a
  # mailer per row would be a mass mail-out to the whole user base.
  it "should send no mail and queue no jobs" do
    ENV['FRD'] = '1'
    u = User.create!
    u.settings['name'] = 'No name'
    u.save!
    expect(UserMailer).to_not receive(:schedule_delivery)
    expect(Worker).to_not receive(:schedule_for)
    run_task
    expect(u.reload.settings['name']).to eq(nil)
  end

  it "should keep going when one record raises" do
    ENV['FRD'] = '1'
    bad = User.create!
    bad.settings['name'] = 'No name'
    bad.save!
    good = User.create!
    good.settings['name'] = 'No name'
    good.save!
    allow_any_instance_of(User).to receive(:save!).and_wrap_original do |m, *args|
      raise 'boom' if m.receiver.global_id == bad.global_id
      m.call(*args)
    end
    out = run_task
    expect(out).to match(/ERROR on #{bad.global_id}/)
    expect(good.reload.settings['name']).to eq(nil)
  end
end
