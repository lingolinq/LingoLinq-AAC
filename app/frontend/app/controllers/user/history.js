import Controller from '@ember/controller';
import LingoLinq from '../../app';
import Utils from '../../utils/misc';
import { computed } from '@ember/object';

export default Controller.extend({
  load_results: function() {
    var _this = this;
    _this.set('history', {loading: true});
    LingoLinq.store.query('userversion', {user_id: this.get('model.id')}).then(function(res) {
      _this.set('history', res);
    }, function(err) {
      _this.set('history', {error: true});
    });
  },
  maybe_more: computed('history', function() {
    return this.get('history.length') >= 25;
  })
});
