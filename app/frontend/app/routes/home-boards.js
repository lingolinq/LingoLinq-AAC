import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import persistence from '../utils/persistence';
import app_state from '../utils/app_state';
import { observer } from '@ember/object';

export default Route.extend({
  setupController: function(controller) {
    var _this = this;
    app_state.controller.set('simple_board_header', true);
    function loadBoards() {
      if(persistence.get('online')) {
        controller.set('home_boards', {loading: true});
        _this.store.query('board', {user_id: app_state.get('domain_board_user_name'), starred: true, public: true}).then(function(boards) {
          controller.set('home_boards', boards);
        }, function() {
          controller.set('home_boards', null);
        });
        controller.set('core_vocabulary', {loading: true});
        _this.store.query('board', {user_id: app_state.get('domain_board_user_name'), starred: true, public: true, per_page: 6}).then(function(boards) {
          controller.set('core_vocabulary', boards);
        }, function() {
          controller.set('core_vocabulary', null);
        });
        controller.set('subject_vocabulary', {loading: true});
        _this.store.query('board', {user_id: 'subjects', starred: true, public: true, per_page: 6}).then(function(boards) {
          controller.set('subject_vocabulary', boards);
        }, function() {
          return RSVP.resolve({});
        });
//         controller.set('disability_vocabulary', {loading: true});
//         _this.store.query('board', {user_id: 'disability_boards', starred: true, public: true}).then(function(boards) {
//           controller.set('disability_vocabulary', boards);
//         }, function() {
//           controller.set('disability_vocabulary', null);
//         });
      } else {
        controller.set('home_boards', null);
        controller.set('core_vocabulary', null);
        controller.set('subject_vocabulary', null);
        controller.set('disability_vocabulary', null);
      }
    }
//     loadBoards();
//     persistence.addObserver('online', function() {
//       loadBoards();
//     });
  }
});
