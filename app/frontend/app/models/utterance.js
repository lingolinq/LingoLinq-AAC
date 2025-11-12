import { later as runLater } from '@ember/runloop';
import DS from 'ember-data';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import { computed, set as emberSet } from '@ember/object';

LingoLinq.Utterance = DS.Model.extend({
  button_list: DS.attr('raw'),
  sentence: DS.attr('string'),
  link: DS.attr('string'),
  reply_code: DS.attr('string'),
  user_id: DS.attr('string'),
  image_url: DS.attr('string'),
  large_image_url: DS.attr('string'),
  timestamp: DS.attr('number'),
  private_only: DS.attr('boolean'),
  permissions: DS.attr('raw'),
  prior: DS.attr('raw'),
  user: DS.attr('raw'),
  show_user: DS.attr('boolean'),
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
    var attempt = this.get('large_image_attempt') || 1;
    var _this = this;
    if(_this.get('permissions.edit') && !_this.get('large_image_url') && attempt < 15) {
      runLater(function() {
        _this.set('large_image_attempt', attempt + 1);
        _this.reload().then(function(u) {
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
