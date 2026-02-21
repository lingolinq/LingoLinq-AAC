# Fallback when ImageMagick 'identify' is not installed or not in PATH.
# OBF gem uses identify to get image dimensions during OBZ/PDF export.
# See CLAUDE.md - ImageMagick (convert, identify, montage) is required for full functionality.
module OBFImageAttrsFallback
  def image_attrs(path, extension = '')
    super
  rescue Errno::ENOENT
    # identify command not found - return sensible defaults
    res = {}
    if path && path.to_s.match(/^data:image\/(\w+);/)
      res['content_type'] = "image/#{$1}"
    end
    res['width'] ||= 400
    res['height'] ||= 400
    res
  end
end

OBF::Utils.singleton_class.prepend(OBFImageAttrsFallback)
