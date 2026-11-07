require 'spec_helper'
require 'tmpdir'

# OBF::Utils.fix_color must run node without a shell. A fake node first on PATH records the exact
# argv, and the examples also reject the backtick method outright, because a quoted or escaped shell
# string can pass an argv or marker check alone. @dir in a colour keeps its cache key unique.
describe 'OBF::Utils.fix_color hardening' do
  let(:script) { File.join(Gem.loaded_specs['obf'].full_gem_path, 'lib', 'tinycolor_convert.js') }

  around(:each) do |example|
    original_path = ENV['PATH']
    Dir.mktmpdir('fix-color') do |dir|
      @dir = dir
      @argv_log = File.join(dir, 'argv')
      @marker = File.join(dir, 'injected')
      fake = File.join(dir, 'node')
      File.write(fake, "#!/bin/sh\nfor a in \"$0\" \"$@\"; do echo \"$a\" >> '#{@argv_log}'; done\necho ' 010203 '\n")
      File.chmod(0o755, fake)
      ENV['PATH'] = "#{dir}:#{original_path}"
      ENV['FIX_COLOR_MARKER'] = @marker
      example.run
    ensure
      ENV['PATH'] = original_path
      ENV.delete('FIX_COLOR_MARKER')
    end
  end

  def recorded_argv
    File.read(@argv_log).split("\n")
  end

  it 'passes a hostile colour to node as one argument' do
    hostile = "rgb(1,2,3)$(touch $FIX_COLOR_MARKER);true #{@dir} #"
    expect(OBF::Utils).not_to receive(:'`')
    OBF::Utils.fix_color(hostile, 'hex')
    expect(recorded_argv).to eq([File.join(@dir, 'node'), script, hostile, 'hex'])
    expect(File.exist?(@marker)).to eq(false)
  end

  it 'passes a hostile conversion type to node as one argument' do
    color = "#{@dir}-type"
    hostile = '$(touch $FIX_COLOR_MARKER);true #'
    expect(OBF::Utils).not_to receive(:'`')
    OBF::Utils.fix_color(color, hostile)
    expect(recorded_argv).to eq([File.join(@dir, 'node'), script, color, hostile])
    expect(File.exist?(@marker)).to eq(false)
  end

  it 'raises when node cannot start' do
    ENV['PATH'] = @dir
    File.delete(File.join(@dir, 'node'))
    expect { OBF::Utils.fix_color("#{@dir}-missing", 'hex') }.to raise_error(Errno::ENOENT)
  end

  it 'passes the conversion type through and returns the stripped output' do
    color = "#{@dir}-contrast"
    expect(OBF::Utils).not_to receive(:'`')
    expect(OBF::Utils.fix_color(color, 'contrast')).to eq('010203')
    expect(recorded_argv).to eq([File.join(@dir, 'node'), script, color, 'contrast'])
  end

  it 'defaults the conversion type to hex' do
    color = "#{@dir}-default"
    expect(OBF::Utils).not_to receive(:'`')
    OBF::Utils.fix_color(color)
    expect(recorded_argv.last).to eq('hex')
  end

  it 'caches per colour and type' do
    color = "#{@dir}-cached"
    expect(OBF::Utils).not_to receive(:'`')
    2.times { OBF::Utils.fix_color(color, 'hex') }
    expect(recorded_argv.count(color)).to eq(1)
    OBF::Utils.fix_color(color, 'rgb')
    expect(recorded_argv.count(color)).to eq(2)
  end

  it 'gives node no stdin' do
    expect(IO).to receive(:popen).with(['node', script, "#{@dir}-stdin", 'hex'], hash_including(:in => File::NULL)).and_return('010203')
    OBF::Utils.fix_color("#{@dir}-stdin", 'hex')
  end
end

describe 'OBF::Utils.fix_color conversion' do
  around(:each) do |example|
    OBF::Utils.instance_variable_set(:@colors, nil)
    example.run
    OBF::Utils.instance_variable_set(:@colors, nil)
  end

  it 'converts colours with the gem script through real node' do
    expect(File.exist?(OBFFixColorHardening::SCRIPT)).to eq(true)
    {
      ['#fff', 'hex'] => 'ffffff',
      ['#fff', 'rgb'] => 'rgb(255, 255, 255)',
      ['#fff', 'contrast'] => '000000',
      ['red', 'hex'] => 'ff0000',
      ['red', 'rgb'] => 'rgb(255, 0, 0)',
      ['red', 'contrast'] => 'ffffff',
      ['rgba(0,0,0,0.5)', 'hex'] => '808080',
      ['rgba(0,0,0,0.5)', 'rgb'] => 'rgba(0, 0, 0, 0.5)',
      ['rgba(0,0,0,0.5)', 'contrast'] => 'ffffff',
      ['rgb(1, 2, 3)', 'hex'] => '010203',
      ['rgba(0, 0, 0, 0.5)', 'hex'] => '808080',
      ['-x', 'hex'] => '000000'
    }.each do |(color, type), expected|
      expect(OBF::Utils.fix_color(color, type)).to eq(expected)
    end
  end
end
