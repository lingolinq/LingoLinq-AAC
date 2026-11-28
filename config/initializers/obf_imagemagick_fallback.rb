require 'base64'
require 'tempfile'
require Rails.root.join('lib/image_magick_runner').to_s

# The obf gem's image_attrs (obf-0.9.9.3/lib/obf/utils.rb:378-415) with identify run through
# ImageMagickRunner instead of backticks: -verbose decodes the whole image, so an image that names
# other files gets them opened unless the run is confined. Otherwise the gem's method as it was.
# Fallback when ImageMagick 'identify' is not installed or not in PATH.
# OBF gem uses identify to get image dimensions during OBZ/PDF export.
# See CLAUDE.md - ImageMagick (convert, identify, montage) is required for full functionality.
module OBFImageAttrsFallback
  def image_attrs(path, extension = '')
    res = {}
    if path && path.match(/^data:/)
      res['content_type'] = path.split(/;/)[0].split(/:/)[1]
      raw = Base64.strict_decode64(path.split(/\,/, 2)[1])
      file = Tempfile.new(['file', extension])
      path = file.path
      file.binmode
      file.write raw
      file.close
    else
      is_file = File.exist?(path) rescue false
      if !is_file
        file = Tempfile.new(['file', extension])
        file.binmode
        file.write path
        path = file.path
        file.close
      end
    end
    OBF::Utils.log "file not found, #{path}" if !File.exist?(path)
    begin
      data = ImageMagickRunner.capture('identify', '-verbose', path)
    rescue Errno::ENOENT
      # identify command not found - return sensible defaults
      res['width'] ||= 400
      res['height'] ||= 400
      return res
    end
    data.split(/\n/).each do |line|
      pre, post = line.sub(/^\s+/, '').split(/:\s/, 2)
      if pre == 'Geometry'
        match = post.match(/(\d+)x(\d+)/)
        if match && match[1] && match[2]
          res['width'] = match[1].to_i
          res['height'] = match[2].to_i
        end
      elsif pre == 'Mime type'
        res['content_type'] = post
      end
    end
    if res['content_type'] && res['content_type'].match(/^image\/svg/)
      res['width'] ||= 300
      res['height'] ||= 300
    end
    res
  end
end

OBF::Utils.singleton_class.prepend(OBFImageAttrsFallback)
