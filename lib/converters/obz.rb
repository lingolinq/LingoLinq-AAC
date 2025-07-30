module Converters::OBZ
  def self.to_coughdrop(obz, opts)
    Converters::LingoLinq.from_obz(obz, opts)
  end
  
  def self.from_coughdrop(board, dest_path, opts)
    Converters::LingoLinq.to_obz(board, dest_path, opts)
  end
  
  def self.to_pdf(obz, dest_path)
    OBF::PDF.from_obz(obz, dest_path)
  end
end
