#!/usr/bin/env ruby
# frozen_string_literal: true

EVENT_VALUE = <<~'JS'.strip
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
JS

EVENT_VALUE_BOUND = <<~'JS'.strip
    this.ctrlActionEventValueBound = function(actionName, boundArg, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, boundArg, value);
      };
    };
JS

MUT = <<~'JS'.strip
    this.ctrlActionMut = function(propPath, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.set(propPath, value);
      };
    };
JS

CTRL_ACTION = <<~'JS'.strip
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
JS

def insert_after_no_bubble(content, extra)
  return content if content.include?(extra.lines.first.strip)

  if content.include?('ctrlActionNoBubble')
    content.sub(
      /(this\.ctrlActionNoBubble = function\(actionName\) \{[^}]+\};)\s*\n/m,
      "\\1\n    #{extra}\n"
    )
  elsif content.include?('this.ctrlAction = function')
    content.sub(
      /(this\.ctrlAction = function\(actionName\) \{[^}]+\}[^;]*;\s*\n(?:\s*return function[^}]+\}[^;]*;\s*\n)?\s*\};)\s*\n/m,
      "\\1\n    #{extra}\n"
    )
  else
    content
  end
end

def ensure_init_with_helpers(content, helpers_body)
  return content if content.include?('ctrlAction') && helpers_body.lines.all? { |l| l.strip.empty? || content.include?(l.strip) }

  if content =~ /init\s*\(\)\s*\{/
    insert_after_no_bubble(content, helpers_body)
  else
    content.sub(
      /export default \w+\.extend\(\{\s*\n/m,
      "export default \\0  init() {\n    this._super(...arguments);\n    var self = this;\n    #{CTRL_ACTION}\n    #{helpers_body}\n  },\n\n"
    )
  end
end

patches = {
  'app/components/label-chips.js' => EVENT_VALUE,
  'app/components/create-board-new.js' => EVENT_VALUE,
  'app/components/new-board.js' => EVENT_VALUE,
  'app/components/eval-comprehensive-runner.js' => EVENT_VALUE,
  'app/components/eval-quick-report.js' => EVENT_VALUE,
  'app/components/button-settings.js' => EVENT_VALUE,
  'app/components/confirm-delete-board.js' => EVENT_VALUE,
  'app/controllers/system-settings.js' => EVENT_VALUE_BOUND,
  'app/controllers/system-settings/email-edit.js' => "#{CTRL_ACTION}\n    #{EVENT_VALUE_BOUND}",
  'app/controllers/system-settings/features.js' => MUT,
  'app/controllers/system-settings/emails.js' => MUT,
  'app/controllers/beta-feedback-admin/index.js' => MUT,
}

patches.each do |path, helpers|
  next unless File.exist?(path)

  content = File.read(path)
  if path == 'app/controllers/system-settings/email-edit.js'
    new_content = ensure_init_with_helpers(content, helpers)
  elsif path == 'app/controllers/system-settings/emails.js'
    new_content = ensure_init_with_helpers(content, helpers)
  elsif path == 'app/components/button-settings.js'
    next if content.include?('ctrlActionEventValue')
    new_content = content.sub(
      /(this\.set\('ctrlAction', function\(actionName\) \{[^}]+\}[^;]*;\s*\n\s*\}\);)\s*\n/,
      "\\1\n    this.set('ctrlActionEventValue', function(actionName, targetProp) {\n      return function(event) {\n        var value = event && event.target ? event.target[targetProp] : undefined;\n        self.send(actionName, value);\n      };\n    });\n"
    )
  else
    new_content = insert_after_no_bubble(content, helpers)
  end

  next if new_content == content

  File.write(path, new_content)
  puts "patched #{path}"
end

# style-switcher: minimal ctrlAction init
path = 'app/components/style-switcher.js'
content = File.read(path)
unless content.include?('ctrlAction')
  new_content = content.sub(
    /menu_open: false,\s*\n/,
    "menu_open: false,\n\n  init() {\n    this._super(...arguments);\n    var self = this;\n    #{CTRL_ACTION}\n  },\n\n"
  )
  File.write(path, new_content)
  puts "patched #{path}"
end
