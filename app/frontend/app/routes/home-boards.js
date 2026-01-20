import Route from '@ember/routing/route';
import RSVP from 'rsvp';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';

export default Route.extend({
  store: service('store'),
  persistence: service('persistence'),
  appState: service('app-state'),
  setupController: function(controller) {
    var _this = this;
    _this.appState.controller.set('simple_board_header', true);
    function loadBoards() {
      if(_this.persistence.get('online')) {
        controller.set('home_boards', {loading: true});
        _this.store.query('board', {user_id: 'self', starred: true, public: true}).then(function(boards) {
          controller.set('home_boards', boards);
        }, function() {
          controller.set('home_boards', null);
        });
        controller.set('core_vocabulary', {loading: true});
        _this.store.query('board', {user_id: _this.appState.get('currentUser.id') || 'self', starred: true, public: true, per_page: 6}).then(function(boards) {
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
//     _this.persistence.addObserver('online', function() {
//       loadBoards();
//     });
  }
});
