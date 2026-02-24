require 'spec_helper'
require Rails.root.join('lib', 'converters', 'lingo_linq')

describe Converters::LingoLinq do
  describe "to_obf" do
    it "should render a basic board" do
      u = User.create
      b = Board.create(:user => u)
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('Unnamed Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 4,
        'order' => [[nil, nil, nil, nil], [nil, nil, nil, nil]]
      })
      expect(json['buttons']).to eq([])
      expect(json['ext_lingolinq_settings']).to eq({
        'key' => b.key,
        'private' => true,
        'protected' => false,
        'word_suggestions' => false,
        'categories' => nil,
        'hide_empty' => nil,
        'text_only' => nil,
        'home_board' => nil
      })
    end
    
    it "should include buttons" do
      u = User.create
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken'},
        {'id' => 2, 'label' => 'nuggets'},
        {'id' => 3, 'label' => 'sauce', 'vocalization' => 'I like sauce'}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,2],[3,2]]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [[1, 2], [3, 2]]
      })
      expect(json['buttons'].length).to eq(3)
      expect(json['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'chicken',
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
      expect(json['buttons'][1]).to eq({
        'id' => 2,
        'label' => 'nuggets', 
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
      expect(json['buttons'][2]).to eq({
        'id' => 3,
        'label' => 'sauce', 
        'vocalization' => "I like sauce",
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
    end
    
    it "should link to external boards" do
      u = User.create
      ref = Board.create(:user => u)
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'load_board' => {'id' => ref.global_id, 'key' => ref.key}}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil]]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [[1, nil], [nil, nil]]
      })
      expect(json['buttons'].length).to eq(1)
      expect(json['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'chicken', 
        'load_board' => {
          'id' => ref.global_id, 
          'url' => "#{JsonApi::Json.current_host}/#{ref.key}", 
          'data_url' => "#{JsonApi::Json.current_host}/api/v1/boards/#{ref.key}"
        },
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
    end
    
    it "should convert vocalization extensions to actions" do
      u = User.create
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'vocalization' => '+chi'},
        {'id' => 2, 'label' => 'nuggets', 'vocalization' => ':space'},
        {'id' => 3, 'label' => 'sauce', 'vocalization' => 'I like sauce'},
        {'id' => 4, 'label' => 'blink', 'vocalization' => ':space && +wi && :home'},
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,2],[3,2]]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [[1, 2], [3, 2]]
      })
      expect(json['buttons'].length).to eq(4)
      expect(json['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'chicken', 
        'action' => '+chi',
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
      expect(json['buttons'][1]).to eq({
        'id' => 2,
        'label' => 'nuggets', 
        'action' => ':space',
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
      expect(json['buttons'][2]).to eq({
        'id' => 3,
        'label' => 'sauce', 
        'vocalization' => "I like sauce",
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
      expect(json['buttons'][3]).to eq({
        'id' => 4,
        'label' => 'blink', 
        'action' => ':space',
        'actions' => [':space', '+wi', ':home'],
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)'
      })
    end
    
    it "should include images and sounds inline" do
      res = OpenStruct.new(:success? => true, :body => "abc", :headers => {'Content-Type' => 'text/plaintext'})
      expect(OBF::Utils).to receive(:image_attrs).and_return({})
      h = {reqs: []}
      # expect(Typhoeus::Hydra).to receive(:hydra).and_return(h)
      # expect(h).to receive(:queue) do |req| 
      #   expect(req.url).to eq("http://example.com/pic.png")
      #   req.instance_variable_get('@on_complete').each do |block|
      #     block.call(res)
      #   end
      #   h[:reqs] << req
      # end
      # expect(h).to receive(:run).and_return(true)
      expect(Typhoeus).to receive(:get).with("http://example.com/pic.png", {:followlocation=>true}).and_return(res)
      expect(Typhoeus).to receive(:get).with("http://example.com/sound.mp3", {:followlocation=>true}).and_return(res)
      u = User.create
      i = ButtonImage.create(:user => u, :url => "http://example.com/pic.png", :settings => {'content_type' => 'text/plaintext'})
      s = ButtonSound.create(:user => u, :url => "http://example.com/sound.mp3", :settings => {'content_type' => 'text/plaintext'})
      ref = Board.create(:user => u)
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'image_id' => i.global_id, 'sound_id' => s.global_id}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil]]
      }
      b.settings['image_url'] = 'http://example.com/pic.png'
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(b.known_button_images.count).to eq(1)
      expect(b.button_sounds.count).to eq(1)
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b.reload, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      list = []
      list << {
        'id' => i.global_id,
        'license' => {'type' => 'private'},
        'url' => 'http://example.com/pic.png',
        'data_url' => "#{JsonApi::Json.current_host}/api/v1/images/#{i.global_id}",
        'content_type' => 'text/plaintext',
        'protected' => false,
        'data' => 'data:text/plaintext;base64,YWJj'
      }
      expect(json['images']).to eq(list)

      list = []
      list << {
        'id' => s.global_id,
        'license' => {'type' => 'private'},
        'url' => 'http://example.com/sound.mp3',
        'data_url' => "#{JsonApi::Json.current_host}/api/v1/sounds/#{s.global_id}",
        'content_type' => 'text/plaintext',
        'data' => 'data:text/plaintext;base64,YWJj'
      }
      expect(json['sounds']).to eq(list)
    end
    
    it "should export links to external urls" do
      u = User.create
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'url' => 'http://www.example.com'}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil],[nil,nil]]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [[1, nil], [nil, nil]]
      })
      expect(json['buttons'].length).to eq(1)
      expect(json['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'chicken', 
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)',
        'url' => 'http://www.example.com'
      })
    end
    
    it "should export links to external apps" do
      u = User.create
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'apps' => {'web' => {'launch_url' => 'http://www.example.com'}}}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil],[nil,nil]]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [[1, nil], [nil, nil]]
      })
      expect(json['buttons'].length).to eq(1)
      expect(json['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'chicken', 
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' =>  {'web' => {'launch_url' => 'http://www.example.com'}}
      })
    end
    
    it "should mark the board as protected, and specify the authorized user" do
      u = User.create
      u.settings['email'] = 'bob@example.com'
      u.save
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['protected'] = {
        'vocabulary' => true
      }
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'apps' => {'web' => {'launch_url' => 'http://www.example.com'}}}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil],[nil,nil]]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['ext_lingolinq_settings']).to eq({
        'key' => b.key,
        'private' => true,
        'protected' => true,
        'protected_user_id' => u.global_id,
        'word_suggestions' => false,
        'categories' => nil,
        'home_board' => nil,
        'hide_empty' => nil,
        'text_only' => nil
      })
      expect(json['protected_content_user_identifier']).to eq('bob@example.com')
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      expect(json['grid']).to eq({
        'rows' => 2,
        'columns' => 2,
        'order' => [[1, nil], [nil, nil]]
      })
      expect(json['buttons'].length).to eq(1)
      expect(json['buttons'][0]).to eq({
        'id' => 1,
        'label' => 'chicken', 
        'border_color' => 'rgb(170, 170, 170)',
        'background_color' => 'rgb(255, 255, 255)',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' =>  {'web' => {'launch_url' => 'http://www.example.com'}}
      })
    end

    it "should include translations and inflections" do
      u = User.create
      u.settings['email'] = 'bob@example.com'
      u.save
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'cat', 'vocalization' => 'it is a cat', 'inflections' => ['catty', 'catted']},
        {'id' => '2', 'label' => 'more'}
      ]
      b.settings['translations'] = {
        'default' => 'en',
        'current_label' => 'en',
        'current_vocalization' => 'en',
        'en' => {
          '1' => {
            'label' => 'cat',
            'vocalization' => 'it is a cat',
            'inflections' => ['catty', 'catted'],
            'inflection_defaults' => {'s' => 'catydid', 'se' => 'caterpillar'}
          },
          '2' => {
            'label' => 'more',
            'inflections' => [nil, nil, 'moreover'],
            'inflection_defaults' => {'ne' => 'morose'}
          }
        },
        'fr' => {
          '1' => {
            'label' => 'chat',
            'vocalization' => "c'est un chat",
            'inflections' => [nil, nil, nil, nil, nil, 'chateau'],
            'inflection_defaults' => {'n' => 'chats'}
          },
          '2' => {
            'label' => 'plus',
            'inflections' => ['minus'],
            'inflection_defaults' => {'s' => 'bien'}
          }
        }
      }
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [['1',nil],[nil,'2']]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['default_locale']).to eq('en')
      expect(json['label_locale']).to eq('en')
      expect(json['vocalization_locale']).to eq('en')
      expect(json['buttons'].length).to eq(2)
      expect(json['buttons'][0]['translations']).to eq({
        'en' => {
          'label' => 'cat',
          'vocalization' => 'it is a cat',
          'inflections' => {
            'n' => 'catted',
            'nw' => 'catty',
            's' => 'catydid',
            'se' => 'caterpillar',
            'ext_lingolinq_defaults' => ['s', 'se']
          }
        },
        'fr' => {
          'label' => 'chat',
          'vocalization' => "c'est un chat",
          'inflections' => {
            'n' => 'chats',
            'sw' => 'chateau',
            'ext_lingolinq_defaults' => ['n']
          }
        }
      })
      expect(json['buttons'][1]['translations']).to eq({
        'en' => {
          'label' => 'more',
          'inflections' => {
            'ne' => 'moreover'
          }
        },
        'fr' => {
          'label' => 'plus',
          'inflections' => {
            'nw' => 'minus',
            's' => 'bien',
            'ext_lingolinq_defaults' => ['s']
          }
        }
      })
    end

    it "should merge inflections with inflection_defaults" do
      u = User.create
      u.settings['email'] = 'bob@example.com'
      u.save
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'cat', 'vocalization' => 'it is a cat', 'inflections' => ['catty', 'catted']},
        {'id' => '2', 'label' => 'more'}
      ]
      b.settings['translations'] = {
        'default' => 'en',
        'current_label' => 'en',
        'current_vocalization' => 'en',
        'en' => {
          '1' => {
            'label' => 'cat',
            'vocalization' => 'it is a cat',
            'inflections' => ['catty', 'catted'],
            'inflection_defaults' => {'s' => 'catydid', 'se' => 'caterpillar'}
          },
          '2' => {
            'label' => 'more',
            'inflections' => [nil, nil, 'moreover'],
            'inflection_defaults' => {'ne' => 'morose'}
          }
        },
        'fr' => {
          '1' => {
            'label' => 'chat',
            'vocalization' => "c'est un chat",
            'inflections' => [nil, nil, nil, nil, nil, 'chateau'],
            'inflection_defaults' => {'n' => 'chats'}
          },
          '2' => {
            'label' => 'plus',
            'inflections' => ['minus'],
            'inflection_defaults' => {'s' => 'bien'}
          }
        }
      }
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [['1',nil],[nil,'2']]
      }
      b.save
      file = Tempfile.new("stash")
      Converters::LingoLinq.to_obf(b, file.path)
      json = JSON.parse(file.read)
      file.unlink
      expect(json['default_locale']).to eq('en')
      expect(json['label_locale']).to eq('en')
      expect(json['vocalization_locale']).to eq('en')
      expect(json['buttons'].length).to eq(2)
      expect(json['buttons'][0]['translations']).to eq({
        'en' => {
          'label' => 'cat',
          'vocalization' => 'it is a cat',
          'inflections' => {
            'n' => 'catted',
            'nw' => 'catty',
            's' => 'catydid',
            'se' => 'caterpillar',
            'ext_lingolinq_defaults' => ['s', 'se']
          }
        },
        'fr' => {
          'label' => 'chat',
          'vocalization' => "c'est un chat",
          'inflections' => {
            'n' => 'chats',
            'sw' => 'chateau',
            'ext_lingolinq_defaults' => ['n']
          }
        }
      })
      expect(json['buttons'][1]['translations']).to eq({
        'en' => {
          'label' => 'more',
          'inflections' => {
            'ne' => 'moreover'
          }
        },
        'fr' => {
          'label' => 'plus',
          'inflections' => {
            'nw' => 'minus',
            's' => 'bien',
            'ext_lingolinq_defaults' => ['s']
          }
        }
      })
    end
  end

  describe "from_obf" do
    it "should parse from a file" do
      u = User.create
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      b = Converters::LingoLinq.from_obf(path, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
      expect(b.key).to eq("#{u.user_name}/cool-board")
    end
    
    it "should parse from a hash" do
      u = User.create
      shell = OBF::Utils.obf_shell
      shell['id'] = '1234'
      shell['name'] = "Cool Board"
      b = Converters::LingoLinq.from_obf(shell, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
    end
    
    it "should find and connect to an existing board if linked on a button" do
      u = User.create
      original_board = Board.create(:user => u)
      shell = OBF::Utils.obf_shell
      shell['id'] = '9876'
      shell['buttons'] = [
        {'id' => '1', 'load_board' => {'id' => original_board.global_id, 'key' => original_board.key}}
      ]
      b = Converters::LingoLinq.from_obf(shell, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['buttons']).not_to be_empty
      expect(b.settings['buttons'][0]['load_board']).not_to eq(nil)
      expect(b.settings['buttons'][0]['load_board']['id']).to eq(original_board.global_id)
      expect(b.settings['buttons'][0]['load_board']['key']).to eq(original_board.key)
    end
    
    it "should not link up if the user doesn't have permission to create the link" do
      u = User.create
      u2 = User.create
      original_board = Board.create(:user => u2)
      shell = OBF::Utils.obf_shell
      shell['id'] = '9876'
      shell['buttons'] = [
        {'id' => '1', 'load_board' => {'id' => original_board.global_id, 'key' => original_board.key}}
      ]
      b = Converters::LingoLinq.from_obf(shell, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['buttons']).not_to be_empty
      expect(b.settings['buttons'][0]['load_board']).to eq(nil)
    end
    
    it "should find and connect to an existing image if matching by data_url"
    
    it "should find and connect to an existing sound if matching my data_url"
    
    it "should import external url links" do
      u = User.create
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      shell['buttons'] = [{
        'id' => '1',
        'label' => 'hardly',
        'url' => 'http://www.example.com'
      }]
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      b = Converters::LingoLinq.from_obf(path, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
      button = b.settings['buttons'][0]
      expect(button).not_to eq(nil)
      expect(button['url']).to eq('http://www.example.com')
    end
    
    it "should import external app links" do
      u = User.create
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      shell['buttons'] = [{
        'id' => '1',
        'label' => 'hardly',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' => {
          'a' => 1
        }
      }]
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      b = Converters::LingoLinq.from_obf(path, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
      button = b.settings['buttons'][0]
      expect(button).not_to eq(nil)
      expect(button['url']).to eq(nil)
      expect(button['apps']).to eq({'a' => 1})
    end
    
    it "should not allow importing a protected board for a different user than the original user" do
      u = User.create
      u.settings['email'] = 'fred@example.com'
      u.save
      u2 = User.create
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      shell['ext_lingolinq_settings'] = {
        'protected' => true,
        'key' => "#{u.user_name}/test"
      }
      shell['protected_content_user_identifier'] = 'bob@example.com'
      shell['buttons'] = [{
        'id' => '1',
        'label' => 'hardly',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' => {
          'a' => 1
        }
      }]
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      expect{ Converters::LingoLinq.from_obf(path, {'user' => u2}) }.to raise_error("can't import protected boards to a different user")
    end
    
    it "should allow importing a protected board to the same user" do
      u = User.create
      u.settings['email'] = 'fred@example.com'
      u.save
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      shell['protected_content_user_identifier'] = 'fred@example.com'
      shell['ext_lingolinq_settings'] = {
        'protected' => true,
        'key' => "#{u.user_name}/test"
      }
      shell['buttons'] = [{
        'id' => '1',
        'label' => 'hardly',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' => {
          'a' => 1
        }
      }]
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      b = Converters::LingoLinq.from_obf(path, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
      button = b.settings['buttons'][0]
      expect(button).not_to eq(nil)
      expect(button['url']).to eq(nil)
      expect(button['apps']).to eq({'a' => 1})
    end

    it "should restore translations and inflections" do
      u = User.create
      u.settings['email'] = 'fred@example.com'
      u.save
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      shell['locale'] = 'en'
      shell['default_locale'] = 'en'
      shell['label_locale'] = 'en'
      shell['vocalization_locale'] = 'en'
      shell['protected_content_user_identifier'] = 'fred@example.com'
      shell['ext_lingolinq_settings'] = {
        'protected' => true,
        'key' => "#{u.user_name}/test"
      }
      shell['buttons'] = [{
        'id' => '1',
        'label' => 'hardly',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' => {
          'a' => 1
        },
        'translations' => {
          'en' => {
            'label' => 'hardly'
          }
        }
      }, {
        'id' => '2',
        'label' => 'apple',
        'translations' => {
          'en' => {
            'label' => 'apple',
            'inflections' => {
              'a' => 'asdf',
              'n' => 'qwer'
            }
          },
          'fr' => {
            'label' => 'pomme',
            'inflections' => {
              'nw' => 'pomodor',
              's' => 'pomme de terre',
              'ext_lingolinq_defaults' => ['nw']
            }
          }
        }
      }]      
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      b = Converters::LingoLinq.from_obf(path, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
      expect(b.settings['locale']).to eq('en')
      expect(b.settings['buttons'].length).to eq(2)
      expect(b.settings['buttons'][0]).to include(
        'apps' => {'a' => 1},
        'background_color' => nil,
        'border_color' => nil,
        'id' => '1',
        'label' => 'hardly'
      )
      expect(b.settings['buttons'][0]['hidden']).to be_in([nil, false])
      expect(b.settings['buttons'][1]).to include(
        'background_color' => nil,
        'border_color' => nil,
        'id' => '2',
        'label' => 'apple'
      )
      expect(b.settings['buttons'][1]['hidden']).to be_in([nil, false])
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'en',
        'current_vocalization' => 'en',
        "board_name" => {"en"=>"Cool Board"},
        '2' => {
          'en' => {
            'label' => 'apple',
            'inflections' => [nil, 'qwer']
          },
          'fr' => {
            'label' => 'pomme',
            'inflections' => [nil, nil, nil, nil, nil, nil, 'pomme de terre']
          }
        }
      })
    end

    it "should pull out inflection_defaults from overrides when available" do
      u = User.create
      u.settings['email'] = 'fred@example.com'
      u.save
      path = OBF::Utils.temp_path("stash")
      shell = OBF::Utils.obf_shell
      shell['id'] = '2345'
      shell['name'] = "Cool Board"
      shell['locale'] = 'en'
      shell['default_locale'] = 'en'
      shell['label_locale'] = 'en'
      shell['vocalization_locale'] = 'en'
      shell['protected_content_user_identifier'] = 'fred@example.com'
      shell['ext_lingolinq_settings'] = {
        'protected' => true,
        'key' => "#{u.user_name}/test"
      }
      shell['buttons'] = [{
        'id' => '1',
        'label' => 'hardly',
        'url' => 'http://www.example.com',
        'ext_lingolinq_apps' => {
          'a' => 1
        },
        'translations' => {
          'en' => {
            'label' => 'hardly'
          }
        }
      }, {
        'id' => '2',
        'label' => 'apple',
        'translations' => {
          'en' => {
            'label' => 'apple',
            'inflections' => {
              'a' => 'asdf',
              'n' => 'qwer'
            }
          },
          'fr' => {
            'label' => 'pomme',
            'inflections' => {
              'nw' => 'pomodor',
              's' => 'pomme de terre',
              'ext_lingolinq_defaults' => ['nw']
            }
          }
        }
      }]      
      File.open(path, 'w') do |f|
        f.puts shell.to_json
      end
      b = Converters::LingoLinq.from_obf(path, {'user' => u})
      expect(b).to be_is_a(Board)
      expect(b.settings['name']).to eq("Cool Board")
      expect(b.settings['locale']).to eq('en')
      expect(b.settings['buttons'].length).to eq(2)
      expect(b.settings['buttons'][0]).to include(
        'apps' => {'a' => 1},
        'background_color' => nil,
        'border_color' => nil,
        'id' => '1',
        'label' => 'hardly'
      )
      expect(b.settings['buttons'][0]['hidden']).to be_in([nil, false])
      expect(b.settings['buttons'][1]).to include(
        'background_color' => nil,
        'border_color' => nil,
        'id' => '2',
        'label' => 'apple'
      )
      expect(b.settings['buttons'][1]['hidden']).to be_in([nil, false])
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'en',
        'current_vocalization' => 'en',
        "board_name" => {"en"=>"Cool Board"},
        '2' => {
          'en' => {
            'label' => 'apple',
            'inflections' => [nil, 'qwer']
          },
          'fr' => {
            'label' => 'pomme',
            'inflections' => [nil, nil, nil, nil, nil, nil, 'pomme de terre']
          }
        }
      })
    end
  end

  describe "to_obz" do
    it "should build without errors" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{
        'id' => '1', 'load_board' => {'id' => b2.global_id}
      }]
      b.settings['grid'] = {
        'rows' => 1,
        'columns' => 1,
        'order' => [['1']]
      }
      b.save!
      path = OBF::Utils.temp_path("stash")
      Converters::LingoLinq.to_obz(b, path, {'user' => u})
      expect(File.exist?(path)).to eq(true)
      expect(File.size(path)).to be > 10
    end
    
    it "should include linked boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{
        'id' => '1', 'load_board' => {'id' => b2.global_id}
      }]
      b.settings['grid'] = {
        'rows' => 1,
        'columns' => 1,
        'order' => [['1']]
      }
      b.save!
      path = OBF::Utils.temp_path("stash")
      Converters::LingoLinq.to_obz(b, path, {'user' => u})
      expect(File.exist?(path)).to eq(true)
      expect(File.size(path)).to be > 10
      
      OBF::Utils.load_zip(path) do |zipper|
        manifest = JSON.parse(zipper.read('manifest.json'))
        expect(manifest['root']).not_to eq(nil)
        board = JSON.parse(zipper.read(manifest['root'])) rescue nil
        expect(board).not_to eq(nil)
        expect(board['buttons']).not_to eq(nil)
        expect(board['buttons'][0]).not_to eq(nil)
        expect(board['buttons'][0]['load_board']['path']).not_to eq(nil)
        board2 = JSON.parse(zipper.read(board['buttons'][0]['load_board']['path'])) rescue nil
        expect(board2).not_to eq(nil)
      end
    end

    it "should not include linked boards if the user doesn't have access privileges" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b.settings['buttons'] = [{
        'id' => '1', 'load_board' => {'id' => b2.global_id}
      }]
      b.settings['grid'] = {
        'rows' => 1,
        'columns' => 1,
        'order' => [['1']]
      }
      b.save!
      expect(b.settings['buttons'][0]['load_board']['id']).to eq(b2.global_id)
      expect(b2.reload.allows?(u, 'view')).to eq(false)
      
      path = OBF::Utils.temp_path("stash")
      Converters::LingoLinq.to_obz(b, path, {'user' => u})
      expect(File.exist?(path)).to eq(true)
      expect(File.size(path)).to be > 10
      
      OBF::Utils.load_zip(path) do |zipper|
        manifest = JSON.parse(zipper.read('manifest.json'))
        expect(manifest['root']).to eq("board_#{b.global_id}.obf")
        board = JSON.parse(zipper.read(manifest['root'])) rescue nil
        expect(board).not_to eq(nil)
        expect(board['buttons']).not_to eq(nil)
        expect(board['buttons'][0]).not_to eq(nil)
        expect(board['buttons'][0]['load_board']['path']).to eq(nil)
        expect(zipper.read("board_#{b2.global_id}.obf")).to eq(nil)
      end
    end
    
    it "should include images" do
      res = OpenStruct.new(:success? => true, :body => "abc", :headers => {'Content-Type' => 'text/plaintext'})
      expect(OBF::Utils).to receive(:image_attrs).and_return({})

      h = {reqs: []}
      # expect(Typhoeus::Hydra).to receive(:hydra).and_return(h)
      # expect(h).to receive(:queue) do |req| 
      #   expect(req.url).to eq("http://example.com/pic.png")
      #   req.instance_variable_get('@on_complete').each do |block|
      #     block.call(res)
      #   end
      #   h[:reqs] << req
      # end
      # expect(h).to receive(:run).and_return(true)
      expect(Typhoeus).to receive(:get).with("http://example.com/pic.png", {:followlocation=>true}).and_return(res)
      expect(Typhoeus).to receive(:get).with("http://example.com/sound.mp3", {:followlocation=>true}).and_return(res)
      u = User.create
      i = ButtonImage.create(:user => u, :url => "http://example.com/pic.png", :settings => {'content_type' => 'text/plaintext'})
      s = ButtonSound.create(:user => u, :url => "http://example.com/sound.mp3", :settings => {'content_type' => 'text/plaintext'})
      ref = Board.create(:user => u)
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'image_id' => i.global_id, 'sound_id' => s.global_id}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil]]
      }
      b.settings['image_url'] = 'http://example.com/pic.png'
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(b.known_button_images.count).to eq(1)
      expect(b.button_sounds.count).to eq(1)

      path = OBF::Utils.temp_path("stash")
      Converters::LingoLinq.to_obz(b.reload, path, {'user' => u})
      
      OBF::Utils.load_zip(path) do |zipper|
        manifest = JSON.parse(zipper.read('manifest.json'))
        json = JSON.parse(zipper.read(manifest['root']))
        expect(json['id']).to eq(b.global_id)
        expect(json['name']).to eq('My Board')
        expect(json['default_layout']).to eq('landscape')
        expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
        expect(json['data_url']).to eq("#{JsonApi::Json.current_host}/api/v1/boards/#{b.key}")
        list = []
        list << {
          'id' => i.global_id,
          'license' => {'type' => 'private'},
          'url' => 'http://example.com/pic.png',
          'data_url' => "#{JsonApi::Json.current_host}/api/v1/images/#{i.global_id}",
          'content_type' => 'text/plaintext',
          'protected' => false,
          'path' => "images/image_#{i.global_id}"
        }
        expect(json['images']).to eq(list)

        list = []
        list << {
          'id' => s.global_id,
          'license' => {'type' => 'private'},
          'url' => 'http://example.com/sound.mp3',
          'data_url' => "#{JsonApi::Json.current_host}/api/v1/sounds/#{s.global_id}",
          'content_type' => 'text/plaintext',
          'path' => "sounds/sound_#{s.global_id}"
        }
        expect(json['sounds']).to eq(list)
      end
    end
  end

  describe "from_obz" do
    it "should parse" do
      u = User.create
      b = Board.create(:user => u, :key => 'user/robert')
      expect(b.key).to eql('user/robert')
      b2 = Board.create(:user => u, :key => 'user/susan')
      expect(b2.key).to eql('user/susan')
      b.settings['buttons'] = [{
        'id' => '1', 'load_board' => {'id' => b2.global_id}
      }]
      b.settings['grid'] = {
        'rows' => 1,
        'columns' => 1,
        'order' => [['1']]
      }
      b.save!
      path = OBF::Utils.temp_path("stash")
      Converters::LingoLinq.to_obz(b, path, {'user' => u})
      expect(File.exist?(path)).to eq(true)
      expect(File.size(path)).to be > 10
      
      boards = Converters::LingoLinq.from_obz(path, {'user' => u})
      expect(boards).not_to eq(nil)
      expect(boards.length).to eq(2)
      expect(boards[0].id).not_to eq(b.id)
      expect(boards[0].id).not_to eq(b2.id)
      expect(boards[0].key).to eq("#{u.user_name}/robert")
      expect(boards[1].id).not_to eq(b.id)
      expect(boards[1].id).not_to eq(b2.id)
      expect(boards[1].key).to eq("#{u.user_name}/susan")
    end
  end
  
  describe "from_external" do
    it "should process multiple actions" do
      u = User.create
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'asdf', 'actions' => [':bacon', '+wee', ':home']},
          {'id' => '3', 'label' => 'three'}
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(2)
      expect(board.settings['buttons'][0]['label']).to eq('asdf')
      expect(board.settings['buttons'][0]['vocalization']).to eq(':bacon && +wee && :home')
      expect(board.settings['buttons'][1]['label']).to eq('three')
      expect(board.settings['buttons'][1]['vocalization']).to eq(nil)
    end

    it "should process a single action" do
      u = User.create
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'asdf', 'action' => ':bacon'}
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(1)
      expect(board.settings['buttons'][0]['label']).to eq('asdf')
      expect(board.settings['buttons'][0]['vocalization']).to eq(':bacon')
    end

    it "should process multiple actions" do
      u = User.create
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'asdf', 'actions' => [':bacon', '+wee', ':home']}
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(1)
      expect(board.settings['buttons'][0]['label']).to eq('asdf')
      expect(board.settings['buttons'][0]['vocalization']).to eq(':bacon && +wee && :home')
    end

    it "should process actions and a vocalization" do
      u = User.create
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'asdf', 'actions' => [':bacon', '+wee', ':home'], 'vocalization' => 'I have a good day'}
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(1)
      expect(board.settings['buttons'][0]['label']).to eq('asdf')
      expect(board.settings['buttons'][0]['vocalization']).to eq('I have a good day && :bacon && +wee && :home')
    end

    it "should use existing images and skip unauthorized protected images" do
      u = User.create
      u.settings['extras_disabled'] = true
      u.save
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'cat', 'image_id' => '111'},
          {'id' => '3', 'label' => 'hat', 'image_id' => '222'}
        ],
        'images' => [
          {'id' => '111', 'data' => 'data:text/plaintext;base64,YWJj'},
          {'id' => '222', 'data' => 'data:text/plaintext;base64,YWJj', 'protected' => true, 'protected_source' => 'symbolstix'},
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(2)
      expect(board.settings['buttons'][0]['label']).to eq('cat')
      expect(board.settings['buttons'][0]['image_id']).to_not eq(nil)
      expect(board.settings['buttons'][1]['label']).to eq('hat')
      expect(board.settings['buttons'][1]['image_id']).to eq(nil)
    end

    it "should allow authorized protected images" do
      u = User.create
      expect(u).to receive(:enabled_protected_sources).with(true).and_return(['imagey'])
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'cat', 'image_id' => '111'},
          {'id' => '3', 'label' => 'hat', 'image_id' => '222'}
        ],
        'images' => [
          {'id' => '111', 'data' => 'data:text/plaintext;base64,YWJj'},
          {'id' => '222', 'data' => 'data:text/plaintext;base64,YWJj', 'protected' => true, 'protected_source' => 'imagey'},
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(2)
      expect(board.settings['buttons'][0]['label']).to eq('cat')
      expect(board.settings['buttons'][0]['image_id']).to_not eq(nil)
      expect(board.settings['buttons'][1]['label']).to eq('hat')
      expect(board.settings['buttons'][1]['image_id']).to_not eq(nil)
    end

    it "should use the unskinned url if provided" do
      u = User.create
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'cat', 'image_id' => '111'},
          {'id' => '3', 'label' => 'hat', 'image_id' => '222'}
        ],
        'images' => [
          {'id' => '111', 'url' => 'https://www.example.com/pic.png'},
          {'id' => '222', 'url' => 'https://www.example.com/pic.png', 'ext_lingolinq_unskinned_url' => 'https://www.example.com/pic2.png'},
        ],
        'id' => 'asdfasdf'
      }
      board = Converters::LingoLinq.from_external(json, {'user' => u})
      expect(board).to_not eq(nil)
      expect(board.settings['buttons'].length).to eq(2)
      expect(board.settings['buttons'][0]['label']).to eq('cat')
      expect(board.settings['buttons'][0]['image_id']).to_not eq(nil)
      bi = ButtonImage.find_by_global_id(board.settings['buttons'][0]['image_id'])
      expect(bi).to_not eq(nil)
      expect(bi.settings['source_url']).to eq("https://www.example.com/pic.png")
      expect(board.settings['buttons'][1]['label']).to eq('hat')
      expect(board.settings['buttons'][1]['image_id']).to_not eq(nil)    
      bi = ButtonImage.find_by_global_id(board.settings['buttons'][1]['image_id'])
      expect(bi).to_not eq(nil)
      expect(bi.settings['source_url']).to eq("https://www.example.com/pic2.png")
    end

    it "should error without a user" do
      expect{ Converters::LingoLinq.from_external({}, {'user' => nil}) }.to raise_error("user required")
    end

    it "should error without an id" do
      u = User.create
      expect{ Converters::LingoLinq.from_external({}, {'user' => u}) }.to raise_error("missing id")
    end

    it "should raise an error when importing a protected board for the wrong user" do
      u = User.create
      json = {
        'buttons' => [
          {'id' => '2', 'label' => 'cat', 'image_id' => '111'},
          {'id' => '3', 'label' => 'hat', 'image_id' => '222'}
        ],
        'images' => [
          {'id' => '111', 'data' => 'data:text/plaintext;base64,YWJj'},
          {'id' => '222', 'data' => 'data:text/plaintext;base64,YWJj', 'protected' => true, 'protected_source' => 'imagey'},
        ],
        'id' => 'asdfasdf',
        'ext_lingolinq_settings' => {
          'protected' => true,
          'key' => 'nobody/else',
          'protected_user_id' => '1111'
        }
      }
      expect { Converters::LingoLinq.from_external(json, {'user' => u}) }.to raise_error("can't import protected boards to a different user")
    end

    it "should allow supervisor with edit permission to import protected board" do
      board_owner = User.create(:user_name => 'communicator')
      supervisor = User.create(:user_name => 'therapist')
      User.link_supervisor_to_user(supervisor, board_owner, nil, true)
      json = {
        'buttons' => [{'id' => '1', 'label' => 'cat', 'image_id' => '111'}],
        'images' => [{'id' => '111', 'data' => 'data:text/plaintext;base64,YWJj', 'protected' => true, 'protected_source' => 'lessonpix'}],
        'id' => 'board123',
        'ext_lingolinq_settings' => {
          'protected' => true,
          'key' => 'communicator/my-board',
          'protected_user_id' => board_owner.global_id
        }
      }
      expect { Converters::LingoLinq.from_external(json, {'user' => supervisor}) }.not_to raise_error
      b = Board.last
      expect(b).to be_present
      expect(b.user_id).to eq(supervisor.id)
    end

    it "should support known boards"
  end

  describe "from_external_nested" do
    it "should parse" do
      u = User.create(:user_name => 'alfonso')
      content = {
        'boards' => [
          {'id' => 'a', 'name' => 'my cool board', 'buttons' => [{'id' => 1, 'label' => 'cheese', 'load_board' => {'id' => 'b'}}], 'grid' => {'rows' => 1, 'columns' => 1, 'order' => [[1]]}},
          {'id' => 'b', 'name' => 'my less cool board', 'buttons' => [{'id' => 1, 'label' => 'dirt'}], 'grid' => {'rows' => 1, 'columns' => 1, 'order' => [[1]]}}
        ],
        'images' => [],
        'sounds' => []
      }
      Converters::LingoLinq.from_external_nested(content, {'user' => u})
      boards = Board.all.sort_by(&:id)
      expect(boards.count).to eql(2)
      expect(boards[0].key).to eql('alfonso/my-cool-board')
      expect(boards[0].settings['buttons'][0]['load_board']).to eql({'id' => boards[1].global_id, 'key' => boards[1].key})
      expect(boards[1].key).to eql('alfonso/my-less-cool-board')
    end
  end

  describe "to_pdf" do
    it "should convert to pdf, then use the obf-to-pdf converter" do
      expect(Converters::LingoLinq).to receive(:to_external).and_return("/file.obf")
      expect(OBF::External).to receive(:to_pdf) do |tmp, dest|
        expect(tmp).not_to eq(nil)
        expect(dest).to eq("/file.pdf")
      end.and_return(nil)
      Converters::LingoLinq.to_pdf(nil, "/file.pdf", {})
    end
    
    it "if specified it should use obz instead of obf as the middle step" do
      expect(Converters::LingoLinq).to receive(:to_external_nested).and_return("/file.obz")
      expect(OBF::External).to receive(:to_pdf) do |tmp, dest|
        expect(tmp).not_to eq(nil)
        expect(dest).to eq("/file.pdf")
      end
      Converters::LingoLinq.to_pdf(nil, "/file.pdf", {'packet' => true})
    end
  end

  describe "to_png" do
    it "should convert to pdf then use the pdf-to-png converter" do
      hash = {}
      expect(Converters::LingoLinq).to receive(:to_external).and_return(hash)
      expect(OBF::External).to receive(:to_png) do |tmp, dest|
        expect(tmp).to eq(hash)
        expect(dest).to eq("/file.png")
      end
      Converters::LingoLinq.to_png(nil, "/file.png")
    end
  end
  
  describe "to_external" do
    it "should include custom parameters" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'hidden' => true},
        {'id' => 2, 'link_disabled' => true},
        {'id' => 3, 'home_lock' => true},
        {'id' => 4, 'part_of_speech' => 'noun'},
        {'id' => 5, 'add_to_vocalization' => true}
      ]
      b.save
      hash = Converters::LingoLinq.to_external(b, nil)
      expect(hash['id']).to eq(b.global_id)
      expect(hash['buttons'].length).to eq(5)
      expect(hash['buttons'][0]['id']).to eq(1)
      expect(hash['buttons'][0]['hidden']).to eq(true)
      expect(hash['buttons'][1]['id']).to eq(2)
      expect(hash['buttons'][1]['ext_lingolinq_link_disabled']).to eq(true)
      expect(hash['buttons'][2]['id']).to eq(3)
      expect(hash['buttons'][2]['ext_lingolinq_home_lock']).to eq(true)
      expect(hash['buttons'][3]['id']).to eq(4)
      expect(hash['buttons'][3]['ext_lingolinq_part_of_speech']).to eq('noun')
      expect(hash['buttons'][4]['id']).to eq(5)
      expect(hash['buttons'][4]['ext_lingolinq_add_to_vocalization']).to eq(true)
    end

    it 'should support vocalization as an action' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'hidden' => true, 'vocalization' => ':back'},
      ]
      b.save
      hash = Converters::LingoLinq.to_external(b, nil)
      expect(hash['id']).to eq(b.global_id)
      expect(hash['buttons'].length).to eq(1)
      expect(hash['buttons'][0]['id']).to eq(1)
      expect(hash['buttons'][0]['hidden']).to eq(true)
      expect(hash['buttons'][0]['vocalization']).to eq(nil)
      expect(hash['buttons'][0]['action']).to eq(':back')
    end

    it 'should split vocalization into actions if multiple' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'hidden' => true, 'vocalization' => ':back && :clear && +a'},
      ]
      b.save
      hash = Converters::LingoLinq.to_external(b, nil)
      expect(hash['id']).to eq(b.global_id)
      expect(hash['buttons'].length).to eq(1)
      expect(hash['buttons'][0]['id']).to eq(1)
      expect(hash['buttons'][0]['hidden']).to eq(true)
      expect(hash['buttons'][0]['vocalization']).to eq(nil)
      expect(hash['buttons'][0]['action']).to eq(':back')
      expect(hash['buttons'][0]['actions']).to eq([':back', ':clear', '+a'])
    end

    it 'should support vocalization into actions and vocalization' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'hidden' => true, 'vocalization' => 'my && :back && :clear && +a && my'},
      ]
      b.save
      hash = Converters::LingoLinq.to_external(b, nil)
      expect(hash['id']).to eq(b.global_id)
      expect(hash['buttons'].length).to eq(1)
      expect(hash['buttons'][0]['id']).to eq(1)
      expect(hash['buttons'][0]['hidden']).to eq(true)
      expect(hash['buttons'][0]['action']).to eq(':back')
      expect(hash['buttons'][0]['actions']).to eq([':back', ':clear', '+a'])
      expect(hash['buttons'][0]['vocalization']).to eq('my my')
    end

    it "should use skinned URLs where appropriate" do
      u = User.create
      b = Board.create(:user => u)
      bi = ButtonImage.create(user: u, board: b, url: "https://www.example.com/pic-varianted-skin.png")
      u.settings['preferences']['skin'] = 'medium'
      u.save
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'cat', 'image_id' => bi.global_id},
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(b.known_button_images.count).to eq(1)
      hash = Converters::LingoLinq.to_external(b, {'user' => u})
      expect(hash['id']).to eq(b.global_id)
      expect(hash['buttons'].length).to eq(1)
      expect(hash['buttons'][0]['id']).to eq(1)
      expect(hash['buttons'][0]['label']).to eq('cat')
      expect(hash['images'][0]).to_not eq(nil)
      expect(hash['images'][0]['id']).to eq(bi.global_id)
      expect(hash['images'][0]['url']).to eq("https://www.example.com/pic-variant-medium.png")
      expect(hash['images'][0]['ext_lingolinq_unskinned_url']).to eq("https://www.example.com/pic-varianted-skin.png")
    end

    it "should use correct raster urls for vector images if available" do
      res = OpenStruct.new(:success? => true, :body => "abc", :headers => {'Content-Type' => 'text/plaintext'})
      h = {reqs: []}
      expect(Typhoeus).to receive(:head).with("http://example.com/pic.png.raster.png").and_return(res)
      u = User.create
      i = ButtonImage.create(:user => u, :url => "http://example.com/pic.png", :settings => {'content_type' => 'text/plaintext', 'rasterized' => 'from_url'})
      s = ButtonSound.create(:user => u, :url => "http://example.com/sound.mp3", :settings => {'content_type' => 'text/plaintext'})
      ref = Board.create(:user => u)
      b = Board.new(:user => u, :settings => {'name' => 'My Board'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'chicken', 'image_id' => i.global_id, 'sound_id' => s.global_id}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 2,
        'order' => [[1,nil]]
      }
      b.settings['image_url'] = 'http://example.com/pic.png'
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(b.known_button_images.count).to eq(1)
      expect(b.button_sounds.count).to eq(1)
      file = Tempfile.new("stash")
      json = Converters::LingoLinq.to_external(b.reload, {'for_pdf' => true})
      expect(json['id']).to eq(b.global_id)
      expect(json['name']).to eq('My Board')
      expect(json['default_layout']).to eq('landscape')
      expect(json['url']).to eq("#{JsonApi::Json.current_host}/#{b.key}")
      list = []
      list << {
        'id' => i.global_id,
        'height' => 400,
        'width' => 400,
        'protected' => false,
        'protected_source' => nil,
        'license' => {'type' => 'private'},
        'url' => 'http://example.com/pic.png.raster.png',
        'fallback_url' => 'http://example.com/pic.png',
        'data_url' => "#{JsonApi::Json.current_host}/api/v1/images/#{i.global_id}",
        'content_type' => 'image/png'
      }
      expect(json['images']).to eq(list)

      list = []
      list << {
        'id' => s.global_id,
        'license' => {'type' => 'private'},
        'url' => 'http://example.com/sound.mp3',
        'data_url' => "#{JsonApi::Json.current_host}/api/v1/sounds/#{s.global_id}",
        'content_type' => 'text/plaintext',
        'duration' => nil,
        'protected' => nil,
        'protected_source' => nil
      }
      expect(json['sounds']).to eq(list)
    end    
  end

end
