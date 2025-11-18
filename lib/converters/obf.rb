module Converters::OBF
  def self.to_lingolinq(obf, opts)
    Converters::LingoLinq.from_obf(obf, opts)
  end
  
  def self.from_lingolinq(board, dest_path)
    Converters::LingoLinq.to_obf(board, dest_path)
  end
  
  def self.to_pdf(obf, dest_path)
    OBF::PDF.from_obf(obf, dest_path)
  end
  
  def self.to_png(obf, dest_path)
    OBF::PNG.from_obf(obf, dest_path)
  end
end