import Service from '@ember/service';
import { inject as service } from '@ember/service';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import capabilities from '../utils/capabilities';

const FLUSH_DELAY = 5000;
const MAX_BUFFER = 50;

export default Service.extend({
  appState: service('app-state'),
  persistence: service('persistence'),

  init() {
    this._super(...arguments);
    this.buffer = [];
    this.sessionId = 'telemetry-' + (new Date()).getTime() + '-' + Math.floor(Math.random() * 100000);
    this.lastRoute = null;
    this.lastRouteAt = null;
    this.lastBoardActivationAt = 0;
    this.boardPointerListenerSetup = false;
  },

  enabled() {
    var user = this.get('appState.currentUser') || this.get('appState.sessionUser');
    if(!user) { return false; }
    if(user.get && (user.get('admin') || user.get('is_admin'))) { return true; }
    return !!this.get('appState.feature_flags.product_telemetry');
  },

  trackRoute(routeName) {
    if(!this.enabled()) { return; }
    var now = (new Date()).getTime();
    if(this.lastRoute && this.lastRouteAt) {
      this.track('route_visit', {
        route: this.lastRoute,
        feature_area: this.featureAreaForRoute(this.lastRoute),
        data: {
          duration_ms: now - this.lastRouteAt,
          path: window.location && window.location.pathname
        }
      });
    }
    this.lastRoute = routeName;
    this.lastRouteAt = now;
    this.ensureBoardPointerListener();
  },

  trackBoardActivation(button) {
    if(!this.enabled() || !button) { return; }
    this.lastBoardActivationAt = (new Date()).getTime();
    var board = button.board || {};
    this.track('board_activation', {
      route: this.get('appState.current_route') || 'board',
      feature_area: 'speak_board',
      data: {
        board_id: board.id,
        button_id: button.button_id,
        percent_x: button.percent_x,
        percent_y: button.percent_y,
        prior_percent_x: button.prior_percent_x,
        prior_percent_y: button.prior_percent_y,
        percent_travel: button.percent_travel,
        input_method: button.source || button.access,
        source: button.source
      }
    });
  },

  track(type, attrs) {
    if(!this.enabled()) { return; }
    attrs = attrs || {};
    var data = attrs.data || {};
    data.session_id = this.sessionId;
    data.system = capabilities.system;
    data.browser = capabilities.browser;
    data.viewport_width = window.outerWidth;
    data.viewport_height = window.outerHeight;
    this.buffer.push({
      event_type: type,
      route: attrs.route,
      feature_area: attrs.feature_area,
      occurred_at: (new Date()).toISOString(),
      data: data
    });
    if(this.buffer.length >= MAX_BUFFER) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  },

  scheduleFlush() {
    if(this.flushTimer) { return; }
    this.flushTimer = runLater(this, this.flush, FLUSH_DELAY);
  },

  flush() {
    if(this.flushTimer) {
      runCancel(this.flushTimer);
      this.flushTimer = null;
    }
    if(!this.buffer || this.buffer.length === 0 || !this.get('persistence.online')) { return; }
    var events = this.buffer.splice(0, MAX_BUFFER);
    this.persistence.ajax('/api/v1/telemetry_events', {
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({telemetry_events: events})
    }).then(null, function() {
      // Telemetry should never block AAC workflows. Keep failures silent.
    });
  },

  ensureBoardPointerListener() {
    if(this.boardPointerListenerSetup || typeof document === 'undefined') { return; }
    this.boardPointerListenerSetup = true;
    var _this = this;
    document.addEventListener('mouseup', function(event) {
      _this.capturePossibleBoardTap(event);
    }, true);
    document.addEventListener('touchend', function(event) {
      _this.capturePossibleBoardTap(event);
    }, true);
  },

  capturePossibleBoardTap(event) {
    if(!this.enabled()) { return; }
    var point = this.eventPoint(event);
    if(!point) { return; }
    var board = this.boardElementForEvent(event);
    if(!board) { return; }
    var rect = board.getBoundingClientRect();
    if(!rect || !rect.width || !rect.height) { return; }
    var startedAt = (new Date()).getTime();
    var percentX = (point.clientX - rect.left) / rect.width;
    var percentY = (point.clientY - rect.top) / rect.height;
    if(percentX < 0 || percentX > 1 || percentY < 0 || percentY > 1) { return; }
    var _this = this;
    runLater(function() {
      if(_this.lastBoardActivationAt && _this.lastBoardActivationAt >= startedAt) { return; }
      _this.track('non_activation_tap', {
        route: _this.get('appState.current_route') || 'board',
        feature_area: 'speak_board',
        data: {
          percent_x: percentX,
          percent_y: percentY,
          input_method: event.type == 'touchend' ? 'touch' : 'click',
          reason: 'no_button_activation'
        }
      });
    }, 350);
  },

  boardElementForEvent(event) {
    var target = event.target;
    if(target && target.closest) {
      var board = target.closest('.board');
      if(board) { return board; }
    }
    return document.getElementById('board_canvas');
  },

  eventPoint(event) {
    var source = event;
    if(event.changedTouches && event.changedTouches.length) {
      source = event.changedTouches[0];
    }
    if(source && source.clientX !== undefined && source.clientY !== undefined) {
      return {clientX: source.clientX, clientY: source.clientY};
    }
    return null;
  },

  featureAreaForRoute(routeName) {
    routeName = routeName || '';
    if(routeName.match(/^board/) || routeName.match(/board-detail/)) { return 'speak_board'; }
    if(routeName.match(/^organization/)) { return 'organization_dashboard'; }
    if(routeName.match(/^user\\.stats/) || routeName.match(/^user\\.logs?/)) { return 'reports'; }
    if(routeName.match(/^setup/)) { return 'setup'; }
    return 'app';
  }
});
