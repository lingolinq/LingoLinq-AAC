import Component from '@ember/component';
import { inject as service } from '@ember/service';
import contentGrabbers from '../utils/content_grabbers';
import app_state from '../utils/app_state';
import stashes from '../utils/_stashes';

/**
 * GIF Search Modal Component
 *
 * Converted from modals/gif template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/gif';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('selected_gif', null);
    this.set('results', null);
    this.set('flipped', false);
    this.set('search', '');
  },

  searchGifs() {
    this.set('selected_gif', null);
    const str = this.get('search');
    const user_name = app_state.get('referenced_user.user_name');
    const locale = app_state.get('label_locale');
    const _this = this;
    _this.set('results', { loading: true });
    contentGrabbers.pictureGrabber.protected_search(str, 'giphy', user_name, locale).then(function(res) {
      const col1 = [];
      const col2 = [];
      const col3 = [];
      col1.height = 0;
      col2.height = 1;
      col3.height = 2;
      res.forEach(function(img) {
        if (col1.height < col2.height && col1.height < col3.height) {
          col1.push(img);
          col1.height = (col1.height || 0) + img.height;
        } else if (col2.height < col3.height) {
          col2.push(img);
          col2.height = (col2.height || 0) + img.height;
        } else {
          col3.push(img);
          col3.height = (col3.height || 0) + img.height;
        }
      });
      if (_this.get('model.luck')) {
        _this.set('selected_gif', res[0]);
      }
      _this.set('results', { list: res, columns: [{ list: col1 }, { list: col2 }, { list: col3 }] });
    }, function() {
      _this.set('results', { error: true });
    });
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('selected_gif', null);
      this.set('results', null);
      this.set('flipped', false);
      const voc = stashes.get('working_vocalization') || [];
      this.set('search', voc.map(function(v) { return v.label; }).join(' '));
      this.searchGifs();
    },
    closing() {},
    flip() {
      this.set('flipped', !this.get('flipped'));
    },
    search() {
      this.searchGifs();
    },
    back() {
      this.set('selected_gif', null);
    },
    move(direction) {
      const scroll = document.querySelector('#gif_scroll');
      if (!scroll) { return; }
      const y = window.innerHeight / 2;
      if (direction === 'up') {
        scroll.scrollTop = (scroll.scrollTop || 0) - y;
      } else {
        scroll.scrollTop = (scroll.scrollTop || 0) + y;
      }
    },
    choose(gif) {
      this.set('selected_gif', gif);
    }
  }
});
