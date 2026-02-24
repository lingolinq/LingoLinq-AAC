require 'spec_helper'

describe SentencePic do
  it "should error on a non-saved utterance" do
    u = Utterance.new
    expect{ SentencePic.generate(u) }.to raise_error("utterance must be saved first")
  end
  
  it "should generate a preview image" do
    author = User.create
    button_list = [
      {'label' => 'hat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'cat', 'image' => 'http://www.example.com/pib.png'},
      {'label' => 'scat', 'image' => 'http://www.example.com/pic.png'}
    ]
    u = Utterance.create(:user => author, :data => {
      'button_list' => button_list
    })
    expect(OBF::Utils).to receive(:save_image).with({'url' => 'http://www.example.com/pib.png'}).and_return("pic1.png")
    expect(OBF::Utils).to receive(:save_image).with({'url' => 'http://www.example.com/pic.png'}).and_return("pic2.png")
    expect(OBF::Utils).to receive(:temp_path).with('montage').and_return('/tmp/montage')
    expect(OBF::Utils).to receive(:temp_path).with('preview').and_return('/tmp/preview')
    expect(SentencePic).to receive(:'`').with("montage -label \"hat\" pic1.png -label \"cat\" pic1.png -label \"scat\" pic2.png -tile 3x1 -shadow -pointsize 16 -geometry 140x140+3+10 -border 2 -bordercolor \"#888\" /tmp/montage.png").and_return(nil)
    expect(SentencePic).to receive(:'`').with("convert /tmp/montage.png -gravity center -extent 500x240 /tmp/preview.png")
    key = GoSecure.sha512(u.id.to_s, 'utterance_id')[0, 25]
    expect(Uploader).to receive(:remote_upload).with("sentences/#{u.id}/#{key}/preview.png", "/tmp/preview.png", "image/png").and_return({url: "http://www.example.com/pid.png"})
    res = SentencePic.generate(u)
    expect(res).to eq("http://www.example.com/pid.png")
  end
end
