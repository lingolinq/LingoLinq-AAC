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

  # The loop stops only when no eligible `*** ` value is left. Pinned privacy
  # keys stay `*** ` on purpose (WordData::ENGLISH_PINNED_LOCALE_KEYS), so the
  # batch must report them back as nopes or the task never terminates.
  it "should terminate when a locale holds a pinned privacy key, leaving it untranslated" do
    ENV['GOOGLE_TRANSLATE_TOKEN'] = 'fake-token'
    ENV['LOCALE'] = 'zz'
    zz = satisfy { |path| path.to_s.end_with?('/public/locales/zz.json') }
    pinned = '*** Children\'s data stays in English.'
    store = { 'data' => JSON.generate({ 'privacy_security_retention_children' => pinned, 'ordinary_ui_key' => '*** Hello' }) }
    allow(File).to receive(:file?).and_call_original
    allow(File).to receive(:file?).with(zz).and_return(true)
    allow(File).to receive(:read).and_call_original
    allow(File).to receive(:read).with(zz) { store['data'] }
    allow(File).to receive(:open).and_call_original
    allow(File).to receive(:open).with(zz, 'w') do
      io = StringIO.new
      io.define_singleton_method(:close) { store['data'] = string }
      io
    end
    allow(WordData).to receive(:query_translations) { |ref, *_| ref.map { |r| r.merge(translation: 'Hola') } }
    calls = 0
    allow(WordData).to receive(:translate_locale_batch).and_wrap_original do |original, *args|
      calls += 1
      raise "translate_ui_locales did not terminate: #{calls} batches, nopes=#{args[1].inspect}" if calls > 5
      original.call(*args)
    end
    expect { Rake::Task['extras:translate_ui_locales'].invoke }.to output(/done\./).to_stdout
    result = JSON.parse(store['data'])
    expect(result['privacy_security_retention_children']).to eq(pinned)
    expect(result['ordinary_ui_key']).to start_with('Hola')
    expect(calls).to be <= 2
  end
end
