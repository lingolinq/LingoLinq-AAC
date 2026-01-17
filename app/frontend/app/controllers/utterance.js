import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import speecher from '../utils/speecher';
import utterance from '../utils/utterance';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/string';

export default Controller.extend({
  persistence: service(),
  modal: service(),

  title: computed('model.sentence', 'model.show_user', 'model.user', function() {
    var sentence = this.get('model.sentence') || "something";
    if(this.get('model.show_user') && this.get('model.user')) {
      return (this.get('model.user.name') || this.get('model.user.user_name')) + " said: \"" + sentence + "\"";
    } else {
      return "Someone said: \"" + sentence + "\"";
    }
  }),
  check_reachable_core: observer('model.permissions.reply', 'model.id', function() {
    var _this = this;
    if(_this.get('model.permissions.reply') && !_this.get('reachable_core')) {
      _this.set('reachable_core', {pending: true});
      this.persistence.ajax("/api/v1/words/reachable_core?user_id=" + _this.get('model.user.id') + "&utterance_id=" + _this.get('model.id'), {type: 'GET'}).then(function(res) {
        _this.set('reachable_core', res.words.sort());
      }, function(err) { 
        _this.set('reachable_core', null);
      });
    }
  }),
  spaced_core_dom: computed('reachable_core', function() {
    var dom = document.createElement('span');
    if(!this.get('reachable_core').length) { return null; }
    (this.get('reachable_core') || []).forEach(function(str) {
      var span = document.createElement('span');
      span.innerText = str;
      span.word = str;
      dom.appendChild(span);
      dom.append(" ");
    });
    return dom;
  }),
  used_core: computed('reachable_core', 'message', function() {
    var _this = this;
    var words = {};
    if(!_this.get('reachable_core').length) { return ""; }
    (_this.get('message') || '').split(/[^\w]+/).forEach(function(w) { words[w.toLowerCase()] = true; });
    var dom = document.createElement('span');
    (_this.get('reachable_core') || []).forEach(function(str) {
      if(words[str.toLowerCase()]) {
        var span = document.createElement('span');
        span.innerText = str;
        dom.appendChild(span);
        dom.append(" ");
      }
    });
    return htmlSafe(dom.innerHTML);
  }),
  update_spaced_core: observer('reachable_core', 'spaced_core_dom', 'message', function() {
    var _this = this;
    var dom = _this.get('spaced_core_dom');
    if(!dom) { return; }
    var words = {};
    (_this.get('message') || '').split(/[^\w]+/).forEach(function(w) { words[w.toLowerCase()] = true; });
    Array.from(dom.children).forEach(function(span) {
      if(words[span.word.toLowerCase()]) {
        span.style.fontWeight = 'bold';
        span.style.color = '#000';
      } else {
        span.style.fontWeight = 'normal';
        span.style.color = '#888';
      }
    });
    _this.set('spaced_core', htmlSafe(dom.innerHTML));
  }),
  image_url: computed('model.image_url', 'model.large_image_url', 'image_index', function() {
    var index = this.get('image_index');
    if(index === undefined) {
      return this.get('model.image_url');
    }

    if(index == -1) {
      return this.get('model.large_image_url');
    } else {
      return this.get('model.button_list')[index].image;
    }
  }),
  show_share: observer('model.sentence', function() {
    if(!this.get('model.id')) { return; }
    this.get('model').check_for_large_image_url();
    this.set('speakable', speecher.ready);
  }),
  single_button_full_sentence: computed('model.button_list', 'model.sentence', function() {
    if(this.get('model.button_list.length') == 0) {
      return true;
    } else if(this.get('model.button_list.length') == 1) {
      return !this.get('model.button_list')[0].image && this.get('model.button_list')[0].label == this.get('model.sentence');
    }
    return false;
  }),
  user_showable: computed('model.show_user', 'model.user.name', 'model.user.user_name', function() {
    return this.get('model.show_user') && this.get('model.user.name') && this.get('model.user.user_name');
  }),
  actions: {
    clear_reply: function() {
      this.set('message', null);
    },
    reply: function() {
      var _this = this;
      if(!_this.get('message') || !_this.get('model.reply_code')) { return; }
      _this.set('reply_status', {loading: true});
      this.persistence.ajax('/api/v1/utterances/' + _this.get('model.id') + '/reply', {
        type: 'POST',
        data: {
          message: _this.get('message'),
          reply_code: _this.get('model.reply_code')
        }
      }).then(function(data) {
        _this.set('reply_status', {sent: true});
        _this.set('message', null);
      }, function(err) {
        _this.set('reply_status', {error: true});
      });
    },
    show_attribution: function() {
      this.set('model.show_attribution', true);
    },
    vocalize: function() {
      if(speecher.ready) {
        utterance.speak_text(this.get('model.sentence'));
      }
    },
    expand_core: function() {
      this.set('expanded_list', !this.get('expanded_list'));
    },
    change_image: function(direction) {
      var index = this.get('image_index');
      if(index === undefined) {
        var _this = this;
        var image_url = _this.get('model.image_url');
        if(image_url == _this.get('model.large_image_url')) {
          index = -1;
        } else {
          this.get('model.button_list').forEach(function(b, idx) {
            if(b.image == image_url && !index) {
              index = idx;
            }
          });
        }
      }

      if(direction == 'next') {
        index++;
      } else {
        index--;
      }
      if(index == -1 && this.get('model.large_image_url')) {
      } else if(index < 0) {
        index = this.get('model.button_list').length - 1;
      } else if(index >= this.get('model.button_list').length) {
        if(this.get('model.large_image_url')) {
          index = -1;
        } else {
          index = 0;
        }
      }
      this.set('image_index', index);
    },
    copy_event(res) {
      if(res) { modal.success(i18n.t('copied', "Copied to clipboard!")); }
      else { this.modal.error(i18n.t('copy_failed', "Copying to the clipboard failed.")); }
    },
    update_utterance: function() {
      this.set('model.image_url', this.get('image_url'));
      this.get('model').save().then(null, function() {
        this.modal.error(i18n.t('utterance_update_failed', "Sentence update failed"));
      });
    }
  }
});
