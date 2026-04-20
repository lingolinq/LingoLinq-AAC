require 'spec_helper'

describe Converters::PDF do
  describe "from_obf" do
    it "should render a basic obf" do
      f = Tempfile.new("stash")
      f.puts OBF::Utils.obf_shell.to_json
      f.rewind
      f2 = Tempfile.new("stash")
      Converters::PDF.from_obf(f.path, f2.path)
      f.unlink
      f2.rewind
      expect(f2.size).to be > 2500
      f2.unlink
    end
  end

  describe "from_obz" do
    it "should render a multi-page obz" do
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
      path1 = OBF::Utils.temp_path("stash")
      path2 = OBF::Utils.temp_path(["file", ".pdf"])
      Converters::LingoLinq.to_obz(b, path1, {'user' => u})
      Converters::PDF.from_obz(path1, path2)
      File.unlink path1
      expect(File.exist?(path2)).to eq(true)
      expect(File.size(path2)).to be > 10
      File.unlink path2
    end
  end

  describe "from_lingolinq" do
    it "should convert to obz and then render that" do
      hash = {}
      expect(Converters::LingoLinq).to receive(:to_external).and_return(hash)
      expect(OBF::PDF).to receive(:from_external).with(hash, "/file.pdf")
      Converters::PDF.from_lingolinq(nil, "/file.pdf", {})
    end
  end  

  describe "to_png" do
    it "should use the png-from-pdf converter" do
      file = "/file.pdf"
      path = "/file.png"
      expect(OBF::PNG).to receive(:from_pdf).with(file, path)
      Converters::PDF.to_png(file, path)
    end
  end
end
