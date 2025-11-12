import Controller from '@ember/controller';
import persistence from '../utils/persistence';
import { computed, observer } from '@ember/object';
import LingoLinq from '../app';

export default Controller.extend({
  setup_tracking: function() {
    this.set('status', null);
    this.set('show_description', false);
    this.set('show_rating', false);
    this.set('started', (new Date()).getTime());
    this.set('player', null);
    this.set('forced_show', false);
    var _this = this;
    LingoLinq.Lessons.track(this.get('model.url')).then(function(lesson) {
      _this.set('lesson', lesson);      
    });
    if(this.get('model.video')) {
      LingoLinq.Videos.track('lesson_embed').then(function(player) {
        _this.set('player', player);
      });
    }
  },
  set_lesson_complete: observer('lesson.state', function() {
    if(this.get('lesson.state') == 'complete' && !this.get('forced_show')) {
      this.set('forced_show', true);
      this.set('show_rating', true);
    }
  }),
  set_video_complete: observer('player.time', 'player.duration', function() {
    var time = this.get('player.time');
    var duration = this.get('player.duration');
    if(time && duration && !this.get('forced_show')) {
      if(time / duration > 0.93) {
        this.set('forced_show', true);
        this.set('show_rating', true);
      } else if(duration > (5 * 60) && (duration - time) < (30)) {
        this.set('forced_show', true);
        this.set('show_rating', true);
      } else if(duration > (10 * 60) && (duration - time) < (60)) {
        this.set('forced_show', true);
        this.set('show_rating', true);
      }
    }
  }),
  finished_at: computed('model.user.completion', function() {
    var comp = this.get('model.user.completion');
    if(comp) {
      var ts = new Date(comp.ts * 1000);
      return ts;
    }
    return null;
  }),
  actions: {
    toggle_description: function() {
      this.set('show_description', !this.get('show_description'));
    },
    done: function() {
      this.set('show_rating', !this.get('show_rating'));
    },
    new_window: function() {
      window.open(this.get('model.url'), '_blank');
    },
    rate: function(score) {
      var _this = this;
      _this.set('status', {saving: true})
      var data = {rating: score};
      if(_this.get('player.duration')) {
        data.duration = _this.get('player.time') || _this.get('player.duration');
      } else if(_this.get('lesson.duration')) {
        data.duration = _this.get('lesson.duration');
      } else {
        var now = (new Date()).getTime();
        data.duration = (now - _this.get('started')) / 1000;
      }
      persistence.ajax('/api/v1/lessons/' + this.get('model.id') + '/complete', {type: 'POST', data: data}).then(function(res) {
        _this.set('status', {done: true})
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
