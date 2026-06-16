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
    end
  end

  describe '.validate!' do
    it 'rejects bundles without boards' do
      expect { described_class.validate!({ 'boards' => [] }) }.to raise_error(Progress::ProgressError, /missing boards/)
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
  end
end
