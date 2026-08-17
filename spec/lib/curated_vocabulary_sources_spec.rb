require 'spec_helper'

describe CuratedVocabularySources do
  describe '.static_bucket' do
    it 'prefers UPLOAD_STATIC_S3_BUCKET over STATIC_S3_BUCKET' do
      prior_upload = ENV['UPLOAD_STATIC_S3_BUCKET']
      prior_static = ENV['STATIC_S3_BUCKET']
      begin
        ENV['STATIC_S3_BUCKET'] = 'lingolinq-dev-static'
        ENV['UPLOAD_STATIC_S3_BUCKET'] = 'lingolinq-staging-static'
        expect(described_class.static_bucket).to eq('lingolinq-staging-static')
      ensure
        ENV['UPLOAD_STATIC_S3_BUCKET'] = prior_upload
        ENV['STATIC_S3_BUCKET'] = prior_static
      end
    end
  end

  describe '.openaac_skip_files' do
    it 'includes OpenAAC filenames that curated assets replace' do
      skips = described_class.openaac_skip_files
      expect(skips).to include('communikate-20.obz')
      expect(skips).to include('sequoia-15.obz')
      expect(skips).to include('vocal-flair-84-with-keyboard.obz')
      expect(skips).to include('project-core.obf')
      expect(skips).not_to include('quick-core-60.obz')
    end
  end

  describe '.import_entry!' do
    it 'skips when the root board key already exists' do
      owner = User.create(user_name: 'lingolinq')
      entry = described_class.importable_entries.detect { |e| e[:id] == 'jokes' }
      board = Board.process_new({name: "Jokes", public: true}, {user: owner, key: entry[:root_slug]})
      expect(described_class).to_not receive(:fetch_bytes)

      result = described_class.import_entry!(entry, owner)

      expect(result[:status]).to eq(:skipped)
      expect(result[:board].id).to eq(board.id)
    end

    it 'imports from a local tmp file when S3 is missing' do
      owner = User.create(user_name: 'lingolinq')
      entry = {
        id: 'spec-local-board',
        local_filename: 'spec-local-board.obz',
        s3_key: 'system-boards/spec-local-board.obz',
        root_slug: 'spec-local-board'
      }
      local = described_class.local_path_for(entry)
      FileUtils.mkdir_p(File.dirname(local))
      File.write(local, 'fake')
      root = Board.process_new({name: "Spec Local", public: false}, {user: owner, key: 'spec-import-root'})

      allow(described_class).to receive(:fetch_bytes).and_return(nil)
      expect(Converters::LingoLinq).to receive(:from_obz).and_return([root])

      begin
        result = described_class.import_entry!(entry, owner)
        expect(result[:status]).to eq(:imported)
        expect(result[:source]).to eq(:local)
        expect(result[:board].reload.key).to eq(SystemBoardSources.board_key('spec-local-board'))
      ensure
        FileUtils.rm_f(local)
      end
    end

    it 'returns missing when neither S3 nor local file exists' do
      owner = User.create(user_name: 'lingolinq')
      entry = {
        id: 'missing-board',
        local_filename: 'definitely-missing-curated.obz',
        s3_key: 'system-boards/definitely-missing-curated.obz',
        root_slug: 'definitely-missing-curated'
      }
      allow(described_class).to receive(:fetch_bytes).and_return(nil)

      result = described_class.import_entry!(entry, owner)
      expect(result[:status]).to eq(:missing)
    end
  end

  describe 'OpenAAC skip wiring' do
    it 'removes curated overlaps from the default OpenAAC file list' do
      skips = described_class.openaac_skip_files
      files = [
        'quick-core-24.obz',
        'quick-core-40.obz',
        'quick-core-60.obz',
        'quick-core-84.obz',
        'quick-core-112.obz',
        'vocal-flair-24.obz',
        'vocal-flair-40.obz',
        'vocal-flair-60.obz',
        'vocal-flair-84.obz',
        'vocal-flair-84-with-keyboard.obz',
        'vocal-flair-112.obz',
        'sequoia-15.obz',
        'communikate-20.obz',
        'ck12.obz',
        'project-core.obf'
      ]
      filtered = files - skips
      expect(filtered).to include('quick-core-60.obz')
      expect(filtered).to include('vocal-flair-60.obz')
      expect(filtered).not_to include('communikate-20.obz')
      expect(filtered).not_to include('sequoia-15.obz')
      expect(filtered).not_to include('vocal-flair-84-with-keyboard.obz')
      expect(filtered).not_to include('project-core.obf')
    end
  end
end
