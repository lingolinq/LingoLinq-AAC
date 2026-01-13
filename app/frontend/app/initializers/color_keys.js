import app_state from '../utils/app_state';
import { htmlSafe } from '@ember/template';
import { set as emberSet, get as emberGet } from '@ember/object';

export default {
  name: 'color_keys',
  initialize: function() {
    window.LingoLinq.keyed_colors.forEach(function(r) {
      if(!emberGet(r, 'border')) {
        var fill = window.tinycolor(r.fill);
        var border = fill.darken(30);
        emberSet(r, 'border', border.toHexString());
      }
      emberSet(r, 'style', htmlSafe("border-color: " + r.border + "; background: " + r.fill + ";"));
    });
    app_state.set('colored_keys', true);
  }
};
