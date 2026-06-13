require 'spec_helper'

describe SvgSanitizer do
  SVG_FIXTURES_DIR = Rails.root.join('spec/fixtures/svg')

  def read_svg_fixture(name)
    File.read(SVG_FIXTURES_DIR.join(name))
  end

  describe '.svg_content_type?' do
    it 'matches svg mime types' do
      expect(described_class.svg_content_type?('image/svg+xml')).to eq(true)
      expect(described_class.svg_content_type?('image/svg')).to eq(true)
      expect(described_class.svg_content_type?('image/png')).to eq(false)
    end
  end

  describe '.sanitize' do
    it 'preserves real OpenSymbols mulberry SVG' do
      input = read_svg_fixture('mulberry-cat.svg')
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).to include('<svg')
      expect(result[:bytes]).to include('path')
      expect(result[:bytes]).not_to include('<script')
    end

    it 'preserves real OpenSymbols noun-project SVG' do
      input = read_svg_fixture('noun-project-test-tube.svg')
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).to include('<svg')
      expect(result[:changed]).to eq(false)
    end

    it 'preserves twemoji SVG with paths and defs' do
      input = read_svg_fixture('twemoji-home.svg')
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).to include('<path')
      expect(result[:bytes]).to include('clipPath')
    end

    it 'preserves animateTransform (spinner-style SVG)' do
      input = <<~SVG
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="32">
            <animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 50 50;360 50 50"/>
          </circle>
        </svg>
      SVG
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).to include('animateTransform')
    end

    it 'preserves a static symbol SVG' do
      input = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:changed]).to eq(false)
      expect(result[:bytes]).to include('<circle')
    end

    it 'strips script elements' do
      input = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:changed]).to eq(true)
      expect(result[:bytes]).not_to include('<script')
      expect(result[:bytes]).to include('<circle')
    end

    it 'strips on* event handlers' do
      input = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle onclick="x" cx="5" cy="5" r="4"/></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).not_to match(/onload/i)
      expect(result[:bytes]).not_to match(/onclick/i)
      expect(result[:bytes]).to include('<circle')
    end

    it 'strips foreignObject' do
      input = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body onload="x"></body></foreignObject></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).not_to include('foreignObject')
    end

    it 'strips javascript: xlink:href' do
      input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><text>hi</text></a></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).not_to include('javascript:')
    end

    it 'strips SMIL set targeting href' do
      input = '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:alert(1)"/></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).not_to include('<set')
    end

    it 'strips style attributes with javascript' do
      input = '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background:url(javascript:alert(1))" width="10" height="10"/></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).not_to include('javascript:')
    end

    it 'strips nested script inside style sibling (CVE-class vector)' do
      input = '<svg xmlns="http://www.w3.org/2000/svg"><style></style><script>alert(1)</script></svg>'
      result = described_class.sanitize(input)
      expect(result[:ok]).to eq(true)
      expect(result[:bytes]).not_to include('<script')
    end

    it 'rejects empty input' do
      result = described_class.sanitize('')
      expect(result[:ok]).to eq(false)
      expect(result[:error]).to eq('empty')
    end

    it 'rejects non-svg root' do
      result = described_class.sanitize('<html><body>x</body></html>')
      expect(result[:ok]).to eq(false)
      expect(result[:error]).to eq('no_svg_root')
    end

    it 'rejects unparseable content without svg root' do
      result = described_class.sanitize('not xml at all')
      expect(result[:ok]).to eq(false)
      expect(result[:error]).to eq('no_svg_root')
    end
  end

  describe '.sanitize_data_uri' do
    it 'sanitizes percent-encoded malicious SVG' do
      evil = 'data:image/svg+xml,' + CGI.escape('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
      result = described_class.sanitize_data_uri(evil)
      expect(result[:ok]).to eq(true)
      expect(result[:changed]).to eq(true)
      expect(result[:data_uri]).not_to include('script')
      decoded = described_class.decode_data_uri_payload(result[:data_uri])
      expect(decoded).not_to include('<script')
    end

    it 'sanitizes base64 malicious SVG' do
      evil = 'data:image/svg+xml;base64,' + Base64.strict_encode64('<svg onload="alert(1)"></svg>')
      result = described_class.sanitize_data_uri(evil)
      expect(result[:ok]).to eq(true)
      expect(result[:data_uri]).to match(/\Adata:image\/svg\+xml;base64,/)
      decoded = described_class.decode_data_uri_payload(result[:data_uri])
      expect(decoded).not_to match(/onload/i)
    end

    it 'passes through clean static SVG data URI' do
      good = 'data:image/svg+xml,' + CGI.escape('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>')
      result = described_class.sanitize_data_uri(good)
      expect(result[:ok]).to eq(true)
      expect(result[:data_uri]).to eq(good)
    end
  end
end
