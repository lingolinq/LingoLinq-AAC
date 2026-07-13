import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import Utils from '../../utils/misc';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import capabilities from '../../utils/capabilities';
import { htmlSafe } from '@ember/template';

export default Controller.extend({
  session: service('session'),
  appState: service('app-state'),
  app_state: alias('appState'),
  load_lessons: function() {
  },
  show_org_trainings_admin: computed(
    'appState.feature_flags.lessons',
    'appState.sessionUser.managed_orgs.length',
    function() {
      if (!this.get('appState.feature_flags.lessons')) {
        return false;
      }
      var orgs = this.get('appState.sessionUser.managed_orgs');
      return !!(orgs && orgs.length);
    }
  ),
  styled_lessons: computed('model.sorted_lessons', function() {
    var res = this.get('model.sorted_lessons');
    if(!res) { return null;}
    res.forEach(function(lesson) {
      if(lesson.rating && lesson.completed) {
        lesson.rating_class = htmlSafe(lesson.rating == 3 ? 'face laugh' : (lesson.rating == 2 ? 'face neutral' : 'face sad'));
      }
    });
    return res;
  }),
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    launch: function(lesson) {
      if(lesson && this.get('model.lesson_share_token')) {
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + this.get('model.lesson_share_token'), '_blank');
      }

    }
  }
});
