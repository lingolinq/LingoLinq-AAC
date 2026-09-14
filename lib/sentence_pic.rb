require 'tempfile'
require_relative 'image_magick_runner'
module SentencePic
  PER_ROW=6
  def self.generate(utterance)
    raise "utterance must be saved first" unless utterance && utterance.id
    images = {}
    return unless utterance.data['button_list']
    utterance.data['button_list'].map{|b| b['image'] }.uniq.each do |url|
      filename = OBF::Utils.save_image({'url' => url})
      images[url] = filename
    end
    montage = OBF::Utils.temp_path('montage') + '.png'
    
    rows = (utterance.data['button_list'].length.to_f / PER_ROW.to_f).ceil
    columns = PER_ROW
    width = 70
    height = 70
    if utterance.data['button_list'].length < PER_ROW
      columns = utterance.data['button_list'].length
      columns = 1 if !columns || columns == 0
      width = [420 / columns, 200].min
      height = width
    elsif utterance.data['button_list'].length < PER_ROW * 2
      columns = (utterance.data['button_list'].length.to_f / 2.0).ceil
    end

    image_args = []
    text_limit = 25
    text_limit = 20 if columns == 2
    text_limit = 10 if columns > 2
    utterance.data['button_list'].each do |button|
      filename = images[button['image']]
      # save_image returns nil for an unreachable or too-small image, and the image URL comes
      # straight from the request. An empty argv element makes montage read STDIN and hang.
      next if filename.blank?
      label = (button['label'] || button['vocalization'] || '').to_s
      if label.length > text_limit
        label = label[0, text_limit - 2] + ".."
      end
      # Escape AFTER truncating: truncating an already-escaped label can split a '%%' pair
      # back into a live format specifier.
      image_args += ['-label', ImageMagickRunner.escape_label(label), filename]
    end

    ImageMagickRunner.run('montage', *image_args, '-tile', "#{columns}x#{rows}", '-shadow',
                          '-pointsize', '16', '-geometry', "#{width}x#{height}+3+10",
                          '-border', '2', '-bordercolor', '#888', montage)
    preview = OBF::Utils.temp_path('preview') + '.png'
    # Counts BUTTONS, matching the pre-argv behaviour exactly: image_args holds three
    # elements per button, so counting it here would move this threshold from 13 buttons
    # to 5 and reposition every ordinary preview.
    if utterance.data['button_list'].length > PER_ROW * 2
      ImageMagickRunner.run('convert', montage, '-gravity', 'north', '-extent', '500x240', preview)
    else
      ImageMagickRunner.run('convert', montage, '-gravity', 'center', '-extent', '500x240', preview)
    end
    key = GoSecure.sha512(utterance.id.to_s, 'utterance_id')[0, 25]
    remote_path = "sentences/#{utterance.id}/#{key}/preview.png"
    url = (Uploader.remote_upload(remote_path, preview, 'image/png') || {})[:url]
    url
  end
end