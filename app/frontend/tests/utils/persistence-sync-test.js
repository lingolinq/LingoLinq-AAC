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
import { queryLog, db_wait, fake_dbman } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import persistence from '../../utils/persistence';
import speecher from '../../utils/speecher';
import lingoLinqExtras from '../../utils/extras';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import editManager from '../../utils/edit_manager';
import capabilities from '../../utils/capabilities';
import contentGrabbers from '../../utils/content_grabbers';
import LingoLinq from '../../app';
import { run as emberRun } from '@ember/runloop';
import $ from 'jquery';

describe("persistence-sync", function() {
  var app = null;
  var dbman;
  var pictureGrabber = contentGrabbers.pictureGrabber;
  var soundGrabber = contentGrabbers.soundGrabber;
  var dbg = function() {
    debugger;
  };
  beforeEach(function() {
    app = {
      register: function(key, obj, args) {
        app.registered = (key === 'lingolinq:persistence' && obj === persistence && args.singleton === true);
      },
      inject: function(component, name, key) {
        if(name === 'persistence' && key === 'lingolinq:persistence') {
          app.injections.push(component);
        }
      },
      injections: []
    };
    stashes.set('current_mode', 'default');
    app_state.set('currentBoardState', null);
    app_state.set('sessionUser', null);
    persistence.set('sync_log', null);
    stub(speecher, 'load_beep', function() { return RSVP.resolve({}); });
    var pajax = persistence.ajax;
    stub(persistence, 'ajax', function(url, opts) {
      if(url.match(/board_revisions$/)) {
        var rej = RSVP.reject({});
        rej.then(null, function() { });
        return rej;
      } else {
        return pajax.apply(this, arguments);
      }
    });
    dbman = capabilities.dbman;
    capabilities.dbman = fake_dbman();
  });
  afterEach(function() {
    capabilities.dbman = dbman;
  });

  var board = null;
  function push_board(callback) {
    db_wait(function() {
      LingoLinq.store.push({data: {type: 'board', id: '1234', attributes: {
        id: '1234',
        name: 'Best Board'
      }}});
      var record = null;
      LingoLinq.store.find('board', '1234').then(function(res) {
        record = res;
      });
      var _this = this;
      waitsFor(function() { return record; });
      runs(function() {
        board = record;
        emberRun(_this, callback);
      });
    });
  }

  it("should return a promise", function() {
    db_wait(function() {
      var done = false;
      var res = persistence.sync(1);
      expect(persistence.get('sync_status')).toEqual('syncing');
      expect(res.then).not.toEqual(null);
      res.then(function() { done = true; }, function() { done = true; });
      waitsFor(function() { return done; });
      runs();
    });
  });

  it("should make sure the local db is available and error if not", function() {
    db_wait(function() {
      var error = null;
      var db = capabilities.db;
      capabilities.db = null;
      var called = false;
      var promise = new RSVP.Promise(function(resolve, reject) {
        called = true;
        resolve({user: {id: '134', user_name: 'fred'}});
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: promise,
        id: "134"
      });

      persistence.sync(134).then(function() {
        capabilities.db = db;
      }, function(str) {
        capabilities.db = db;
        error = str;
      });
      stub(modal, 'error', function() {});
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual({error: "db not initialized"});
      });
    });
  });


  it("should try to find the specified user, which should then persist that user to the local db", function() {
    var called = false;
    var promise = new RSVP.Promise(function(resolve, reject) {
      called = true;
      resolve({user: {id: '134', user_name: 'fred'}});
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'user',
      response: promise,
      id: "134"
    });
    var done = false;
    persistence.sync(134).then(function() { done = true; }, function() { done = true; });
    waitsFor(function() { return called && done; });
    runs();
  });

  it("should call find_changed", function() {
    var called = false;
    stub(persistence, 'find_changed', function() {
      called = true;
      return RSVP.resolve([]);
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'user',
      response: RSVP.resolve({user: {id: '134', user_name: 'fred'}}),
      id: "134"
    });
    var done = false;
    persistence.sync(134).then(function() { done = true; }, function() { done = true; });
    waitsFor(function() { return called && done; });
    runs();
  });


  it("should save the specified user's avatar as a data-uri", function() {
    LingoLinq.all_wait = true;
    var called = false;
    stub(persistence, 'store_url', function(url, type) {
      called = (url === "http://example.com/pic.png" && type === 'image');
      return RSVP.resolve({url: "http://example.com/pic.png"});
    });
    stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
    queryLog.defineFixture({
      method: 'GET',
      type: 'user',
      response: RSVP.resolve({user: {id: '134', user_name: 'fred', avatar_url: 'http://example.com/pic.png'}}),
      id: "134"
    });
    var done = false;
    persistence.sync(134).then(function() { done = true; }, function() { done = true; });
    waitsFor(function() { return called && done; });
    runs();
  });

  it("should traverse all the user's boards, saving their icons and buttons and sounds", function() {
    var stores = [];
    stub(persistence, 'store_url', function(url, type) {
      stores.push(url);
      console.log(url);
      return RSVP.resolve({url: url});
    });
    stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
    queryLog.defineFixture({
      method: 'GET',
      type: 'user',
      response: RSVP.resolve({user: {
        id: '134',
        user_name: 'fred',
        avatar_url: 'http://example.com/pic.png',
        preferences: {home_board: {id: '145'}}
      }}),
      id: "134"
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'board',
      response: RSVP.resolve({board: {
        id: '145',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      },
        image: [
          {id: '2', url: 'http://example.com/image.png'}
        ],
        sound: [
          {id: '3', url: 'http://example.com/sound.mp3'}
        ]
      }),
      id: '145'
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'board',
      response: RSVP.resolve({board: {
        id: '167',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      },
        image: [
          {id: '2', url: 'http://example.com/image2.png'}
        ]
      }),
      id: '167'
    });
    var done = false;
    persistence.sync(134).then(function() { done = true; }, function() { done = true; });
    waitsFor(function() { return stores.length === 6 && done; });
    runs(function() {
      expect(stores.find(function(u) { return u === 'http://example.com/pic.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/board.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/image.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/image2.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/sound.mp3'; })).not.toEqual(null);
    });
  });

  it("should not get stuck in a circular reference for board links", function() {
    var stores = [];
    stub(persistence, 'store_url', function(url, type) {
      stores.push(url);
      console.log(url);
      return RSVP.resolve({url: url});
    });
    stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
    queryLog.defineFixture({
      method: 'GET',
      type: 'user',
      response: RSVP.resolve({user: {
        id: '134',
        user_name: 'fred',
        avatar_url: 'http://example.com/pic.png',
        preferences: {home_board: {id: '145'}}
      }}),
      id: "134"
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'board',
      response: RSVP.resolve({board: {
        id: '145',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      },
        image: [
          {id: '2', url: 'http://example.com/image.png'}
        ],
        sound: [
          {id: '3', url: 'http://example.com/sound.mp3'}
        ]
      }),
      id: '145'
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'board',
      response: RSVP.resolve({board: {
        id: '167',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      },
        image: [
          {id: '2', url: 'http://example.com/image2.png'}
        ]
      }),
      id: '167'
    });
    var done = false;
    persistence.sync(134).then(function() { done = true; }, function() { done = true; });
    waitsFor(function() { return stores.length === 6 && done; });
    runs(function() {
      expect(stores.find(function(u) { return u === 'http://example.com/pic.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/board.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/image.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/image2.png'; })).not.toEqual(null);
      expect(stores.find(function(u) { return u === 'http://example.com/sound.mp3'; })).not.toEqual(null);
    });
  });

  it("should persist to the local db the list of important ids", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });

      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      var ids = null;

      emberRun.later(function() {
        persistence.sync(1340).then(function() {
          setTimeout(function() {
            persistence.find('settings', 'importantIds').then(function(res) {
              ids = res.ids;
            }, function() { ids = []; });
          }, 50);
        }, function() { ids = []; });
      }, 10);
      waitsFor(function() { return ids; });
      runs(function() {
        expect(ids.length).toEqual(10);
        expect(ids.find(function(u) { return u === 'user_1340'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'dataCache_http://example.com/pic.png'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'image_2'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'dataCache_http://example.com/image.png'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'sound_3'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'dataCache_http://example.com/sound.mp3'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'board_167'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'dataCache_http://example.com/image2.png'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'board_145'; })).not.toEqual(null);
        expect(ids.find(function(u) { return u === 'dataCache_http://example.com/pic.png'; })).not.toEqual(null);
      });
    });
  });

  it("should persist to the local db the timestamp of the last sync", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      var stamp = false;
      var done = false;
      persistence.sync(1340).then(function() {
        setTimeout(function() {
          persistence.find('settings', 'lastSync').then(function(res) {
            stamp = res.last_sync;
            done = true;
          }, function() { done = true; });
        }, 50);
      }, function() { done = true; });
      var ts = (new Date()).getTime() / 1000;
      waitsFor(function() { return done && (stamp > (ts - 3)); });
      runs();
    });
  });

   it("should resolve on completion", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '178'
      });
      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs();
    });
  });

 it("should resolve on completion, retrieving all boards", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}},
            {id: '2', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}},
            {id: '2', image_id: '2', load_board: {id: '167'}},
            {id: '3', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '178'
      });
      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        var logs = queryLog;
        expect(logs.findBy('id', '1340')).toNotEqual(undefined);
        expect(logs.findBy('id', '145')).toNotEqual(undefined);
        expect(logs.findBy('id', '167')).toNotEqual(undefined);
        expect(logs.findBy('id', '178')).toNotEqual(undefined);
      });
    });
  });

  it("should append to the sync log on success", function() {
    db_wait(function() {
      persistence.set('sync_log', [{a: 1}]);
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}},
            {id: '2', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}},
            {id: '2', image_id: '2', load_board: {id: '167'}},
            {id: '3', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '178'
      });
      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        var logs = queryLog;
        expect(logs.findBy('id', '1340')).toNotEqual(undefined);
        expect(logs.findBy('id', '145')).toNotEqual(undefined);
        expect(logs.findBy('id', '167')).toNotEqual(undefined);
        expect(logs.findBy('id', '178')).toNotEqual(undefined);
        var log = persistence.get('sync_log');
        expect(log.length).toEqual(2);
        expect(log[0].a).toEqual(1);
        expect(log[1].user_id).toEqual('fred');
      });
    });
  });

  it("should append to the sync log on failure", function() {
    db_wait(function() {
      persistence.set('sync_log', null);
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(modal, 'error', function() { });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.reject({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });

      var error = null;
      persistence.sync(1340).then(function() { debugger; }, function(err) {
        error = err;
      });
      waitsFor(function() { return error; });
      runs(function() {
        var logs = queryLog;
        expect(logs.findBy('id', '1340')).toNotEqual(undefined);

        var log = persistence.get('sync_log');
        expect(log.length).toEqual(1);
        expect(log[0].user_id).toEqual(1340);
      });
    });
  });

  it("should append to the sync log on board failure", function() {
    db_wait(function() {
      persistence.set('sync_log', null);
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(modal, 'error', function() { });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });

      var r = RSVP.reject({error: "Not authorized"});
      r.then(null, function() { });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: r,
        id: '167'
      });

      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board.png',
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}},
            {id: '2', image_id: '2', load_board: {id: '167'}},
            {id: '3', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '178'
      });
      var result = null;
      persistence.sync(1340).then(function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        var logs = queryLog;
        expect(logs.findBy('id', '1340')).toNotEqual(undefined);
        expect(logs.findBy('id', '145')).toNotEqual(undefined);
        expect(logs.findBy('id', '167')).toNotEqual(undefined);

        var log = persistence.get('sync_log');
        expect(log.length).toEqual(1);
        expect(log[0].user_id).toEqual('fred');
        expect(log[0].issues).toEqual(true);
        expect(log[0].statuses.length).toEqual(2);
        expect(log[0].statuses[0].id).toEqual('145');
        expect(log[0].statuses[1].id).toEqual('167');
        expect(log[0].statuses[1].error).toEqual('board 167 failed retrieval for syncing, linked from 145');
      });
    });
  });

  it("should skip board lookups that are already cached locally", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        full_set_revision: 'not_current',
        permissions: {},
        buttons: [
          {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        full_set_revision: 'not_current',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '178'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '178',
        full_set_revision: 'current',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '167'}},
          {id: '3', image_id: '2', load_board: {id: '179'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b4 = {
        id: '179',
        full_set_revision: 'whatever',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;
      revisions[b4.id] = b4.full_set_revision;

      persistence.url_uncache = {
        'http://www.example.com/pic.png': true
      };
      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b2, b2.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('board', b4, b4.id));
      store_promises.push(persistence.store('image', {id: '2', url: 'http://www.example.com/pic.png'}, '2'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));


      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          stored = true;
        }, 50);
      }, function() {
        dbg();
      });

      var done = false;
      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;

        b1.full_set_revision = 'current';
        b2.full_set_revision = 'current';
        b3.full_set_revision = 'current';
        b4.full_set_revision = 'current';
        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/178') {
            return RSVP.resolve({
              board: b3
            });
          }
          return RSVP.reject({});
        });

        persistence.sync(1340).then(function() {
          done = true;
        });
      });
      waitsFor(function() { return done; });
      runs();
    });
  });

  it("should not assume a board is cached locally if an image's dataCache is missing", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var now = (new Date()).getTime();
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        permissions: {},
        full_set_revision: 'current',
        buttons: [
          {id: '1', image_id: '1', sound_id: '3', load_board: {id: '167'}}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        full_set_revision: 'current',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '168'}},
          {id: '2', image_id: '2'}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '168',
        full_set_revision: 'current',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '1'}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;

      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b2, b2.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('image', {id: '1', url: 'http://www.example.com/pic1.png'}, '1'));
      store_promises.push(persistence.store('image', {id: '2', url: 'http://www.example.com/pic2.png'}, '2'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic1.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic1.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));
      persistence.url_cache = persistence.url_cache || {};
      persistence.url_cache['http://www.example.com/pic1.png'] = 'data:image/png;base64,a0a';
      persistence.url_uncache = {};
      stub(lingoLinqExtras, 'find_all', function(type) {
        if(type == 'image') {
          return RSVP.resolve([
            {id: '1', url: 'http://www.example.com/pic1.png'},
            {id: '2', url: 'http://www.example.com/pic2.png'}
          ]);
        } else {
          return RSVP.resolve([]);
        }
      });

      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          lingoLinqExtras.storage.find_all('board').then(function(r) {
            expect(r.length).toEqual(3);
            stored = true;
          }, function(err) {
            debugger;
          });
        }, 50);
      }, function() {
        dbg();
      });

      var done = false;
      var remote_checked_b1 = false;
      var remote_checked_b2 = false;
      var remote_checked_b3 = false;

      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;

        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            remote_checked_b1 = true;
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            remote_checked_b2 = true;
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/168') {
            remote_checked_b3 = true;
            return RSVP.resolve({
              board: b3
            });
          }
          return RSVP.reject({});
        });
        emberRun.later(function() {
          persistence.known_missing = null;
          persistence.sync(1340).then(function() {
            done = true;
          }, function() {
            done = true;
          });
        }, 50);
      });
      waitsFor(function() { return done && remote_checked_b1; });
      runs(function() {
        expect(remote_checked_b2).toEqual(true);
        expect(remote_checked_b3).toEqual(false);
      });
    });
  });

  it("should not assume a board is cached locally if an image's db entry missing", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var now = (new Date()).getTime();
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        permissions: {},
        full_set_revision: 'current',
        buttons: [
          {id: '1', image_id: '1', sound_id: '3', load_board: {id: '167'}}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        permissions: {},
        full_set_revision: 'current',
        image_url: 'http://example.com/board.png',
        image_urls: [],
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '168'}},
          {id: '2', image_id: '2'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '168',
        permissions: {},
        full_set_revision: 'current',
        image_url: 'http://example.com/board.png',
        image_urls: [],
        buttons: [
          {id: '1', image_id: '1'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;

      persistence.url_cache = {
        'http://www.example.com/pic1.png': 'data:image/png;base64,a0a'
      };
      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b2, b2.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('image', {id: '1', url: 'http://www.example.com/pic1.png'}, '1'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic1.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic1.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));
      stub(lingoLinqExtras, 'find_all', function(type) {
        if(type == 'image') {
          return RSVP.resolve([
            {id: '1', url: 'http://www.example.com/pic1.png'}
          ]);
        } else {
          return RSVP.resolve([]);
        }
      });

      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          stored = true;
        }, 100);
      }, function() {
        dbg();
      });

      var done = false;
      var remote_checked_b1 = false;
      var remote_checked_b2 = false;
      var remote_checked_b3 = false;

      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;


        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            remote_checked_b1 = true;
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            remote_checked_b2 = true;
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/168') {
            remote_checked_b3 = true;
            return RSVP.resolve({
              board: b3
            });
          }
          return RSVP.reject({});
        });

        emberRun.later(function() {
          persistence.sync(1340).then(function() {
            done = true;
          }, function() {
            done = true;
          });
        }, 50);
      });
      waitsFor(function() { return done && remote_checked_b1; });
      runs(function() {
        expect(remote_checked_b2).toEqual(true);
        expect(remote_checked_b3).toEqual(false);
      });
    });
  });

  it("should not assume a board is cached locally if a board's db entry missing", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var now = (new Date()).getTime();
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        permissions: {},
        full_set_revision: 'current',
        buttons: [
          {id: '1', image_id: '1', sound_id: '3', load_board: {id: '167'}}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        permissions: {},
        full_set_revision: 'current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '168'}},
          {id: '2', image_id: '2'}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '168',
        permissions: {},
        full_set_revision: 'current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '1'}
        ],
        image_urls: [],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;

      persistence.url_cache = {
        'http://www.example.com/pic1.png': 'data:image/png;base64,a0a'
      };
      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('image', {id: '1', url: 'http://www.example.com/pic1.png'}, '1'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic1.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic1.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));
      stub(lingoLinqExtras, 'find_all', function(type) {
        if(type == 'image') {
          return RSVP.resolve([
            {id: '1', url: 'http://www.example.com/pic1.png'}
          ]);
        } else {
          return RSVP.resolve([]);
        }
      });

      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          stored = true;
        }, 100);
      }, function() {
        dbg();
      });

      var done = false;
      var remote_checked_b1 = false;
      var remote_checked_b2 = false;
      var remote_checked_b3 = false;

      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;


        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            remote_checked_b1 = true;
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            remote_checked_b2 = true;
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/168') {
            remote_checked_b3 = true;
            return RSVP.resolve({
              board: b3
            });
          }
          return RSVP.reject({});
        });

        emberRun.later(function() {
          persistence.sync(1340).then(function() {
            done = true;
          }, function() {
            done = true;
          });
        }, 50);
      });
      waitsFor(function() { return done && remote_checked_b2; });
      runs(function() {
        expect(remote_checked_b1).toEqual(true);
        expect(remote_checked_b3).toEqual(false);
      });
    });
  });

  it("should error if a required board isn't available", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(modal, 'error', function() { });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145', key: 'aa/bb'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          key: 'aa/bb',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167', key: 'aa/cc'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });

      var r = RSVP.reject({error: "Not authorized"});
      r.then(null, function() { });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: r,
        id: '167'
      });

      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '145'}},
            {id: '2', image_id: '2', load_board: {id: '167'}},
            {id: '3', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '178'
      });
      var result = null;
      persistence.sync(1340).then(function(res) {
        result = res;
      });
      waitsFor(function() { return result; });
      runs(function() {
        var logs = queryLog;
        expect(logs.findBy('id', '1340')).toNotEqual(undefined);
        expect(logs.findBy('id', '145')).toNotEqual(undefined);
        expect(logs.findBy('id', '167')).toNotEqual(undefined);
        expect(logs.findBy('id', '178')).toEqual(undefined);

        logs = persistence.get('sync_log');
        expect(logs.length).toEqual(1);
        expect(logs[0].issues).toEqual(true);
        expect(logs[0].user_id).toEqual('fred');
        expect(logs[0].statuses[0].key).toEqual('aa/bb');
        expect(logs[0].statuses[1].error).toEqual('board aa/cc failed retrieval for syncing, linked from aa/bb');

      });
    });
  });

 it("should not error if a link_disabled board isn't available", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}}
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}, link_disabled: true}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });

      var r = RSVP.reject({error: "Not authorized"});
      r.then(null, function() { });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: r,
        id: '167'
      });

      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        var logs = queryLog;
        expect(logs.findBy('id', '1340')).toNotEqual(undefined);
        expect(logs.findBy('id', '145')).toNotEqual(undefined);
        expect(logs.findBy('id', '167')).toNotEqual(undefined);
      });
    });
  });

  it("should create any newly-created records from find_changed", function() {
    db_wait(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;
      persistence.set('online', false);
      var record = null;
      var found_record = null;
      var created = null;

      stub($, 'realAjax', function(options) {
        if(options.url === '/api/v1/users/1340') {
          return RSVP.resolve({user: {
            id: '1340',
            user_name: 'fred'
          }});
        } else if(options.type === 'POST' && options.url === '/api/v1/boards') {
          if(options.data.board.key === found_record.key) {
            created = true;
            return RSVP.resolve({board: {
              id: '1998',
              key: 'fred/cool'
            }});
          }
        }
        return RSVP.reject({});
      });

      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      board.save().then(function(res) {
        record = res;
      });

      waitsFor(function() { return record; });
      runs(function() {
        setTimeout(function() {
          persistence.find('board', record.id).then(function(res) {
            found_record = res;
          });
        }, 50);
      });
      var done = false;
      var found_record_id = null;
      waitsFor(function() { return found_record; });
      runs(function() {
        expect(!!found_record.id.match(/^tmp_/)).toEqual(true);
        expect(!!found_record.key.match(/^tmp_.+\/cool/)).toEqual(true);
        expect(found_record.name).toEqual("My Awesome Board");
        emberRun.later(function() {
          found_record_id = found_record.id;
          persistence.set('online', true);
          persistence.sync(1340).then(null, function() {
            done = true;
          });
        });
      });
      var removed = false;
      waitsFor(function() { return done; });
      runs(function() {
        setTimeout(function() {
          persistence.find('board', '1998').then(function(res) {
            persistence.find('board', found_record_id).then(function() { dbg(); }, function() {
              removed = true;
            });
          }, function() { dbg(); });
        }, 50);
      });
      waitsFor(function() { return removed; });
      runs();
    });
  });

  it("should update any changed records from find_changed", function() {
    db_wait(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;
      var record = null;
      var updated_record = null;
      var remote_updated = null;

      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      board.save().then(function(res) {
        record = res;
      });
      stub($, 'realAjax', function(options) {
        if(options.type === 'GET' && options.url === "/api/v1/users/1567") {
          return RSVP.resolve({ user: {
            id: '1567',
            user_name: 'freddy'
          }});
        } else if(options.type === 'POST' && options.url === "/api/v1/boards") {
          if(options.data.board.name === "My Awesome Board") {
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board'
            }});
          }
        } else if(options.type === 'PUT' && options.url === "/api/v1/boards/1234") {
          if(options.data.board.name === "My Gnarly Board") {
            remote_updated = true;
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Stellar Board'
            }});
          }
        }
        return RSVP.reject({});
      });

      waitsFor(function() { return record; });
      runs(function() {
        emberRun.later(function() {
          expect(record.get('id')).toEqual("1234");
          expect(record.get('name')).toEqual("Righteous Board");
          persistence.set('online', false);
          record.set('name', 'My Gnarly Board');
          record.save().then(function() {
            setTimeout(function() {
              lingoLinqExtras.storage.find('board', '1234').then(function(res) {
                updated_record = res;
              });
            }, 50);
          }, function() { dbg(); });
        }, 50);
      });
      var done = false;
      waitsFor(function() { return updated_record; });
      runs(function() {
        emberRun.later(function() {
          expect(updated_record.raw.id).toEqual("1234");
          expect(updated_record.raw.name).toEqual("My Gnarly Board");
          expect(updated_record.changed).toEqual(true);
          persistence.set('online', true);
          persistence.sync('1567').then(function() { dbg(); }, function() {
            setTimeout(function() {
              done = true;
            }, 10);
          });
        }, 10);
      });
      var final_record = null;
      window.persistence = persistence;
      waitsFor(function() { return done && remote_updated; });
      runs(function() {
        setTimeout(function() {
          persistence.find('board', '1234').then(function(res) {
            final_record = res;
          }, function() { dbg(); });
          setTimeout(function() {
            persistence.find('board', '1234').then(function(res) { console.log(res); });
          }, 10);
        }, 50);
      });
      waitsFor(function() { return final_record; });
      runs(function() {
        persistence.find('board', '1234').then(function(res) { console.log(res); });
        expect(final_record.name).toEqual("Stellar Board");
      });
    });
  });

  it("should delete from the server when sync is finally called 2", function() {
    push_board(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;
      persistence.set('online', false);
      var deleted = null;
      board.deleteRecord();
      board.save().then(function(res) {
        setTimeout(function() {
          persistence.find('board', '1234').then(function() { dbg(); }, function() {
            deleted = true;
          });
        }, 50);
      }, function() { dbg(); });
      var found_deletion = null;
      waitsFor(function() { return deleted; });
      runs(function() {
        lingoLinqExtras.storage.find('deletion', 'board_1234').then(function() {
          found_deletion = true;
        });
      });

      var remotely_deleted = false;
      stub($, 'realAjax', function(options) {
        if(options.url === '/api/v1/users/1256') {
          return RSVP.resolve({user: {
            id: '1256',
            user_name: 'fred'
          }});
        } else if(options.url === '/api/v1/boards/1234') {
          if(options.type === 'GET') {
            return RSVP.resolve({board: {
              id: '1234',
              key: 'fred/cool'
            }});
          } else if(options.type === 'DELETE') {
            remotely_deleted = true;
            return RSVP.resolve({board: {id: '1234'}});
          }
        } else {
          return RSVP.reject({});
        }
      });
      waitsFor(function() { return found_deletion; });
      runs(function() {
        emberRun.later(function() {
          persistence.set('online', true);
          persistence.sync(1256).then(null, function() { });
        });
      });
      waitsFor(function() { return remotely_deleted; });
      runs();
    });
  });

  it("should error on failure updating a changed record", function() {
    db_wait(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;
      var record = null;
      var updated_record = null;
      var remote_updated = null;

      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      board.save().then(function(res) {
        record = res;
      });
      stub($, 'realAjax', function(options) {
        if(options.type === 'GET' && options.url === "/api/v1/users/1567") {
          return RSVP.resolve({ user: {
            id: '1567',
            user_name: 'freddy',
            avatar_url: 'data:image/png;base64,a0a'
          }});
        } else if(options.type === 'GET' && options.url === "/api/v1/board/1234") {
          return RSVP.resolve({ board: {
            id: '1234',
            name: 'Righteous Board'
          }});
        } else if(options.type === 'POST' && options.url === "/api/v1/boards") {
          if(options.data.board.name === "My Awesome Board") {
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board'
            }});
          }
        } else if(options.type === 'PUT' && options.url === "/api/v1/boards/1234") {
          if(options.data.board.name === "Yodeling Board") {
            remote_updated = true;
            return RSVP.reject({});
          }
        }
        dbg();
        return RSVP.reject({});
      });

      stub(persistence, 'find_changed', function() {
        return RSVP.resolve([
          {store: 'board', data: { raw: { id: '1234', name: 'Yodeling Board' } }}
        ]);
      });
      stub(modal, 'error', function() { });

      waitsFor(function() { return record; });
      runs(function() {
        emberRun.later(function() {
          expect(record.get('id')).toEqual("1234");
          expect(record.get('name')).toEqual("Righteous Board");
          persistence.set('online', false);
          record.set('name', 'My Gnarly Board');
          record.save().then(function() {
            setTimeout(function() {
              lingoLinqExtras.storage.find('board', '1234').then(function(res) {
                updated_record = res;
              });
            }, 50);
          }, function() { dbg(); });
        }, 50);
      });
      var error = null;
      waitsFor(function() { return updated_record; });
      runs(function() {
        emberRun.later(function() {
          expect(updated_record.raw.id).toEqual("1234");
          expect(updated_record.raw.name).toEqual("My Gnarly Board");
          expect(updated_record.changed).toEqual(true);
          persistence.set('online', true);
          persistence.sync('1567').then(function() { dbg(); }, function(err) {
            error = err;
          });
        }, 50);
      });
      var final_record = null;
      waitsFor(function() { return error; });
      runs(function() {
        setTimeout(function() {
          persistence.find('board', '1234').then(function(res) {
            final_record = res;
          }, function() { dbg(); });
        }, 50);
      });
      waitsFor(function() { return final_record; });
      runs(function() {
        expect(final_record.name).toEqual("My Gnarly Board");
        expect(error.error).toEqual("failed to save offline record, board 1234");
      });
    });
  });

  it("should error on failure creating a changed record", function() {
    db_wait(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;
      persistence.set('online', false);
      var record = null;
      var found_record = null;
      var created = null;

      stub($, 'realAjax', function(options) {
        if(options.url === '/api/v1/users/1340') {
          return RSVP.resolve({user: {
            id: '1340',
            user_name: 'fred',
            avatar_url: 'data:image/png;base64,a0a'
          }});
        } else if(options.type === 'POST' && options.url === '/api/v1/boards') {
          if(options.data.board.key === found_record.key) {
            created = true;
            return RSVP.reject({});
          }
        }
        return RSVP.reject({});
      });
      stub(modal, 'error', function() { });
      stub(persistence, 'find_changed', function() {
        return RSVP.resolve([
          {store: 'board', data: {raw: {id: found_record.id, key: found_record.key} }}
        ]);
      });

      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      board.save().then(function(res) {
        record = res;
      });

      waitsFor(function() { return record; });
      runs(function() {
        setTimeout(function() {
          persistence.find('board', record.id).then(function(res) {
            found_record = res;
          });
        }, 50);
      });
      var error = null;
      waitsFor(function() { return found_record; });
      runs(function() {
        expect(!!found_record.id.match(/^tmp_/)).toEqual(true);
        expect(!!found_record.key.match(/^tmp_.+\/cool/)).toEqual(true);
        expect(found_record.name).toEqual("My Awesome Board");
        emberRun.later(function() {
          persistence.set('online', true);
          persistence.sync(1340).then(null, function(err) {
            error = err;
          });
        });
      });
      var removed = false;
      waitsFor(function() { return error; });
      runs(function() {
        expect(!!error.error.match(/failed to save offline record, board tmp_/)).toEqual(true);
      });
    });
  });

  it("should upload a locally-created image file during sync", function() {
    db_wait(function() {
      queryLog.real_lookup = true;
      persistence.set('online', false);
      var obj = EmberObject.create({
      });
      var controller = EmberObject.extend({
        send: function(message) {
          this.sentMessages[message] = arguments;
        },
        model: EmberObject.create()
      }).create({
        'currentUser': EmberObject.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'}),
        sentMessages: {},
        id: '456',
        licenseOptions: [],
        'board': {model: obj}
      });
      stub(editManager, 'controller', controller.get('board'));
      stub(app_state, 'controller', controller);
      var button = EmberObject.extend({
        findContentLocally: function() {
          this.foundContentLocally = true;
          return RSVP.resolve(true);
        }
      }).create();
      pictureGrabber.setup(button, controller);
      controller.set('image_preview', {url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id === '456' && args.image_id === '123') { button_set = true; }
      });
      pictureGrabber.select_image_preview();

      var record = null;
      waitsFor(function() { return controller.get('model.image'); });
      runs(function() {
        expect(!!controller.get('model.image.id').match(/^tmp_/)).toEqual(true);
        expect(controller.get('model.image.url')).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
        expect(controller.get('image_preview')).toEqual(null);
        setTimeout(function() {
          persistence.find('image', controller.get('model.image.id')).then(function(res) {
            record = res;
          });
        }, 50);
      });

      stub($, 'realAjax', function(options) {
        if(options.url === '/api/v1/users/1340') {
          return RSVP.resolve({user: {
            id: '1340',
            user_name: 'fred',
            avatar_url: 'data:image/png;base64,a0a'
          }});
        } else if(options.type === 'POST' && options.url === '/api/v1/images') {
          return RSVP.resolve({image: {
            id: '1432',
            url: 'http://example.com/pic.png'
          }});
        } else if(options.type === 'GET' && options.url === '/api/v1/images/1432') {
          return RSVP.resolve({image: {
            id: '1432',
            url: 'http://example.com/pic.png'
          }});
        }
        return RSVP.reject({});
      });
      stub(persistence, 'find_changed', function() {
        return RSVP.resolve([
          {store: 'image', data: {raw: record }}
        ]);
      });

      var done = false;
      waitsFor(function() { return record; });
      runs(function() {
        emberRun.later(function() {
          expect(!!record.id.match(/^tmp_/)).toEqual(true);
          expect(record.url).toEqual('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
          persistence.set('online', true);
          persistence.sync(1340).then(function() {
            done = true;
          });
        });
      });
      waitsFor(function() { return done; });
      runs();
    });
  });

  it("should upload a locally-created sound file during sync", function() {
    db_wait(function() {
      queryLog.real_lookup = true;
      persistence.set('online', false);
      var obj = EmberObject.create({
      });
      var controller = EmberObject.extend({
        send: function(message) {
          this.sentMessages[message] = arguments;
        },
        model: EmberObject.create()
      }).create({
        'currentUser': EmberObject.create({user_name: 'bob', profile_url: 'http://www.bob.com/bob'}),
        sentMessages: {},
        id: '456',
        licenseOptions: [],
        'board': {model: obj}
      });
      stub(app_state, 'controller', controller);
      stub(editManager, 'controller', controller.get('board'));
      var button = EmberObject.extend({
        findContentLocally: function() {
          this.foundContentLocally = true;
          return RSVP.resolve(true);
        }
      }).create();
      soundGrabber.setup(button, controller);
      controller.set('sound_preview', {url: 'data:audio/mp3;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='});
      var button_set = false;
      stub(editManager, 'change_button', function(id, args) {
        if(id === '456' && args.sound_id === '123') { button_set = true; }
      });
      stub(window, 'Audio', function() {
        var res = {};
        function check() {
          if(res.src && res.ondurationchange) {
            res.ondurationchange();
          } else {
            setTimeout(check, 10);
          }
        }
        setTimeout(check, 10);
        return res;
      });
      soundGrabber.select_sound_preview();

      var record = null;
      waitsFor(function() { return controller.get('model.sound'); });
      runs(function() {
        expect(!!controller.get('model.sound.id').match(/^tmp_/)).toEqual(true);
        expect(controller.get('model.sound.url')).toEqual('data:audio/mp3;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
        expect(controller.get('sound_preview')).toEqual(null);
        setTimeout(function() {
          persistence.find('sound', controller.get('model.sound.id')).then(function(res) {
            record = res;
          });
        }, 50);
      });

      stub($, 'realAjax', function(options) {
        if(options.url === '/api/v1/users/1340') {
          return RSVP.resolve({user: {
            id: '1340',
            user_name: 'fred',
            avatar_url: 'data:image/png;base64,a0a'
          }});
        } else if(options.type === 'POST' && options.url === '/api/v1/sounds') {
          return RSVP.resolve({sound: {
            id: '1432',
            url: 'http://example.com/pic.png'
          }});
        } else if(options.type === 'GET' && options.url === '/api/v1/sounds/1432') {
          return RSVP.resolve({sound: {
            id: '1432',
            url: 'http://example.com/pic.png'
          }});
        }
        return RSVP.reject({});
      });
      stub(persistence, 'find_changed', function() {
        return RSVP.resolve([
          {store: 'sound', data: {raw: record }}
        ]);
      });

      var done = false;
      waitsFor(function() { return record; });
      runs(function() {
        emberRun.later(function() {
          expect(!!record.id.match(/^tmp_/)).toEqual(true);
          expect(record.url).toEqual('data:audio/mp3;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==');
          persistence.set('online', true);
          persistence.sync(1340).then(function() {
            done = true;
          });
        });
      });
      waitsFor(function() { return done; });
      runs();
    });
  });

  it("should clear changed status of successfully-updated records on partial sync", function() {
    db_wait(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;
      var record = null;
      var updated_record = null;
      var remote_updated = null;

      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      board.save().then(function(res) {
        record = res;
      });
      stub($, 'realAjax', function(options) {
        if(options.type === 'GET' && options.url === "/api/v1/users/1567") {
          return RSVP.resolve({ user: {
            id: '1567',
            user_name: 'freddy'
          }});
        } else if(options.type === 'POST' && options.url === "/api/v1/boards") {
          if(options.data.board.name === "My Awesome Board") {
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board'
            }});
          }
        } else if(options.type === 'PUT' && options.url === "/api/v1/boards/1234") {
          if(options.data.board.name === "My Gnarly Board") {
            remote_updated = true;
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Stellar Board'
            }});
          }
        }
        return RSVP.reject({});
      });

      waitsFor(function() { return record; });
      runs(function() {
        emberRun.later(function() {
          expect(record.get('id')).toEqual("1234");
          expect(record.get('name')).toEqual("Righteous Board");
          persistence.set('online', false);
          record.set('name', 'My Gnarly Board');
          record.save().then(function() {
            setTimeout(function() {
              lingoLinqExtras.storage.find('board', '1234').then(function(res) {
                updated_record = res;
              });
            }, 50);
          }, function() { dbg(); });
        }, 50);
      });
      var done = false;
      waitsFor(function() { return updated_record; });
      runs(function() {
        emberRun.later(function() {
          expect(updated_record.raw.id).toEqual("1234");
          expect(updated_record.raw.name).toEqual("My Gnarly Board");
          expect(updated_record.changed).toEqual(true);
          persistence.set('online', true);
          persistence.sync('1567').then(function() { dbg(); }, function() {
            done = true;
          });
        }, 50);
      });
      var final_record = null;
      waitsFor(function() { return done && remote_updated; });
      runs(function() {
        setTimeout(function() {
          lingoLinqExtras.storage.find('board', '1234').then(function(res) {
            final_record = res;
          }, function() { dbg(); });
        }, 50);
      });
      waitsFor(function() { return final_record; });
      runs(function() {
        expect(final_record.raw.name).toEqual("Stellar Board");
        expect(final_record.changed).toEqual(false);
      });
    });
  });

  it("should update all board links to sub-boards, images and sounds containing temporary identifiers as part of sync", function() {
    db_wait(function() {
      LingoLinq.all_wait = true;
      queryLog.real_lookup = true;

      stub($, 'realAjax', function(options) {
        if(options.type == 'GET' && options.url == "/api/v1/users/1567") {
          return RSVP.resolve({ user: {
            id: '1567',
            user_name: 'freddy',
            avatar_url: 'data:image/png;base64,a000'
          }});
        } else if(options.type == 'POST' && options.url == "/api/v1/boards") {
          var board = options.data.board;
          if(board.name == "My Awesome Board") {
            return RSVP.resolve({ board: {
              id: '1234',
              name: 'Righteous Board',
              buttons: board.buttons,
              order: board.order
            }});
          } else if(options.data.board.name == "Temp Board") {
            return RSVP.resolve({ board: {
              id: '1235',
              name: 'Previously-Temp Board',
              buttons: board.buttons,
              order: board.order
            }});
          }
        } else if(options.type == 'PUT' && options.url == '/api/v1/boards/1234') {
          var res = options.data.board;
          res.id = '1234';
          return RSVP.resolve({ board: res });
        } else if(options.type == 'PUT' && options.url == '/api/v1/boards/1235') {
          var res = options.data.board;
          res.id = '1235';
          return RSVP.resolve({ board: res });
        } else if(options.type == 'POST' && options.url == '/api/v1/images') {
          return RSVP.resolve({ image: {
            id: '1236'
          }});
        } else if(options.type == 'POST' && options.url == '/api/v1/sounds') {
          return RSVP.resolve({ sound: {
            id: '1237'
          }});
        } else if(options.type == 'GET' && options.url == '/api/v1/images/1236') {
          return RSVP.resolve({ image: {
            id: '1236'
          }});
        } else if(options.type == 'GET' && options.url == '/api/v1/sounds/1237') {
          return RSVP.resolve({ sound: {
            id: '1237'
          }});
        }
        dbg();
        return RSVP.reject({});
      });

      var server_board, tmp_board, tmp_image, tmp_sound;
      var new_image, new_board, new_sound;
      // create a server-side board
      var board = LingoLinq.store.createRecord('board', {key: 'ok/cool', name: "My Awesome Board"});
      board.save().then(function(res) {
        server_board = res;
      });

      var temps_made = false;
      waitsFor(function() { return server_board; });
      runs(function() {
        persistence.set('online', false);
        emberRun.later(function() {
          // create a temporary image
          // create a temporary sound
          // create a temporary board
          expect(server_board.get('id')).toEqual("1234");
          expect(server_board.get('name')).toEqual("Righteous Board");
          persistence.set('online', false);

          var board2 = LingoLinq.store.createRecord('board', {key: 'ok/cool2', name: 'Temp Board'});
          board2.save().then(function(res) {
            tmp_board = res;
          });

          var image = LingoLinq.store.createRecord('image', {});
          image.save().then(function(res) {
            setTimeout(function() {
              persistence.find('image', res.get('id')).then(function(res) {
                tmp_image = res;
              });
            }, 50);
          });

          var sound = LingoLinq.store.createRecord('sound', {});
          sound.save().then(function(res) {
            setTimeout(function() {
              persistence.find('sound', res.get('id')).then(function(res) {
                tmp_sound = res;
              });
            }, 50);
          });
        }, 50);
      });

      var server_board_updated, tmp_board_updated;
      waitsFor(function() { return server_board && tmp_image && tmp_sound && tmp_board; });
      runs(function() {
        // update the server-side board with links to all three temporary records
        // update the temporary board with links to all three temporary records
        emberRun(function() {
          var buttons = [
            {
              id: 1,
              image_id: tmp_image.id,
              sound_id: tmp_sound.id,
              load_board: {
                id: tmp_board.get('id'),
                key: tmp_board.get('key')
              }
            },
            {
              id: 2,
              load_board: {
                id: server_board.get('id'),
                key: server_board.get('key')
              }
            }
          ];
          var grid = {
            rows: 2,
            columns: 2,
            order: [[1, 2], [null, null]]
          };
          server_board.set('buttons', buttons);
          server_board.set('grid', grid);
          server_board.save().then(function(res) {
            setTimeout(function() {
              persistence.find('board', res.get('id')).then(function(res) {
                server_board = res;
                server_board_updated = true;
              });
            }, 50);
          });
          tmp_board.set('buttons', buttons);
          tmp_board.set('grid', grid);
          tmp_board.save().then(function(res) {
            setTimeout(function() {
              persistence.find('board', res.get('id')).then(function(res) {
                tmp_board = res;
                tmp_board_updated = true;
              });
            }, 50);
          });
        });
      });
      var synced = false;
      waitsFor(function() { return server_board_updated && tmp_board_updated; });
      runs(function() {
        var tmp_board_id = tmp_board.id;
        var tmp_image_id = tmp_image.id;
        var tmp_sound_id = tmp_sound.id;
        persistence.set('online', true);
        // stub find_changed to return the records with the server-side board first
        stub(persistence, 'find_changed', function() {
          return RSVP.resolve([
            {store: 'board', data: { raw: server_board }},
            {store: 'board', data: { raw: tmp_board }},
            {store: 'image', data: { raw: tmp_image }},
            {store: 'sound', data: { raw: tmp_sound }}
          ]);
        });
        emberRun.later(function() {
          // call sync
          persistence.known_missing = null;
          persistence.sync(1567).then(function() {
            setTimeout(function() {
              // re-lookup
              synced = true;
              persistence.find('board', server_board.id).then(function(res) {
                server_board = res;
                persistence.find('board', res.buttons[0].load_board.id).then(function(res) {
                  new_board = res;
                });
                persistence.find('image', res.buttons[0].image_id).then(function(res) {
                  new_image = res;
                });
                persistence.find('sound', res.buttons[0].sound_id).then(function(res) {
                  new_sound = res;
                });
              });
              persistence.find('board', tmp_board_id).then(null, function() {
                tmp_board = null;
              });
              persistence.find('image', tmp_image_id).then(null, function() {
                tmp_image = null;
              });
              persistence.find('sound', tmp_sound_id).then(null, function() {
                tmp_sound = null;
              });
            }, 50);
          }, function(err) {
            dbg();
          });
        }, 50);
      });
      // make sure the temporary image has a permanent id
      // make sure the temporary sound has a permanent id
      // make sure the temporary board has a permanent id
      waitsFor(function() { return synced && !tmp_image && !tmp_sound && !tmp_board && new_image && new_sound && new_board; });
      runs(function() {
        // make sure the temporary board points to the permanent sound and image and board ids
        expect(!!new_board.buttons[0].image_id.match(/^tmp_/)).toEqual(false);
        expect(!!new_board.buttons[0].sound_id.match(/^tmp_/)).toEqual(false);
        expect(!!new_board.buttons[0].load_board.id.match(/^tmp_/)).toEqual(false);
        expect(new_board.buttons[0].image_id).toEqual(new_image.id);
        expect(new_board.buttons[0].sound_id).toEqual(new_sound.id);
        expect(new_board.buttons[0].load_board.id).toEqual(new_board.id);
        // make sure the server-side board points to the permanent sound and image and board ids
        expect(!!server_board.buttons[0].image_id.match(/^tmp_/)).toEqual(false);
        expect(!!server_board.buttons[0].sound_id.match(/^tmp_/)).toEqual(false);
        expect(!!server_board.buttons[0].load_board.id.match(/^tmp_/)).toEqual(false);
        expect(server_board.buttons[0].image_id).toEqual(new_image.id);
        expect(server_board.buttons[0].sound_id).toEqual(new_sound.id);
        expect(server_board.buttons[0].load_board.id).toEqual(new_board.id);
      });
    });
  });

  it("should delete changed stuff", function() {
    db_wait(function() {
      var board_cleared = false;
      var image_cleared = false;
      var sound_cleared = false;
      capabilities.dbman.clear('board', function() {
        board_cleared = true;
      });
      capabilities.dbman.clear('image', function() {
        image_cleared = true;
      });
      capabilities.dbman.clear('sound', function() {
        sound_cleared = true;
      });
      waitsFor(function() { return board_cleared && image_cleared && sound_cleared; });
      runs();
    });
  });

  it("should try to sync supervisee-related boards if there are any", function() {
    db_wait(function() {
      var stores = [];
      var warnings = [];
      stub(modal, 'warning', function(message) {
        warnings.push(message);
      });
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}},
          supervisees: [
            {id: '1', user_name: 'fiona'},
            {id: '2', user_name: 'alastar'}
          ]
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1',
          user_name: 'fiona',
          avatar_url: 'http://example.com/pic2.png',
          permissions: {supervise: true},
          preferences: {home_board: {id: '177'}},
          supervisees: [
            {id: '3', user_name: 'dwight'}
          ]
        }}),
        id: "1"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '2',
          user_name: 'alastar',
          avatar_url: 'http://example.com/pic3.png',
          permissions: {supervise: true},
          preferences: {home_board: {id: '179'}},
        }}),
        id: "2"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '3',
          user_name: 'dwight',
          avatar_url: 'http://example.com/pic4.png',
          permissions: {supervise: true},
          preferences: {home_board: {id: '179'}},
        }}),
        id: "3"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: 'i1', sound_id: 's1', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: 'i1', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: 's1', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board2.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: 'i2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: 'i2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board3.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: 'i3', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: 'i3', url: 'http://example.com/image3.png'}
          ]
        }),
        id: '178'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '177',
          image_url: 'http://example.com/board4.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: 'i4'}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: 'i4', url: 'http://example.com/image4.png'}
          ]
        }),
        id: '177'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '179',
          image_url: 'http://example.com/board5.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: 'i5'}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: 'i5', url: 'http://example.com/image5.png'}
          ]
        }),
        id: '179'
      });
      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(warnings).toEqual([]);
        expect(stores.indexOf('http://example.com/pic.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/pic2.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/pic3.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/pic4.png')).toEqual(-1);
        expect(stores.indexOf('http://example.com/board.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/board2.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/board3.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/board4.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/board5.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image2.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image3.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image4.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image5.png')).toNotEqual(-1);
      });
    });
  });

  it("should warn but not fail if a supervisee's data is irretrievable", function() {
    db_wait(function() {
      var stores = [];
      var warnings = [];
      stub(modal, 'warning', function(message) {
        warnings.push(message);
      });
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}},
          supervisees: [
            {id: '1', user_name: 'fiona'},
            {id: '2', user_name: 'alastar'}
          ]
        }}),
        id: "1340"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1',
          user_name: 'fiona',
          avatar_url: 'http://example.com/pic2.png',
          preferences: {home_board: {id: '177'}},
          supervisees: [
            {id: '3', user_name: 'dwight'}
          ]
        }}),
        id: "1"
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '145',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image.png'}
          ],
          sound: [
            {id: '3', url: 'http://example.com/sound.mp3'}
          ]
        }),
        id: '145'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '167',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '167'
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '178',
          image_url: 'http://example.com/board.png',
          permissions: {},
          buttons: [
            {id: '1', image_id: '2', load_board: {id: '178'}}
          ],
          grid: {
            rows: 1,
            columns: 1,
            order: [['1']]
          }
        },
          image: [
            {id: '2', url: 'http://example.com/image2.png'}
          ]
        }),
        id: '178'
      });
      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(warnings.indexOf("Couldn't sync boards for supervisee \"fiona\"")).toNotEqual(-1);
        expect(warnings.indexOf("Couldn't sync boards for supervisee \"alastar\"")).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/pic.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/pic2.png')).toEqual(-1);
        expect(stores.indexOf('http://example.com/pic3.png')).toEqual(-1);
        expect(stores.indexOf('http://example.com/pic4.png')).toEqual(-1);
        expect(stores.indexOf('http://example.com/board.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/board2.png')).toEqual(-1);
        expect(stores.indexOf('http://example.com/board3.png')).toEqual(-1);
        expect(stores.indexOf('http://example.com/image.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image2.png')).toNotEqual(-1);
        expect(stores.indexOf('http://example.com/image3.png')).toEqual(-1);
      });
    });
  });

  it("should sync sidebar boards if defined", function() {
    db_wait(function() {
      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: RSVP.resolve({user: {
          id: '1340',
          user_name: 'fred',
          avatar_url: 'http://example.com/pic.png',
          preferences: {home_board: {id: '145'}, sidebar_boards: [{key: 'maxine/sword'}, {}, {key: 'fred/bacon'}]}
        }}),
        id: "1340"
      });
      var found1 = false;
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: new RSVP.Promise(function(resolve) {
          found1 = true;
          return {board: {}};
        }),
        id: "maxine/sword"
      });
      var found2 = false;
      queryLog.defineFixture({
        method: 'GET',
        type: 'user',
        response: new RSVP.Promise(function(resolve) {
          found2 = true;
          return {board: {}};
        }),
        id: "fred/bacon"
      });
      var done = false;
      persistence.sync(1340).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(found1).toEqual(true);
        expect(found2).toEqual(true);
      });
    });
  });

  it("should query for fresh board_revisions", function() {
    db_wait(function() {
      var revisions_called = false;
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/1340/board_revisions') {
          revisions_called = true;
          return RSVP.resolve({
          });
        }
        return RSVP.reject();
      });

      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        full_set_revision: 'not_current',
        permissions: {},
        buttons: [
          {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        full_set_revision: 'not_current',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '178'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '178',
        full_set_revision: 'current',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '167'}},
          {id: '3', image_id: '2', load_board: {id: '179'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b4 = {
        id: '179',
        full_set_revision: 'whatever',
        permissions: {},
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;
      revisions[b4.id] = b4.full_set_revision;

      persistence.url_uncache = {
        'http://www.example.com/pic.png': true
      };
      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b2, b2.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('board', b4, b4.id));
      store_promises.push(persistence.store('image', {id: '2', url: 'http://www.example.com/pic.png'}, '2'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));


      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          stored = true;
        }, 100);
      }, function() {
        dbg();
      });

      var done = false;
      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;

        b1.full_set_revision = 'current';
        b2.full_set_revision = 'current';
        b3.full_set_revision = 'current';
        b4.full_set_revision = 'current';
        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/178') {
            return RSVP.resolve({
              board: b3
            });
          }
          return RSVP.reject({});
        });

        persistence.sync(1340).then(function() {
          done = true;
        });
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(revisions_called).toEqual(true);
      });
    });
  });

  it("should not try to download boards that match the fresh revision from board_revisions", function() {
    db_wait(function() {
      var revisions_called = false;
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/1340/board_revisions') {
          revisions_called = true;
          return RSVP.resolve({
            '145': 'current',
            '167': 'current',
            '178': 'current',
            '179': 'current'
          });
        }
        return RSVP.reject({});
      });

      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        full_set_revision: 'not_current',
        permissions: {},
        current_revision: 'current',
        buttons: [
          {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        full_set_revision: 'not_current',
        permissions: {},
        current_revision: 'current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '178'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '178',
        full_set_revision: 'current',
        permissions: {},
        current_revision: 'not_current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '167'}},
          {id: '3', image_id: '2', load_board: {id: '179'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b4 = {
        id: '179',
        full_set_revision: 'whatever',
        permissions: {},
        current_revision: 'current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;
      revisions[b4.id] = b4.full_set_revision;

      persistence.url_uncache = {
        'http://www.example.com/pic.png': true
      };
      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b2, b2.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('board', b4, b4.id));
      store_promises.push(persistence.store('image', {id: '2', url: 'http://www.example.com/pic.png'}, '2'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));


      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          stored = true;
        }, 100);
      }, function() {
        dbg();
      });

      var done = false;
      var reloads = {};
      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;

        b1.full_set_revision = 'current';
        b2.full_set_revision = 'current';
        b3.full_set_revision = 'current';
        b4.full_set_revision = 'current';
        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            reloads['145'] = true;
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            reloads['167'] = true;
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/178') {
            reloads['178'] = true;
            return RSVP.resolve({
              board: b3
            });
          } else if(options.url == '/api/v1/boards/179') {
            reloads['179'] = true;
            return RSVP.resolve({
              board: b4
            });
          }
          return RSVP.reject({});
        });

        persistence.sync(1340).then(function() {
          done = true;
        });
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(revisions_called).toEqual(true);
        expect(reloads).toEqual({
          '178': true
        });
      });
    });
  });

  it("should try to download boards that don't match the fresh revision from board_revisions, even if they otherwise seem ok", function() {
    db_wait(function() {
      var revisions_called = false;
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/1340/board_revisions') {
          revisions_called = true;
          return RSVP.resolve({
            '145': 'current',
            '167': 'current',
            '178': 'current',
            '179': 'current'
          });
        }
        return RSVP.reject({});
      });

      var stores = [];
      stub(persistence, 'store_url', function(url, type) {
        stores.push(url);
        console.log(url);
        return RSVP.resolve({url: url});
      });
      var b1 = {
        id: '145',
        image_url: 'http://example.com/board.png',
        full_set_revision: 'not_current',
        current_revision: 'not_current',
        buttons: [
          {id: '1', image_id: '2', sound_id: '3', load_board: {id: '167'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b2 = {
        id: '167',
        full_set_revision: 'not_current',
        current_revision: 'not_current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '178'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b3 = {
        id: '178',
        full_set_revision: 'current',
        current_revision: 'not_current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2', load_board: {id: '145'}},
          {id: '2', image_id: '2', load_board: {id: '167'}},
          {id: '3', image_id: '2', load_board: {id: '179'}}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };
      var b4 = {
        id: '179',
        full_set_revision: 'whatever',
        current_revision: 'not_current',
        image_url: 'http://example.com/board.png',
        buttons: [
          {id: '1', image_id: '2'}
        ],
        grid: {
          rows: 1,
          columns: 1,
          order: [['1']]
        }
      };

      var revisions = {};
      revisions[b1.id] = b1.full_set_revision;
      revisions[b2.id] = b2.full_set_revision;
      revisions[b3.id] = b3.full_set_revision;
      revisions[b4.id] = b4.full_set_revision;

      persistence.url_uncache = {
        'http://www.example.com/pic.png': true
      };
      var store_promises = [];
      store_promises.push(persistence.store('board', b1, b1.id));
      store_promises.push(persistence.store('board', b2, b2.id));
      store_promises.push(persistence.store('board', b3, b3.id));
      store_promises.push(persistence.store('board', b4, b4.id));
      store_promises.push(persistence.store('image', {id: '2', url: 'http://www.example.com/pic.png'}, '2'));
      store_promises.push(persistence.store('dataCache', {url: 'http://www.example.com/pic.png', content_type: 'image/png', data_uri: 'data:image/png;base64,a0a'}, 'http://www.example.com/pic.png'));
      store_promises.push(persistence.store('settings', revisions, 'synced_full_set_revisions'));


      var stored = false;
      RSVP.all_wait(store_promises).then(function() {
        emberRun.later(function() {
          stored = true;
        }, 100);
      }, function() {
        dbg();
      });

      var done = false;
      var reloads = {};
      waitsFor(function() { return stored; });
      runs(function() {
        LingoLinq.all_wait = true;
        queryLog.real_lookup = true;

        b1.full_set_revision = 'current';
        b2.full_set_revision = 'current';
        b3.full_set_revision = 'current';
        b4.full_set_revision = 'current';
        stub(persistence, 'find_changed', function() { return RSVP.resolve([]); });
        stub($, 'realAjax', function(options) {
          if(options.url === '/api/v1/users/1340') {
            return RSVP.resolve({user: {
              id: '1340',
              user_name: 'fred',
              avatar_url: 'http://example.com/pic.png',
              preferences: {home_board: {id: '145'}}
            }});
          } else if(options.url == '/api/v1/boards/145') {
            reloads['145'] = true;
            return RSVP.resolve({
              board: b1
            });
          } else if(options.url == '/api/v1/boards/167') {
            reloads['167'] = true;
            return RSVP.resolve({
              board: b2
            });
          } else if(options.url == '/api/v1/boards/178') {
            reloads['178'] = true;
            return RSVP.resolve({
              board: b3
            });
          } else if(options.url == '/api/v1/boards/179') {
            reloads['179'] = true;
            return RSVP.resolve({
              board: b4
            });
          }
          return RSVP.reject({});
        });

        persistence.sync(1340).then(function() {
          done = true;
        });
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(revisions_called).toEqual(true);
        expect(reloads).toEqual({
          '145': true,
          '167': true,
          '178': true,
          '179': true
        });
      });
    });
  });

  describe("board_lookup", function() {
    it("should set lookups", function() {
      var done = false;
      persistence.set('sync_progress', {});
      persistence.board_lookup('asdf', {}).then(null, function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['asdf']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([]);
      });
    });

    it("should look up the same board only once", function() {
      persistence.set('sync_progress', {});
      var lookups = 0;
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          lookups++;
          var obj = EmberObject.create({
            fresh: true,
            permissions: {},
          });
          obj.reload = function() { return RSVP.resolve(obj); };
          return RSVP.resolve(obj);
        }
      });
      var dones = 0;
      var done_check = function() {
        dones++;
      };
      for(var idx = 0; idx < 3; idx++) {
        persistence.board_lookup('1_00', {}).then(done_check);
      }
      waitsFor(function() { return dones == 3; });
      runs(function() {
        expect(lookups).toEqual(1);
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 'downloaded'
        }]);
      });
    });

    it("should reload if peeked", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: true
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'peekRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          return rec;
        }
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 're-downloaded'
        }]);
        expect(rec.reloaded).toEqual(true);
      });
    });

    it("should reload if a key passed as id", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: true,
        key: 'as/df'
      });
      rec.set('id', '1_00');
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == 'as/df') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;

      persistence.board_lookup('as/df', {}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['as/df']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: 'as/df', key: 'as/df', status: 're-downloaded'
        }]);
        expect(rec.reloaded).toEqual(true);
      });
    });

    it("should reload if not fresh", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: false
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 're-downloaded'
        }]);
        expect(rec.reloaded).toEqual(true);
      });
    });

    it("should not reload if fresh, numerical id and not peeked", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: true,
        current_revision: 'asdf'
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {}, {'1_00': 'asdf'}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 'downloaded'
        }]);
        expect(rec.reloaded).toEqual(undefined);
      });
    });

    it("should not reload if safely_cached without cache mismatch", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: false
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          rec.set('image_urls', ['http://www.example.com/pic.png']);
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {'1_00': true}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 'cached'
        }]);
        expect(rec.reloaded).toEqual(undefined);
      });
    });

    it("should reload if safely_cached with cache mismatch", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: false
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {'1_00': true}, {'1_00': 'asdf'}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 're-downloaded'
        }]);
        expect(rec.reloaded).toEqual(true);
      });
    });

    it("should not reload if not safely_cached but has a cache match", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: false,
        current_revision: 'asdf'
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {}, {'1_00': 'asdf'}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 'cached'
        }]);
        expect(rec.reloaded).toEqual(undefined);
      });
    });

    it("should store board status on result", function() {
      persistence.set('sync_progress', {});
      var rec = EmberObject.create({
        fresh: false,
        current_revision: 'asdf'
      });
      stub(rec, 'reload', function() {
        rec.reloaded = true;
        return RSVP.resolve(rec);
      });
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'board' && id == '1_00') {
          rec.set('permissions', {});
          return RSVP.resolve(rec);
        }
      });
      var done = false;
      persistence.board_lookup('1_00', {}, {'1_00': 'asdf'}).then(function() {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(persistence.get('sync_progress.key_lookups')['1_00']).toNotEqual(undefined);
        expect(persistence.get('sync_progress.board_statuses')).toEqual([{
          id: '1_00', key: undefined, status: 'cached'
        }]);
        expect(rec.reloaded).toEqual(undefined);
      });
    });
  });
});
