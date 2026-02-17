import Component from '@ember/component';
import { inject as service } from '@ember/service';
import capabilities from '../utils/capabilities';
import Button from '../utils/button';
import LingoLinq from '../app';
import modal from '../utils/modal';

/**
 * Inline Video modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'inline-video';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('player', null);
  },

  didInsertElement() {
    this._super(...arguments);
    const _this = this;
    const host = window.default_host || capabilities.fallback_host;
    let url = null;
    const opts = [];
    if (this.get('model.video.id') && this.get('model.video.type')) {
      url = host + '/videos/' + this.get('model.video.type') + '/' + this.get('model.video.id');
      if (this.get('model.video.start')) {
        opts.push('start=' + this.get('model.video.start'));
      }
      if (this.get('model.video.end')) {
        opts.push('end=' + this.get('model.video.end'));
      }
    } else if (this.get('model.video.url')) {
      const resource = Button.resource_from_url(this.get('model.video.url'));
      if (resource.type === 'video') {
        url = host + '/videos/' + resource.video_type + '/' + resource.id;
      }
    }
    if (url) {
      if (opts.length) {
        url = url + '?' + opts.join('&');
      }
      this.set('video_url', url);
    }
    this.set('video_callback', function(event_type) {
      if (event_type === 'ended') {
        _this.send('close');
      } else if (event_type === 'error') {
        _this.set('player', { error: true });
      } else if (event_type === 'embed_error') {
        _this.set('player', { error: true, embed_error: true });
      }
    });
    LingoLinq.Videos.track('video_preview', this.get('video_callback')).then(function(player) {
      _this.set('player', player);
    });
  },

  willDestroyElement() {
    if (this.get('player') && this.get('player').cleanup) {
      this.get('player').cleanup();
    }
    LingoLinq.Videos.untrack('video_preview', this.get('video_callback'));
    this._super(...arguments);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {
      if (this.get('player') && this.get('player').cleanup) {
        this.get('player').cleanup();
      }
      LingoLinq.Videos.untrack('video_preview', this.get('video_callback'));
    },
    toggle_video() {
      const player = this.get('player');
      if (player) {
        if (player.get('paused')) {
          player.play();
        } else {
          player.pause();
        }
      }
    }
  }
});
