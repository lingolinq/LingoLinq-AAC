import Component from '@ember/component';
import buttonTracker from '../utils/raw_events';

import capabilities from '../utils/capabilities';

export default Component.extend({
  tagName: 'span',
  mouseDown: function() {
    // on iOS (probably just UIWebView) this phantom
    // click event get triggered. If you tap & release 
    // really fast then tap somewhere else, right after
    // touchstart a click gets triggered at the location
    // you hit and released before.
    var ignore = false;
    if(buttonTracker.lastTouchStart) {
      var now = (new Date()).getTime();
      if(capabilities.mobile && now - buttonTracker.lastTouchStart < 300) {
        ignore = true;
      }
    }
    if(!ignore) {
      if(this.select) {
        this.select();
      }
    }
    return true;
  },
  touchStart: function() {
    if(this.select) {
      this.select();
    }
    return true;
  },
  touchEnd: function(e) {
    if(this.release) {
      this.release(e);
    }
    return true;
  },
  mouseUp: function(event) {
    // on iOS (probably just UIWebView) this phantom
    // click event get triggered. If you tap & release 
    // really fast then tap somewhere else, right after
    // touchstart a click gets triggered at the location
    // you hit and released before.
    var ignore = false;
    var now = (new Date()).getTime();
    event.handled_at = now;
    if(buttonTracker.lastTouchStart) {
      if(capabilities.mobile && now - buttonTracker.lastTouchStart < 300) {
        ignore = true;
        event.fake_event = true;
      }
    }
    if(!ignore) {
      if(this.release) {
        this.release(event);
      }
    }
    return true;
  }
});
