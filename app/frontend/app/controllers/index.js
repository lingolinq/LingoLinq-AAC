import Controller from '@ember/controller';
import app_state from '../utils/app_state';
import $ from 'jquery';

export default Controller.extend({
  actions: {
    hide_login: function() {
      app_state.set('login_modal', false);
      $("html,body").css('overflow', '');
      $("#login_overlay").remove();
    },
    opening_index: function() {
      app_state.set('index_view', true);
    },
    closing_index: function() {
      app_state.set('index_view', false);
    }
  }
});
