import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import frame_listener from '../utils/frame_listener';
import i18n from '../utils/i18n';

import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';
import Button from '../utils/button';

export default Component.extend({
  didInsertElement: function() {
  },
  border_color: computed('row.border', function() {
    var border = (this.get('row.border') || '').trim();
    if(border.match(/^#[0-9abdef]{3}$/) || border.match(/^#[0-9abdef]{6}$/) || border.match(/^#[0-9abdef]{8}$/))  {
      return border;
    } else if(border.match(/^rgb\(\d+\s*,\s*\d+\s*,\s*\d+\)$/)) {
      return border;
    } else if(border.match(/^rgba\(\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[0-9\.]+\)/)) {
      return border;
    }
    return "#888";
  }),
  fill_color: computed('row.fill', function() {
    var fill = (this.get('row.fill') || '').trim();
    if(fill.match(/^#[0-9abdef]{3}$/) || fill.match(/^#[0-9abdef]{6}$/) || fill.match(/^#[0-9abdef]{8}$/))  {
      return fill;
    } else if(fill.match(/^rgb\(\d+\s*,\s*\d+\s*,\s*\d+\)$/)) {
      return fill;
    } else if(fill.match(/^rgba\(\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[0-9\.]+\)/)) {
      return fill;
    }
    return "#fff";
  }),
  box_style: computed('border_color', 'fill_color', function() {
    return htmlSafe("border: 1px solid " + Button.clean_text(this.get('border_color') || '#888') + "; background: " + Button.clean_text(this.get('fill_color') || '#fff') + ";");
  }),
  actions: {
  }
});
