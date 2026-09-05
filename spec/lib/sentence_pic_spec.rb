require 'spec_helper'
require 'tmpdir'

describe SentencePic do
  let(:author) { User.create }

  def utterance_with(labels)
    Utterance.create(:user => author, :data => {
      'button_list' => labels.map{|l| {'label' => l, 'image' => 'http://www.example.com/pib.png'} }
    })
  end

  it "should error on a non-saved utterance" do
    u = Utterance.new
    expect{ SentencePic.generate(u) }.to raise_error("utterance must be saved first")
  end

  it "should generate a preview image" do
    button_list = [
      {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
    ]
    u = Utterance.create(:user => author, :data => {'button_list' => button_list})
    expect(OBF::Utils).to receive(:save_image).with({'url' => 'http://www.example.com/pib.png'}).and_return("pic1.png")
    expect(OBF::Utils).to receive(:save_image).with({'url' => 'http://www.example.com/pic.png'}).and_return("pic2.png")
    expect(OBF::Utils).to receive(:temp_path).with('montage').and_return('/tmp/montage')
    expect(OBF::Utils).to receive(:temp_path).with('preview').and_return('/tmp/preview')
    expect(ImageMagickRunner).to receive(:run).with(
      'montage', '-label', 'hat', 'pic1.png', '-label', 'cat', 'pic1.png', '-label', 'scat', 'pic2.png',
      '-tile', '3x1', '-shadow', '-pointsize', '16', '-geometry', '140x140+3+10',
      '-border', '2', '-bordercolor', '#888', '/tmp/montage.png'
    ).and_return(nil)
    expect(ImageMagickRunner).to receive(:run).with(
      'convert', '/tmp/montage.png', '-gravity', 'center', '-extent', '500x240', '/tmp/preview.png'
    ).and_return(nil)
    key = GoSecure.sha512(u.id.to_s, 'utterance_id')[0, 25]
    expect(Uploader).to receive(:remote_upload).with("sentences/#{u.id}/#{key}/preview.png", "/tmp/preview.png", "image/png").and_return({url: "http://www.example.com/pid.png"})
    res = SentencePic.generate(u)
    expect(res).to eq("http://www.example.com/pid.png")
  end

  describe "shell safety" do
    # ONE button on purpose. With three buttons text_limit is 10 (sentence_pic.rb:28-30) and
    # every payload below is truncated to harmless text -- that is exactly how an earlier
    # version of this test passed against the live bug. One button => text_limit 25.
    # Do not "simplify" this fixture to reuse the three-button one above.
    def generate_in(dir, label)
      u = utterance_with([label])
      allow(OBF::Utils).to receive(:save_image).and_return('in.png')
      allow(OBF::Utils).to receive(:temp_path) {|name| File.join(dir, name) }
      allow(Uploader).to receive(:remote_upload).and_return({url: 'http://www.example.com/x.png'})
      # ImageMagick may be absent (CI installs none); the runner returns nil rather than
      # raising, so no guard is needed. These examples assert only that no marker file
      # appeared, and shell substitution fires during parsing, before the binary is looked up.
      Dir.chdir(dir) { SentencePic.generate(u) }
    end

    # These two DO execute against the unfixed code -- verified by running it. They are the
    # proof arms; if either regresses, a button label is running commands on the worker.
    { 'p1' => '$(touch p1)', 'p2' => '`touch p2`' }.each do |marker, label|
      it "does not let #{label.inspect} in a button label execute" do
        Dir.mktmpdir do |dir|
          generate_in(dir, label)
          expect(File.exist?(File.join(dir, marker))).to eq(false),
            "label #{label.inspect} executed a command: #{marker} was created"
        end
      end
    end

    # INERT against the ORIGINAL code (a ';' or '|' inside a double-quoted shell word is
    # literal), so these are regression guards, not proofs of the original bug. Each payload
    # ends in '#' deliberately: without it the shell runs `touch p3 in.png -tile 1x1 ...`,
    # and p6 uses '||' not '&&': montage exits non-zero, so '&&' would short-circuit and that
    # arm could never fire even against a fully shell-injectable implementation.
    # GNU touch rejects -tile, and no marker is created -- so the guard would pass against a
    # command built by joining argv into a shell string, which is precisely what it must catch.
    { 'p3' => 'x;touch p3 #', 'p4' => 'x|touch p4 #', 'p5' => "x\ntouch p5 #", 'p6' => 'x||touch p6 #' }.each do |marker, label|
      it "keeps #{label.inspect} inert in a button label" do
        Dir.mktmpdir do |dir|
          generate_in(dir, label)
          expect(File.exist?(File.join(dir, marker))).to eq(false)
        end
      end
    end

    it "does not use Kernel backticks" do
      expect(SentencePic).not_to receive(:'`')
      allow(ImageMagickRunner).to receive(:run) {|*args|
        expect(args.length).to be > 1
        expect(args).to all(be_a(String))
        nil
      }
      allow(OBF::Utils).to receive(:save_image).and_return('pic.png')
      allow(OBF::Utils).to receive(:temp_path) {|name| "/tmp/#{name}" }
      allow(Uploader).to receive(:remote_upload).and_return({url: 'http://www.example.com/x.png'})
      SentencePic.generate(utterance_with(['$(touch nope)']))
    end
  end

  describe "label content" do
    def args_for(labels)
      captured = []
      allow(ImageMagickRunner).to receive(:run) {|*args| captured << args; nil }
      allow(OBF::Utils).to receive(:save_image).and_return('pic.png')
      allow(OBF::Utils).to receive(:temp_path) {|name| "/tmp/#{name}" }
      allow(Uploader).to receive(:remote_upload).and_return({url: 'http://www.example.com/x.png'})
      SentencePic.generate(utterance_with(labels))
      captured
    end

    # Guards against "fixing" the injection by stripping characters out of AAC vocabulary.
    # Every escape below is content-preserving when rendered -- measured with
    # `compare -metric AE` on IM 6.9.12 (see the 2026-09-05 task log).
    it "preserves shell-significant characters in a label" do
      args = args_for(['cost $5 & up'])
      expect(args.first).to include('cost $5 & up')
    end

    it "preserves genuinely non-ASCII vocabulary" do
      label = "caf\u00e9 \u4e2d\u6587"
      expect(label.ascii_only?).to eq(false)
      expect(args_for([label]).first).to include(label)
    end

    it "preserves a label containing quotes" do
      args = args_for(['say "hi"'])
      expect(args.first).to include('say "hi"')
    end

    it "escapes ImageMagick's own label sigils rather than deleting them" do
      # '%' would otherwise reach IM's format evaluator: '%[fx:1+1]' renders as '2'.
      expect(args_for(['100% sure']).first).to include('100%% sure')
      # a lone backslash is consumed by IM's label parser; doubling keeps it visible
      expect(args_for(['a\\b']).first).to include('a\\\\b')
      # a LEADING '@' makes IM read a file and render its contents into the preview
      expect(args_for(['@home']).first).to include('\\@home')
      # ...but only when leading
      expect(args_for(['e@x']).first).to include('e@x')
    end

    it "escapes after truncating, so a split cannot revive a format specifier" do
      # 3 buttons => text_limit 10 (sentence_pic.rb:28-30), so an 11-char label truncates.
      # Correct order: truncate 'abcdefg%hij' -> 'abcdefg%' + '..' -> escape -> 'abcdefg%%..'
      # Escape-first would give 'abcdefg%%hij' -> truncate -> 'abcdefg%..', splitting the pair
      # back into a live specifier. IM really does interpret the result: '%..' warns
      # `unknown image property "%."`.
      args = args_for(['abcdefg%hij', 'second', 'third'])
      expect(args.first).to include('abcdefg%%..')
    end

    it "renders a non-string label as its string form rather than blanking it" do
      expect(args_for([42]).first).to include('42')
    end
  end

  describe "layout" do
    def gravity_for(count)
      captured = []
      allow(ImageMagickRunner).to receive(:run) {|*args| captured << args; nil }
      allow(OBF::Utils).to receive(:save_image).and_return('pic.png')
      allow(OBF::Utils).to receive(:temp_path) {|name| "/tmp/#{name}" }
      allow(Uploader).to receive(:remote_upload).and_return({url: 'http://www.example.com/x.png'})
      SentencePic.generate(utterance_with((1..count).map{|i| "w#{i}" }))
      convert = captured.detect{|a| a.first == 'convert' }
      convert[convert.index('-gravity') + 1]
    end

    # The gravity threshold is `> PER_ROW * 2` BUTTONS, i.e. north starts at 13. It must not
    # become a count of argv elements (3 per button), which would move it to 5 buttons and
    # silently reposition every ordinary sentence preview.
    it "centres a 6-button montage" do
      expect(gravity_for(6)).to eq('center')
    end

    it "centres a 12-button montage" do
      expect(gravity_for(12)).to eq('center')
    end

    it "top-aligns a 13-button montage" do
      expect(gravity_for(13)).to eq('north')
    end

    it "drops only the button whose image failed, keeping the others" do
      # The all-fail stub below leaves image_args EMPTY, which makes its assertions vacuous and
      # lets a placeholder-filename implementation pass. This exercises the mixed case.
      captured = []
      allow(ImageMagickRunner).to receive(:run) {|*args| captured << args; nil }
      allow(OBF::Utils).to receive(:save_image) {|img| img['url'].include?('bad') ? nil : 'ok.png' }
      allow(OBF::Utils).to receive(:temp_path) {|name| "/tmp/#{name}" }
      allow(Uploader).to receive(:remote_upload).and_return({url: 'http://www.example.com/x.png'})
      u = Utterance.create(:user => author, :data => {'button_list' => [
        {'label' => 'hat',  'image' => 'http://www.example.com/ok1.png'},
        {'label' => 'cat',  'image' => 'http://www.example.com/bad.png'},
        {'label' => 'scat', 'image' => 'http://www.example.com/ok2.png'}
      ]})
      SentencePic.generate(u)
      montage = captured.detect{|a| a.first == 'montage' }
      expect(montage).to include('hat')
      expect(montage).to include('scat')
      expect(montage).not_to include('cat')
      expect(montage).not_to include('')
    end

    it "skips a button whose image could not be fetched" do
      # save_image returns nil for an unreachable/too-small image, and the URL is
      # attacker-supplied. An empty argv element makes montage read STDIN and hang the
      # worker (measured: rc=124), so the button must be dropped entirely.
      captured = []
      allow(ImageMagickRunner).to receive(:run) {|*args| captured << args; nil }
      allow(OBF::Utils).to receive(:save_image).and_return(nil)
      allow(OBF::Utils).to receive(:temp_path) {|name| "/tmp/#{name}" }
      allow(Uploader).to receive(:remote_upload).and_return({url: 'http://www.example.com/x.png'})
      SentencePic.generate(utterance_with(['hat', 'cat']))
      montage = captured.detect{|a| a.first == 'montage' }
      expect(montage).not_to include('')
      expect(montage).not_to include(nil)
    end
  end
end
