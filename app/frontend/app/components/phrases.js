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
    var self = this;
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

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

  /* Two-step state for "Clear all phrases": the row swaps to a confirm prompt in place
     rather than opening a nested modal. Opening one from here would REPLACE this modal
     (utils/modal only holds one), so the user would confirm and land nowhere. */
  confirming_clear: false,

  /* How many phrases the clear would ACTUALLY delete: the ones in the category on screen,
     belonging to the user this modal is scoped to. Counted off the same source and with the
     same normalisation app_state#clear_phrases uses, because this number appears in an
     irreversible prompt and a count that does not match what happens is worse than no
     count at all.

     Two things it deliberately does NOT count. Held thoughts: they live in the stash, are
     pushed into `phrases` by update_list with no `category` at all, and clear_phrases
     spares them — counting them produced "Delete all 1 saved phrases?" over a list reading
     "No phrases have been saved yet", and confirming removed nothing, so the control armed
     itself forever. Other categories: they are not on screen and are no longer deleted. */
  /* The on-screen NAME of the current category, for the clear prompt. Reuses the same
     `categories` list the tabs render, so the prompt says exactly what the tab says —
     including 'default' -> "Quick", which is the one place the id and the label differ. */
  current_category_name: computed('categories', 'current_category', function() {
    var cat = this.get('current_category') || 'default';
    var match = (this.get('categories') || []).find(function(c) { return c && c.id === cat; });
    return (match && match.name) || cat;
  }),

  clearable_phrase_count: computed(
    'user.vocalizations.length',
    'user.vocalizations.@each.category',
    'current_category',
    function() {
      var cat = this.get('current_category') || 'default';
      return (this.get('user.vocalizations') || []).filter(function(v) {
        return v && v.list && (v.category || 'default') === cat;
      }).length;
    }
  ),

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
      this.set('confirming_clear', false);
      this.update_list();
    },
    closing() {},
    /*
     * Picking a phrase or a held thought out of the list.
     *
     * PRESERVES WHAT IS IN THE SENTENCE BAR, which this surface did not used to do. The
     * Speak Options menu has swapped since it was written — its own comment: "If there is
     * a working vocalization, swap it into the stash when you swap this one out" — while
     * this modal simply overwrote the bar. Same word, same icon, two different outcomes
     * for the user's unsaved sentence depending on which surface they happened to open.
     * Neither was drift from the component migration; the two originals differed too.
     *
     * The swap is the behaviour worth keeping: an AAC user may have spent minutes
     * assembling that sentence one button at a time, and discarding it to make room for
     * something they can already retrieve is the wrong way round.
     *
     * `swapped: true` because this is a bump, not a deliberate park — it is what lets the
     * row read "Swap back:" rather than claiming the user chose to hold it.
     */
    select(button) {
      const existing = [].concat(stashes.get('working_vocalization') || []);
      const has_stash = (stashes.get('remembered_vocalizations') || []).some(function(v) { return v && v.stash; });
      if (button.stash) {
        utterance.set('rawButtonList', button.vocalizations);
        utterance.set('list_vocalized', false);
        const list = (stashes.get('remembered_vocalizations') || []).filter(function(v) { return !v.stash || v.sentence !== button.sentence; });
        stashes.persist('remembered_vocalizations', list);
        /* Guarded the way speak-menu.js:291 guards its copy. Without `!has_stash` every
           pick re-parked the bar on top of the last one: Recent rows reach this branch too
           (category_phrases stamps `stash: true` on prior utterances), and the filter above
           removes nothing for those, so entries accumulated in remembered_vocalizations
           that no surface renders — speak-menu shows `slice(0, 2)`, category_phrases drops
           anything without a `category`, and nothing caps the array. They were unreachable
           and undeletable, growing in localStorage. */
        if (existing.length > 0 && !has_stash) {
          stashes.remember({ override: existing, stash: true, swapped: true });
        }
      } else {
        /* Only when the slot is free. Saying a saved phrase should not evict a held
           thought the user is still counting on — matching speak-menu.js. */
        if (existing.length > 0 && !has_stash) {
          stashes.remember({ override: existing, stash: true, swapped: true });
        }
        app_state.set_and_say_buttons(button.vocalizations);
      }
      this.get('modal').close();
    },
    start_clear() {
      this.set('confirming_clear', true);
    },
    cancel_clear() {
      this.set('confirming_clear', false);
    },
    confirm_clear() {
      /* Pass the subject and the scope explicitly — `this.user` is whoever this modal was
         opened FOR (a supervisee, when opened from their preferences), which is not
         necessarily the signed-in user. */
      app_state.clear_phrases(this.get('user'), this.get('current_category'));
      this.set('confirming_clear', false);
      this.update_list();
    },
    set_recent() {
      this.set('confirming_clear', false);
      this.set('current_category', null);
      this.set('recent_category', true);
    },
    set_category(cat) {
      /* Disarm the clear confirm on any tab change — otherwise a prompt armed on one
         category is still sitting there after switching to another, aimed at a list the
         user is no longer looking at. */
      this.set('confirming_clear', false);
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
        // Bail if the component was torn down within the 5s window (e.g. the user
        // saved a phrase then switched boards / left speak mode) — otherwise the
        // deferred set throws "calling set on destroyed object".
        if (_this.isDestroyed || _this.isDestroying) { return; }
        if (_this.get('added') === code) {
          _this.set('added', null);
        }
      }, 5000);
      this.set('sentence', null);
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    // Ember 5.12 modal migration: the service-based modal system does not
    // auto-invoke opening() (this.onOpening is vestigial), so build modal state
    // here on insert. Without this, opening() never runs. See assessment-settings.
    self.send('opening');
},

});
