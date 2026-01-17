import utterance from '../../utils/utterance';
import modal from '../../utils/modal';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/string';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import contentGrabbers from '../../utils/content_grabbers';
import stashes from '../../utils/_stashes';

export default modal.ModalController.extend({
  appState: service('app-state'),
  stashes: service(),

  opening: function() {
    this.set('selected_gif', null);
    this.set('results', null);
    this.set('flipped', false);
    var voc = this.stashes.get('working_vocalization') || [];
    this.set('search', voc.map(function(v) { return v.label; }).join(' '));
    this.search_gifs();
  },
  search_gifs: function() {
    this.set('selected_gif', null);
    var str = this.get('search');
    var user_name = this.appState.get('referenced_user.user_name');
    var locale = this.appState.get('label_locale')
    var _this = this;
    _this.set('results', {loading: true});
    contentGrabbers.pictureGrabber.protected_search(str, 'giphy', user_name, locale).then(function(res) {
      var col1 = [], col2 = [], col3 = [];
      col1.height = 0;
      col2.height = 1;
      col3.height = 2;
      res.forEach(function(img) {
        if(col1.height < col2.height && col1.height < col3.height) {
          col1.push(img);
          col1.height = (col1.height || 0) + img.height;
        } else if(col2.height < col3.height) {
          col2.push(img);
          col2.height = (col2.height || 0) + img.height;
        } else {
          col3.push(img);
          col3.height = (col3.height || 0) + img.height;
        }
      });
      if(_this.get('model.luck')) {
        _this.set('selected_gif', res[0]);
      }
      _this.set('results', {list: res, columns: [{list: col1}, {list: col2}, {list: col3}]});
    }, function(err) {
      _this.set('results', {error: true});
    });

  },
  actions: {
    flip: function() {
      this.set('flipped', !this.get('flipped'));
    },
    search: function() {
      this.search_gifs();
    },  
    back: function() {
      this.set('selected_gif', null);
    },
    move: function(direction) {
      var scroll = document.querySelector('#gif_scroll');
      var y = window.innerHeight / 2;
      if(direction == 'up') {
        scroll.scrollTop = (scroll.scrollTop || 0) - y;
      } else {
        scroll.scrollTop = (scroll.scrollTop || 0) + y;
      }
    },
    choose: function(gif) {
      this.set('selected_gif', gif);
    }
  }
});
