require 'spec_helper'
require 'tmpdir'
require 'open3'

# ImageMagick may open only the files named on its command line. A vector image can name other files
# for ImageMagick to draw in; these check that it cannot reach one.
describe ImageMagickRunner, "confinement" do
  def imagemagick?
    system('convert', '-version', :out => File::NULL, :err => File::NULL)
  end

  # Measured outside the runner, so the measurement is never itself confined.
  def mean_red(path)
    out, _s = Open3.capture2e('convert', path, '-format', '%[fx:mean.r]', 'info:')
    out[/[\d.]+\z/].to_f
  end

  def write_svg(dir, body, name = 'in.svg')
    path = File.join(dir, name)
    File.write(path, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"blue\"/>#{body}</svg>")
    path
  end

  around(:each) do |example|
    Dir.mktmpdir('confine-spec') do |dir|
      @dir = dir
      @victim = File.join(dir, 'victim.png')
      example.run
    end
  end

  describe "with ImageMagick installed" do
    before(:each) do
      skip('ImageMagick not installed') unless imagemagick?
      system('convert', '-size', '64x64', 'xc:red', @victim)
    end

    it "does not draw a file an svg names by absolute path" do
      input = write_svg(@dir, "<image href=\"#{@victim}\" width=\"64\" height=\"64\"/>")
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
      expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
    end

    it "does not draw a file named through xlink:href" do
      input = File.join(@dir, 'in.svg')
      File.write(input, "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"blue\"/><image xlink:href=\"#{@victim}\" width=\"64\" height=\"64\"/></svg>")
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
      expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
    end

    it "does not draw a named file when the svg arrives under a raster file name" do
      input = File.join(@dir, 'in.png')
      File.write(input, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><image href=\"#{@victim}\" width=\"64\" height=\"64\"/></svg>")
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', input, '-flatten', out)
      expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
    end

    it "still renders an svg that names nothing" do
      input = write_svg(@dir, '')
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
      expect(File.exist?(out)).to eq(true)
      expect(mean_red(out)).to be < 0.1
    end

    it "renders a raster image embedded as a data: uri as it would unconfined" do
      png = Open3.capture2('convert', '-size', '8x8', 'xc:red', 'png:-', :binmode => true)[0]
      input = write_svg(@dir, "<image href=\"data:image/png;base64,#{Base64.strict_encode64(png)}\" width=\"64\" height=\"64\"/>")
      unconfined = File.join(@dir, 'unconfined.jpg')
      system('convert', '-background', 'white', input, '-flatten', unconfined, :err => File::NULL)
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
      expect(File.exist?(out)).to eq(File.exist?(unconfined))
      expect(mean_red(out)).to be_within(0.01).of(mean_red(unconfined)) if File.exist?(unconfined)
    end

    it "still lets identify read the file it was given" do
      expect(ImageMagickRunner.capture('identify', '-format', '%w %h', "#{@victim}[0]")).to eq('64 64')
    end

    it "leaves no policy directory behind" do
      input = write_svg(@dir, '')
      before = Dir.glob(File.join(Dir.tmpdir, 'magick-confine*'))
      ImageMagickRunner.run('convert', input, File.join(@dir, 'out.jpg'))
      expect(Dir.glob(File.join(Dir.tmpdir, 'magick-confine*'))).to match_array(before)
    end

    it "does not draw a file reached by walking up out of an allowed directory" do
      allowed = Dir.glob(ImageMagickRunner::SYSTEM_READ_GLOBS).find { |d| File.directory?(d) }
      skip('no ImageMagick config or font directory found') unless allowed
      walk = File.join(File.realpath(allowed), *Array.new(File.realpath(allowed).count('/'), '..')) + @victim
      input = write_svg(@dir, "<image href=\"#{walk}\" width=\"64\" height=\"64\"/>")
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
      expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
    end

    it "confines a spawned render, and removes its directory once the process is gone" do
      input = write_svg(@dir, "<image href=\"#{@victim}\" width=\"64\" height=\"64\"/>")
      out = File.join(@dir, 'out.jpg')
      before = Dir.glob(File.join(Dir.tmpdir, 'magick-confine*'))
      Process.detach(ImageMagickRunner.spawn('convert', '-background', 'white', input, '-flatten', out)).join
      expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
      ImageMagickRunner.run('convert', write_svg(@dir, '', 'other.svg'), File.join(@dir, 'other.jpg'))
      expect(Dir.glob(File.join(Dir.tmpdir, 'magick-confine*'))).to match_array(before)
    end

    it "removes a private directory a finished job left behind, once it is stale" do
      stale = Dir.mktmpdir('magick-confine')
      fresh = Dir.mktmpdir('magick-confine')
      File.utime(Time.now - ImageMagickRunner::STALE_DIR_SECONDS - 60, Time.now - ImageMagickRunner::STALE_DIR_SECONDS - 60, stale)
      ImageMagickRunner.run('convert', write_svg(@dir, ''), File.join(@dir, 'out.jpg'))
      expect(File.exist?(stale)).to eq(false)
      expect(File.exist?(fresh)).to eq(true)
    ensure
      FileUtils.rm_rf(fresh) if fresh
    end

    it "sends the obf gem's identify through the runner and still reads dimensions" do
      expect(ImageMagickRunner).to receive(:capture).with('identify', '-verbose', @victim).and_call_original
      attrs = OBF::Utils.image_attrs(@victim)
      expect(attrs['width']).to eq(64)
      expect(attrs['content_type']).to eq('image/png')
    end
  end

  describe "the policy handed to ImageMagick" do
    def policy_for(*args)
      policy = nil
      allow(ImageMagickRunner).to receive(:system) do |*call|
        env = call.first
        policy = File.read(File.join(env['MAGICK_CONFIGURE_PATH'].split(':').first, 'policy.xml'))
        true
      end
      ImageMagickRunner.run(*args)
      policy
    end

    it "denies every path, then allows the input to be read and the output to be written" do
      input = File.join(@dir, 'in.svg')
      File.write(input, '<svg/>')
      out = File.join(@dir, 'out.jpg')
      rules = Nokogiri::XML(policy_for('convert', input, out)).xpath('/policymap/policy[@domain="path"]')
      expect(rules.first['pattern']).to eq('*')
      expect(rules.first['rights']).to eq('none')
      expect(rules.select { |r| r['rights'] == 'read' }.map { |r| r['pattern'] }).to include(input)
      expect(rules.select { |r| r['rights'] == 'write' }.map { |r| r['pattern'] }).to include(out)
      expect(rules.map { |r| r['pattern'] }).not_to include(@dir, "#{@dir}/*", "#{Dir.tmpdir}/*")
    end

    it "does not allow a path holding a character the policy cannot express literally" do
      input = File.join(@dir, 'in*.svg')
      File.write(input, '<svg/>')
      patterns = Nokogiri::XML(policy_for('convert', input, File.join(@dir, 'out.jpg'))).xpath('/policymap/policy').map { |r| r['pattern'] }
      expect(patterns.grep(/in\*/)).to eq([])
    end

    it "leaves commands other than ImageMagick alone" do
      expect(ImageMagickRunner).to receive(:system).with('/bin/echo', 'x', :in => File::NULL).and_return(true)
      ImageMagickRunner.run('/bin/echo', 'x')
    end
  end
end
