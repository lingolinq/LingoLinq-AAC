require 'spec_helper'
require Rails.root.join('lib/converters/api_json_bundle')

describe Converters::ApiJsonBundle do
  def api_board_payload(id:, name:, key:, load_target: nil)
    buttons = [{ 'id' => 1, 'label' => name, 'image_id' => nil }]
    if load_target
      buttons << {
        'id' => 2,
        'label' => 'open',
        'load_board' => { 'id' => load_target[:id], 'key' => load_target[:key] }
      }
    end
    {
      'board' => {
        'id' => id,
        'key' => key,
        'name' => name,
        'locale' => 'en',
        'public' => false,
        'visibility' => 'private',
        'buttons' => buttons,
        'grid' => {
          'rows' => 2,
          'columns' => 2,
          'order' => [[1, 2], [nil, nil]]
        }
      },
      'images' => [],
      'sounds' => []
    }
  end

  describe '.import' do
    it 'imports a linked JSON bundle and rewires load_board links' do
      user = User.create
      child_source_id = '1_999_abc'
      child_key = 'source/child-board'
      root_key = 'source/root-board'
      bundle = {
        'root' => root_key,
        'boards' => [
          { 'key' => root_key, 'data' => api_board_payload(id: '1_100_root', name: 'Root', key: root_key, load_target: { id: child_source_id, key: child_key }) },
          { 'key' => child_key, 'data' => api_board_payload(id: child_source_id, name: 'Child', key: child_key) }
        ]
      }

      boards = Converters::ApiJsonBundle.import(bundle, user)
      expect(boards.length).to eq(2)

      root = boards.find { |b| b.settings['name'] == 'Root' }
      child = boards.find { |b| b.settings['name'] == 'Child' }
      expect(root).to be_present
      expect(child).to be_present
      expect(root.settings['copy_id']).to eq(root.global_id)

      folder = root.buttons.find { |btn| btn['load_board'] }
      expect(folder).to be_present
      expect(folder['load_board']['id']).to eq(child.global_id)
      expect(folder['load_board']['key']).to eq(child.key)
    end

    it 'marks imported button images to preserve the exported source file' do
      user = User.create
      image_id = '1_555_teacher'
      root_key = 'source/root-board'
      bundle = {
        'root' => root_key,
        'boards' => [
          {
            'key' => root_key,
            'data' => {
              'board' => {
                'id' => '1_100_root',
                'key' => root_key,
                'name' => 'Teachers',
                'locale' => 'en',
                'buttons' => [{ 'id' => 1, 'label' => 'Miss Shanan', 'image_id' => image_id }],
                'grid' => { 'rows' => 1, 'columns' => 1, 'order' => [[1]] }
              },
              'images' => [{
                'id' => image_id,
                'url' => 'https://s3.amazonaws.com/coughdrop-usercontent/images/teacher.png',
                'content_type' => 'image/png'
              }],
              'sounds' => []
            }
          }
        ]
      }

      boards = Converters::ApiJsonBundle.import(bundle, user)
      board = boards.first
      button = board.buttons.first
      image = ButtonImage.find_by_global_id(button['image_id'])

      expect(image).to be_present
      expect(image.settings['preserve_source_image']).to eq(true)
      expect(image.needs_library_url_enrichment?).to eq(false)
      expect(image.skin_capable_url).to eq(nil)
    end

    it 'imports button sounds when sounds[] stubs are filled from sound_urls' do
      user = User.create
      sound_url = 'https://example.com/rimshot.mp3'
      allow(SafeHttp).to receive(:get).and_return(
        OpenStruct.new(success?: true, code: 200, body: 'ID3fake', headers: { 'Content-Type' => 'audio/mpeg' })
      )
      allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(success?: true, code: 200, body: 'ok'))

      bundle = {
        'root' => 'source/joke',
        'boards' => [
          {
            'key' => 'source/joke',
            'data' => {
              'board' => {
                'id' => '1_100_root',
                'key' => 'source/joke',
                'name' => 'Joke',
                'locale' => 'en',
                'buttons' => [{ 'id' => 1, 'label' => 'rimshot', 'sound_id' => '1_99_snd' }],
                'grid' => { 'rows' => 1, 'columns' => 1, 'order' => [[1]] },
                'sound_urls' => { '1_99_snd' => sound_url }
              },
              'images' => [],
              'sounds' => [{ 'id' => '1_99_snd' }]
            }
          }
        ]
      }

      boards = described_class.import(bundle, user)
      button = boards.first.buttons.first
      expect(button['sound_id']).to be_present
      sound = ButtonSound.find_by_global_id(button['sound_id'])
      expect(sound).to be_present
      expect(sound.url).to be_present
      expect(sound.settings['pending']).to eq(false)
    end
  end

  describe '.validate!' do
    it 'rejects bundles without boards' do
      expect { described_class.validate!({ 'boards' => [] }) }.to raise_error(Progress::ProgressError, /missing boards/)
    end
  end

  describe '.load_bundle' do
    it 'rejects remote URLs that are not the importer bundle upload path' do
      importer = User.create
      url = 'https://www.example.com/imports/boards/evil/bundle-abc.json'
      expect {
        described_class.load_bundle(url, allowed_importer_global_id: importer.global_id)
      }.to raise_error(Progress::ProgressError, /invalid import bundle URL/)
    end

    it 'presigns uploads-bucket bundle URLs before downloading' do
      importer = User.create
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'
      url = "https://#{uploads_bucket}.s3.amazonaws.com/imports/boards/#{importer.global_id}/bundle-abc.json"
      signed = 'https://signed.example.com/bundle?X-Amz-Signature=abc'
      allow(Uploader).to receive(:valid_import_bundle_url?).with(url, importer.global_id).and_return(true)
      allow(Uploader).to receive(:sanitize_url).with(url).and_return(url)
      expect(Uploader).to receive(:signed_internal_url).with(url).and_return(signed)
      allow(SafeHttp).to receive(:head).with(signed).and_return(double('head', success?: true, headers: {}))
      allow(SafeHttp).to receive(:get).with(signed).and_return(double('get', success?: true, body: '{"boards":[]}', code: 200))

      result = described_class.load_bundle(url, allowed_importer_global_id: importer.global_id)
      expect(result['boards']).to eq([])
    end

    it 'falls back to the canonical bundle URL when presigning returns blank' do
      importer = User.create
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'
      url = "https://#{uploads_bucket}.s3.amazonaws.com/imports/boards/#{importer.global_id}/bundle-abc.json"
      allow(Uploader).to receive(:valid_import_bundle_url?).with(url, importer.global_id).and_return(true)
      allow(Uploader).to receive(:sanitize_url).with(url).and_return(url)
      allow(Uploader).to receive(:signed_internal_url).with(url).and_return('')
      allow(SafeHttp).to receive(:head).with(url).and_return(double('head', success?: true, headers: {}))
      allow(SafeHttp).to receive(:get).with(url).and_return(double('get', success?: true, body: '{"boards":[]}', code: 200))

      result = described_class.load_bundle(url, allowed_importer_global_id: importer.global_id)
      expect(result['boards']).to eq([])
    end

    it 'rejects bundles larger than MAX_BUNDLE_BYTES' do
      importer = User.create
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'
      url = "https://#{uploads_bucket}.s3.amazonaws.com/imports/boards/#{importer.global_id}/bundle-abc.json"
      allow(Uploader).to receive(:valid_import_bundle_url?).with(url, importer.global_id).and_return(true)
      allow(Uploader).to receive(:sanitize_url).with(url).and_return(url)
      allow(Uploader).to receive(:signed_internal_url).with(url).and_return(url)
      head = double('head', success?: true, headers: { 'Content-Length' => (described_class::MAX_BUNDLE_BYTES + 1).to_s })
      allow(SafeHttp).to receive(:head).with(url).and_return(head)

      expect {
        described_class.load_bundle(url, allowed_importer_global_id: importer.global_id)
      }.to raise_error(Progress::ProgressError, /exceeds maximum size/)
    end

    it 'rejects non-JSON bundle bodies' do
      importer = User.create
      uploads_bucket = ENV['UPLOADS_S3_BUCKET'] || 'lingolinq-dev-uploads'
      url = "https://#{uploads_bucket}.s3.amazonaws.com/imports/boards/#{importer.global_id}/bundle-abc.json"
      allow(Uploader).to receive(:valid_import_bundle_url?).with(url, importer.global_id).and_return(true)
      allow(Uploader).to receive(:sanitize_url).with(url).and_return(url)
      allow(Uploader).to receive(:signed_internal_url).with(url).and_return(url)
      allow(SafeHttp).to receive(:head).with(url).and_return(double('head', success?: true, headers: {}))
      allow(SafeHttp).to receive(:get).with(url).and_return(double('get', success?: true, body: '<html></html>', code: 200))

      expect {
        described_class.load_bundle(url, allowed_importer_global_id: importer.global_id)
      }.to raise_error(Progress::ProgressError, /not valid JSON/)
    end

    it 'rejects malformed JSON bundle bodies' do
      expect {
        described_class.load_bundle('{not json')
      }.to raise_error(Progress::ProgressError, /not valid JSON/)
    end

    it 'rejects inline bundles larger than MAX_BUNDLE_BYTES' do
      stub_const('Converters::ApiJsonBundle::MAX_BUNDLE_BYTES', 10)
      expect {
        described_class.load_bundle('{"boards":[]}' + (' ' * 5))
      }.to raise_error(Progress::ProgressError, /exceeds maximum size/)
    end

    it 'rejects local bundle files larger than MAX_BUNDLE_BYTES' do
      stub_const('Converters::ApiJsonBundle::MAX_BUNDLE_BYTES', 10)
      path = Rails.root.join('tmp', "oversized-bundle-#{SecureRandom.hex(8)}.json")
      File.binwrite(path, '{"boards":[]}' + (' ' * 5))
      expect {
        described_class.load_bundle(path.to_s)
      }.to raise_error(Progress::ProgressError, /exceeds maximum size/)
    ensure
      File.delete(path) if path && File.exist?(path)
    end
  end

  describe '.normalize_sound' do
    it 'stringifies numeric sound ids for sounds_hash key consistency' do
      normalized = described_class.normalize_sound({ 'id' => 42, 'url' => 'https://example.com/a.mp3' })
      expect(normalized['id']).to eq('42')
    end

    it 'encodes sound urls and preserves data: URIs' do
      normalized = described_class.normalize_sound({
        'id' => '1_9',
        'url' => 'https://example.com/path with spaces/a.mp3',
        'data_url' => 'data:audio/mpeg;base64,AAA'
      })
      expect(normalized['url']).to include('path%20with%20spaces')
      expect(normalized['data']).to eq('data:audio/mpeg;base64,AAA')
    end

    it 'does not promote authed /api/v1/sounds data_urls into fetchable urls' do
      normalized = described_class.normalize_sound({
        'id' => '1_9',
        'data_url' => 'https://app.mycoughdrop.com/api/v1/sounds/1_9'
      })
      expect(normalized['url']).to be_nil
      expect(normalized['data']).to be_nil
    end
  end

  describe '.entry_payload' do
    it 'builds images from board.image_urls when API omitted images[]' do
      entry = {
        'key' => 'source/root-board',
        'data' => {
          'board' => {
            'id' => '1_100_root',
            'key' => 'source/root-board',
            'buttons' => [{ 'id' => 1, 'label' => 'eat', 'image_id' => '1_555_img' }],
            'image_urls' => { '1_555_img' => 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/lunch 2.svg' }
          },
          'images' => [],
          'sounds' => []
        }
      }

      payload = described_class.entry_payload(entry)
      expect(payload[:images].length).to eq(1)
      expect(payload[:images][0]['id']).to eq('1_555_img')
      expect(payload[:images][0]['url']).to include('lunch%202.svg')
    end

    it 'fills stub sounds[] urls from board.sound_urls' do
      entry = {
        'key' => 'source/joke',
        'data' => {
          'board' => {
            'id' => '1_100_root',
            'key' => 'source/joke',
            'buttons' => [{ 'id' => 1, 'label' => 'rimshot', 'sound_id' => '1_99_snd' }],
            'sound_urls' => { '1_99_snd' => 'https://example.com/rimshot.mp3' }
          },
          'images' => [],
          'sounds' => [{ 'id' => '1_99_snd' }]
        }
      }

      payload = described_class.entry_payload(entry)
      expect(payload[:sounds].length).to eq(1)
      expect(payload[:sounds][0]['id']).to eq('1_99_snd')
      expect(payload[:sounds][0]['url']).to eq('https://example.com/rimshot.mp3')
    end
  end

  describe '.build_nested_content' do
    it 'collects synthesized images into the top-level images array' do
      bundle = {
        'root' => 'source/root-board',
        'boards' => [
          {
            'key' => 'source/root-board',
            'data' => {
              'board' => {
                'id' => '1_100_root',
                'key' => 'source/root-board',
                'buttons' => [{ 'id' => 1, 'label' => 'eat', 'image_id' => '1_555_img' }],
                'image_urls' => { '1_555_img' => 'https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/lunch%202.svg' }
              },
              'images' => [],
              'sounds' => []
            }
          }
        ]
      }

      content = described_class.build_nested_content(described_class.validate!(bundle))
      expect(content['images'].length).to eq(1)
      expect(content['boards'][0]['images_hash']['1_555_img']).to be_present
    end

    it 'collects filled stub sounds into the top-level sounds array' do
      bundle = {
        'root' => 'source/joke',
        'boards' => [
          {
            'key' => 'source/joke',
            'data' => {
              'board' => {
                'id' => '1_100_root',
                'key' => 'source/joke',
                'buttons' => [{ 'id' => 1, 'label' => 'rimshot', 'sound_id' => '1_99_snd' }],
                'sound_urls' => { '1_99_snd' => 'https://example.com/rimshot.mp3' }
              },
              'images' => [],
              'sounds' => [{ 'id' => '1_99_snd' }]
            }
          }
        ]
      }

      content = described_class.build_nested_content(described_class.validate!(bundle))
      expect(content['sounds'].length).to eq(1)
      expect(content['sounds'][0]['url']).to eq('https://example.com/rimshot.mp3')
      expect(content['boards'][0]['sounds_hash']['1_99_snd']['url']).to eq('https://example.com/rimshot.mp3')
    end
  end
end
