import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import progress_tracker from '../utils/progress_tracker';

/**
 * Download/Print Board modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'download-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('progress', null);
    this.set('track_id', null);
    const appState = this.get('appState');
    const pos = appState.get('currentUser.preferences.preferences.device.button_text_position');
    this.set('text_below', pos === 'bottom');
    const bg = appState.get('currentUser.preferences.preferences.symbol_background');
    this.set('white_background', bg === 'white');
    if (this.get('persistence.online')) {
      this.send('startDownload');
    }
  },

  pdf_download: computed('model.type', function() {
    return this.get('model.type') === 'pdf';
  }),
  obf_download: computed('model.type', function() {
    return this.get('model.type') === 'obf';
  }),
  pending: computed('progress.status', function() {
    return this.get('progress.status') === 'pending';
  }),
  started: computed('progress.status', function() {
    return this.get('progress.status') === 'started';
  }),
  finished: computed('progress.status', function() {
    return this.get('progress.status') === 'finished';
  }),
  errored: computed('progress.status', function() {
    return this.get('progress.status') === 'errored';
  }),
  minutes_estimate: computed('progress.minutes_estimate', function() {
    return this.get('progress.minutes_estimate') || 5;
  }),
  status_message: computed('progress.status', 'progress.sub_status', function() {
    return progress_tracker.status_text(this.get('progress.status'), this.get('progress.sub_status'));
  }),
  num_percent: computed('progress.percent', function() {
    return Math.round(100 * (this.get('progress.percent') || 0));
  }),
  num_style: computed('num_percent', function() {
    return htmlSafe('width: ' + this.get('num_percent') + '%;');
  }),
  multi_download_type: computed('model.type', 'model.has_links', function() {
    return this.get('model.type') !== 'pdf' && this.get('model.has_links');
  }),
  single_download_type: computed('model.type', 'model.has_links', function() {
    return this.get('model.type') !== 'pdf' && !this.get('model.has_links');
  }),

  actions: {
    close() {
      progress_tracker.untrack(this.get('track_id'));
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    startDownload(decision) {
      if (decision || (!this.get('model.has_links') && this.get('download_type'))) {
        let type = this.get('model.type');
        if (decision === 'all' && type === 'obf') { type = 'obz'; }
        let url = '/api/v1/boards/' + this.get('model.id') + '/download?type=' + type + '&include=' + decision;
        if (!this.get('include_header') && !this.get('download_type')) {
          url = url + '&headerless=1';
        }
        if (!this.get('text_below') && !this.get('download_type')) {
          url = url + '&text_on_top=1';
        }
        if (!this.get('white_background') && !this.get('download_type')) {
          url = url + '&transparent_background=1';
        }
        const appState = this.get('appState');
        if (appState.get('currentUser.preferences.device.button_text_position') === 'text_only') {
          url = url + '&text_only=1';
        }
        const style = appState.get('currentUser.preferences.device.button_style');
        if (style) {
          url = url + '&font=' + (style.replace(/(_caps|_small)$/, '') || '');
          if ((style || '').match(/_caps/)) {
            url = url + '&text_case=upper';
          } else if ((style || '').match(/_small/)) {
            url = url + '&text_case=lower';
          }
        }
        const _this = this;
        this.set('progress', { status: 'pending' });
        this.get('persistence').ajax(url, { type: 'POST' }).then(function(data) {
          const track_id = progress_tracker.track(data.progress, function(progress) {
            _this.set('progress', progress);
          });
          _this.set('track_id', track_id);
        }, function() {
          _this.set('progress', {
            status: 'errored',
            result: i18n.t('Download failed unexpectedly', 'board_download_failed')
          });
        });
      }
    },
    set_attribute(attr, val) {
      this.set(attr, val);
    }
  }
});
