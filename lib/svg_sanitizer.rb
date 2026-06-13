require 'uri'
require 'loofah'
require 'nokogiri'
require 'base64'
require 'cgi'
require 'erb'

# Sanitizes SVG uploads by stripping scriptable elements and attributes.
# Uses a Loofah scrubber on XML (not the sanitize gem — SVG is unsupported there).
class SvgSanitizer
  MAX_BYTES = 5 * 1024 * 1024
  MAX_NODES = 10_000
  SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

  DANGEROUS_ELEMENTS = %w[
    script foreignobject iframe object embed handler listener
  ].freeze

  EXTERNAL_REFERENCE_ELEMENTS = %w[
    use image
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

  BLOCKED_URL_SCHEMES = /
    \A(?:javascript|vbscript|livescript|mocha|ecmascript):
  /ix.freeze

  ALLOWED_DATA_IMAGE_PREFIXES = [
    'data:image/png',
    'data:image/jpeg',
    'data:image/jpg',
    'data:image/gif',
    'data:image/webp'
  ].freeze

  DANGEROUS_STYLE_PATTERN = /
    javascript: |
    expression\( |
    vbscript: |
    url\s*\(\s*["']?\s*(?:javascript|vbscript|data:text\/html):
  /ix.freeze

  class SvgScrubber < Loofah::Scrubber
    attr_reader :node_count

    def initialize
      @direction = :top_down
      @node_count = 0
    end

    def scrub(node)
      return CONTINUE unless node.element?

      @node_count += 1
      return STOP if @node_count > SvgSanitizer::MAX_NODES

      name = node.name.to_s
      lname = name.downcase

      if SvgSanitizer::DANGEROUS_ELEMENTS.include?(lname)
        node.remove
        return STOP
      end

      if SvgSanitizer::EXTERNAL_REFERENCE_ELEMENTS.include?(lname)
        SvgSanitizer.strip_external_reference_attributes(node)
      end

      if SvgSanitizer::ANIMATION_ELEMENTS.include?(lname)
        target = SvgSanitizer.attribute_value(node, 'attributeName').downcase
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

  def self.attribute_value(node, name)
    node.attribute_nodes.each do |attr|
      return attr.value.to_s if attr.name.to_s.downcase == name.downcase
    end
    ''
  end

  def self.strip_external_reference_attributes(node)
    URL_ATTRIBUTES.each do |attr_name|
      value = attribute_value(node, attr_name)
      next if value.empty?
      next if value.start_with?('#')

      if value.match?(/\A(?:https?:)?\/\//i) || value.match?(/\Ahttps?:/i)
        node.attribute_nodes.each do |attr|
          node.remove_attribute(attr.name) if attr.name.to_s.downcase == attr_name
        end
      end
    end
  end

  def self.safe_url?(value)
    return true if value.empty?
    return false if value.match?(BLOCKED_URL_SCHEMES)
    return false if value.match?(/\Adata:/i) && !allowed_data_image_url?(value)

    true
  end

  def self.allowed_data_image_url?(value)
    ALLOWED_DATA_IMAGE_PREFIXES.any? { |prefix| value.downcase.start_with?(prefix) }
  end

  def self.svg_content_type?(content_type)
    content_type.to_s.match?(/\Aimage\/svg/i)
  end

  def self.looks_like_svg?(bytes)
    sample = bytes.to_s.lstrip.byteslice(0, 4096).to_s.downcase
    sample.include?('<svg') && !sample.match?(/<!doctype\s+html|<html[\s>]/)
  end

  def self.sanitize(input)
    bytes = input.to_s.b
    return failure('empty') if bytes.empty?
    return failure('too_large') if bytes.bytesize > MAX_BYTES
    return failure('html_document') if bytes.lstrip.match?(/\A(?:<!doctype\s+html|<html[\s>])/i)

    doc = parse_svg_document(bytes)
    return doc if doc.is_a?(Hash)

    root = doc.root
    return failure('no_svg_root') unless svg_root?(root)

    loofah_doc = Loofah.xml_document(serialize_document(doc))
    original = serialize_loofah_document(loofah_doc)
    scrubber = SvgScrubber.new
    loofah_doc.scrub!(scrubber)
    return failure('too_many_nodes') if scrubber.node_count > MAX_NODES

    sanitized = serialize_loofah_document(loofah_doc)

    {
      ok: true,
      bytes: sanitized,
      changed: sanitized != original,
      error: nil
    }
  rescue Nokogiri::XML::SyntaxError, ArgumentError => e
    failure("invalid_xml: #{e.message}")
  end

  def self.parse_svg_document(bytes)
    doc = Nokogiri::XML(bytes) do |config|
      config.nonet.noent.strict
    end
    if doc.errors.any? { |err| err.fatal? || err.error? }
      return failure('invalid_xml')
    end
    doc
  end

  def self.svg_root?(node)
    return false unless node && node.name.to_s.downcase == 'svg'

    ns = node.namespace&.href
    ns.nil? || ns == SVG_NAMESPACE
  end

  def self.serialize_loofah_document(doc)
    doc.to_xml(
      save_with: Nokogiri::XML::Node::SaveOptions::AS_XML |
                 Nokogiri::XML::Node::SaveOptions::NO_DECLARATION
    ).rstrip
  end

  def self.serialize_document(doc)
    doc.to_xml(
      save_with: Nokogiri::XML::Node::SaveOptions::AS_XML |
                 Nokogiri::XML::Node::SaveOptions::NO_DECLARATION
    ).rstrip
  end

  def self.decode_data_uri_payload(data_uri)
    str = data_uri.to_s
    return nil unless str.match?(/\Adata:image\/svg\+xml/i)

    payload = str.sub(/\Adata:[^,]*,/, '')
    if str.match?(/;base64,/i)
      Base64.strict_decode64(payload)
    else
      URI.decode_www_form_component(payload)
    end
  rescue StandardError
    nil
  end

  def self.decode_image_data_uri_payload(data_uri)
    str = data_uri.to_s
    return nil unless str.match?(/\Adata:image\//i)

    return decode_data_uri_payload(str) if str.match?(/\Adata:image\/svg\+xml/i)

    payload = str.sub(/\Adata:[^,]*,/, '')
    if str.match?(/;base64,/i)
      Base64.strict_decode64(payload)
    else
      URI.decode_www_form_component(payload)
    end
  rescue StandardError
    nil
  end

  def self.encode_data_uri_payload(bytes, base64: false)
    if base64
      "data:image/svg+xml;base64,#{Base64.strict_encode64(bytes)}"
    else
      "data:image/svg+xml,#{ERB::Util.url_encode(bytes)}"
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
