import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Message Unit Modal Component
 *
 * Converted from modals/message-unit template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  persistence: service('persistence'),
  appState: service('app-state'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/message-unit';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('note_type', 'text');
    this.set('status', null);
  },

  text_note: computed('note_type', function() {
    return this.get('note_type') === 'text';
  }),
  video_note: computed('note_type', function() {
    return this.get('note_type') === 'video';
  }),
  no_video_ready: computed('video_id', function() {
    return !this.get('video_id');
  }),
  target_type: computed('model.target', function() {
    const res = {};
    res[this.get('model.target') || 'none'] = true;
    return res;
  }),
  text_class: computed('text_note', function() {
    let res = 'btn ';
    if (this.get('text_note')) {
      res = res + 'btn-primary';
    } else {
      res = res + 'btn-default';
    }
    return res;
  }),
  video_class: computed('text_note', function() {
    let res = 'btn ';
    if (this.get('text_note')) {
      res = res + 'btn-default';
    } else {
      res = res + 'btn-primary';
    }
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    set_type(type) {
      this.set('note_type', type);
    },
    video_ready(id) {
      this.set('video_id', id);
    },
    video_not_ready() {
      this.set('video_id', false);
    },
    video_pending() {
      this.set('video_id', false);
    },
    send_message(type) {
      if (type === 'video' && !this.get('video_id')) { return; }
      const _this = this;
      _this.set('status', { sending: true });
      this.get('persistence').ajax('/api/v1/units/' + _this.get('model.unit.id') + '/note', {
        type: 'POST',
        data: {
          note: _this.get('note'),
          include_footer: _this.get('include_footer'),
          target: _this.get('model.target'),
          video_id: _this.get('video_id'),
          notify_user: _this.get('notify_user')
        }
      }).then(function() {
        _this.set('status', null);
        modal.close();
        modal.success(i18n.t('message_sent', 'Message successfully sent!'));
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});
