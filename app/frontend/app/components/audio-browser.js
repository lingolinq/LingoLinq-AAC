import Component from '@ember/component';
import contentGrabbers from '../utils/content_grabbers';
import word_suggestions from '../utils/word_suggestions';
import Utils from '../utils/misc';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default Component.extend({
  appState: service('app-state'),
  tagName: 'span',
  willInsertElement: function() {
    var controller = this;
    controller.set('browse_audio', {loading: true});
    var user_id = this.appState.get('currentUser.id');
    // TODO: allow browsing for supervisees too
    Utils.all_pages('sound', {user_id: user_id}, function(res) {
      controller.set('browse_audio', {results: res.slice(0, 10), full_results: res, filtered_results: res});
      controller.send('filter_browsed_audio', null);
    }).then(function(res) {
      controller.set('browse_audio', {results: res.slice(0, 10), full_results: res, filtered_results: res});
      controller.send('filter_browsed_audio', null);
    }, function(err) {
      controller.set('browse_audio', {error: true});
    });
  },
  more_audio_results: computed('browse_audio.{results,filtered_results}', function() {
    return !!(this.get('browse_audio.results') && this.get('browse_audio.results').length < this.get('browse_audio.filtered_results').length);
  }),
  filter_audio_string: observer('browse_audio.filter_string', function() {
    this.send('filter_browsed_audio', this.get('browse_audio.filter_string'));
  }),
  actions: {
    filter_browsed_audio: function(str) {
      var re = str ? new RegExp(str, 'i') : null;
      var controller = this;
      var prompt = this.get('prompt') || this.get('fallback_prompt');
      if(controller.get('browse_audio.full_results')) {
        var all = controller.get('browse_audio.full_results');
        if(!re) {
          var pre = [];
          var post = [];
          if(prompt) {
            all.forEach(function(res) {
              var trans = res.get('transcription');
              if(trans && word_suggestions.edit_distance(prompt, trans) < Math.max(prompt.length, trans.length) * 0.5) {
                pre.push(res);
              } else {
                post.push(res);
              }
            });
          } else {
            pre = all;
          }
          controller.set('browse_audio.filtered_results', pre.concat(post));
        } else {
          controller.set('browse_audio.filtered_results', all.filter(function(r) { return r.get('search_string').match(re); }));
        }
        controller.set('browse_audio.results', controller.get('browse_audio.filtered_results').slice(0, 10));
      }
    },
    select_audio: function(sound) {
      var controller = this;
      controller.set('browse_audio', null);
      var fn = this.get('audio_selected');
      if (typeof fn === 'function') { fn(sound); }
    },
    more_browsed_audio: function() {
      var controller = this;
      if(controller.get('browse_audio.results')) {
        controller.set('browse_audio.results', controller.get('browse_audio.filtered_results').slice(0, controller.get('browse_audio.results').length + 10));
      }
    },
    play_audio: function(sound) {
      contentGrabbers.soundGrabber.play_audio(sound);
    }
  }
});
