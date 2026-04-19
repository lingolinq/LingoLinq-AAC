require 'spec_helper'

describe Converters::Utils do
  describe "board_to_remote" do
    it "should update progress" do
      u = User.create()
      b = Board.create(:user => u)
      expect(Uploader).to receive(:check_existing_upload).and_return({url: "http://www.example.com/file.obf"})
      expect(Progress).to receive(:update_current_progress).with(0.1, :preconverting_file)
      Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obf', 'include' => 'this'})
    end
    
    it "should convert to only obf, obz or pdf" do
      u = User.create()
      b = Board.create(:user => u)
      allow(Uploader).to receive(:check_existing_upload).and_return({})
      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.obf"})
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obf', 'include' => 'this'})
      expect(res).to eq("http://www.example.com/file.obf")

      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.obf"})
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obf', 'include' => 'all'})
      expect(res).to eq("http://www.example.com/file.obf")

      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.pdf"})
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'pdf', 'include' => 'this'})
      expect(res).to eq("http://www.example.com/file.pdf")

      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.obz"})
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obz', 'include' => 'this'})
      expect(res).to eq("http://www.example.com/file.obz")

      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.obz"})
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obz', 'include' => 'all'})
      expect(res).to eq("http://www.example.com/file.obz")

      expect { Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'txt', 'include' => 'this'}) }.to raise_error("Unrecognized conversion type: txt")
    end
    
    it "should upload the file to the remote storage service" do
      u = User.create()
      b = Board.create(:user => u)
      expect(Uploader).to receive(:check_existing_upload).and_return({})
      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.obf"})
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obf', 'include' => 'this'})
      expect(res).to eq("http://www.example.com/file.obf")
    end
    
    it "should raise an error for unrecognized file types" do
      u = User.create()
      b = Board.create(:user => u)
      expect { Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'txt', 'include' => 'this'}) }.to raise_error("Unrecognized conversion type: txt")
    end
    
    it "should raise an error if the upload failed" do
      u = User.create()
      b = Board.create(:user => u)
      expect(Uploader).to receive(:check_existing_upload).and_return({})
      expect(Uploader).to receive(:remote_upload).and_return(nil)
      expect { Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'obf', 'include' => 'this'}) }.to raise_error("File not uploaded")
    end
    
    it "should specify a font if set" do
      u = User.create()
      b = Board.create(:user => u)
      expect(Uploader).to receive(:check_existing_upload).and_return({})
      expect(Uploader).to receive(:remote_upload).and_return({url: "http://www.example.com/file.obf"})
      expect(Converters::LingoLinq).to receive(:to_pdf){|board, path, opts|
        expect(board).to eq(b)
        expect(path).to_not eq(nil)
        expect(opts).to eq({
          'font' => File.expand_path('../../../../public/fonts/ComicSans.ttf', __FILE__),
          'headerless' => false,
          'packet' => false,
          'text_case' => 'default',
          'text_on_top' => false,
          'text_only' => false,
          'transparent_background' => false,
          'symbol_background' => 'white',
          'user' => u
        })
        expect(File.exist?(opts['font'])).to eq(true)
      }
      res = Converters::Utils.board_to_remote(b, u.global_id, {'file_type' => 'pdf', 'font' => 'comic_sans', 'include' => 'this'})
      expect(res).to eq("http://www.example.com/file.obf")
    end
  end

  describe "remote_to_boards" do
    it "should make a request to the specified url" do
      res = OpenStruct.new(:body => "bacon", :headers => {'Content-Type' => 'image/png'})
      expect(Typhoeus).to receive(:get).with("http://example.com/board").and_return(res)
      expect { Converters::Utils.remote_to_boards(nil, "http://example.com/board") }.to raise_error("Unrecognized file type: image/png")
    end
    
    it "should error on unrecognized file type" do
      res = OpenStruct.new(:body => "bacon", :headers => {'Content-Type' => 'image/png'})
      expect(Typhoeus).to receive(:get).with("http://example.com/board").and_return(res)
      expect { Converters::Utils.remote_to_boards(nil, "http://example.com/board") }.to raise_error("Unrecognized file type: image/png")
    end
    
    it "should download and process an obf file" do
      shell = OBF::Utils.obf_shell
      shell['id'] = '1234'
      shell['name'] = "Cool Board"

      res = OpenStruct.new(:body => shell.to_json, :headers => {'Content-Type' => 'application/obf'})
      expect(Typhoeus).to receive(:get).with("http://example.com/board").and_return(res)
      b = Board.new
      expect(Converters::LingoLinq).to receive(:from_obf).and_return(b)
      res = Converters::Utils.remote_to_boards(nil, "http://example.com/board")
      expect(res).to eq([b])
    end
    
    it "should download and process and obz file" do
      shell = OBF::Utils.obf_shell
      shell['id'] = '1234'
      shell['name'] = "Cool Board"

      res = OpenStruct.new(:body => shell.to_json, :headers => {'Content-Type' => 'application/obz'})
      expect(Typhoeus).to receive(:get).with("http://example.com/board").and_return(res)
      b = Board.new
      expect(Converters::LingoLinq).to receive(:from_obz).and_return([b])
      res = Converters::Utils.remote_to_boards(nil, "http://example.com/board")
      expect(res).to eq([b])
    end
  end
  
  describe "find_by_data_url" do
    it "should return nil unless a string" do
      expect(Converters::Utils.find_by_data_url(12)).to eq(nil)
    end
    
    it "should return nil for invalid paths" do
      expect(Converters::Utils.find_by_data_url('http://www.example.com/bacon')).to eq(nil)
    end
    
    it "should return nil for invalid hosts" do
      bs = ButtonSound.create
      expect(Converters::Utils.find_by_data_url("http://www.baddomain.frost/api/v1/images/#{bs.global_id}")).to eq(nil)
    end
    
    it "should return image if found" do
      u = User.create
      bi = ButtonImage.create(user: u)
      expect(Converters::Utils.find_by_data_url("#{JsonApi::Json.current_host}/api/v1/images/#{bi.global_id}")).to eq(bi)
    end
    
    it "should return sound if found" do
      u = User.create
      bs = ButtonSound.create(user: u)
      expect(Converters::Utils.find_by_data_url("#{JsonApi::Json.current_host}/api/v1/sounds/#{bs.global_id}")).to eq(bs)
    end
    
    it "should return board if found" do
      u = User.create
      b = Board.create(:user => u)
      expect(Converters::Utils.find_by_data_url("#{JsonApi::Json.current_host}/api/v1/boards/#{b.global_id}")).to eq(b)
    end
  end
end
