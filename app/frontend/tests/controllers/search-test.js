import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';

describe('SearchController', 'controller:search', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import LingoLinq from '../app';
// import persistence from '../utils/persistence';
// 
// export default EmberObjectController.extend({
//   title: function() {
//     return "Search results for " + this.get('searchString');
//   }.property('searchString'),
//   load_results: function(str) {
//     var _this = this;
//     this.set('online_results', {loading: true, results: []});
//     this.set('local_results', {loading: true, results: []});
// 
//     if(this.get('session.isAuthenticated')) {
//       persistence.find_boards(str).then(function(res) {
//         _this.set('local_results', {results: res});
//       }, function() { _this.set('local_results', {results: []}); });
//     } else {
//       _this.set('local_results', {impossible: true});
//     }
// 
//     function loadBoards() {
//       if(persistence.get('online')) {
//         _this.set('online_results', {loading: true, results: []});
//         LingoLinq.store.find('board', {q: str}).then(function(res) {
//           _this.set('online_results', {results: res.content});
//         }, function() { 
//           _this.set('online_results', {results: []}); 
//         });
//       } else {
//         _this.set('online_results', {results: []});
//       }
//     }
//     loadBoards();
//     
//     persistence.addObserver('online', function() {
//       loadBoards();
//     });
// 
//   }
// });
// 
