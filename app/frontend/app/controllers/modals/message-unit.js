/*
 * ⚠️ ORPHANED MODAL CONTROLLER — NOT CURRENTLY WIRED INTO THE APP (kept for team review).
 *
 * During the component-modal migration this modal was reimplemented as the co-located
 * component `app/components/<same-name>.{js,hbs}`, which is what actually renders now
 * (via `components/modal-container.js` -> its `convertedModals` list). There is no
 * `app/templates/modals/<name>.hbs` backing this controller, and nothing imports it or
 * resolves it through `controllerFor`, so Ember never instantiates it. As of the Ember
 * 5.12 work this is dead code.
 *
 * REVIEW NEEDED: DELETE this file, OR RE-WIRE it if the team still wants the modal. If you
 * revive it, reconcile with the component version first — the two have diverged since the
 * split (fixes landed in the component, not here).
 * Context: docs/task-management/2026-07-14-ember-5-12-full-deprecation-audit.md
 */

import modal from '../../utils/modal';
import app_state from '../../utils/app_state';
import stashes from '../../utils/_stashes';
import i18n from '../../utils/i18n';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';
import persistence from '../../utils/persistence';

export default modal.ModalController.extend({
  opening: function() {
    this.set('note_type', 'text');
    this.set('status', null);
  },
  text_note: computed('note_type', function() {
    return this.get('note_type') == 'text';
  }),
  video_note: computed('note_type', function() {
    return this.get('note_type') == 'video';
  }),
  no_video_ready: computed('video_id', function() {
    return !this.get('video_id');
  }),
  target_type: computed('model.target', function() {
    var res = {};
    res[this.get('model.target') || 'none'] = true;
    return res;
  }),
  text_class: computed('text_note', function() {
    var res = "btn ";
    if(this.get('text_note')) {
      res = res + "btn-primary";
    } else {
      res = res + "btn-default";
    }
    return res;
  }),
  video_class: computed('text_note', function() {
    var res = "btn ";
    if(this.get('text_note')) {
      res = res + "btn-default";
    } else {
      res = res + "btn-primary";
    }
    return res;
  }),
  actions: {
    set_type: function(type) {
      this.set('note_type', type);
    },
    video_ready: function(id) {
      this.set('video_id', id);
    },
    video_not_ready: function() {
      this.set('video_id', false);
    },
    video_pending: function() {
      this.set('video_id', false);
    },
    send_message: function(type) {
      if(type == 'video' && !this.get('video_id')) { return; }
      var _this = this;

      _this.set('status', {sending: true});
      persistence.ajax('/api/v1/units/' + _this.get('model.unit.id') + '/note', {
        type: 'POST',
        data: {
          note: _this.get('note'),
          include_footer: _this.get('include_footer'),
          target: _this.get('model.target'),
          video_id: _this.get('video_id'),
          notify_user: this.get('notify_user')
        }
      }).then(function(res) {
        _this.set('status', null);
        modal.close();
        modal.success(i18n.t('message_sent', "Message successfully sent!"));
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
