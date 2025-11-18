module Converters::OBZ
  def self.to_lingolinq(obz, opts)
    Converters::LingoLinq.from_obz(obz, opts)
  end
  
  def self.from_lingolinq(board, dest_path, opts)
    Converters::LingoLinq.to_obz(board, dest_path, opts)
  end
  
  def self.to_pdf(obz, dest_path)
    OBF::PDF.from_obz(obz, dest_path)
  end
end