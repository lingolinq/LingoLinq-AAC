require 'spec_helper'
require 'tmpdir'
require 'open3'

describe ImageMagickRunner do
  describe "run" do
    it "does not pass arguments through a shell" do
      Dir.mktmpdir do |dir|
        ImageMagickRunner.run('/bin/echo', "hi; touch #{dir}/pwned")
        expect(File.exist?(File.join(dir, 'pwned'))).to eq(false)
      end
    end

    it "refuses a single-element argv" do
      # Kernel#system treats one argument as a shell command line, so this guard is the
      # only thing stopping a future caller from reintroducing the shell.
      Dir.mktmpdir do |dir|
        expect {
          ImageMagickRunner.run("/bin/echo hi; touch #{dir}/pwned")
        }.to raise_error(ArgumentError)
        expect(File.exist?(File.join(dir, 'pwned'))).to eq(false)
      end
    end

    it "redirects stdin away from the caller's" do
      # montage/convert fall back to reading stdin when handed an empty path and then block
      # forever, wedging the Resque worker. Asserted on the spawn option rather than by
      # actually blocking: the behavioural form falsifies by HANGING the suite rather than
      # failing it, which was verified by removing the guard.
      expect(ImageMagickRunner).to receive(:system).with('/bin/cat', '-', :in => File::NULL).and_return(true)
      ImageMagickRunner.run('/bin/cat', '-')
    end

    it "returns nil, without raising, when the process cannot be started" do
      # An earlier revision RAISED here, to mirror the old metacharacter-free `convert ...`
      # backtick. That was wrong: system returns nil for EVERY pre-exec failure, not just a
      # missing binary, and an exception escapes generate_preview so utterance.rb:55 never
      # latches large_image_url_attempted -- the job then re-enqueues on every later save.
      expect(ImageMagickRunner.run('definitely_no_such_binary_xyz', '-v')).to eq(nil)
    end

    it "does not raise when the argv is too large to exec" do
      # Reachable: button_list has no length cap (utterance.rb:331), and ~30k buttons of
      # Tempfile-length paths is ~1.8MB of argv, past ARG_MAX. Measured: system returns nil,
      # and a raise here would be a permanent, attacker-triggerable failure loop from one POST.
      path = '/tmp/image_stash20260905-1467643-wb5rbv.png.jpg'
      argv = ['/bin/true'] + Array.new(30_000) {|i| ['-label', "word#{i}", path] }.flatten
      expect { ImageMagickRunner.run(*argv) }.not_to raise_error
    end

    it "returns false, without raising, when the binary runs and fails" do
      expect(ImageMagickRunner.run('/bin/false', 'x')).to eq(false)
    end
  end

  # Both defects found in this function so far -- a leading space defeating the '@' guard, and
  # a Regexp raising on invalid UTF-8 -- were missed by hand-picked example inputs and would
  # each have been caught by one of the two sweeps below. Curated lists test what the author
  # already thought of; these enumerate the space and ask ImageMagick, which is the point.
  describe "escape_label, swept rather than sampled" do
    it "never raises, for any single byte in any position, or any odd encoding" do
      (0..255).each do |byte|
        [[byte, 0x40, 0x78], [0x61, byte, 0x40], [0x40, 0x78, byte]].each do |bytes|
          raw = bytes.pack('C*').force_encoding('UTF-8')
          expect { ImageMagickRunner.escape_label(raw) }.not_to raise_error,
            "raised for bytes #{bytes.inspect}"
        end
      end
      [[0xFF, 0x40].pack('C*').force_encoding('ASCII-8BIT'),
       [0xED, 0xB0, 0x80, 0x40].pack('C*').force_encoding('UTF-8'), # lone low surrogate, via JSON
       'plain'.encode('US-ASCII')].each do |raw|
        expect { ImageMagickRunner.escape_label(raw) }.not_to raise_error
      end
    end

    it "leaves no prefix byte able to walk ImageMagick to a file read" do
      skip('ImageMagick not installed') unless system('montage', '-version', :out => File::NULL, :err => File::NULL)
      Dir.mktmpdir do |dir|
        input = File.join(dir, 'in.png')
        system('convert', '-size', '40x40', 'xc:skyblue', input)
        File.write(File.join(dir, 'x.txt'), 'SECRET')
        reached = (1..127).select do |byte|
          label = ImageMagickRunner.escape_label(byte.chr + '@x.txt')
          out, _s = Open3.capture2e('montage', '-label', label, input, '-tile', '1x1',
                                    '-pointsize', '16', '-geometry', '40x40+3+10',
                                    File.join(dir, 'o.png'), :chdir => dir)
          out.include?('InterpretImageProperties')
        end
        expect(reached).to eq([]), "bytes #{reached.inspect} still reach the file-read branch"
      end
    end
  end

  describe "argv integrity" do
    it "hands the binary the exact argv it was given, in order and complete" do
      # Without this, run could drop, reorder or replace every argument after the command and
      # the suite stayed green: the only other assertion on what reaches `system` uses a
      # 2-element argv, where drop-last and reverse-tail are both no-ops.
      Dir.mktmpdir do |dir|
        recorder = File.join(dir, 'recorder')
        record = File.join(dir, 'argv.txt')
        File.write(recorder, "#!/bin/sh\nfor a in \"$@\"; do printf '%s\\n' \"$a\"; done > #{record}\n")
        File.chmod(0o755, recorder)
        args = ['-label', 'a b', '-tile', '3x1', '-bordercolor', '#888', 'out.png']
        ImageMagickRunner.run(recorder, *args)
        expect(File.read(record).split("\n")).to eq(args)
      end
    end
  end

  describe "escape_label, as a property over arbitrary labels" do
    ALPHABET = ['%', '\\', '@', ' ', "\t", 'a', 'Z', '5', '$', '&', '"', "\u00e9", "\u4e2d"].freeze

    it "doubles EVERY percent, not merely the first" do
      # `sub` in place of `gsub` is a one-character mutation that leaves the second '%' live:
      # measured, `a%%b%[fx:1+1]` renders differently from the correctly escaped form (AE 698),
      # i.e. the fx evaluator fired. Hardcoded-literal tests do not catch it.
      raw = 'a%b%[fx:1+1]'
      expect(ImageMagickRunner.escape_label(raw).count('%')).to eq(raw.count('%') * 2)
    end

    it "escapes reversibly, so nothing is dropped, mangled, or left live" do
      # An INVERSE property, not a re-implementation: un-doubling the output must reproduce the
      # input exactly. Randomised, so no lookup table of the literals this file happens to use
      # can satisfy it.
      srand(20260905)
      400.times do
        raw = Array.new(rand(0..8)) { ALPHABET.sample }.join
        escaped = ImageMagickRunner.escape_label(raw)
        expect(escaped.count('%')).to eq(raw.count('%') * 2), "percent not doubled for #{raw.inspect}"
        undone = escaped.sub(/\A([ \t\n\v\f\r]*)\\@/) { "#{Regexp.last_match(1)}@" }
        undone = undone.gsub('%%', '%').gsub('\\\\', '\\')
        expect(undone).to eq(raw), "not reversible: #{raw.inspect} -> #{escaped.inspect}"
      end
    end
  end

  describe "escape_label" do
    it "leaves ordinary AAC vocabulary alone" do
      expect(ImageMagickRunner.escape_label('cost $5 & up')).to eq('cost $5 & up')
      expect(ImageMagickRunner.escape_label('café')).to eq('café')
      expect(ImageMagickRunner.escape_label('say "hi"')).to eq('say "hi"')
    end

    it "doubles a percent so it cannot reach the format evaluator" do
      expect(ImageMagickRunner.escape_label('100% sure')).to eq('100%% sure')
      expect(ImageMagickRunner.escape_label('%[fx:1+1]')).to eq('%%[fx:1+1]')
    end

    it "doubles a backslash so it survives the label parser" do
      expect(ImageMagickRunner.escape_label('a\\b')).to eq('a\\\\b')
    end

    it "escapes a leading at-sign so ImageMagick cannot read a file" do
      expect(ImageMagickRunner.escape_label('@/etc/hostname')).to eq('\\@/etc/hostname')
    end

    it "neutralises an at-sign that ImageMagick reaches after leading whitespace" do
      # IM skips C isspace() bytes BEFORE testing for '@', so a byte-0 check is not enough.
      # The set below was measured by sweeping every ASCII byte as a prefix and asking montage
      # which ones reach InterpretImageProperties: exactly 9,10,11,12,13,32. No non-ASCII
      # whitespace (NBSP, U+1680, U+3000, U+2028, U+0085) triggers it, so the class is
      # deliberately explicit rather than \s, which is wrong in both directions.
      ['', ' ', '  ', "\t", "\n", "\v", "\f", "\r", " \t "].each do |prefix|
        escaped = ImageMagickRunner.escape_label("#{prefix}@/etc/hostname")
        expect(escaped).not_to match(/\A[ \t\n\v\f\r]*@/),
          "prefix #{prefix.inspect} left the at-sign live: #{escaped.inspect}"
      end
    end

    it "keeps the leading whitespace it escapes around" do
      expect(ImageMagickRunner.escape_label(' @home')).to eq(' \\@home')
    end

    it "stops montage reaching a file read for a whitespace-prefixed at-sign" do
      # Asks ImageMagick rather than encoding my own idea of which bytes count as space.
      # Oracle: the stock Debian policy (path rights=none pattern=@*) turns a REACHED file
      # read into an InterpretImageProperties error, so its absence means the read branch
      # was never entered. On a host without that policy this arm cannot observe the read;
      # the string assertion above is what covers that case.
      skip('ImageMagick not installed') unless system('montage', '-version', :out => File::NULL, :err => File::NULL)
      Dir.mktmpdir do |dir|
        input = File.join(dir, 'in.png')
        system('convert', '-size', '40x40', 'xc:skyblue', input)
        File.write(File.join(dir, 'x.txt'), 'SECRET')
        [' ', "\t", "\n"].each do |prefix|
          out, _status = Open3.capture2e('montage', '-label',
            ImageMagickRunner.escape_label("#{prefix}@x.txt"), input, '-tile', '1x1',
            '-pointsize', '16', '-geometry', '40x40+3+10', File.join(dir, 'o.png'),
            :chdir => dir)
          expect(out).not_to include('InterpretImageProperties'),
            "prefix #{prefix.inspect} reached ImageMagick's file-read branch"
        end
      end
    end

    it "leaves a non-leading at-sign alone" do
      expect(ImageMagickRunner.escape_label('e@x')).to eq('e@x')
    end

    it "does not raise on a label containing invalid UTF-8" do
      # Regexp matching raises ArgumentError on invalid byte sequences; String#start_with?,
      # which this replaced, did not. An exception here escapes generate_preview and leaves
      # large_image_url_attempted unset (utterance.rb:50-55), so the job re-enqueues on every
      # later save. Labels are attacker-supplied, so the escape must be encoding-agnostic.
      bad = [0xFF, 0x40, 0x78].pack('C*').force_encoding('UTF-8')
      expect(bad.valid_encoding?).to eq(false)
      expect { ImageMagickRunner.escape_label(bad) }.not_to raise_error
    end

    it "still escapes a leading at-sign when the label holds invalid UTF-8 further along" do
      bad = [0x20, 0x40, 0x78, 0xFF].pack('C*').force_encoding('UTF-8')
      expect(ImageMagickRunner.escape_label(bad).bytes.first(3)).to eq([0x20, 0x5C, 0x40])
    end

    it "coerces a non-string label" do
      expect(ImageMagickRunner.escape_label(42)).to eq('42')
      expect(ImageMagickRunner.escape_label(nil)).to eq('')
    end
  end
end
