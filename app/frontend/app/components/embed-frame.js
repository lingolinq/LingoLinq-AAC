import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import frame_listener from '../utils/frame_listener';
import i18n from '../utils/i18n';
import { inject as service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'div',
  classNames: ['integration_container'],
  persistence: service('persistence'),
  didInsertElement: function() {
    var elem = this.element;
    var _this = this;
    this.element.addEventListener('mousemove', function(event) {
      if(elem) {
        var session_id = elem.childNodes[0].getAttribute('data-session_id');
//         frame_listener.raw_event({
//           session_id: session_id,
//           type: 'mousemove',
//           x_percent: 0.1,
//           y_percent: 0.2
//         });
      }
    });
    this.element.addEventListener('click', function(e) {
      if(elem) {
        var session_id = elem.childNodes[0].getAttribute('data-session_id');
//         frame_listener.raw_event({
//           session_id: session_id,
//           type: 'click',
//           x_percent: 0.3,
//           y_percent: 0.325
//         });
      }
    });
    runLater(function() {
      if($(elem).find("#integration_overlay.pending").length > 0) {
        $(elem).find("#integration_overlay .status").text(i18n.t('loading_integration', "Loading Integration..."));
      }
    }, 750);
    runLater(function() {
      if($(elem).find("#integration_overlay.pending").length > 0) {
        if(!_this.persistence || !_this.persistence.get('online')) {
          $(elem).find("#integration_overlay .status").text(i18n.t('loading_integration_failed_offline', "Integrations cannot load when offline"));
        } else {
          $(elem).find("#integration_overlay .status").text(i18n.t('loading_integration_failed', "Integration hasn't loaded, please check your settings and Internet Connection"));
        }
      }
    }, 5000);
  },
  willDestroyElement: function() {
    frame_listener.unload();
  },
  overlay_style: computed('board_style', function() {
    var res = this.get('board_style');
    res = res.string || res;
    if(res && res.replace) {
      res = res.replace(/position:\s*relative/, 'position: absolute');
    }
    return htmlSafe(res);
  }),
  actions: {
  }
});
