import Controller from '@ember/controller';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import app_state from '../../utils/app_state';

export default Controller.extend({
  load_badges: function() {
    var _this = this;
    this.set('badges', {loading: true});
    this.store.query('badge', {user_id: this.get('model.id')}).then(function(badges) {
      badges = badges.map(function(i) { return i; });
      _this.set('badges', badges);
    }, function(err) {
      _this.set('badges', {error: true});
    });
  },
  actions: {
    highlight_badge: function(badge, do_highlight) {
      var _this = this;
      badge.set('highlighted', !!do_highlight);
      badge.save().then(function() {
        _this.load_badges();
      }, function() {
        modal.error(i18n.t('badge_update_failed', "Badge Update Failed"));
      });
    },
    delete_badge: function(badge) {
      var _this = this;
      badge.set('disabled', true);
      badge.save().then(function() {
        _this.load_badges();
      }, function() {
        modal.error(i18n.t('badge_update_failed', "Badge Update Failed"));
      });
    },
    badge_popup: function(badge) {
      modal.open('badge-awarded', {badge: badge});
    }
  }
});
