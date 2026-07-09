import { later as runLater } from '@ember/runloop';
import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import { computed, set as emberSet } from '@ember/object';

LingoLinq.Utterance = BaseModel.extend({
  button_list: attr('raw'),
  sentence: attr('string'),
  link: attr('string'),
  reply_code: attr('string'),
  user_id: attr('string'),
  image_url: attr('string'),
  large_image_url: attr('string'),
  timestamp: attr('number'),
  private_only: attr('boolean'),
  permissions: attr('raw'),
  prior: attr('raw'),
  user: attr('raw'),
  show_user: attr('boolean'),
  assert_remote_urls: function() {
    var find_remote = function(local) {
      for(var url in (persistence.url_cache || {})) {
        if(persistence.url_cache[url] == local) {
          return url;
        }
      }
      return local;
    };
    if(this.get('image_url') && !LingoLinq.remote_url(!this.get('image_url'))) {
      this.set('image_url', find_remote(this.get('image_url')));
    }
    (this.get('button_list') || []).forEach(function(btn) {
      if(btn.image && !LingoLinq.remote_url(!btn.image)) {
        emberSet(btn, 'image', find_remote(btn.image));
      }
    });
  },
  best_image_url: computed('image_url', 'large_image_url', function() {
    return this.get('large_image_url') || this.get('image_url');
  }),
  check_for_large_image_url: function() {
    if(this.isDestroyed || this.isDestroying) { return false; }
    var attempt = this.get('large_image_attempt') || 1;
    var _this = this;
    if(_this.get('permissions.edit') && !_this.get('large_image_url') && attempt < 15) {
      runLater(function() {
        if(_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('large_image_attempt', attempt + 1);
        _this.reload().then(function() {
          if(_this.isDestroyed || _this.isDestroying) { return; }
          _this.check_for_large_image_url();
        });
      }, attempt * 500);
      return true;
    } else {
      return false;
    }
  },
});

export default LingoLinq.Utterance;
