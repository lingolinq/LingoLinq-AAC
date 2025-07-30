require 'spec_helper'

describe Converters::PNG do
  describe "from_pdf" do
    it "should shell out to convert the image" do
      expect(OBF::PNG).to receive(:'`').with("convert -density 300 -crop 3160x1690+0+600 +repage  /file.pdf /image.png")
      Converters::PNG.from_pdf("/file.pdf", "/image.png")

      expect(OBF::PNG).to receive(:'`').with("convert -density 300 -crop 3160x1690+0+600 +repage -resize 600x321 -quality 100 /file2.pdf /image2.png")
      Converters::PNG.from_pdf("/file2.pdf", "/image2.png", :resize => true)
    end
  end
  
  describe "from_obf" do
    it "should user the obf-to-pdf converter and then call from_pdf" do
      expect(OBF::PNG).to receive(:from_pdf).with("/file.pdf", "/file.png")
      expect(OBF::OBF).to receive(:to_pdf).and_return("/file.pdf")
      Converters::PNG.from_obf("/file.obf", "/file.png")
    end
  end
  
  describe "from_lingolinq" do
    it "should use the lingolinq-to-pdf converter and then call from_pdf" do
      b = Board.new
      hash = {}
      expect(OBF::PNG).to receive(:from_external).with(hash, "/file.png")
      expect(Converters::LingoLinq).to receive(:to_external).and_return(hash)
      Converters::PNG.from_lingolinq(b, "/file.png")
    end
  end
end
