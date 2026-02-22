import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import $ from 'jquery';


var boundClasses = {};
// TODO: need to periodically clear out CSS rule sheet or it will get big over time... maybe on new board view?
(function() {
  var styleElement = null;

  $.extend(boundClasses, {
    setup: function(reset) {
      if(!styleElement || reset) {
        this.classes = {
          '__': true
        };
        create_sheet();
      }
    },
    clear: function() {
      styleElement = null;
      this.classes = null;
    },
    keyify: function(button) {
      if(!button) { throw "need button"; }
      return ('b_' + (button.border_color || '') + '__' + (button.background_color || '')).replace(/[^a-zA-Z0-9]/g, '_');
    },
    add_rules: function(buttons) {
      if(!buttons) { return; }
      for(var idx = 0; idx < buttons.length; idx++) {
        var button = buttons[idx];
        boundClasses.add_rule(button);
      }
    },
    add_rule: function(button) {
      if(!button) { throw "need button"; }
      if(!this.classes || !styleElement) { console.log("must call setup before using bound_classes"); return false; }
      var key = this.keyify(button);
      if(!this.classes[key]) {
        var str = '';
        var hoverStr = '';
        var cornerStr = '';
        if(button.border_color) {
          // TODO: compute and store hover colors, mark them as "server-side approved"
          // and use them without tinycolor if approved
          var border = window.tinycolor(button.border_color || '#eee');
          str = str + 'border-color: ' + border.toRgbString() + ';';
          button.dark_border_color = window.tinycolor(border.toRgb()).darken(5).toRgbString();
          hoverStr = hoverStr + 'border-color: ' + button.dark_border_color + ';';
        }
        if(button.background_color) {
          var fill = window.tinycolor(button.background_color || '#fff');
          str = str + 'background-color: ' + fill.toRgbString() + ';';
          button.dark_background_color = window.tinycolor(fill.toRgb()).darken(5).toRgbString();
          hoverStr = hoverStr + 'background-color: ' + button.dark_background_color + ';';
          var text = window.tinycolor.mostReadable(fill, ['#fff', '#000']);
          button.text_color = text.toRgbString();
          str = str + 'color: ' + button.text_color + ';';
          if(button.background_color == button.border_color) {
            var border = window.tinycolor(button.border_color || '#eee');
            if(text.toHexString() == '#ffffff') {
              var light_corner = border.lighten(50).toRgbString();
              cornerStr = cornerStr + 'border-color: ' + light_corner + ' !important;'
            } else {
              var dark_corner = border.darken(50).toRgbString();
              cornerStr = cornerStr + 'border-color: ' + dark_corner + ' !important;'
            }
          }
        }

        add_css_rule('.button.' + key, str);
        add_css_rule('.button.' + key + ':hover, .button.' + key + '.touched, .button.' + key + ':focus', hoverStr);
        if(cornerStr) {
          add_css_rule('.button.' + key + ':not(.edit) .action_container.folder', cornerStr);
        }
        this.classes[key] = [str, hoverStr, button.dark_border_color, button.dark_background_color, button.text_color];
      } else {
        var vals = this.classes[key];
        button.dark_border_color = vals[2];
        button.dark_background_color = vals[3];
        button.text_color = vals[4];
      }
      return true;
    },
    add_classes: function(button) {
      if(!button) { throw "need button"; }
      var key = this.keyify(button);
      var classes = 'button ' + key;
      if(button.hidden) {
        classes = classes + " hidden_button";
      } else if(button.empty) {
        classes = classes + " empty";
      }
      if(button.link_disabled) {
        classes = classes + " link_disabled";
      }
      if(button.dim) {
        classes = classes + " dim_button";
      }
      emberSet(button, 'display_class', classes);
    }
  });

  function create_sheet() {
    // TODO: this is an attempted optimization for a poorly-performing method
    if(styleElement) { return; }

    // Create the <style> tag
    var newStyle = document.createElement('style');
    newStyle.setAttribute('data-for-board', 'true');

    // Add a media (and/or media query) here if you'd like!
    // style.setAttribute("media", "screen")
    // style.setAttribute("media", "@media only screen and (max-width : 1024px)")

    // WebKit hack :(
    newStyle.appendChild(document.createTextNode(''));

    // Remove prior instance if one existed
    if(styleElement) {
      document.head.removeChild(styleElement);
    }

    // Add the <style> element to the page
    document.head.appendChild(newStyle);

    styleElement = newStyle;
  }
  function add_css_rule(selector, rules, index) {
    var sheet = styleElement.sheet;
    if(sheet.insertRule) {
      sheet.insertRule(selector + '{' + rules + '}', index || sheet.cssRules.length);
    } else {
      sheet.addRule(selector, rules, index);
    }
  }
}).call(boundClasses);

export default boundClasses;
