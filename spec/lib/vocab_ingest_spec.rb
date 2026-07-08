require 'spec_helper'
require 'rake'

describe 'vocab:ingest rake task' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('vocab:ingest')
  end

  before(:each) do
    Rake::Task['vocab:ingest'].reenable
  end

  after(:each) do
    Setting.where(key: 'vocab/en').destroy_all
    RedisInit.default.del('setting/vocab/en')
  end

  let(:core_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'core_lists.reader-golden.json')))['lists']
  end
  let(:fringe_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'fringe_lists.reader-golden.json')))['lists']
  end

  it "loads the committed vocab-en.json into Setting['vocab/en']" do
    Rake::Task['vocab:ingest'].invoke('en')
    stored = Setting.get_cached('vocab/en')
    expect(stored).to be_present
    expect(stored['sets'].select { |s| s['category'] == 'core' }.length).to eq(4)
  end

  it "reconstructs core_lists byte-identical to the reader golden (VOCAB reconstruction, COMPAT-01/02)" do
    Rake::Task['vocab:ingest'].invoke('en')
    reconstructed = WordData.send(:reconstruct_core_lists_from_vocab, 'en')
    expect(reconstructed).to eq(core_golden)
  end

  it "reconstructs fringe_lists byte-identical to the reader golden (VOCAB reconstruction, COMPAT-01/02)" do
    Rake::Task['vocab:ingest'].invoke('en')
    reconstructed = WordData.send(:reconstruct_fringe_lists_from_vocab, 'en')
    expect(reconstructed).to eq(fringe_golden)
  end

  it "aborts on an oversized ext_members payload without persisting it (T-02.03-01)" do
    dir = Rails.root.join('db', 'language', 'zz_oversized_spec')
    FileUtils.mkdir_p(dir)
    oversized = {
      '_locale' => 'zz_oversized_spec', '_schema' => 2, '_type' => 'vocab',
      'concepts' => [],
      'sets' => [{
        'id' => 'huge', 'category' => 'core', 'name' => 'huge',
        'ext_members' => Array.new(6000) { |i| "word#{i}" }
      }]
    }
    File.write(dir.join('vocab-en.json'), oversized.to_json)

    expect {
      Rake::Task['vocab:ingest'].invoke('zz_oversized_spec')
    }.to raise_error(/ceiling/)

    expect(Setting.get_cached('vocab/zz_oversized_spec')).to be_nil
  ensure
    FileUtils.rm_rf(dir)
    Setting.where(key: 'vocab/zz_oversized_spec').destroy_all
    RedisInit.default.del('setting/vocab/zz_oversized_spec')
  end

  it "aborts on a malformed payload (missing sets) without persisting it (T-02.03-01)" do
    dir = Rails.root.join('db', 'language', 'yy_malformed_spec')
    FileUtils.mkdir_p(dir)
    File.write(dir.join('vocab-en.json'), { '_type' => 'vocab' }.to_json)

    expect {
      Rake::Task['vocab:ingest'].invoke('yy_malformed_spec')
    }.to raise_error(/validation/)

    expect(Setting.get_cached('vocab/yy_malformed_spec')).to be_nil
  ensure
    FileUtils.rm_rf(dir)
    Setting.where(key: 'vocab/yy_malformed_spec').destroy_all
    RedisInit.default.del('setting/vocab/yy_malformed_spec')
  end
end
