import Component from '@ember/component';
import frame_listener from '../utils/frame_listener';
import LingoLinq from '../app';

export default Component.extend({
  willDestroyElement: function() {
    frame_listener.unload();
  },
  actions: {
  }
});
