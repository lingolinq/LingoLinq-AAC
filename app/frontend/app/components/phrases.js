import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { set as emberSet } from '@ember/object';
import modal from '../utils/modal';
import stashes from '../utils/_stashes';
import app_state from '../utils/app_state';
import utterance from '../utils/utterance';
import i18n from '../utils/i18n';

/**
 * Phrases Modal Component
 *
 * Converted from modals/phrases template/controller to component.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    this.set('app_state', app_state);
    this.set('stashes', stashes);
    const modalService = this.get('modal');
    const template = 'modals/phrases';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  update_categores: observer('current_category', 'phrases', function() {
    const current = this.get('current_category');
    (this.get('categories') || []).forEach(function(c) {
      emberSet(c, 'active', current === c.id);
    });
  }),

  update_list: observer(
    'stashes.remembered_vocalizations.length',
    'user.vocalizations',
    'user.vocalizations.@each.id',
    function() {
      let utterances = stashes.get('remembered_vocalizations') || [];
      const _this = this;
      let categories = this.get('user.preferences.phrase_categories') || [];
      categories = ['default'].concat(categories).concat(['journal']);
      if (_this.get('user')) {
        utterances = utterances.filter(function(u) { return u.stash; });
        (_this.get('user.vocalizations') || []).forEach(function(u) {
          if (u && u.list) {
            let cat = u.category || 'default';
            if (categories.indexOf(cat) === -1) {
              if (categories.indexOf('other') === -1) {
                categories.push('other');
              }
              cat = 'other';
            }
            utterances.push({
              id: u.id,
              category: cat,
              date: new Date(u.ts * 1000),
              sentence: u.list.map(function(v) { return v.label; }).join(' '),
              vocalizations: u.list,
              stash: false
            });
          }
        });
      }
      this.set('phrases', utterances);
      const current = this.get('current_category');
      this.set('categories', categories.map(function(c) {
        const cat = { name: c, active: c === current, id: c };
        if (c === 'default') {
          cat.name = i18n.t('quick', "Quick");
        } else if (c === 'journal') {
          cat.name = i18n.t('journal', "Journal");
        }
        return cat;
      }));
    }
  ),

  category_phrases: computed(
    'phrases',
    'phrases.length',
    'phrases.@each.id',
    'current_category',
    'recent_category',
    function() {
      if (this.get('recent_category')) {
        const now = (new Date()).getTime();
        const priors = (stashes.get('prior_utterances') || []).filter(function(p) { return p.cleared > (now - (24 * 60 * 60 * 1000)); }).reverse();
        priors.forEach(function(p) {
          emberSet(p, 'sentence', utterance.sentence(p.vocalizations));
          emberSet(p, 'date', new Date(p.cleared));
          emberSet(p, 'stash', true);
        });
        return priors;
      } else {
        const cat = this.get('current_category');
        return (this.get('phrases') || []).filter(function(u) { return u.category === cat; });
      }
    }
  ),

  journaling: computed('current_category', function() {
    return this.get('current_category') === 'journal';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      const voc = stashes.get('working_vocalization') || [];
      this.set('sentence', voc.map(function(v) { return v.label; }).join(' '));
      this.set('user', this.get('model.user') || app_state.get('referenced_user'));
      this.set('current_category', 'default');
      this.set('recent_category', null);
      this.update_list();
    },
    closing() {},
    select(button) {
      if (button.stash) {
        utterance.set('rawButtonList', button.vocalizations);
        utterance.set('list_vocalized', false);
        const list = (stashes.get('remembered_vocalizations') || []).filter(function(v) { return !v.stash || v.sentence !== button.sentence; });
        stashes.persist('remembered_vocalizations', list);
      } else {
        app_state.set_and_say_buttons(button.vocalizations);
      }
      this.get('modal').close();
    },
    set_recent() {
      this.set('current_category', null);
      this.set('recent_category', true);
    },
    set_category(cat) {
      this.set('current_category', cat.id);
      this.set('recent_category', null);
    },
    remove(phrase) {
      if (this.get('recent_category')) {
        const list = (stashes.get('prior_utterances') || []).filter(function(p) { return p !== phrase; });
        stashes.persist('prior_utterances', list);
      } else {
        app_state.remove_phrase(phrase);
      }
      this.update_list();
    },
    shift(phrase, direction) {
      app_state.shift_phrase(phrase, direction);
      this.update_list();
    },
    add() {
      const sentence = this.get('sentence');
      if (!sentence) { return; }
      let voc = stashes.get('working_vocalization') || [];
      const working = voc.map(function(v) { return v.label; }).join(' ');
      if (sentence !== working) {
        voc = [{ label: sentence }];
      }
      app_state.save_phrase(voc, this.get('current_category'));
      this.update_list();
      const code = (new Date()).getTime() + '_' + Math.random();
      this.set('added', code);
      const _this = this;
      setTimeout(function() {
        if (_this.get('added') === code) {
          _this.set('added', null);
        }
      }, 5000);
      this.set('sentence', null);
    }
  }
});
