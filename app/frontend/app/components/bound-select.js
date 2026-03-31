import Component from '@ember/component';
import { htmlSafe } from '@ember/template';
import { reads } from '@ember/object/computed';
import $ from 'jquery';
import { computed, observer } from '@ember/object';

export default Component.extend({
  tagName: 'span',
  content: null,
  prompt: null,
  action: function() { return this; },

  _selection: reads('selection'),

  init: function() {
    this._super(...arguments);
  },
  didInsertElement: function() {
    const selectEl = this.element && this.element.querySelector('select');
    if (!selectEl) {
      return;
    }
    const sel = this.get('selection');
    // Include '' so placeholder options (id '') stay in sync; `if (sel)` wrongly skipped them.
    if (sel !== undefined && sel !== null) {
      selectEl.value = sel;
    }
  },
  update_selection: observer('selection', function() {
    const selectEl = this.element && this.element.querySelector('select');
    if (!selectEl) {
      return;
    }
    const sel = this.get('selection');
    if (sel !== undefined && sel !== null) {
      selectEl.value = sel;
    }
  }),
  select_style: computed('short', function() {
    if(this.get('short')) {
      return htmlSafe('height: 25px; padding-top: 0; padding-bottom: 0;');
    } else {
      return htmlSafe('');
    }
  }),
  raw_content: computed('content', function() {
    // Ember got super slow at long lists for some reason..
    // Selection sync is handled by didInsertElement and update_selection observer.
    var elem = document.createElement('select');
    (this.get('content') || []).forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      opt.disabled = !!c.disabled;
      elem.appendChild(opt);
    });
    return htmlSafe(elem.innerHTML);
  }),

  actions: {
    change() {
      const selectEl = $(this.element).find('select')[0];
      const selectedIndex = selectEl.selectedIndex;
      const content = this.get('content');

      // decrement index by 1 if we have a prompt
      const hasPrompt = !!this.get('prompt');
      const contentIndex = hasPrompt ? selectedIndex - 1 : selectedIndex;

      const selection = content[contentIndex];

      // set the local, shadowed selection to avoid leaking
      // changes to `selection` out via 2-way binding
      this.set('_selection', selection);

      const changeCallback = this.get('action');
      changeCallback(selection.id);
    }
  }
});
