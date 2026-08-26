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
import { fake_dbman, asEmberArray } from 'frontend/tests/helpers/ember_helper';
import capabilities from '../../utils/capabilities';

describe('dbman', function() {
  beforeEach(function() {
    stub(capabilities, 'dbman', fake_dbman());
  });

  describe('storing and finding', function() {
    it("should not find a record that isn't there", function() {
      var unfound = false;
      capabilities.dbman.find('shield', '2', function() { }, function() {
        unfound = true;
      });
      waitsFor(function() { return unfound; });
      runs();
    });

    it("should allow storing a record", function() {
      var result = null;
      capabilities.dbman.store('hat', {id: '1', name: 'top hat'}, function(res) {
        result = res;
      }, function() {
      });

      var found_record = null;
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.id).toEqual('1');
        expect(result.name).toEqual('top hat');
        capabilities.dbman.find('hat', '1', function(res) {
          found_record = res;
        }, function() { });
      });

      waitsFor(function() { return found_record; });
      runs(function() {
        expect(found_record.id).toEqual('1');
        expect(found_record.name).toEqual('top hat');
      });
    });

    it("should allow updating an existing record", function() {
      var result = null;
      capabilities.dbman.store('hat', {id: '1', name: 'top hat'}, function(res) {
        result = res;
      }, function() {
      });

      var updated_result = null;
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.id).toEqual('1');
        expect(result.name).toEqual('top hat');
        capabilities.dbman.store('hat', {id: '1', hair: 'none'}, function(res) {
          updated_result = res;
        }, function() { });
      });

      var found_result = null;
      waitsFor(function() { return updated_result; });
      runs(function() {
        capabilities.dbman.find('hat', '1', function(res) {
          found_result = res;
        }, function() { });
      });

      waitsFor(function() { return found_result; });
      runs(function() {
        expect(found_result.id).toEqual('1');
        expect(found_result.name).toEqual(undefined);
        expect(found_result.hair).toEqual('none');
      });
    });

    it("should find by specified index if provided", function() {
      // Distinct ids on purpose. Both records previously used id '1' and relied
      // on two concurrent stores racing so that neither removed the other, which
      // is not how the real dbman behaves: IndexedDB put() replaces on keyPath
      // and the sqlite path does UPDATE-if-exists, so a repeated id yields one
      // record. Two ids is what actually exercises find_all-by-index.
      var result1 = null, result2 = null;
      capabilities.dbman.store('hat', {id: '1', name: 'top hat', color: 'black'}, function(res) {
        result1 = res;
      }, function() {
      });
      capabilities.dbman.store('hat', {id: '2', name: 'ugly hat', color: 'black'}, function(res) {
        result2 = res;
      }, function() {
      });

      var results = null;
      waitsFor(function() { return result1 && result2; });
      runs(function() {
        capabilities.dbman.find_all('hat', 'color', 'black', function(list) {
          results = list;
        }, function() { });
      });

      waitsFor(function() { return results; });
      runs(function() {
        expect(asEmberArray(results).mapBy('data').mapBy('name').sort()).toEqual(['top hat', 'ugly hat']);
      });
    });

    it("should find by key for boards if specified", function() {
      var result1 = null, result2 = null;
      capabilities.dbman.store('board', {id: 'a/b', key: 'bacon'}, function(res) {
        result1 = res;
      }, function() { });
      capabilities.dbman.store('board', {id: 'bacon', key: 'a/b'}, function(res) {
        result2 = res;
      }, function() { });

      var found_result = null;
      waitsFor(function() { return result1 && result2; });
      runs(function() {
        capabilities.dbman.find('board', 'a/b', function(res) {
          found_result = res;
        }, function() { });
      });

      waitsFor(function() { return found_result; });
      runs(function() {
        expect(found_result.id).toEqual('bacon');
        expect(found_result.key).toEqual('a/b');
      });
    });

    it("should return the newest result when finding by key for boards if specified", function() {
      var findKey = 'dbman/newest-board-' + Math.random().toString(36).slice(2);
      var result1 = null, result2 = null, result3 = null;
      capabilities.dbman.store('board', {id: 'a/b', key: findKey, persisted: 1}, function(res) {
        result1 = res;
      }, function() { });
      capabilities.dbman.store('board', {id: 'bacon', key: findKey, persisted: 2}, function(res) {
        result2 = res;
      }, function() { });
      capabilities.dbman.store('board', {id: 'bacon2', key: findKey, persisted: 3}, function(res) {
        result3 = res;
      }, function() { });

      var found_result = null;
      waitsFor(function() { return result1 && result2 && result3; });
      runs(function() {
        capabilities.dbman.find('board', findKey, function(res) {
          found_result = res;
        }, function() { });
      });

      waitsFor(function() { return found_result; });
      runs(function() {
        expect(found_result.id).toEqual('bacon2');
        expect(found_result.key).toEqual(findKey);
      });
    });

    it("should find by key for users if specified", function() {
      var result1 = null, result2 = null;
      capabilities.dbman.store('user', {id: '1_2', key: 'bacon'}, function(res) {
        result1 = res;
      }, function() { });
      capabilities.dbman.store('user', {id: 'bacon', key: '1_2'}, function(res) {
        result2 = res;
      }, function() { });

      var found_result = null;
      waitsFor(function() { return result1 && result2; });
      runs(function() {
        capabilities.dbman.find('user', 'bacon', function(res) {
          found_result = res;
        }, function() { });
      });

      waitsFor(function() { return found_result; });
      runs(function() {
        expect(found_result.id).toEqual('1_2');
        expect(found_result.key).toEqual('bacon');
      });
    });

    it("should return the newest result when finding by key for users if specified", function() {
      var result1 = null, result2 = null, result3 = null;
      capabilities.dbman.store('user', {id: '1_2', key: 'bacon'}, function(res) {
        result1 = res;
      }, function() { });
      capabilities.dbman.store('user', {id: 'bacon', key: '1_2'}, function(res) {
        result2 = res;
      }, function() { });
      setTimeout(function() {
        capabilities.dbman.store('user', {id: '1_3', key: 'bacon'}, function(res) {
          result3 = res;
        }, function() { });
      }, 200);

      var found_result = null;
      waitsFor(function() { return result1 && result2 && result3; });
      runs(function() {
        capabilities.dbman.find('user', 'bacon', function(res) {
          found_result = res;
        }, function() { });
      });

      waitsFor(function() { return found_result; });
      runs(function() {
        expect(found_result.id).toEqual('1_3');
        expect(found_result.key).toEqual('bacon');
      });
    });
  });

  describe('clear', function() {
    it("should allow clearing a store", function() {
      var result = null;
      capabilities.dbman.store('hat', {id: '1', name: 'top hat'}, function(res) {
        result = res;
      }, function() {
      });

      var cleared = null;
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.id).toEqual('1');
        expect(result.name).toEqual('top hat');
        capabilities.dbman.clear('hat', function() {
          cleared = true;
        });
      });

      var unfound = false;
      waitsFor(function() { return cleared; });
      runs(function() {
        capabilities.dbman.find('hat', '1', function() { }, function() {
          unfound = true;
        });
      });

      waitsFor(function() { return unfound; });
    });
  });

  describe('remove', function() {
    it("should remove an existing record", function() {
      var result = null;
      capabilities.dbman.store('hat', {id: '1', name: 'top hat'}, function(res) {
        result = res;
      }, function() {
      });

      var found_record = null;
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.id).toEqual('1');
        expect(result.name).toEqual('top hat');
        capabilities.dbman.find('hat', '1', function(res) {
          found_record = res;
        }, function() { });
      });

      var delete_result = null;
      waitsFor(function() { return found_record; });
      runs(function() {
        expect(found_record.id).toEqual('1');
        expect(found_record.name).toEqual('top hat');

        capabilities.dbman.remove('hat', '1', function(res) {
          delete_result = res;
        }, function() {
        });
      });

      var unfound = false;
      waitsFor(function() { return delete_result; });
      runs(function() {
        expect(delete_result.id).toEqual('1');
        capabilities.dbman.find('hat', '1', function() { }, function() {
          unfound = true;
        });
      });

      waitsFor(function() { return unfound; });
    });
  });
});
