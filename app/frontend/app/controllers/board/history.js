import Controller from '@ember/controller';
import LingoLinq from '../../app';
import Utils from '../../utils/misc';
import { computed } from '@ember/object';
import persistence from '../../utils/persistence';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';

export default Controller.extend({
  load_results: function() {
    var _this = this;
    _this.set('loading', true);
    _this.set('rollback_status', null);
    _this.set('error', false);
    LingoLinq.store.query('boardversion', {board_id: this.get('key')}).then(function(res) {
      _this.set('loading', false);
      _this.set('versions', res);
    }, function(err) {
      _this.set('loading', false);
      _this.set('error', true);
    });
  },
  possible_upstream_boards: computed('versions', function() {
    var res = [];
    (this.get('versions') || []).forEach(function(v) {
      (v.get('immediately_upstream_boards') || []).forEach(function(b) {
        res.push(b);
      });
    });
    res = Utils.uniq(res, function(b) { return b.id; });
    return res;
  }),
  maybe_more: computed('versions', function() {
    return this.get('versions.length') >= 25;
  }),
  actions: {
    rollback: function() {
      var _this = this;
      _this.set('rollback_status', {saving: true});
      persistence.ajax('/api/v1/boards/' + _this.get('key') + '/rollback', {
        type: 'POST',
        data: {
          date: _this.get('rollback_date')
        }
      }).then(function(res) {
        _this.load_results();
        if(res.restored) {
          modal.success(i18n.t('deleted_board_restored', "Deleted board restored to version from %{d}", {d: res.reverted || 'unknown'}));
        } else if(res.reverted) {
          modal.success(i18n.t('board_restored', "Board reverted to version from %{d}", {d: res.reverted}));
        } else {
          modal.error(i18n.t('nothing_happened', "Nothing happened"));
        }
      }, function() {
        _this.set('rollback_status', {error: true});
      });
    }
  }
});
