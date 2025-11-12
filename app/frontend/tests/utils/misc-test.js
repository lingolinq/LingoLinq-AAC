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
import { easyPromise, db_wait, result_wrap } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import Utils from '../../utils/misc';
import modal from '../../utils/modal';
import persistence from '../../utils/persistence';
import scanner from '../../utils/scanner';
import LingoLinq from '../../app';

describe("misc", function() {
  describe("handlebars helpers", function() {
  });

  describe("resolutions", function() {
    it("should return the list of resolutions, if any", function() {
      var defers = [];
      var promises = [];
      for(var idx = 0; idx < 5; idx++) {
        var defer = RSVP.defer();
        defers.push(defer);
        promises.push(defer.promise);
      }
      var resolutions = null;
      RSVP.resolutions(promises).then(function(list) {
        resolutions = list;
      });

      defers[0].resolve();
      expect(resolutions).toEqual(null);

      defers[1].resolve();
      expect(resolutions).toEqual(null);

      defers[2].reject();
      expect(resolutions).toEqual(null);

      defers[3].reject();
      expect(resolutions).toEqual(null);

      defers[4].resolve();
      waitsFor(function() { return resolutions; });
      runs(function() {
        expect(resolutions.length).toEqual(3);
      });
    });
    it("should resolve immediately for an empty list of promises", function() {
      var resolved = false;
      RSVP.resolutions([]).then(function(list) {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
      runs();
    });
    it("should not fail when promises reject", function() {
      var defer = RSVP.defer();
      var resolved = false;
      RSVP.resolutions([defer.promise]).then(function(list) {
        resolved = list.length === 0;
      });
      defer.reject();
      waitsFor(function() { return resolved; });
      runs();
    });
  });

  describe("Utils", function() {
    describe("uniq", function() {
      it("should uniqify based on a string attribute", function() {
        var list = [{a: 1}, {a: 1}, {a: 2}];
        var res = Utils.uniq(list, 'a');
        expect(res).toEqual([{a: 1}, {a: 2}]);
      });
      it("should ignore any results with no value for the attribute", function() {
        var list = [{a: 1}, {a: 1}, {a: 2}, {b: 1}, {b: 2}];
        var res = Utils.uniq(list, 'a');
        expect(res).toEqual([{a: 1}, {a: 2}]);
      });
      it("should uniqify based on a function attribute", function() {
        var list = [{a: 1}, {a: 1}, {b: 2}, {b: 3}];
        var res = Utils.uniq(list, function(i) { return i.b || (i.a * 2); });
        expect(res).toEqual([{a: 1}, {b: 3}]);
      });
    });

    describe("max_appearance", function() {
      it("should calculate the correct max_appearance", function() {
        expect(Utils.max_appearance([1,1,1,1,2,2,3])).toEqual(4);
        expect(Utils.max_appearance([1,2,3,1,2,3,1,2,3])).toEqual(3);
        expect(Utils.max_appearance([1,2,3,4,56,7,8,9,8])).toEqual(2);
        expect(Utils.max_appearance(['a', 'b', 'c', 'a', 'b', 'a'])).toEqual(3);
      });
    });

    describe("all_pages", function() {
      it("should handle paginated record queries", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(LingoLinq.store, 'query', function(type, opts) {
          expect(type).toEqual('user');
          expect(opts.a).toEqual(1);
          attempt++;
          if(attempt == 1) {
            return RSVP.resolve(result_wrap({
              map: function() {
                return [{id: '1'},{id: '2'}];
              },
              meta: {
                more: true,
                per_page: 2,
                next_offset: 2
              }
            }));
          } else if(attempt == 2) {
            expect(opts.offset).toEqual(2);
            return RSVP.resolve(result_wrap({
              map: function() {
                return [{id: '3'},{id: '4'}];
              },
              meta: {
                more: true,
                per_page: 2,
                next_offset: 4
              }
            }));
          } else {
            expect(opts.offset).toEqual(4);
            return RSVP.resolve(result_wrap({
              map: function() {
                return [{id: '1'},{id: '2'}];
              },
              meta: {
                more: false,
                per_page: 2,
                next_offset: 2
              }
            }));
          }
        });
        var list = null;
        Utils.all_pages('user', {a: 1}).then(function(res) {
          list = res;
        });
        waitsFor(function() { return list; });
        runs(function() {
          expect(attempt).toEqual(3);
          expect(list.length).toEqual(6);
          expect(list[0].id).toEqual('1');
        });
      });

      it("should handle single-page record queries", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(LingoLinq.store, 'query', function(type, opts) {
          expect(type).toEqual('user');
          expect(opts.a).toEqual(1);
          attempt++;
          if(attempt == 1) {
            return RSVP.resolve({
              map: function() {
                return [
                  {id: '1'},{id: '2'}
                ];
              },
              meta: {
                more: false,
                per_page: 2,
                next_offset: 2
              }
            });
          }
        });
        var list = null;
        Utils.all_pages('user', {a: 1}).then(function(res) {
          list = res;
        });
        waitsFor(function() { return list; });
        runs(function() {
          expect(attempt).toEqual(1);
          expect(list.length).toEqual(2);
        });
      });

      it("should handle paginated url queries", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(persistence, 'ajax', function(path, opts) {
          attempt++;
          if(attempt == 1) {
            expect(opts.a).toEqual(1);
            expect(path).toEqual('/api/v1/more/level/1');
            return RSVP.resolve({
              user: [
                {id: '1'},
                {id: '2'}
              ],
              meta: {
                more: true,
                per_page: 2,
                next_offset: 2,
                next_url: '/api/v1/more/level/2'
              }
            });
          } else if(attempt == 2) {
            expect(opts.a).toEqual(undefined);
            expect(path).toEqual('/api/v1/more/level/2');
            return RSVP.resolve({
              user: [
                {id: '3'},
                {id: '4'}
              ],
              meta: {
                more: true,
                per_page: 2,
                next_offset: 4,
                next_url: '/api/v1/more/level/3'
              }
            });
          } else {
            expect(opts.a).toEqual(undefined);
            expect(path).toEqual('/api/v1/more/level/3');
            return RSVP.resolve({
              user: [
                {id: '1'},
                {id: '2'}
              ],
              meta: {
                more: false,
                per_page: 2,
                next_offset: 2
              }
            });
          }
        });
        var list = null;
        Utils.all_pages('/api/v1/more/level/1', {a: 1, result_type: 'user'}).then(function(res) {
          list = res;
        });
        waitsFor(function() { return list; });
        runs(function() {
          expect(attempt).toEqual(3);
          expect(list.length).toEqual(6);
          expect(list[0].id).toEqual('1');
        });
      });

      it("should handle single-page url queries", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(persistence, 'ajax', function(path, opts) {
          attempt++;
          expect(opts.a).toEqual(1);
          expect(path).toEqual('/api/v1/more/level/1');
          return RSVP.resolve({
            user: [
              {id: '1'},
              {id: '2'}
            ],
            meta: {
              more: false,
              per_page: 2,
              next_offset: 2,
              next_url: null
            }
          });
        });
        var list = null;
        Utils.all_pages('/api/v1/more/level/1', {a: 1, result_type: 'user'}).then(function(res) {
          list = res;
        });
        waitsFor(function() { return list; });
        runs(function() {
          expect(attempt).toEqual(1);
          expect(list.length).toEqual(2);
          expect(list[0].id).toEqual('1');
        });
      });

      it("should handle record query errors gracefully", function() {
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(LingoLinq.store, 'query', function(type, opts) {
          expect(type).toEqual('user');
          expect(opts.a).toEqual(1);
          return RSVP.reject({error: 'asdf'});
        });
        var error = null;
        Utils.all_pages('user', {a: 1}).then(null, function(res) {
          error = res;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual({error: 'asdf'});
        });
      });

      it("should handle record query errors on subsequent pages", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(LingoLinq.store, 'query', function(type, opts) {
          expect(type).toEqual('user');
          expect(opts.a).toEqual(1);
          attempt++;
          if(attempt == 1) {
            return RSVP.resolve({
              map: function() {
                return [
                  {id: '1'},{id: '2'}
                ];
              },
              meta: {
                more: true,
                per_page: 2,
                next_offset: 2
              }
            });
          } else if(attempt == 2) {
            expect(opts.offset).toEqual(2);
            return RSVP.resolve({
              map: function() {
                return [{id: '3'},{id: '4'}
                ];
              },
              meta: {
                more: true,
                per_page: 2,
                next_offset: 4
              }
            });
          } else {
            expect(opts.offset).toEqual(4);
            return RSVP.reject({error: 'asdf'});
          }
        });
        var error = null;
        Utils.all_pages('user', {a: 1}).then(null, function(res) {
          error = res;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(attempt).toEqual(3);
          expect(error).toEqual({error: 'asdf'});
        });
      });

      it("should call back with preliminary results if a callback is defined on a record query", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        var intermediate = null;
        stub(LingoLinq.store, 'query', function(type, opts) {
          expect(type).toEqual('user');
          expect(opts.a).toEqual(1);
          attempt++;
          if(attempt == 1) {
            expect(intermediate).toEqual(null);
            return RSVP.resolve({
              map: function() {
                return [
                  {id: '1'},{id: '2'}
                ];
              },
              meta: {
                more: true,
                per_page: 2,
                next_offset: 2
              }
            });
          } else if(attempt == 2) {
            expect(opts.offset).toEqual(2);
            expect(intermediate.length).toEqual(2);
            return RSVP.resolve({
              map: function() {
                return [
                  {id: '3'},{id: '4'}
                ];
              },
              meta: {
                more: true,
                per_page: 2,
                next_offset: 4
              }
            });
          } else {
            expect(opts.offset).toEqual(4);
            expect(intermediate.length).toEqual(4);
            return RSVP.resolve({
              map: function() {
                return [
                  {id: '1'},{id: '2'}
                ]
              },
              meta: {
                more: false,
                per_page: 2,
                next_offset: 2
              }
            });
          }
        });
        var list = null;
        Utils.all_pages('user', {a: 1}, function(inter) {
          intermediate = inter;
        }).then(function(res) {
          list = res;
        });
        waitsFor(function() { return list; });
        runs(function() {
          expect(attempt).toEqual(3);
          expect(list.length).toEqual(6);
          expect(list[0].id).toEqual('1');
        });
      });

      it("should handle url query errors gracefully", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(persistence, 'ajax', function(path, opts) {
          attempt++;
          expect(opts.a).toEqual(1);
          expect(path).toEqual('/api/v1/more/level/1');
          return RSVP.reject({error: 'asdf'});
        });
        var error = null;
        Utils.all_pages('/api/v1/more/level/1', {a: 1, result_type: 'user'}).then(null, function(res) {
          error = res;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(attempt).toEqual(1);
          expect(error).toEqual({error: 'asdf'});
        });
      });

      it("should handle url query errors on subsequent pages", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });

        stub(persistence, 'ajax', function(path, opts) {
          attempt++;
          if(attempt == 1) {
            expect(opts.a).toEqual(1);
            expect(path).toEqual('/api/v1/more/level/1');
            return RSVP.resolve({
              user: [
                {id: '1'},
                {id: '2'}
              ],
              meta: {
                more: true,
                per_page: 2,
                next_offset: 2,
                next_url: '/api/v1/more/level/2'
              }
            });
          } else if(attempt == 2) {
            expect(opts.a).toEqual(undefined);
            expect(path).toEqual('/api/v1/more/level/2');
            return RSVP.resolve({
              user: [
                {id: '3'},
                {id: '4'}
              ],
              meta: {
                more: true,
                per_page: 2,
                next_offset: 4,
                next_url: '/api/v1/more/level/3'
              }
            });
          } else {
            expect(opts.a).toEqual(undefined);
            expect(path).toEqual('/api/v1/more/level/3');
            return RSVP.reject({error: 'asdf'});
          }
        });
        var error = null;
        Utils.all_pages('/api/v1/more/level/1', {a: 1, result_type: 'user'}).then(null, function(res) {
          error = res;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(attempt).toEqual(3);
          expect(error).toEqual({error: 'asdf'});
        });
      });

      it("should call back with preliminary results if a callback is defined on a url query", function() {
        var attempt = 0;
        stub(persistence, 'meta', function(type, obj) {
          expect(type).toEqual('user');
          return obj.meta;
        });
        var intermediate = null;

        stub(persistence, 'ajax', function(path, opts) {
          attempt++;
          if(attempt == 1) {
            expect(opts.a).toEqual(1);
            expect(path).toEqual('/api/v1/more/level/1');
            expect(intermediate).toEqual(null);
            return RSVP.resolve({
              user: [
                {id: '1'},
                {id: '2'}
              ],
              meta: {
                more: true,
                per_page: 2,
                next_offset: 2,
                next_url: '/api/v1/more/level/2'
              }
            });
          } else if(attempt == 2) {
            expect(opts.a).toEqual(undefined);
            expect(path).toEqual('/api/v1/more/level/2');
            expect(intermediate.length).toEqual(2);
            return RSVP.resolve({
              user: [
                {id: '3'},
                {id: '4'}
              ],
              meta: {
                more: true,
                per_page: 2,
                next_offset: 4,
                next_url: '/api/v1/more/level/3'
              }
            });
          } else {
            expect(opts.a).toEqual(undefined);
            expect(path).toEqual('/api/v1/more/level/3');
            expect(intermediate.length).toEqual(4);
            return RSVP.resolve({
              user: [
                {id: '1'},
                {id: '2'}
              ],
              meta: {
                more: false,
                per_page: 2,
                next_offset: 2
              }
            });
          }
        });
        var list = null;
        Utils.all_pages('/api/v1/more/level/1', {a: 1, result_type: 'user'}, function(inter) {
          intermediate = inter;
        }).then(function(res) {
          list = res;
        });
        waitsFor(function() { return list; });
        runs(function() {
          expect(attempt).toEqual(3);
          expect(list.length).toEqual(6);
          expect(list[0].id).toEqual('1');
        });
      });
    });
  });
});
