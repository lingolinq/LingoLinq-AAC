module Converters::PDF
  def self.from_obf(obf_json_or_path, dest_path, zipper=nil)
    OBF::PDF.from_obf(obf_json_or_path, dest_path, zipper)
  end
  
  def self.from_obz(obz_path, dest_path)
    OBF::PDF.from_obz(obz_path, dest_path)
  end
  
  def self.from_coughdrop(board, dest_path, opts)
    json = nil
    if opts['packet']
      json = Converters::LingoLinq.to_external_nested(board, opts)
    else
      json = Converters::LingoLinq.to_external(board)
    end
    OBF::PDF.from_external(json, dest_path)
  end
  
  def self.to_png(pdf, dest_path)
    OBF::PNG.from_pdf(pdf, dest_path)
  end
end
