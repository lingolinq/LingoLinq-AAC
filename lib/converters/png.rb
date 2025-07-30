module Converters::PNG
  def self.from_pdf(pdf_path, dest_path, opts={})
    OBF::PNG.from_pdf(pdf_path, dest_path, opts)
  end
  
  def self.from_obf(obf, dest_path)
    OBF::PNG.from_obf(obf, dest_path)
  end
  
  def self.from_lingolinq(board, dest_path)
    json = Converters::LingoLinq.to_external(board)
    OBF::PNG.from_external(json, dest_path)
  end
end
