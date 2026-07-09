#!/usr/bin/env ruby
# frozen_string_literal: true

SKIP_PATH_PARTS = %w[archive].freeze

HELPER_SNIPPET = <<~JS
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
    this.ctrlActionEventValueBound = function(actionName, boundArg, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, boundArg, value);
      };
    };
JS

def skip?(path)
  SKIP_PATH_PARTS.any? { |part| path.include?(part) }
end

def migrate_content(content)
  # @key-up / @enter / @escape-press / @insert-newline with value=
  content.gsub!(
    /@key-up=\{\{action "([^"]+)" ([^" ]+) value="target\.value"\}\}/,
    '@key-up={{this.ctrlActionEventValueBound "\1" \2 "value"}}'
  )
  content.gsub!(
    /@(key-up|enter|escape-press|insert-newline)=\{\{action "([^"]+)" value="target\.value"\}\}/,
    '@\1={{this.ctrlActionEventValue "\2" "value"}}'
  )
  content.gsub!(
    /@(enter|escape-press|insert-newline)=\{\{action "([^"]+)"\}\}/,
    '@\1={{fn this.ctrlAction "\2"}}'
  )

  # DOM event attributes
  %w[onclick oninput onkeydown onkeyup onblur onfocus onpaste onchange
     ondragover ondrop ondragstart ondragend ondragleave ondblclick].each do |attr|
    event = attr.sub('on', '')
    content.gsub!(
      /#{attr}=\{\{action "([^"]+)" ([^}]+) value="target\.value"\}\}/,
      "{{on \"#{event}\" (this.ctrlActionEventValueBound \"\\1\" \\2 \"value\")}}"
    )
    content.gsub!(
      /#{attr}=\{\{action "([^"]+)" value="target\.value"\}\}/,
      "{{on \"#{event}\" (this.ctrlActionEventValue \"\\1\" \"value\")}}"
    )
    content.gsub!(
      /#{attr}=\{\{action "([^"]+)" ([^}]+)\}\}/,
      "{{on \"#{event}\" (this.ctrlAction \"\\1\" \\2)}}"
    )
    content.gsub!(
      /#{attr}=\{\{action "([^"]+)"\}\}/,
      "{{on \"#{event}\" (this.ctrlAction \"\\1\")}}"
    )
  end

  # {{action with on= modifier (legacy form helper)
  content.gsub!(
    /\{\{action "([^"]+)" on="submit"\}\}/,
    '{{on "submit" (this.ctrlAction "\1")}}'
  )
  content.gsub!(
    /\{\{action "([^"]+)" ([^}]+) on="submit"\}\}/,
    '{{on "submit" (this.ctrlAction "\1" \2)}}'
  )
  content.gsub!(
    /\{\{action "([^"]+)" on="keyDown"\}\}/,
    '{{on "keydown" (this.ctrlAction "\1")}}'
  )

  # element {{action}} with single quotes
  content.gsub!(
    /\{\{action '([^']+)' ([^}]+)\}\}/,
    '{{on "click" (this.ctrlAction "\1" \2)}}'
  )

  # element {{action}} - multi-arg then simple
  content.gsub!(
    /\{\{action "([^"]+)" ([^}]+)\}\}/,
    '{{on "click" (this.ctrlAction "\1" \2)}}'
  )
  content.gsub!(
    /\{\{action "([^"]+)"\}\}/,
    '{{on "click" (this.ctrlAction "\1")}}'
  )

  content
end

def ensure_helpers(js_content)
  return js_content if js_content.include?('ctrlActionEventValueBound')

  if js_content.include?('ctrlAction') && js_content.include?('var self = this;')
    return js_content.sub(
      /(this\.ctrlActionNoBubble = function\(actionName\) \{[^}]+\};)/m
    ) do |m|
      "#{m}\n    #{HELPER_SNIPPET}"
    end
  end

  if js_content =~ /init\s*\(\)\s*\{/
    js_content.sub(/init\s*\(\)\s*\{\s*\n(\s*)this\._super\([^)]*\);\s*\n/m) do |m|
      indent = Regexp.last_match(1)
      snippet = "var self = this;\n" + HELPER_SNIPPET.lines.map { |l| "#{indent}#{l}" }.join
      m + snippet
    end
  else
    js_content
  end
end

updated_hbs = []
updated_js = []

Dir.glob('app/{components,templates}/**/*.hbs').sort.each do |path|
  next if skip?(path)

  content = File.read(path)
  new_content = migrate_content(content.dup)
  next if new_content == content

  File.write(path, new_content)
  updated_hbs << path

  js = path.sub(%r{^app/templates/}, 'app/controllers/').sub(%r{^app/components/}, 'app/components/').sub(/\.hbs$/, '.js')
  js = path.sub('app/templates/', 'app/controllers/').sub(/\.hbs$/, '.js') if path.start_with?('app/templates/')
  js = path.sub(/\.hbs$/, '.js') if path.start_with?('app/components/')

  next unless File.exist?(js)

  new_js = ensure_helpers(File.read(js))
  next if new_js == File.read(js)

  File.write(js, new_js)
  updated_js << js
end

puts "HBS updated: #{updated_hbs.size}"
updated_hbs.each { |p| puts "  #{p}" }
puts "JS updated: #{updated_js.size}"
