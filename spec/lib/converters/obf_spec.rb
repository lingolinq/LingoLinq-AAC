require 'spec_helper'

describe Converters::OBF do
  describe "to_coughdrop" do
    it "should use the coughdrop-from-obf converter" do
      obf = "/file.obf"
      opts = {}
      expect(Converters::LingoLinq).to receive(:from_obf).with(obf, opts)
      Converters::OBF.to_coughdrop(obf, opts)
    end
  end
  
  describe "from_coughdrop" do
    it "should use the coughdrop-to-obf converter" do
      board = Board.new
      opts = {}
      expect(Converters::LingoLinq).to receive(:to_obf).with(board, opts)
      Converters::OBF.from_coughdrop(board, opts)
    end
  end
  
  describe "to_pdf" do  
    it "should use the pdf-from-obf converter" do
      obf = "/file.obf"
      path = "/fild.pdf"
      expect(OBF::PDF).to receive(:from_obf).with(obf, path)
      Converters::OBF.to_pdf(obf, path)
    end
  end
  
  describe "to_png" do
    it "should use the png-from-obf converter" do
      obf = "/file.obf"
      path = "/fild.pdf"
      expect(OBF::PNG).to receive(:from_obf).with(obf, path)
      Converters::OBF.to_png(obf, path)
    end
  end
end
