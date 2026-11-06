require 'spec_helper'
require 'tmpdir'

# Both ImageMagick calls in Uploadable must run without a shell. Fake binaries first on PATH
# record the exact argv, and each example also rejects the backtick method outright, because a
# quoted or escaped shell string can pass an argv or marker check alone. The payload ends in '#'
# so a shell comments out the rest of the command line.
describe Uploadable, "ImageMagick argv" do
  let(:user) { User.create }
  let(:image) { ButtonImage.create(user: user, settings: {}) }

  around(:each) do |example|
    original_path = ENV['PATH']
    Dir.mktmpdir('uploadable-argv') do |dir|
      @dir = dir
      @argv_log = File.join(dir, 'argv')
      # The marker comes from the environment because a '/' cannot appear in a file name.
      @marker = File.join(dir, 'injected')
      @hostile_path = File.join(dir, 'stash$(touch $UPLOADABLE_ARGV_MARKER);true #')
      %w[identify convert].each do |binary|
        fake = File.join(dir, binary)
        File.write(fake, "#!/bin/sh\nfor a in \"$0\" \"$@\"; do echo \"$a\" >> '#{@argv_log}'; done\necho '3 4'\n")
        File.chmod(0o755, fake)
      end
      ENV['PATH'] = "#{dir}:#{original_path}"
      ENV['UPLOADABLE_ARGV_MARKER'] = @marker
      example.run
    ensure
      ENV['PATH'] = original_path
      ENV.delete('UPLOADABLE_ARGV_MARKER')
    end
  end

  def recorded_argv
    File.read(@argv_log).split("\n")
  end

  it "runs convert with an argv in convert_image" do
    expect(image).not_to receive(:'`')
    image.convert_image(@hostile_path)
    expect(recorded_argv).to eq([File.join(@dir, 'convert'), '-background', 'none', '-density', '300',
      '-resize', '400x400', '-gravity', 'center', '-extent', '400x400',
      @hostile_path, "#{@hostile_path}.raster.png"])
    expect(File.exist?(@marker)).to eq(false)
  end

  it "clears a pending raster when convert produces nothing" do
    expect(ImageMagickRunner).to receive(:run).and_return(nil)
    image.settings['rasterized'] = 'pending'
    image.save
    res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/svg+xml'}, :body => '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(Typhoeus).to receive(:get).and_return(res)

    image.upload_to_remote('http://pic.com/cow.svg', true)
    expect(image.reload.settings['rasterized']).to eq(nil)
  end

  it "writes a small download to disk before identify reads it" do
    # This fake reports the bytes it can see, so a buffered write shows up as a width of 0.
    File.write(File.join(@dir, 'identify'), "#!/bin/sh\necho \"$(wc -c < \"${3%\\[0\\]}\" | tr -d ' ') 1\"\n")
    res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => 'abcdefg')
    expect(Typhoeus).to receive(:get).and_return(res)
    allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(:success? => true))

    image.upload_to_remote('http://pic.com/cow.png')
    expect(image.settings['width']).to eq(7)
  end

  it "measures when the output is not valid UTF-8" do
    File.write(File.join(@dir, 'identify'), "#!/bin/sh\nprintf '3 4\\351\\n'\n")
    res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => 'abcdefg')
    expect(Typhoeus).to receive(:get).and_return(res)
    allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(:success? => true))

    image.upload_to_remote('http://pic.com/cow.png')
    expect(image.settings['width']).to eq(3)
  end

  it "ignores output that does not start with the two numbers" do
    File.write(File.join(@dir, 'identify'), "#!/bin/sh\necho 'Geometry: 7777x8888'\n")
    res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => 'abcdefg')
    expect(Typhoeus).to receive(:get).and_return(res)
    allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(:success? => true))

    image.upload_to_remote('http://pic.com/cow.png')
    expect(image.settings['width']).to eq(nil)
  end

  it "runs identify with an argv and reads its output when measuring a downloaded image" do
    expect(image).not_to receive(:'`')
    file = File.open(@hostile_path, 'wb+')
    allow(Tempfile).to receive(:new).and_call_original
    allow(Tempfile).to receive(:new).with(['stash', '']).and_return(file)
    res = OpenStruct.new(:success? => true, :headers => {'Content-Type' => 'image/png'}, :body => 'abcdefg')
    expect(Typhoeus).to receive(:get).and_return(res)
    allow(Typhoeus).to receive(:post).and_return(OpenStruct.new(:success? => true))

    image.upload_to_remote('http://pic.com/cow.png')
    expect(recorded_argv).to eq([File.join(@dir, 'identify'), '-format', '%w %h', "#{@hostile_path}[0]"])
    expect(image.settings['width']).to eq(3)
    expect(image.settings['height']).to eq(4)
    expect(File.exist?(@marker)).to eq(false)
  end
end
