require 'spec_helper'
require 'rake'

# extras:translate_ui_locales calls Google via WordData.translate_locale_batch.
# The load-bearing safety is fail-closed when the token is missing or still an
# unresolved op:// ref (dotenv loads .env.op.local without resolving those).
describe 'extras:translate_ui_locales rake task' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('extras:translate_ui_locales')
  end

  before(:each) do
    Rake::Task['extras:translate_ui_locales'].reenable
    @original_token = ENV['GOOGLE_TRANSLATE_TOKEN']
    @original_locale = ENV['LOCALE']
  end

  after(:each) do
    ENV['GOOGLE_TRANSLATE_TOKEN'] = @original_token
    ENV['LOCALE'] = @original_locale
  end

  it "should raise when GOOGLE_TRANSLATE_TOKEN is missing" do
    ENV.delete('GOOGLE_TRANSLATE_TOKEN')
    expect(WordData).to_not receive(:translate_locale_batch)
    expect {
      Rake::Task['extras:translate_ui_locales'].invoke
    }.to raise_error(/GOOGLE_TRANSLATE_TOKEN is missing/)
  end

  it "should raise when GOOGLE_TRANSLATE_TOKEN is still an op:// reference" do
    ENV['GOOGLE_TRANSLATE_TOKEN'] = 'op://Vault/Google Translate/credential'
    expect(WordData).to_not receive(:translate_locale_batch)
    expect {
      Rake::Task['extras:translate_ui_locales'].invoke
    }.to raise_error(/op:\/\//)
  end
end
