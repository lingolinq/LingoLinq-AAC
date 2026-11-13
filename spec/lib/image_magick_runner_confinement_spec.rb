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
      # The blue rect makes a refused read render blue; without it the result is white, whose red is 1.0.
      input = write_svg(@dir, "<image href=\"#{@victim}\" width=\"64\" height=\"64\"/>", 'in.png')
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', input, '-flatten', out)
      expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
    end

    it "does not draw a file reached by walking up out of its own private directory" do
      private_dir = File.join(@dir, 'magick-confine-known')
      allow(Dir).to receive(:mktmpdir).and_call_original
      allow(Dir).to receive(:mktmpdir).with('magick-confine') { FileUtils.mkdir_p(private_dir) && private_dir }
      input = write_svg(@dir, "<image href=\"#{private_dir}/..#{@victim.delete_prefix(@dir)}\" width=\"64\" height=\"64\"/>")
      out = File.join(@dir, 'out.jpg')
      ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
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

    # ImageMagick reads policy files under $HOME and $XDG_CONFIG_HOME after the private one, and the
    # last matching rule wins, so one there that allows every path would undo the confinement.
    it "ignores a policy file under HOME or XDG_CONFIG_HOME that allows every path" do
      home = File.join(@dir, 'home')
      allow_all = "<policymap>\n  <policy domain=\"path\" rights=\"read|write\" pattern=\"*\"/>\n</policymap>\n"
      [File.join(home, '.config', 'ImageMagick'), File.join(home, '.magick'), File.join(home, 'xdg', 'ImageMagick')].each do |d|
        FileUtils.mkdir_p(d)
        File.write(File.join(d, 'policy.xml'), allow_all)
      end
      saved = ENV.to_h.slice('HOME', 'XDG_CONFIG_HOME')
      begin
        ENV['HOME'] = home
        ENV['XDG_CONFIG_HOME'] = File.join(home, 'xdg')
        input = write_svg(@dir, "<image href=\"#{@victim}\" width=\"64\" height=\"64\"/>")
        out = File.join(@dir, 'out.jpg')
        ImageMagickRunner.run('convert', '-background', 'white', input, '-flatten', out)
        expect(!File.exist?(out) || mean_red(out) < 0.1).to eq(true)
      ensure
        %w[HOME XDG_CONFIG_HOME].each { |k| saved.key?(k) ? ENV[k] = saved[k] : ENV.delete(k) }
      end
    end

    # Every policy file ImageMagick loads after the private one (the app's config/imagemagick, the
    # system's, any other) must not grant a path, or it would override the private policy.
    it "loads no policy file, other than the private one, that grants a path" do
      saved = ENV['MAGICK_CONFIGURE_PATH']
      begin
        ENV['MAGICK_CONFIGURE_PATH'] = Rails.root.join('config/imagemagick').to_s
        listing = ImageMagickRunner.capture('convert', '-list', 'policy')
      ensure
        saved ? ENV['MAGICK_CONFIGURE_PATH'] = saved : ENV.delete('MAGICK_CONFIGURE_PATH')
      end
      sections = listing.split(/^Path: /).drop(1).map { |s| [s.lines.first.strip, s] }
      expect(sections.map(&:first)).to include(Rails.root.join('config/imagemagick/policy.xml').to_s)
      granting = sections.reject { |file, _| File.basename(File.dirname(file)).start_with?('magick-confine') }.flat_map do |file, body|
        body.split(/^\s*Policy: /).select { |p| p.start_with?('Path') && p[/rights:\s*(.*)$/, 1].to_s.strip != 'None' }.map { |p| "#{file}: #{p.strip}" }
      end
      expect(granting).to eq([])
    end
  end

  # The leak examples above pass when the forbidden file is not drawn. These run the same renders with
  # no confinement and must draw it, so a pass above means the confinement stopped a read this
  # ImageMagick would otherwise make.
  describe "the same renders, unconfined" do
    before(:each) do
      skip('ImageMagick not installed') unless system('convert', '-version', :out => File::NULL, :err => File::NULL)
      system('convert', '-size', '64x64', 'xc:red', @victim)
    end

    def unconfined(*args)
      system(*args, :out => File::NULL, :err => File::NULL)
    end

    def drawn?(path)
      File.exist?(path) && mean_red(path) > 0.1
    end

    let(:href) { "<image href=\"#{@victim}\" width=\"64\" height=\"64\"/>" }
    let(:out) { File.join(@dir, 'out.jpg') }

    it "draws a file named by absolute path (runner shape)" do
      unconfined('convert', '-background', 'white', write_svg(@dir, href), '-flatten', out)
      expect(drawn?(out)).to eq(true)
    end

    it "draws a file named through xlink:href" do
      body = "<image xlink:href=\"#{@victim}\" width=\"64\" height=\"64\"/>"
      input = File.join(@dir, 'in.svg')
      File.write(input, "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"blue\"/>#{body}</svg>")
      unconfined('convert', '-background', 'white', input, '-flatten', out)
      expect(drawn?(out)).to eq(true)
    end

    it "draws a file named in an svg under a raster file name" do
      unconfined('convert', write_svg(@dir, href, 'in.png'), '-flatten', out)
      expect(drawn?(out)).to eq(true)
    end

    it "draws a file reached by walking up out of a system directory" do
      allowed = Dir.glob(ImageMagickRunner::SYSTEM_READ_GLOBS).find { |d| File.directory?(d) }
      skip('no ImageMagick config or font directory found') unless allowed
      walk = File.join(File.realpath(allowed), *Array.new(File.realpath(allowed).count('/'), '..')) + @victim
      unconfined('convert', '-background', 'white', write_svg(@dir, "<image href=\"#{walk}\" width=\"64\" height=\"64\"/>"), '-flatten', out)
      expect(drawn?(out)).to eq(true)
    end

    it "draws a file named in an svg rendered as save_image renders an svg" do
      input = write_svg(@dir, href)
      unconfined('convert', '-background', 'white', '-density', '300', '-resize', '400x400', '-gravity', 'center',
                 '-extent', '400x400', input, '-flatten', out)
      expect(drawn?(out)).to eq(true)
    end

    it "draws a file named in an svg rendered as save_image renders a non-svg" do
      input = write_svg(@dir, href, 'in.png')
      unconfined('convert', input, '-density', '300', '-resize', '400x400', '-background', 'white', '-gravity', 'center',
                 '-extent', '400x400', '-flatten', out)
      expect(drawn?(out)).to eq(true)
    end

    it "draws a file named in an svg rendered as convert_image renders it" do
      input = write_svg(@dir, href)
      raster = "#{input}.raster.png"
      unconfined('convert', '-background', 'none', '-density', '300', '-resize', '400x400', '-gravity', 'center',
                 '-extent', '400x400', input, raster)
      expect(drawn?(raster)).to eq(true)
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

    def denies_first?(env)
      policy = File.read(File.join(env['MAGICK_CONFIGURE_PATH'].split(':').first, 'policy.xml'))
      rule = Nokogiri::XML(policy).xpath('/policymap/policy[@domain="path"]').first
      rule['pattern'] == '*' && rule['rights'] == 'none'
    end

    it "hands the same policy to capture" do
      seen = nil
      allow(IO).to receive(:popen) do |env, *_rest|
        seen = env.is_a?(Hash) && denies_first?(env)
        ''
      end
      ImageMagickRunner.capture('identify', '-format', '%w', File.join(@dir, 'x.png'))
      expect(seen).to eq(true)
    end

    it "hands the same policy to spawn" do
      seen = nil
      allow(Process).to receive(:spawn) do |env, *_rest|
        seen = env.is_a?(Hash) && denies_first?(env)
        999_999_999
      end
      ImageMagickRunner.spawn('convert', File.join(@dir, 'x.svg'), File.join(@dir, 'x.jpg'))
      expect(seen).to eq(true)
    end

    # ImageMagick 6.9.12 matches a pattern against the path as written, and '*' spans '/', so
    # '<allowed dir>/../../<file>' matches '<allowed dir>/*'. The last matching rule wins.
    it "ends with a rule refusing any path that has a '..' segment" do
      input = File.join(@dir, 'in.svg')
      File.write(input, '<svg/>')
      rules = Nokogiri::XML(policy_for('convert', input, File.join(@dir, 'out.jpg'))).xpath('/policymap/policy[@domain="path"]')
      expect(rules.last['pattern']).to eq('*/..*')
      expect(rules.last['rights']).to eq('none')
    end

    # A Regexp on a string that is not valid UTF-8 raises ArgumentError, and a label is an argument.
    it "runs with an argument that is not valid UTF-8, and allows nothing for it" do
      input = File.join(@dir, 'in.svg')
      File.write(input, '<svg/>')
      label = "caf\xE9".dup.force_encoding('UTF-8')
      policy = nil
      expect { policy = policy_for('montage', '-label', label, input, File.join(@dir, 'out.jpg')) }.not_to raise_error
      expect(Nokogiri::XML(policy).xpath('/policymap/policy').map { |r| r['pattern'] }).to include(input)
    end

    it "runs with an output path that is not valid UTF-8, and allows no write for it" do
      input = File.join(@dir, 'in.svg')
      File.write(input, '<svg/>')
      out = File.join(@dir, "out\xE9.jpg".dup.force_encoding('UTF-8'))
      policy = nil
      expect { policy = policy_for('convert', input, out) }.not_to raise_error
      expect(Nokogiri::XML(policy).xpath('/policymap/policy[@rights="write"]').length).to eq(0)
    end

    def confine_dirs
      Dir.glob(File.join(Dir.tmpdir, 'magick-confine*'))
    end

    # run must not raise: an exception escaping the sentence preview job re-enqueues it on every save.
    it "returns nil, runs nothing and leaves no directory when an argument holds a NUL byte" do
      input = File.join(@dir, 'in.svg')
      File.write(input, '<svg/>')
      before = confine_dirs
      expect(ImageMagickRunner).not_to receive(:system)
      expect(ImageMagickRunner.run('montage', '-label', "/a\0", input, File.join(@dir, 'out.jpg'))).to eq(nil)
      expect(confine_dirs - before).to eq([])
    end

    it "returns nil, runs nothing and leaves no directory when the policy cannot be written" do
      input = File.join(@dir, 'in.svg')
      File.write(input, '<svg/>')
      allow(File).to receive(:write).and_call_original
      allow(File).to receive(:write).with(end_with('policy.xml'), anything).and_raise(Errno::ENOSPC)
      before = confine_dirs
      expect(ImageMagickRunner).not_to receive(:system)
      expect(ImageMagickRunner.run('convert', input, File.join(@dir, 'out.jpg'))).to eq(nil)
      expect(confine_dirs - before).to eq([])
    end

    it "leaves commands other than ImageMagick alone" do
      expect(ImageMagickRunner).to receive(:system).with('/bin/echo', 'x', :in => File::NULL).and_return(true)
      ImageMagickRunner.run('/bin/echo', 'x')
    end
  end
end
