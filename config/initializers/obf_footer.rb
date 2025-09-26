# Only load obf gem when not disabled (for asset precompilation)
unless ENV['DISABLE_OBF_GEM'] == 'true'
  require 'obf'
  OBF::PDF.footer_text = "printed at coughdrop.com"
  OBF::PDF.footer_url = "https://www.coughdrop.com"
end