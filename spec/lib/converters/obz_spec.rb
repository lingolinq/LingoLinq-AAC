require 'spec_helper'

describe Converters::OBZ do
  describe "to_lingolinq" do
    it "should use the lingolinq-from-obz converter" do
      obz = "/file.obz"
      opts = {}
      expect(Converters::LingoLinq).to receive(:from_obz).with(obz, opts)
      Converters::OBZ.to_lingolinq(obz, opts)
    end
  end
  
  describe "from_lingolinq" do
    it "should use the lingolinq-to-obz converter" do
      obz = "/file.obz"
      path = "/output.obz"
      expect(Converters::LingoLinq).to receive(:to_obz).with(obz, path, {'user' => nil})
      Converters::OBZ.from_lingolinq(obz, path, {'user' => nil})
    end
  end
  
  describe "to_pdf" do
    it "should use the pdf-from-obz converter" do
      obz = "/file.obz"
      path = "/file.png"
      expect(OBF::PDF).to receive(:from_obz).with(obz, path)
      Converters::OBZ.to_pdf(obz, path)
    end
  end
end
