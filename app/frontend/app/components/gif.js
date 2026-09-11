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
    // Must be assigned HERE, not in didInsertElement. ModalDialog reads @opening
    // during its own didRender, and a child's didRender runs BEFORE the parent's
    // didInsertElement -- so assigning there left `opening` undefined at read time
    // and `opening()` never ran. That is why the search term was never seeded from
    // the speak bar and the modal opened as GIF Search for "" with No results.
    // See tests/integration/modal-opening-callback-test.js.
    // `self` is already bound above by the ctrlAction setup.
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
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
      const term = voc.map(function(v) { return v.label; }).join(' ').trim();
      this.set('search', term);
      // Nothing in the speak bar means there is nothing to search for. Firing the
      // request anyway spent a round trip to come back empty and rendered as
      // "No results" / an error, which reads as a failure rather than as "you
      // haven't said anything yet" -- the template shows the empty notice instead.
      if (term) {
        this.searchGifs();
      } else {
        this.set('results', null);
      }
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
  },


});
