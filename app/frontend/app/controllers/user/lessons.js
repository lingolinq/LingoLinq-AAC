import Controller from '@ember/controller';
import RSVP from 'rsvp';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import Utils from '../../utils/misc';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import capabilities from '../../utils/capabilities';
import { htmlSafe } from '@ember/template';

export default Controller.extend({
  load_lessons: function() {
  },
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
  actions: {
    launch: function(lesson) {
      if(lesson && this.get('model.user_token')) {
        var prefix = location.protocol + "//" + location.host;
        if(capabilities.installed_app && capabilities.api_host) {
          prefix = capabilities.api_host;
        }
        window.open(prefix + '/lessons/' + lesson.id + '/' + lesson.lesson_code + '/' + this.get('model.user_token'), '_blank');
      }

    }
  }
});
