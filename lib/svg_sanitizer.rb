require 'loofah'
require 'nokogiri'
require 'base64'
require 'cgi'

# Sanitizes SVG uploads by stripping scriptable elements and attributes.
# Uses a Loofah scrubber on XML (not the sanitize gem — SVG is unsupported there).
class SvgSanitizer
  MAX_BYTES = 5 * 1024 * 1024

  DANGEROUS_ELEMENTS = %w[
    script foreignobject iframe object embed handler listener
  ].freeze

  ANIMATION_ELEMENTS = %w[
    animate animatetransform set animatemotion
  ].freeze

  DANGEROUS_ANIMATION_TARGETS = %w[
    href xlink:href event onclick onload onmouseover
  ].freeze

  URL_ATTRIBUTES = %w[
    href xlink:href src formaction data srcdoc
  ].freeze

  DANGEROUS_STYLE_PATTERN = /
    javascript: |
    expression\( |
    vbscript: |
    url\s*\(\s*["']?\s*(?:javascript|vbscript|data:text\/html):
  /ix.freeze

  class SvgScrubber < Loofah::Scrubber
    def initialize
      @direction = :top_down
    end

    def scrub(node)
      return CONTINUE unless node.element?

      name = node.name.to_s
      lname = name.downcase

      if SvgSanitizer::DANGEROUS_ELEMENTS.include?(lname)
        node.remove
        return STOP
      end

      if SvgSanitizer::ANIMATION_ELEMENTS.include?(lname)
        target = (node['attributeName'] || node['attributename']).to_s.downcase
        if SvgSanitizer::DANGEROUS_ANIMATION_TARGETS.include?(target)
          node.remove
          return STOP
        end
      end

      node.attribute_nodes.each do |attr|
        attr_name = attr.name.to_s
        attr_lower = attr_name.downcase

        if attr_lower.start_with?('on')
          node.remove_attribute(attr_name)
          next
        end

        if SvgSanitizer::URL_ATTRIBUTES.include?(attr_lower)
          value = attr.value.to_s.strip.downcase.gsub(/[\s\x00-\x1f]+/, '')
          unless SvgSanitizer.safe_url?(value)
            node.remove_attribute(attr_name)
          end
          next
        end

        if attr_lower == 'style' && attr.value.to_s.match?(SvgSanitizer::DANGEROUS_STYLE_PATTERN)
          node.remove_attribute(attr_name)
        end
      end

      CONTINUE
    end
  end

  def self.safe_url?(value)
    return true if value.empty?
    return false if value.match?(/\A(?:javascript|vbscript):/i)
    return false if value.match?(/\Adata:text\/html/i)

    true
  end

  def self.svg_content_type?(content_type)
    content_type.to_s.match?(/\Aimage\/svg/i)
  end

  def self.sanitize(input)
    bytes = input.to_s.b
    return failure('empty') if bytes.empty?
    return failure('too_large') if bytes.bytesize > MAX_BYTES

    doc = Loofah.xml_document(bytes)
    root = doc.root
    return failure('no_svg_root') unless root && root.name.to_s.downcase == 'svg'

    original = doc.to_xml(
      save_with: Nokogiri::XML::Node::SaveOptions::AS_XML |
                 Nokogiri::XML::Node::SaveOptions::NO_DECLARATION
    ).rstrip
    doc.scrub!(SvgScrubber.new)
    sanitized = doc.to_xml(
      save_with: Nokogiri::XML::Node::SaveOptions::AS_XML |
                 Nokogiri::XML::Node::SaveOptions::NO_DECLARATION
    ).rstrip

    {
      ok: true,
      bytes: sanitized,
      changed: sanitized != original,
      error: nil
    }
  rescue Nokogiri::XML::SyntaxError, ArgumentError => e
    failure("invalid_xml: #{e.message}")
  end

  def self.decode_data_uri_payload(data_uri)
    str = data_uri.to_s
    return nil unless str.match?(/\Adata:image\/svg\+xml/i)

    payload = str.sub(/\Adata:[^,]*,/, '')
    if str.match?(/;base64,/i)
      Base64.decode64(payload)
    else
      CGI.unescape(payload)
    end
  rescue StandardError
    nil
  end

  def self.encode_data_uri_payload(bytes, base64: false)
    if base64
      "data:image/svg+xml;base64,#{Base64.strict_encode64(bytes)}"
    else
      "data:image/svg+xml,#{CGI.escape(bytes)}"
    end
  end

  def self.sanitize_data_uri(data_uri)
    decoded = decode_data_uri_payload(data_uri)
    return failure('invalid_data_uri') unless decoded

    result = sanitize(decoded)
    return failure(result[:error]) unless result[:ok]

    base64 = data_uri.to_s.match?(/;base64,/i)
    new_uri = if result[:changed]
      encode_data_uri_payload(result[:bytes], base64: base64)
    else
      data_uri
    end

    {
      ok: true,
      data_uri: new_uri,
      bytes: result[:bytes],
      changed: new_uri != data_uri.to_s,
      error: nil
    }
  end

  def self.failure(error)
    { ok: false, bytes: nil, data_uri: nil, changed: false, error: error }
  end
  private_class_method :failure
end
