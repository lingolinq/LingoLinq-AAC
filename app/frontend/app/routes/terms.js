import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import app_state from '../utils/app_state';

export default Route.extend({
  activate: function() {
    this._super();
    window.scrollTo(0, 0);
  },
  actions: {
    didTransition: function() {
      if(app_state.get('no_linky')) {
        var kill = function() {
          var links = document.getElementById('content').getElementsByTagName('A');
          for(var idx = 0; idx < links.length; idx++) {
            kill.killed = true;
            var href = links[idx].getAttribute('href');
            if(href && href.match(/^http/)) {
              var elem = document.createElement('span');
              elem.innerText = links[idx].innerText;
              links[idx].insertAdjacentElement('afterend', elem);
              links[idx].style.display = 'none';
            }
          }
          if(!kill.killed) {
            runLater(kill, 100);
          }
        };
        runLater(kill, 50);
      }
    }
  }
});
