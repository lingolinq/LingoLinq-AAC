require 'spec_helper'
require 'tmpdir'
require 'open3'

# save_image rasterizes fetched images for PDF exports and sentence previews. The image is the
# user's; another file on the worker must not end up in the rendered picture.
describe 'OBFSaveImageHardening confinement' do
  def mean_red(path)
    out, _s = Open3.capture2e('convert', path, '-format', '%[fx:mean.r]', 'info:')
    out[/[\d.]+\z/].to_f
  end

  def leaked?(path)
    !!path && File.exist?(path) && mean_red(path) > 0.1
  end

  before(:each) do
    skip('ImageMagick not installed') unless system('convert', '-version', :out => File::NULL, :err => File::NULL)
    @victim = Tempfile.new(['image_stash', '.png'])
    @victim.close
    system('convert', '-size', '64x64', 'xc:red', @victim.path)
  end

  after(:each) do
    @victim.close! if @victim
  end

  let(:svg) { "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"blue\"/><image href=\"#{@victim.path}\" width=\"64\" height=\"64\"/></svg>" }

  it 'does not draw another file into an svg image' do
    path = OBF::Utils.save_image({'raw_data' => svg, 'content_type' => 'image/svg+xml'}, nil, 'white')
    expect(leaked?(path)).to eq(false)
  end

  it 'does not draw another file into an svg served as png' do
    path = OBF::Utils.save_image({'raw_data' => svg, 'content_type' => 'image/png'}, nil, 'white')
    expect(leaked?(path)).to eq(false)
  end

  it 'does not draw another file when rendering in the background' do
    res = OBF::Utils.save_image({'raw_data' => svg, 'content_type' => 'image/svg+xml', 'threadable' => true}, nil, 'white')
    res[:thread].join
    expect(leaked?(res[:image]['local_path'])).to eq(false)
  end

  it 'still renders an svg that names no other file' do
    benign = svg.sub(/<image[^>]*\/>/, '')
    path = OBF::Utils.save_image({'raw_data' => benign, 'content_type' => 'image/svg+xml'}, nil, 'white')
    expect(File.exist?(path)).to eq(true)
    expect(mean_red(path)).to be < 0.1
  end

  it 'still renders a png in the background' do
    png = Open3.capture2('convert', '-size', '64x64', 'xc:red', 'png:-', :binmode => true)[0]
    res = OBF::Utils.save_image({'raw_data' => png, 'content_type' => 'image/png', 'threadable' => true}, nil, 'white')
    res[:thread].join
    expect(mean_red(res[:image]['local_path'])).to be > 0.9
  end
end

describe Uploadable, 'rasterize confinement' do
  it 'does not draw another file into an uploaded svg raster' do
    skip('ImageMagick not installed') unless system('convert', '-version', :out => File::NULL, :err => File::NULL)
    Dir.mktmpdir('raster-spec') do |dir|
      victim = File.join(dir, 'victim.png')
      system('convert', '-size', '64x64', 'xc:red', victim)
      path = File.join(dir, 'stash.svg')
      File.write(path, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"blue\"/><image href=\"#{victim}\" width=\"64\" height=\"64\"/></svg>")
      ButtonImage.new(settings: {}).convert_image(path)
      raster = "#{path}.raster.png"
      out, _s = Open3.capture2e('convert', raster, '-format', '%[fx:mean.r]', 'info:') if File.exist?(raster)
      expect(!File.exist?(raster) || out[/[\d.]+\z/].to_f < 0.1).to eq(true)
    end
  end
end
