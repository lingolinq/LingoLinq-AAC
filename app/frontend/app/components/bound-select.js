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
    if(this.get('selection') && this.element.querySelector('select')) {
      this.element.querySelector('select').value = this.get('selection');
    }
  },
  update_selection: observer('selection', function() {
    if(this.get('selection') && this.element.querySelector('select')) {
      this.element.querySelector('select').value = this.get('selection');
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
    var elem = document.createElement('select');
    var sel = this.get('selection');
    (this.get('content') || []).forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      if(sel && sel == opt.value) {
        opt.setAttribute('selected', true);
      }
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
