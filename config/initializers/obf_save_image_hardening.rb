require 'tempfile'

# Hardens OBF::Utils.save_image against two failure modes observed in staging
# 2026-04-20..22 on full-board-set PDF prints (Vocal Flair 60, etc.):
#
# 1. Empty or too-small response bodies: when a button image URL returns a 0-
#    byte 200 (stale S3 cache entry, CDN miss, etc.), the original method still
#    writes the empty bytes to a Tempfile and spawns `convert`, which fails
#    with "unable to open image ... No such file or directory" and "no images
#    defined ...jpg". We skip the image instead — the PDF layer handles nil
#    gracefully ("missing image" log line, button renders without symbol).
#
# 2. Tempfile finalizer race: the original save_image returns
#    `{thread:, image:, type:, pid:}` with NO reference to the Tempfile it
#    created. When GC runs during `threads.each{|t| t[:thread].join }` in
#    pdf.rb, the Tempfile finalizer unlinks /tmp/image_stash*.png out from
#    under the still-running `convert` subprocess. We add `tempfile: file` to
#    the returned hash so the Tempfile object stays alive until the caller
#    drops the reference.
#
# Together these turn the observed 501s worker timeout into a job that
# completes in normal time with any genuinely-missing symbols skipped.
module OBFSaveImageHardening
  MIN_IMAGE_BYTES = 100

  def save_image(image, zipper = nil, background = nil)
    if image['data']
      image['content_type'] = image['data'].split(/;/)[0].split(/:/)[1] if !image['content_type']
    elsif image['raw_data']
      # already processed
    elsif image['path'] && zipper
      image['raw_data'] = zipper.read(image['path'])
      if !image['content_type']
        types = MIME::Types.type_for(image['path'])
        image['content_type'] = types[0] && types[0].to_s
      end
    elsif image['url']
      OBF::Utils.log "  retrieving #{image['url']}"
      url_data = OBF::Utils.get_url(image['url'])
      OBF::Utils.log "  done!"
      image['raw_data'] = url_data['data']
      image['content_type'] = url_data['content_type']
    elsif image['symbol']
      # not supported
    end

    if image['raw_data'] && image['raw_data'].to_s.bytesize < MIN_IMAGE_BYTES && !image['data']
      OBF::Utils.log "  skipping image with too-small data (#{image['raw_data'].to_s.bytesize} bytes) url=#{image['url']}"
      return nil
    end

    type = MIME::Types[image['content_type']]
    type = type && type[0]
    extension = nil
    if type.respond_to?(:preferred_extension)
      extension = type && ('.' + type.preferred_extension)
    elsif type.respond_to?(:extensions)
      extension = type && ('.' + type.extensions.first)
    end
    file = Tempfile.new(['image_stash', extension.to_s])
    file.binmode
    if image['data']
      str = Base64.strict_decode64(image['data'].split(/\,/, 2)[1])
      file.write str
    elsif image['raw_data']
      file.write image['raw_data']
    else
      file.close
      return nil
    end
    file.close

    if File.size(file.path) < MIN_IMAGE_BYTES
      OBF::Utils.log "  skipping image, wrote less than #{MIN_IMAGE_BYTES} bytes url=#{image['url']}"
      file.unlink rescue nil
      return nil
    end

    if extension && ['image/jpeg', 'image/jpg'].include?(image['content_type']) && image['width'] && image['width'] < 1000 && image['width'] == image['height']
      `cp #{file.path} #{file.path}#{extension}`
      image['local_path'] = "#{file.path}#{extension}"
    else
      background ||= 'white'
      size = 400
      path = file.path
      if image['content_type'] && image['content_type'].match(/svg/)
        cmd = "convert -background \"#{background}\" -density 300 -resize #{size}x#{size} -gravity center -extent #{size}x#{size} #{file.path} -flatten #{file.path}.jpg"
        OBF::Utils.log "    #{cmd}"
        image['local_path'] = "#{file.path}.jpg"
        if image['threadable']
          pid = Process.spawn(cmd)
          thr = Process.detach(pid)
          OBF::Utils.log '    scheduled image'
          return { thread: thr, image: image, type: 'svg', pid: pid, tempfile: file }
        else
          `#{cmd}`
          OBF::Utils.log "    finished image #{File.exist?(image['local_path']) && File.size(image['local_path'])}"
        end
      else
        cmd = "convert #{path} -density 300 -resize #{size}x#{size} -background \"#{background}\" -gravity center -extent #{size}x#{size} -flatten #{path}.jpg"
        OBF::Utils.log "    #{cmd}"
        image['local_path'] = "#{path}.jpg"
        if image['threadable']
          pid = Process.spawn(cmd)
          thr = Process.detach(pid)
          OBF::Utils.log '    scheduled image'
          return { thread: thr, image: image, type: 'not_svg', pid: pid, tempfile: file }
        else
          `#{cmd}`
          OBF::Utils.log "    finished image #{File.exist?(image['local_path']) && File.size(image['local_path'])}"
        end
      end
      image['local_path']
    end
    image['local_path']
  end
end

OBF::Utils.singleton_class.prepend(OBFSaveImageHardening)
