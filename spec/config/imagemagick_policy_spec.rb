require 'spec_helper'

describe "ImageMagick policy" do
  let(:policy) { Nokogiri::XML(Rails.root.join('config/imagemagick/policy.xml').read) }
  let(:dockerfile) { Rails.root.join('Dockerfile').read }

  def denied(domain)
    policy.xpath("/policymap/policy[@domain='#{domain}' and @rights='none']").map { |rule| rule['pattern'] }
  end

  it "denies every coder in the agreed list, in live rules and not comments" do
    expected = %w[MSL EPHEMERAL TEXT MPC SHOW WIN PLT URL HTTP HTTPS FTP FILE
                  PS PS2 PS3 EPS EPS2 EPS3 EPI EPSF EPSI EPT EPT2 EPT3
                  PDF AI EPDF PDFA POCKETMOD XPS PCL]
    expect(denied('coder')).to match_array(expected)
  end

  it "denies the Ghostscript delegate and indirect reads" do
    expect(denied('delegate')).to eq(['gs'])
    expect(denied('path')).to eq(['@*'])
  end

  it "has no backtick, which ImageMagick's tokenizer treats as a quote and drops rules after" do
    expect(Rails.root.join('config/imagemagick/policy.xml').read).not_to include('`')
  end

  it "is set in the final image stage, which fails its build if the policy is not applied" do
    final_stage = dockerfile.split(/^FROM /).last
    expect(final_stage).to match(%r{^ENV MAGICK_CONFIGURE_PATH=/app/config/imagemagick$})
    copied = final_stage.index(/^COPY \. \.$/)
    check = final_stage.index('convert -list policy')
    expect(check).to be > copied
    expect(final_stage).to include("grep -q 'Path: /app/config/imagemagick/policy.xml'")
    expect(final_stage).to include("grep -qi 'pattern: PCL'")
    expect(final_stage).to include(%q(convert text:/etc/passwd null: 2>&1 | grep -q "security policy .TEXT"))
  end
end
