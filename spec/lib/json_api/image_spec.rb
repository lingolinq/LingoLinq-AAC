require 'spec_helper'

describe JsonApi::Image do
  it "should have defined pagination defaults" do
    expect(JsonApi::Image::TYPE_KEY).to eq('image')
    expect(JsonApi::Image::DEFAULT_PAGE).to eq(25)
    expect(JsonApi::Image::MAX_PAGE).to eq(50)
  end

  describe "build_json" do
    it "should not included unlisted settings" do
      i = ButtonImage.new(settings: {'hat' => 'black'})
      expect(JsonApi::Image.build_json(i).keys).not_to be_include('hat')
    end
    
    it "should include appropriate values" do
      i = ButtonImage.new(settings: {})
      ['id', 'url', 'license'].each do |key|
        expect(JsonApi::Image.build_json(i).keys).to be_include(key)
      end
    end
    
    it "should include permissions" do
      u = User.new
      i = ButtonImage.new(settings: {})
      json = JsonApi::Image.build_json(i, :permissions => u)
      expect(json['permissions']['view']).to eq(true)
    end

    it "should return metadata for pending uploads" do
      i = ButtonImage.new(settings: {'hat' => 'black', 'content_type' => 'image/png', 'pending' => true, 'pending_url' => 'http://www.pic.com'})
      i.instance_variable_set('@remote_upload_possible', true)
      i.save
      expect(i.pending_upload?).to eq(true)
      json = JsonApi::Image.as_json(i, :wrapper => true)
      expect(json['meta']).not_to eq(nil)
      expect(json['meta']['remote_upload']).not_to eq(nil)
    end

    it 'should revert to a fallback image if the protected_source is not in the provided list' do
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {'protected' => true, 'protected_source' => 'asdf'})
      hash = JsonApi::Image.build_json(i, :allowed_sources => ['qwert'])
      expect(hash['url']).to eq(nil)
      expect(hash['protected']).to eq(false)
      expect(hash['protected_source']).to eq(nil)
      expect(hash['fallback']).to eq(true)
    end

    it 'should revert to a fallback image if no list provided and the user does not have access to the protected_source' do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {'protected' => true, 'protected_source' => 'asdf'})
      hash = JsonApi::Image.build_json(i, :permissions => u)
      expect(hash['url']).to eq(nil)
      expect(hash['protected']).to eq(false)
      expect(hash['protected_source']).to eq(nil)
      expect(hash['fallback']).to eq(true)
    end

    it 'should use the protected source if allowed for one of the supervisees' do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u, u2)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u2.global_id})
      u2.reload
      u.reload
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {'protected' => true, 'protected_source' => 'pcs'})
      hash = JsonApi::Image.build_json(i, :permissions => u)
      expect(hash['url']).to eq('http://www.example.com/pic.png')
      expect(hash['protected']).to eq(true)
      expect(hash['protected_source']).to eq('pcs')
      expect(hash['fallback']).to eq(nil)
    end

    it 'should return the actual image if allowed for the user' do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {'protected' => true, 'protected_source' => 'pcs'})
      hash = JsonApi::Image.build_json(i, :permissions => u)
      expect(hash['url']).to eq('http://www.example.com/pic.png')
      expect(hash['protected']).to eq(true)
      expect(hash['protected_source']).to eq('pcs')
      expect(hash['fallback']).to eq(nil)
    end

    it 'should return the actual image if in the provided list' do
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {'protected' => true, 'protected_source' => 'asdf'})
      hash = JsonApi::Image.build_json(i, :allowed_sources => ['asdf'])
      expect(hash['url']).to eq('http://www.example.com/pic.png')
      expect(hash['protected']).to eq(true)
      expect(hash['protected_source']).to eq('asdf')
      expect(hash['fallback']).to eq(nil)
    end

    it 'should include correct alternates' do
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {
        'protected' => true, 'protected_source' => 'asdf',
        'library_alternates' => {
          'symbolstix' => {
            'url' => 'http://www.example.com/symbolstix/pic.png'
          }
        }
      })
      hash = JsonApi::Image.build_json(i, :include_other_sources => true, :allowed_sources => ['asdf', 'symbolstix'], :preferred_source => 'xx')
      expect(hash['url']).to eq('http://www.example.com/pic.png')
      expect(hash['protected']).to eq(true)
      expect(hash['protected_source']).to eq('asdf')
      # Alternates without license inherit main image license
      expect(hash['alternates']).to eq([
        {'content_type' => nil, 'library' => 'symbolstix', 'license' => {'type' => 'private'}, 'url' => 'http://www.example.com/symbolstix/pic.png'},
        {'content_type' => nil, 'library' => 'original', 'license' => {'type'=> 'private'}, 'url' => 'http://www.example.com/pic.png'},
        {'content_type' => nil, 'library' => 'asdf', 'license' => {'type' => 'private'}, 'url' => 'http://www.example.com/pic.png'},
      ])
    end

    it 'should return the preferred library as default if specified' do
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {
        'protected' => true, 'protected_source' => 'asdf',
        'library_alternates' => {
          'symbolstix' => {
            'url' => 'http://www.example.com/symbolstix/pic.png'
          }
        }
      })
      hash = JsonApi::Image.build_json(i, :include_other_sources => true, :allowed_sources => ['asdf', 'symbolstix'], :preferred_source => 'symbolstix')
      expect(hash['url']).to eq('http://www.example.com/symbolstix/pic.png')
      expect(hash['protected']).to eq(true)
      expect(hash['protected_source']).to eq('symbolstix')
      # Alternates without license inherit main image license
      expect(hash['alternates']).to eq([
        {'content_type' => nil, 'library' => 'symbolstix', 'license' => {'type' => 'private'}, 'url' => 'http://www.example.com/symbolstix/pic.png'},
        {'content_type' => nil, 'library' => 'original', 'license' => {'type'=> 'private'}, 'url' => 'http://www.example.com/pic.png'},
        {'content_type' => nil, 'library' => 'asdf', 'license' => {'type' => 'private'}, 'url' => 'http://www.example.com/pic.png'},
      ])
    end

    it 'should include an original alternate when default is changed' do
      i = ButtonImage.new(url: 'http://www.example.com/pic.png', settings: {
        'protected' => true, 'protected_source' => 'asdf',
        'library_alternates' => {
          'symbolstix' => {
            'url' => 'http://www.example.com/symbolstix/pic.png'
          }
        }
      })
      hash = JsonApi::Image.build_json(i, :include_other_sources => true, :allowed_sources => ['asdf', 'symbolstix'], :preferred_source => 'symbolstix')
      expect(hash['url']).to eq('http://www.example.com/symbolstix/pic.png')
      expect(hash['protected']).to eq(true)
      expect(hash['protected_source']).to eq('symbolstix')
      # Alternates without license inherit main image license
      expect(hash['alternates']).to eq([
        {'content_type' => nil, 'library' => 'symbolstix', 'license' => {'type' => 'private'}, 'url' => 'http://www.example.com/symbolstix/pic.png'},
        {'content_type' => nil, 'library' => 'original', 'license' => {'type'=> 'private'}, 'url' => 'http://www.example.com/pic.png'},
        {'content_type' => nil, 'library' => 'asdf', 'license' => {'type' => 'private'}, 'url' => 'http://www.example.com/pic.png'},
      ])
    end
  end
end
