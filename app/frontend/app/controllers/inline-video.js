import i18n from '../utils/i18n';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import Button from '../utils/button';
import LingoLinq from '../app';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('player', null);
    var host = window.default_host || capabilities.fallback_host;
    var url = null;
    var opts = [];
    if(this.get('model.video.id') && this.get('model.video.type')) {
      url = host + "/videos/" + this.get('model.video.type') + "/" + this.get('model.video.id');
      if(this.get('model.video.start')) {
        opts.push('start=' + this.get('model.video.start'));
      }
      if(this.get('model.video.end')) {
        opts.push('end=' + this.get('model.video.end'));
      }
    } else if(this.get('model.video.url')) {
      var resource = Button.resource_from_url(this.get('model.video.url'));
      if(resource.type == 'video') {
        url = host + "/videos/" + resource.video_type + "/" + resource.id;
      }
    }
    if(url) {
      if(opts) {
        url = url + "?" + opts.join('&');
      }
      this.set('video_url', url);
    }

    this.set('video_callback', function(event_type) {
      if(event_type == 'ended') {
        _this.send('close');
      } else if(event_type == 'error') {
        _this.set('player', {error: true});
      } else if(event_type == 'embed_error') {
        _this.set('player', {error: true, embed_error: true});
      }
    });
    LingoLinq.Videos.track('video_preview', this.get('video_callback')).then(function(player) {
      _this.set('player', player);
    });
  },
  closing: function() {
    if(this.get('player') && this.get('player').cleanup) {
      this.get('player').cleanup();
    }
    LingoLinq.Videos.untrack('video_preview', this.get('video_callback'));
  },
  actions: {
    toggle_video: function() {
      var player = this.get('player');
      if(player) {
        if(player.get('paused')) {
          player.play();
        } else {
          player.pause();
        }
      }
    }
  }
});
