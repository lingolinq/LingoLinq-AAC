require 'tempfile'
require 'base64'
require 'mime/types'

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
  # Bounds one fetch. SafeHttp supplies no timeout of its own.
  FETCH_TIMEOUT = 10
  FETCH_CONNECT_TIMEOUT = 5

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
      if image['url'].to_s.match(/\Adata:/)
        # OBF::Utils.get_url decoded data: URIs inline with no network call
        # (obf-0.9.9.3/lib/obf/utils.rb:8-10). Uploader.sanitize_url rejects every
        # non-http(s) scheme by design (lib/uploader.rb:87), so routing these through
        # SafeHttp would return a failed response and silently strip the symbol from
        # the preview. Utterance#process_params only rewrites a non-http image when
        # original_image is present (app/models/utterance.rb:335), so a lone data: URI
        # does reach here.
        image['content_type'] ||= image['url'].split(/;/)[0].split(/:/)[1]
        image['raw_data'] = begin
          Base64.strict_decode64(image['url'].split(/,/, 2)[1].to_s)
        rescue ArgumentError
          nil
        end
      else
        # SafeHttp, not OBF::Utils.get_url: the gem's sanitize_url
        # (obf-0.9.9.3/lib/obf/utils.rb:60-67) passes link-local (169.254.169.254 --
        # .to_i is 169, never equal to the dotted string), every RFC1918 range, an
        # uppercase LOCALHOST (the regex is case-sensitive) and bracketed IPv6
        # literals, then fetches with followlocation:true so no redirect hop is
        # re-validated. button['image'] is attacker-controlled via POST
        # /api/v1/utterances (utterances_controller.rb:19 permit!), and this runs in a
        # Resque worker. SafeHttp re-validates every hop and pins DNS.
        # Timeouts are per-caller: SafeHttp sets none of its own
        # (lib/safe_http.rb:264-268 merges only followlocation/resolve), and without
        # one libcurl's defaults are an infinite read and a 300s connect, so a
        # button_list of dead hosts stalls a worker.
        # Sign uploads-bucket URLs: the bucket blocks public access, so the
        # embedded raw URL 403s on an unsigned fetch (CDN/external unchanged)
        res = SafeHttp.get(
          Uploader.signed_internal_url(image['url']),
          timeout: FETCH_TIMEOUT, connecttimeout: FETCH_CONNECT_TIMEOUT
        )
        # Gate on success?, not on body size. SafeHttp.failed_response returns
        # body='blocked or invalid URL' with code 0 (lib/safe_http.rb:281-290); that
        # string is only 22 bytes so MIN_IMAGE_BYTES below would mask it by accident
        # rather than by intent, and a 404 body would sail past.
        if res && res.success?
          image['raw_data'] = res.body
          image['content_type'] = res.headers && res.headers['Content-Type']
        else
          image['raw_data'] = nil
          image['content_type'] = nil
        end
      end
      OBF::Utils.log "  done!"
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
      # Tempfile already carries the right extension — use it directly.
      image['local_path'] = file.path
    else
      background ||= 'white'
      size = 400
      path = file.path
      if image['content_type'] && image['content_type'].match(/svg/)
        args = ['convert', '-background', background, '-density', '300',
                '-resize', "#{size}x#{size}", '-gravity', 'center',
                '-extent', "#{size}x#{size}", file.path, '-flatten', "#{file.path}.jpg"]
        OBF::Utils.log "    #{args.join(' ')}"
        image['local_path'] = "#{file.path}.jpg"
        if image['threadable']
          pid = Process.spawn(*args)
          thr = Process.detach(pid)
          OBF::Utils.log '    scheduled image'
          return { thread: thr, image: image, type: 'svg', pid: pid, tempfile: file }
        else
          system(*args)
          OBF::Utils.log "    finished image #{File.exist?(image['local_path']) && File.size(image['local_path'])}"
        end
      else
        args = ['convert', path, '-density', '300',
                '-resize', "#{size}x#{size}", '-background', background,
                '-gravity', 'center', '-extent', "#{size}x#{size}",
                '-flatten', "#{path}.jpg"]
        OBF::Utils.log "    #{args.join(' ')}"
        image['local_path'] = "#{path}.jpg"
        if image['threadable']
          pid = Process.spawn(*args)
          thr = Process.detach(pid)
          OBF::Utils.log '    scheduled image'
          return { thread: thr, image: image, type: 'not_svg', pid: pid, tempfile: file }
        else
          system(*args)
          OBF::Utils.log "    finished image #{File.exist?(image['local_path']) && File.size(image['local_path'])}"
        end
      end
      image['local_path']
    end
    image['local_path']
  end
end

OBF::Utils.singleton_class.prepend(OBFSaveImageHardening)
