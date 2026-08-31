import {
  describe,
  it,
  xit,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub,
  restoreStubs
} from 'frontend/tests/helpers/jasmine';
import { db_wait, fakeAudio } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import scanner from '../../utils/scanner';
import app_state from '../../utils/app_state';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import frame_listener from '../../utils/frame_listener';
import modal from '../../utils/modal';
import buttonTracker from '../../utils/raw_events';
import capabilities from '../../utils/capabilities';
import EmberObject from '@ember/object';
import { run as emberRun, later as runLater, cancel as runCancel } from '@ember/runloop';

function childLabels(children) {
  return (children || []).map(function(child) { return child.label; });
}

function scanDom(id, hasClassFn) {
  var el = document.createElement('div');
  el.id = id;
  return {
    0: el,
    id: id,
    hasClass: hasClassFn || function() { return false; }
  };
}

function domStub(length, extra) {
  var stub = {
    length: length || 0,
    each: function() { },
    add: function() { return stub; },
    attr: function() { return ''; },
    text: function() { return ''; },
    hasClass: function() { return false; },
    find: function() { return domStub(0); }
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) { stub[key] = extra[key]; });
  }
  return stub;
}

function speakElemStub(findEachCallback) {
  return domStub(1, {
    find: function() {
      return domStub(0, { each: findEachCallback || function() { } });
    }
  });
}

function scannerFindElemStub(overrides) {
  overrides = overrides || {};
  return function(str) {
    if (Object.prototype.hasOwnProperty.call(overrides, str)) {
      return overrides[str];
    }
    if (str === '#speak' || str === 'header #speak') {
      return speakElemStub(overrides._speakEach);
    }
    if (str === 'header') { return domStub(0); }
    if (str === '#identity a.btn') { return domStub(0); }
    if (str === '#identity .dropdown-menu a' || str === '#identity .dropdown-menu a:visible') {
      return domStub(0);
    }
    if (str === '#word_suggestions') { return domStub(0); }
    if (!str) {
      return domStub(0, {
        elements: [],
        add: function(elem) { this.elements.push(elem); return this; }
      });
    }
    return domStub(0);
  };
}

function ensureScannerAppState() {
  var user = EmberObject.create({
    preferences: {
      device: { scanning: true }
    }
  });
  scanner.set('appState', EmberObject.create({
    currentUser: user,
    speak_mode: true
  }));
}

function stubScannerModalClosed() {
  stub(modal, 'is_open', function(str) {
    if (str === 'highlight' || str === 'highlight-secondary') {
      return false;
    }
    return false;
  });
  stub(modal, 'scannable_targets', function() { return []; });
  modal.highlight_settings = null;
  modal.highlight2_settings = null;
  modal.highlight_controller = null;
  modal.highlight2_controller = null;
}

describe('scanner', function() {

  beforeEach(function() {
    ensureScannerAppState();
  });

  afterEach(function() {
    /* restoreStubs FIRST. Five tests in this file stub `scanner.stop`, and the hook calls
       scanner.stop() below — so with restore last, those tests silently skipped the real
       teardown entirely (runCancel(scanner.interval), modal.close_highlight(), the
       .highlight/.scanning_highlight DOM sweep, scan_axes('clear')). That is the async-leak
       shape CLAUDE.md rule 10 documents. Restoring first also stops the old trailing
       restoreStubs() from writing back over the resets below it. Note restoreStubs is GLOBAL
       (one module-level stash), so do not copy this ordering into a file whose afterEach does
       more work before its own cleanup. */
    restoreStubs();
    scanner.stop();
    scanner.last_options = null;
    scanner.current_element = null;
    scanner.elements = null;
    scanner.options = null;
    scanner.scanning = false;
    modal.highlight_settings = null;
    modal.highlight2_settings = null;
    modal.highlight_controller = null;
    modal.highlight2_controller = null;
  });

  describe("setup", function() {
    it("should set the controller", function() {
      db_wait(function() {
        expect(scanner.controller).toEqual(undefined);
        var con = EmberObject.create({ appState: app_state });
        scanner.setup(con);
        expect(scanner.controller).toEqual(con);
      });
    });
  });

  describe('scan_content', function() {
    it("should return the frame's active targets if enabled", function() {
      stub(frame_listener, 'visible', function() { return true; });
      stub(scanner, 'find_elem', function(search) {
        if(search == 'a') {
          return {a: true};
        } else if(search == 'b') {
          return {b: true};
        } else if(search == 'c') {
          return {c: true};
        } else if(search == 'd') {
          return {d: true};
        } else {
          console.error('unexpected search', search);
        }
      });
      stub(frame_listener, 'active_targets', function() { return [
        {dom: 'a', target: {prompt: 'a'}},
        {dom: 'b', target: {prompt: 'b'}},
        {dom: 'c', target: {prompt: 'c'}},
        {dom: 'd', target: {prompt: 'd'}}
      ]; });
      expect(scanner.scan_content()).toEqual({
        rows: 1,
        columns: 4,
        order: [[
          {a: true, label: 'a'},
          {b: true, label: 'b'},
          {c: true, label: 'c'},
          {d: true, label: 'd'}
        ]]
      });
    });

    it("should return the DOM button list if frame not enabled", function() {
      stub(frame_listener, 'visible', function() { return false; });
      stub(editManager, 'controller', EmberObject.create({
        model: EmberObject.create({
          grid: {
            rows: 3,
            columns: 3,
            order: [[1, 2, 3], [4, 5, 6], [7, null, null]]
          }
        })
      }));
      stub(editManager, 'find_button', function(id) {
        if(id == 1) {
          return EmberObject.create({label: '1'});
        } else if(id == 2) {
          return EmberObject.create({vocalization: '2'});
        } else if(id == 3) {
          return EmberObject.create({label: '3', sound: 'sound'});
        } else {
          return null;
        }
      });
      stub(scanner, 'find_elem', function(search) {
        var idMatch = search && search.match(/data-id='([^']+)'/);
        if (idMatch && idMatch[1] !== 'null') {
          var elem = { length: 1, label: '', sound: null };
          elem[idMatch[1]] = true;
          return elem;
        }
        return { length: 0, label: '', sound: null };
      });
      var res = scanner.scan_content();
      expect(res).toEqual({
        rows: 3, columns: 3, order: [
          [
            {1: true, label: '1', length: 1, sound: null},
            {2: true, label: '2', length: 1, sound: null},
            {3: true, label: '3', length: 1, sound: 'sound'}
          ],
          [
            {4: true, label: '', length: 1, sound: null},
            {5: true, label: '', length: 1, sound: null},
            {6: true, label: '', length: 1, sound: null}
          ],
          [
            {7: true, label: '', length: 1, sound: null},
            {label: '', length: 0, sound: null},
            {label: '', length: 0, sound: null}
          ],
        ]
      });
    });
  });

  describe("start", function() {
    var scan_called = false;
    var rows = null;
    var options = null;
    beforeEach(function() {
      scanner.stop();
      scanner.scanning = false;
      stub(scanner, 'scan_elements', function(r, opts) {
        scan_called = true;
        rows = r;
        options = opts;
        scanner.scanning = true;
      });
    });

    afterEach(function() {
      options = null;
      scan_called = false;
    });

    it('should do nothing if not in speak mode', function() {
      stub(scanner, 'find_elem', scannerFindElemStub({
        '#speak': { length: 0 }
      }));
      var stopped = false;
      stub(scanner, 'stop', function() { stopped = true; });
      scanner.start({});
      expect(stopped).toEqual(true);
    });

    it('should do nothing if a different modal is open', function() {
      var header_search = false;
      stub(scanner, 'find_elem', function(str) {
        if(str == '#speak' || str == 'header #speak') { return {length: 1}; }
        if(str == 'header') { header_search = true; }
      });
      stub(modal, 'is_open', function(str) {
        if (str === 'highlight' || str === 'highlight-secondary') { return false; }
        return true;
      });
      scanner.start({});
      expect(header_search).toEqual(false);
    });

    var simple_header = function() {
      stub(scanner, 'find_elem', scannerFindElemStub());
      stubScannerModalClosed();
      expect(!!scanner.scanning).toEqual(false);
    };

    it('should call scan_elements on success', function() {
      simple_header();
      stub(scanner, 'scan_content', function() {
        return {
          rows: 0,
          columns: 0,
          order: [[]]
        };
      });
      scanner.start({});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(1);
      expect(rows[0].label).toEqual('Menu');
      expect(rows[0].children).toEqual([]);
      expect(options).toEqual({scan_mode: 'row', interval: 1000, all_elements: [], auto_start: false});
    });

    it('should support scanning the header row', function() {
      stub(scanner, 'find_elem', function(str) {
        if(str == '#speak' || str == 'header #speak') {
          return {
            length: 1,
            hasClass: function() { return false; },
            find: function() {
              return {each: function(callback) {
                for(var idx = 0; idx < 5; idx++) {
                  callback.call({header_index: idx});
                }
              }};
            }
          };
        }
        if(str == 'header') { return {length: 0}; }
        if(str == '#identity a.btn') { return {length: 0}; }
        if(str == '#identity .dropdown-menu a' || str == '#identity .dropdown-menu a:visible') {
          return {
            each: function(callback) {
              for(var idx = 0; idx < 3; idx++) {
                callback.call({menu_index: idx});
              }
            }
          };
        }
        if(str == '#word_suggestions') { return {length: 0}; }
        if(str && str.header_index !== undefined) {
          var ids = ['home_button', 'back_button', 'button_list', 'speak_options', 'clear_button'];
          return {attr: function() { return ids[str.header_index]; }};
        }
        if(str && str.menu_index !== undefined) {
          var labels = ['cat', 'stat', 'splat'];
          return {text: function() { return labels[str.menu_index]; }};
        }
      });
      stub(scanner, 'scan_content', function() {
        return {
          rows: 0,
          columns: 0,
          order: [[]]
        };
      });
      stubScannerModalClosed();
      expect(!!scanner.scanning).toEqual(false);
      scanner.start({});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(6);
      expect(rows[0].label).toEqual('Home');
      expect(rows[0].children).toEqual(undefined);
      expect(rows[1].label).toEqual('Back');
      expect(rows[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('Speak');
      expect(rows[2].children).toEqual(undefined);
      expect(rows[3].label).toEqual('Speak Options');
      expect(rows[3].children).toEqual(undefined);
      expect(rows[4].label).toEqual('Clear');
      expect(rows[4].children).toEqual(undefined);
      expect(rows[5].label).toEqual('Menu');
      expect(rows[5].children).toNotEqual(undefined);
      expect(rows[5].children.length).toEqual(3);
      expect(rows[5].children[0].label).toEqual('cat');
      expect(rows[5].children[0].children).toEqual(undefined);
      expect(rows[5].children[1].label).toEqual('stat');
      expect(rows[5].children[1].children).toEqual(undefined);
      expect(rows[5].children[2].label).toEqual('splat');
      expect(rows[5].children[2].children).toEqual(undefined);
      expect(options).toEqual({scan_mode: 'row', interval: 1000, all_elements: [], auto_start: false});
    });

    it('should support scanning the word suggestion row if it exists', function() {
      stub(scanner, 'find_elem', function(str) {
        if(str == '#speak' || str == 'header #speak') {
          return {
            length: 1,
            hasClass: function() { return false; },
            find: function() {
              return {each: function(callback) {
                for(var idx = 0; idx < 5; idx++) {
                  callback.call({header_index: idx});
                }
              }};
            }
          };
        }
        if(str == 'header') {  return {length: 0}; }
        if(str == '#identity a.btn') { return {length: 0}; }
        if(str == '#identity .dropdown-menu a' || str == '#identity .dropdown-menu a:visible') {
          return {
            each: function(callback) {
              for(var idx = 0; idx < 3; idx++) {
                callback.call({menu_index: idx});
              }
            }
          };
        }
        if(str == '#word_suggestions') {
          return {
            length: 1,
            find: function() {
              return {
                each: function(callback) {
                  for(var idx = 0; idx < 6; idx++) {
                    callback.call({suggestion_index: idx});
                  }
                }
              };
            }
          };
        }
        if(str && str.header_index !== undefined) {
          var ids = ['home_button', 'back_button', 'button_list', 'speak_options', 'clear_button'];
          return {attr: function() { return ids[str.header_index]; }};
        }
        if(str && str.menu_index !== undefined) {
          var labels = ['cat', 'stat', 'splat'];
          return {text: function() { return labels[str.menu_index]; }};
        }
        if(str && str.suggestion_index !== undefined) {
          var labels = ['cream', 'crunch', 'crust', 'crabapple', 'crustacean', 'crux'];
          return {text: function() { return labels[str.suggestion_index]; }};
        }
      });
      stub(scanner, 'scan_content', function() {
        return {
          rows: 0,
          columns: 0,
          order: [[]]
        };
      });
      stubScannerModalClosed();
      expect(!!scanner.scanning).toEqual(false);
      scanner.start({});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(2);
      expect(rows[0].label).toEqual('Header');
      expect(rows[0].children).toNotEqual(undefined);
      expect(rows[0].children.length).toEqual(6);
      expect(rows[0].children[0].label).toEqual('Home');
      expect(rows[0].children[0].children).toEqual(undefined);
      expect(rows[0].children[1].label).toEqual('Back');
      expect(rows[0].children[1].children).toEqual(undefined);
      expect(rows[0].children[2].label).toEqual('Speak');
      expect(rows[0].children[2].children).toEqual(undefined);
      expect(rows[0].children[3].label).toEqual('Speak Options');
      expect(rows[0].children[3].children).toEqual(undefined);
      expect(rows[0].children[4].label).toEqual('Clear');
      expect(rows[0].children[4].children).toEqual(undefined);
      expect(rows[0].children[5].label).toEqual('Menu');
      expect(rows[0].children[5].children).toNotEqual(undefined);
      expect(rows[0].children[5].children.length).toEqual(3);
      expect(rows[0].children[5].children[0].label).toEqual('cat');
      expect(rows[0].children[5].children[0].children).toEqual(undefined);
      expect(rows[0].children[5].children[1].label).toEqual('stat');
      expect(rows[0].children[5].children[1].children).toEqual(undefined);
      expect(rows[0].children[5].children[2].label).toEqual('splat');
      expect(rows[0].children[5].children[2].children).toEqual(undefined);
      expect(rows[1].label).toEqual('Suggestions');
      expect(rows[1].children).toNotEqual(undefined);
      expect(rows[1].children.length).toEqual(6);
      expect(rows[1].children[0].label).toEqual('cream');
      expect(rows[1].children[0].children).toEqual(undefined);
      expect(rows[1].children[1].label).toEqual('crunch');
      expect(rows[1].children[1].children).toEqual(undefined);
      expect(rows[1].children[2].label).toEqual('crust');
      expect(rows[1].children[2].children).toEqual(undefined);
      expect(rows[1].children[3].label).toEqual('crabapple');
      expect(rows[1].children[3].children).toEqual(undefined);
      expect(rows[1].children[4].label).toEqual('crustacean');
      expect(rows[1].children[4].children).toEqual(undefined);
      expect(rows[1].children[5].label).toEqual('crux');
      expect(rows[1].children[5].children).toEqual(undefined);
    });

    it('should support row-based scanning', function() {
      simple_header();
      stub(scanner, 'scan_content', function() {
        return {
          rows: 3,
          columns: 3,
          order: [
            [
              {length: 1, label: 'a'},
              {length: 1, label: 'b', sound: 'sound'},
              {length: 0}
            ],
            [
              {length: 0},
              {length: 1, label: 'c'},
              {length: 0}
            ],
            [
              {length: 1, label: 'd'},
              {length: 0},
              {length: 1, label: 'e'}
            ]
          ]
        };
      });
      scanner.start({scan_mode: 'row'});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(4);
      expect(rows[1].label).toEqual('Row 1');
      expect(rows[1].children).toNotEqual(undefined);
      expect(rows[1].children.length).toEqual(2);
      expect(rows[1].children[0].label).toEqual('a');
      expect(rows[1].children[0].sound).toEqual(undefined);
      expect(rows[1].children[0].children).toEqual(undefined);
      expect(rows[1].children[1].label).toEqual('b');
      expect(rows[1].children[1].sound).toEqual('sound');
      expect(rows[1].children[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('c');
      expect(rows[2].children).toEqual(undefined);
      expect(rows[3].label).toEqual('Row 3');
      expect(rows[3].children).toNotEqual(undefined);
      expect(rows[3].children.length).toEqual(2);
      expect(rows[3].children[0].label).toEqual('d');
      expect(rows[3].children[0].sound).toEqual(undefined);
      expect(rows[3].children[0].children).toEqual(undefined);
      expect(rows[3].children[1].label).toEqual('e');
      expect(rows[3].children[1].sound).toEqual(undefined);
      expect(rows[3].children[1].children).toEqual(undefined);
      expect(options).toEqual({interval: 1000, scan_mode: 'row', all_elements: [], auto_start: false});
    });

    it('should support column-based scanning', function() {
      simple_header();
      stub(scanner, 'scan_content', function() {
        return {
          rows: 3,
          columns: 3,
          order: [
            [
              {length: 1, label: 'a'},
              {length: 1, label: 'b', sound: 'sound'},
              {length: 0}
            ],
            [
              {length: 0},
              {length: 1, label: 'c'},
              {length: 0}
            ],
            [
              {length: 1, label: 'd'},
              {length: 0},
              {length: 1, label: 'e'}
            ]
          ]
        };
      });
      scanner.start({scan_mode: 'column'});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(4);
      expect(rows[1].label).toEqual('Column 1');
      expect(rows[1].children).toNotEqual(undefined);
      expect(rows[1].children.length).toEqual(2);
      expect(rows[1].children[0].label).toEqual('a');
      expect(rows[1].children[0].sound).toEqual(undefined);
      expect(rows[1].children[0].children).toEqual(undefined);
      expect(rows[1].children[1].label).toEqual('d');
      expect(rows[1].children[1].sound).toEqual(undefined);
      expect(rows[1].children[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('Column 2');
      expect(rows[2].children).toNotEqual(undefined);
      expect(rows[2].children.length).toEqual(2);
      expect(rows[2].children[0].label).toEqual('b');
      expect(rows[2].children[0].sound).toEqual('sound');
      expect(rows[2].children[0].children).toEqual(undefined);
      expect(rows[2].children[1].label).toEqual('c');
      expect(rows[2].children[1].sound).toEqual(undefined);
      expect(rows[2].children[1].children).toEqual(undefined);
      expect(rows[3].label).toEqual('e');
      expect(rows[3].children).toEqual(undefined);
      expect(options).toEqual({interval: 1000, scan_mode: 'column', all_elements: [], auto_start: false});
    });

    it('should support region-based scanning', function() {
      simple_header();
      stub(scanner, 'scan_content', function() {
        return {
          rows: 3,
          columns: 3,
          order: [
            [
              {length: 1, label: 'a'},
              {length: 1, label: 'b', sound: 'sound'},
              {length: 1, label: 'w'}
            ],
            [
              {length: 0},
              {length: 1, label: 'c'},
              {length: 0}
            ],
            [
              {length: 1, label: 'd'},
              {length: 0},
              {length: 1, label: 'e'}
            ]
          ]
        };
      });
      scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 2, all_elements: [], auto_start: false});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(5);
      expect(rows[1].label).toEqual('a');
      expect(rows[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('d');
      expect(rows[2].children).toEqual(undefined);
      expect(rows[3].label).toEqual('Region 3');
      expect(rows[3].children).toNotEqual(undefined);
      expect(rows[3].children.length).toEqual(2);
      expect(rows[3].children[0].label).toEqual('b');
      expect(rows[3].children[0].children).toEqual(undefined);
      expect(rows[3].children[1].label).toEqual('w');
      expect(rows[3].children[1].children).toEqual(undefined);
      expect(rows[4].label).toEqual('Region 4');
      expect(rows[4].children).toNotEqual(undefined);
      expect(rows[4].children.length).toEqual(2);
      expect(rows[4].children[0].label).toEqual('c');
      expect(rows[4].children[0].children).toEqual(undefined);
      expect(rows[4].children[1].label).toEqual('e');
      expect(rows[4].children[1].children).toEqual(undefined);
      expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 2, vertical_chunks: 2, all_elements: [], auto_start: false});
    });

    it('should skip empty regions', function() {
      simple_header();
      stub(scanner, 'scan_content', function() {
        return {
          rows: 3,
          columns: 3,
          order: [
            [
              {length: 0},
              {length: 1, label: 'b', sound: 'sound'},
              {length: 1, label: 'w'}
            ],
            [
              {length: 0},
              {length: 1, label: 'c'},
              {length: 0}
            ],
            [
              {length: 1, label: 'd'},
              {length: 0},
              {length: 1, label: 'e'}
            ]
          ]
        };
      });
      scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 2});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(4);
      expect(rows[1].label).toEqual('d');
      expect(rows[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('Region 3');
      expect(rows[2].children).toNotEqual(undefined);
      expect(rows[2].children.length).toEqual(2);
      expect(rows[2].children[0].label).toEqual('b');
      expect(rows[2].children[0].children).toEqual(undefined);
      expect(rows[2].children[1].label).toEqual('w');
      expect(rows[2].children[1].children).toEqual(undefined);
      expect(rows[3].label).toEqual('Region 4');
      expect(rows[3].children).toNotEqual(undefined);
      expect(rows[3].children.length).toEqual(2);
      expect(rows[3].children[0].label).toEqual('c');
      expect(rows[3].children[0].children).toEqual(undefined);
      expect(rows[3].children[1].label).toEqual('e');
      expect(rows[3].children[1].children).toEqual(undefined);
      expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 2, vertical_chunks: 2, all_elements: [], auto_start: false});
    });

    describe('non-matching grid sizes for row-based scanning', function() {
      var four_by_four = function() {
        simple_header();
        stub(scanner, 'scan_content', function() {
          return {
            rows: 4,
            columns: 4,
            order: [
              [
                {length: 1, label: 'a'},
                {length: 1, label: 'b'},
                {length: 1, label: 'c'},
                {length: 1, label: 'd'}
              ],
              [
                {length: 1, label: 'e'},
                {length: 1, label: 'f'},
                {length: 1, label: 'g'},
                {length: 1, label: 'h'}
              ],
              [
                {length: 1, label: 'i'},
                {length: 1, label: 'j'},
                {length: 1, label: 'k'},
                {length: 1, label: 'l'}
              ],
              [
                {length: 1, label: 'm'},
                {length: 1, label: 'n'},
                {length: 1, label: 'o'},
                {length: 1, label: 'p'}
              ]
            ]
          };
        });
      };

      it('should support 4x4 grid with 2 horizontal chunks and 2 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 2});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(5);
        expect( rows[1].label).toEqual('Region 1');
        expect(childLabels(rows[1].children)).toEqual(['a', 'e', 'b', 'f']);
        expect( rows[2].label).toEqual('Region 2');
        expect(childLabels(rows[2].children)).toEqual(['i', 'm', 'j', 'n']);
        expect( rows[3].label).toEqual('Region 3');
        expect(childLabels(rows[3].children)).toEqual(['c', 'g', 'd', 'h']);
        expect( rows[4].label).toEqual('Region 4');
        expect(childLabels(rows[4].children)).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 2, vertical_chunks: 2, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 3 horizontal chunks and 3 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 3, horizontal_chunks: 3});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(10);
        expect( rows[1].label).toEqual('a');
        expect(childLabels(rows[1].children)).toEqual([]);
        expect( rows[2].label).toEqual('e');
        expect(childLabels(rows[2].children)).toEqual([]);
        expect( rows[3].label).toEqual('Region 3');
        expect(childLabels(rows[3].children)).toEqual(['i', 'm']);
        expect( rows[4].label).toEqual('b');
        expect(childLabels(rows[4].children)).toEqual([]);
        expect( rows[5].label).toEqual('f');
        expect(childLabels(rows[5].children)).toEqual([]);
        expect( rows[6].label).toEqual('Region 6');
        expect(childLabels(rows[6].children)).toEqual(['j', 'n']);
        expect( rows[7].label).toEqual('Region 7');
        expect(childLabels(rows[7].children)).toEqual(['c', 'd']);
        expect( rows[8].label).toEqual('Region 8');
        expect(childLabels(rows[8].children)).toEqual(['g', 'h']);
        expect( rows[9].label).toEqual('Region 9');
        expect(childLabels(rows[9].children)).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 3, vertical_chunks: 3, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 3 horizontal chunks and 2 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 3});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(7);
        expect( rows[1].label).toEqual('Region 1');
        expect(childLabels(rows[1].children)).toEqual(['a', 'e']);
        expect( rows[2].label).toEqual('Region 2');
        expect(childLabels(rows[2].children)).toEqual(['i', 'm']);
        expect( rows[3].label).toEqual('Region 3');
        expect(childLabels(rows[3].children)).toEqual(['b', 'f']);
        expect( rows[4].label).toEqual('Region 4');
        expect(childLabels(rows[4].children)).toEqual(['j', 'n']);
        expect( rows[5].label).toEqual('Region 5');
        expect(childLabels(rows[5].children)).toEqual(['c', 'g', 'd', 'h']);
        expect( rows[6].label).toEqual('Region 6');
        expect(childLabels(rows[6].children)).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 3, vertical_chunks: 2, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 2 horizontal chunks and 3 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 3, horizontal_chunks: 2});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(7);
        expect( rows[1].label).toEqual('Region 1');
        expect(childLabels(rows[1].children)).toEqual(['a', 'b']);
        expect( rows[2].label).toEqual('Region 2');
        expect(childLabels(rows[2].children)).toEqual(['e', 'f']);
        expect( rows[3].label).toEqual('Region 3');
        expect(childLabels(rows[3].children)).toEqual(['i', 'm', 'j', 'n']);
        expect( rows[4].label).toEqual('Region 4');
        expect(childLabels(rows[4].children)).toEqual(['c', 'd']);
        expect( rows[5].label).toEqual('Region 5');
        expect(childLabels(rows[5].children)).toEqual(['g', 'h']);
        expect( rows[6].label).toEqual('Region 6');
        expect(childLabels(rows[6].children)).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 2, vertical_chunks: 3, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 5 horizontal chunks and 7 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 7, horizontal_chunks: 5});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(17);
        expect( rows[1].label).toEqual('a');
        expect(childLabels(rows[1].children)).toEqual([]);
        expect( rows[2].label).toEqual('e');
        expect(childLabels(rows[2].children)).toEqual([]);
        expect( rows[3].label).toEqual('i');
        expect(childLabels(rows[3].children)).toEqual([]);
        expect( rows[4].label).toEqual('m');
        expect(childLabels(rows[4].children)).toEqual([]);
        expect( rows[5].label).toEqual('b');
        expect(childLabels(rows[5].children)).toEqual([]);
        expect( rows[6].label).toEqual('f');
        expect(childLabels(rows[6].children)).toEqual([]);
        expect( rows[7].label).toEqual('j');
        expect(childLabels(rows[7].children)).toEqual([]);
        expect( rows[8].label).toEqual('n');
        expect(childLabels(rows[8].children)).toEqual([]);
        expect( rows[9].label).toEqual('c');
        expect(childLabels(rows[9].children)).toEqual([]);
        expect( rows[10].label).toEqual('g');
        expect(childLabels(rows[10].children)).toEqual([]);
        expect( rows[11].label).toEqual('k');
        expect(childLabels(rows[11].children)).toEqual([]);
        expect( rows[12].label).toEqual('o');
        expect(childLabels(rows[12].children)).toEqual([]);
        expect( rows[13].label).toEqual('d');
        expect(childLabels(rows[13].children)).toEqual([]);
        expect( rows[14].label).toEqual('h');
        expect(childLabels(rows[14].children)).toEqual([]);
        expect( rows[15].label).toEqual('l');
        expect(childLabels(rows[15].children)).toEqual([]);
        expect( rows[16].label).toEqual('p');
        expect(childLabels(rows[16].children)).toEqual([]);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 5, vertical_chunks: 7, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 1 horizontal chunks and 1 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 1, horizontal_chunks: 1});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(2);
        expect( rows[1].label).toEqual('Region 1');
        expect(childLabels(rows[1].children)).toEqual(['a', 'e', 'i', 'm', 'b', 'f', 'j', 'n', 'c', 'g', 'k', 'o', 'd', 'h', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 1, vertical_chunks: 1, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 1 horizontal chunks and 2 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 1});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(3);
        expect( rows[1].label).toEqual('Region 1');
        expect(childLabels(rows[1].children)).toEqual(['a', 'e', 'b', 'f', 'c', 'g', 'd', 'h']);
        expect( rows[2].label).toEqual('Region 2');
        expect(childLabels(rows[2].children)).toEqual(['i', 'm', 'j', 'n', 'k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 1, vertical_chunks: 2, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 3 horizontal chunks and 1 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 1, horizontal_chunks: 3});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(4);
        expect( rows[1].label).toEqual('Region 1');
        expect(childLabels(rows[1].children)).toEqual(['a', 'e', 'i', 'm']);
        expect( rows[2].label).toEqual('Region 2');
        expect(childLabels(rows[2].children)).toEqual(['b', 'f', 'j', 'n']);
        expect( rows[3].label).toEqual('Region 3');
        expect(childLabels(rows[3].children)).toEqual(['c', 'g', 'k', 'o', 'd', 'h', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 3, vertical_chunks: 1, all_elements: [], auto_start: false});
      });
    });

    it('should support button-based scanning', function() {
      simple_header();
      stub(scanner, 'scan_content', function() {
        return {
          rows: 3,
          columns: 3,
          order: [
            [
              {length: 1, label: 'a'},
              {length: 1, label: 'b', sound: 'sound'},
              {length: 0}
            ],
            [
              {length: 0},
              {length: 1, label: 'c'},
              {length: 0}
            ],
            [
              {length: 1, label: 'd'},
              {length: 0},
              {length: 1, label: 'e'}
            ]
          ]
        };
      });
      scanner.start({scan_mode: 'button'});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(6);
      expect(rows[1].label).toEqual('a');
      expect(rows[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('b');
      expect(rows[2].children).toEqual(undefined);
      expect(rows[3].label).toEqual('c');
      expect(rows[3].children).toEqual(undefined);
      expect(rows[4].label).toEqual('d');
      expect(rows[4].children).toEqual(undefined);
      expect(rows[5].label).toEqual('e');
      expect(rows[5].children).toEqual(undefined);
      expect(options).toEqual({interval: 1000, scan_mode: 'button', all_elements: [], auto_start: false});
    });
  });

  describe("reset", function() {
    it("should cancel any existing interval", function() {
      db_wait(function() {
        scanner.interval = runLater(function() {}, 10000);
        scanner.reset();
        expect(scanner.interval).toEqual(null);
      });
    });

    it("should call 'start'", function() {
      db_wait(function() {
        var called = false;
        stub(scanner, 'start', function() { called = true; });
        scanner.reset();
        waitsFor(function() { return called; });
        runs();
      });
    });
  });

  describe("stop", function() {
    it("should cancel any existing interval", function() {
      db_wait(function() {
        scanner.interval = runLater(function() {}, 10000);
        scanner.stop();
        expect(scanner.interval).toEqual(null);
      });
    });
    it("should set scanning to false", function() {
      db_wait(function() {
        scanner.scanning = true;
        scanner.stop();
        expect(scanner.scanning).toEqual(false);
      });
    });
    it("should close any existing highlight", function() {
      db_wait(function() {
        var called = false;
        stub(modal, 'close_highlight', function() { called = true; });
        scanner.stop();
        waitsFor(function() { return called; });
        runs();
      });
    });
  });

  describe("scan_elements", function() {
    it("should reset scanning options", function() {
      db_wait(function() {
        var a = {a: 1};
        var b = {b: 1};
        var opts = {asdf: true};
        stub(scanner, 'next_element', function() { });
        scanner.scan_elements([a, b], opts);
        expect(scanner.elements).toEqual([a, b]);
        expect(scanner.options).toEqual(opts);
        expect(scanner.element_index).toEqual(undefined);
      });
    });

    it("should call next_element", function() {
      db_wait(function() {
        var called = false;
        stub(scanner, 'next_element', function() { called = true; });
        scanner.scan_elements(null, {auto_start: true});
        waitsFor(function() { return called; });
        runs();
      });
    });

    xit("should not start scanning if auto_start is false", function() {
      expect('test').toEqual('todo');
    });
  });

  describe("pick", function() {
    beforeEach(function() {
      scanner.options = { scan_mode: 'row', auto_start: true };
      stub(modal, 'is_open', function() { return false; });
    });

    it("should call buttonTracker.track_selection", function() {
      var called = false;
      stub(buttonTracker, 'track_selection', function(opts) {
        expect(opts.event_type).toEqual('click');
        expect(opts.selection_type).toEqual('scanner');
        called = true;
        return { proceed: true };
      });
      stub(scanner, 'pick_elem', function() { });
      scanner.current_element = {
        dom: { hasClass: function() { return false; } }
      };
      scanner.pick();
      expect(called).toEqual(true);
    });

    it('should return if not highlighting anything', function() {
      stub(scanner, 'current_element', null);
      stub(modal, 'highlight_contoller', null);
      var tracked = false;
      stub(buttonTracker, 'track_selection', function() { tracked = true; });
      scanner.pick();
      expect(tracked).toEqual(false);
    });

    it('should handle identity clicks', function() {
      var dispatched = [];
      var domNode = {
        hasClass: function(str) { return str === 'btn'; },
        closest: function() { return domStub(1); },
        dispatchEvent: function(e) { dispatched.push(e); }
      };
      scanner.current_element = {
        children: [{}, {}],
        dom: domNode
      };
      stub(buttonTracker, 'track_selection', function() { return { proceed: true }; });
      stub(scanner, 'find_elem', function(e) {
        if (e === domNode) {
          return domStub(1, { 0: domNode });
        }
        return domStub(0, {
          focus: function() { return { select: function() { } }; }
        });
      });
      stub(scanner, 'load_children', function() { });
      scanner.pick();
      expect(dispatched.length).toBeGreaterThan(0);
      expect(dispatched[0].pass_through).toEqual(true);
      expect(dispatched[0].switch_activated).toEqual(true);
    });

    it('should handle stepping up to a higher level in the scan hierarchy', function() {
      scanner.current_element = {
        higher_level: {bob: true},
        higher_level_index: 2,
        dom: {
          hasClass: function(str) { return false; }
        }
      };
      stub(buttonTracker, 'track_selection', function() { return { proceed: true }; });
      var nexted = false;
      stub(scanner, 'next_element', function() {
        nexted = true;
      });
      scanner.pick();
      waitsFor(function() { return nexted; });
      runs(function() {
        expect(scanner.elements).toEqual({bob: true});
        expect(scanner.element_index).toEqual(2);
      });
    });

    it('should handle stepping down to a lower level in the scan hierarchy', function() {
      var children_load = null;
      stub(buttonTracker, 'track_selection', function() { return { proceed: true }; });
      stub(scanner, 'load_children', function(elem, elements, index) {
        children_load = elem;
      });
      scanner.current_element = {
        children: [{}, {}],
        dom: {
          hasClass: function(str) { return false; }
        }
      };
      scanner.pick();
      expect(children_load).toEqual(scanner.current_element);
    });

    it('should trigger button selection events', function() {
      stub(buttonTracker, 'track_selection', function() { return { proceed: true }; });
      stub(editManager, 'find_button', function(id) {
        if(id == 'button_id') {
          return EmberObject.create({
            image: 'image',
            sound: 'sound'
          });
        }
      });
      var picked_button = null;
      var appController = EmberObject.create({
        activateButton: function(button, opts) {
          picked_button = button;
          expect(button.get('image')).toEqual('image');
          expect(button.get('sound')).toEqual('sound');
          expect(opts.board).toEqual('board');
          expect(opts.trigger_source).toEqual('switch');
        }
      });
      scanner.set('appState', EmberObject.create({
        controller: appController,
        currentUser: EmberObject.create({
          preferences: { device: { scanning: true } }
        })
      }));
      stub(editManager, 'controller', EmberObject.create({
        get: function(key) {
          if (key === 'model') { return 'board'; }
          return null;
        }
      }));
      scanner.current_element = {
        dom: {
          hasClass: function(str) { return str === 'button'; },
          attr: function() { return 'button_id'; }
        }
      };
      scanner.pick();
      expect(picked_button).toNotEqual(null);
    });

    it('should trigger frame_listener events', function() {
      var evented = false;
      stub(buttonTracker, 'track_selection', function() { return { proceed: true }; });
      stub(frame_listener, 'trigger_target_event', function(dom, type, aac_type) {
        evented = true;
        expect(type).toEqual('scanselect');
        expect(aac_type).toEqual('select');
      });
      scanner.current_element = {
        dom: {
          0: { target: true },
          hasClass: function(str) { return str === 'integration_target'; }
        }
      };
      scanner.pick();
      expect(evented).toEqual(true);
    });

    xit("should call 'next' if not yet scanning and auto_start is disabled", function() {
      expect('test').toEqual('todo');
    });

    xit("should debounce correctly", function() {
      expect('test').toEqual('todo');
    });
  });

  describe("next", function() {
    it("should cancel any existing interval", function() {
      db_wait(function() {
        scanner.elements = [{}, {}];
        scanner.interval = runLater(function() {}, 10000);
        stub(scanner, 'next_element', function() { });
        scanner.next();
        expect(scanner.interval).toEqual(null);
      });
    });

    it("should properly increment the element index", function() {
      db_wait(function() {
        scanner.elements = [{}, {}];
        scanner.element_index = 0;
        stub(scanner, 'next_element', function() { });
        scanner.next();
        expect(scanner.element_index).toEqual(1);
        scanner.next();
        expect(scanner.element_index).toEqual(0);
      });
    });

    xit("should debounce correctly", function() {
      expect('test').toEqual('todo');
    });
  });

  describe("next_element", function() {
    beforeEach(function() {
      scanner.scanning_distances = { x: 0, y: 0 };
      scanner.element_index = 0;
      scanner.element_index_advanced = true;
      scanner.current_element = null;
      buttonTracker.any_select = true;
      stub(scanner, 'measure', function() {
        return { top: 0, left: 0, width: 10, height: 10 };
      });
      stub(scanner, 'listen_for_input', function() { });
    });

    it('should call highlight for the next element in the scan list', function() {
      stub(scanner, 'elements', [
        { dom: scanDom('a') },
        { dom: scanDom('b') }
      ]);
      stub(scanner, 'pick', function() { });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts.highlight_type).toEqual('scanning');
        expect(opts.interval).toEqual(10);
        return RSVP.resolve();
      });
      scanner.options = {interval: 10};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(highlighted).toEqual(true);
      });
    });

    it('should handle overlay options correctly', function() {
      stub(scanner, 'elements', [
        { dom: scanDom('a') },
        { dom: scanDom('b') }
      ]);
      stub(scanner, 'pick', function() { });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts.focus_overlay).toEqual(true);
        expect(opts.overlay).toEqual(true);
        return RSVP.resolve();
      });
      scanner.options = {interval: 10, focus_overlay: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(highlighted).toEqual(true);
      });
    });

    it('should handle auditory prompts if defined', function() {
      stub(scanner, 'elements', [
        { dom: scanDom('a'), label: 'chicken' },
        { dom: scanDom('b'), sound: 'sound' }
      ]);
      stub(scanner, 'pick', function() { });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts.audio).toEqual(true);
        return RSVP.resolve();
      });
      var sound_triggered = false;
      stub(speecher, 'speak_audio', function(url, type, id, opts) {
        sound_triggered = true;
        expect(url).toEqual('sound');
        expect(type).toEqual('text');
        expect(id).toEqual(false);
        expect(opts).toEqual({alternate_voice: false, interrupt: false});
      });
      scanner.options = {interval: 10, audio: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(highlighted).toEqual(true);
        expect(sound_triggered).toEqual(true);
      });
    });

    it('should handle TTS auditory prompts if defined', function() {
      stub(scanner, 'elements', [
        { dom: scanDom('a'), label: 'chicken' },
        { dom: scanDom('b'), sound: 'sound' }
      ]);
      stub(scanner, 'pick', function() { });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('a');
        expect(opts.audio).toEqual(true);
        return RSVP.resolve();
      });
      var sound_triggered = false;
      stub(speecher, 'speak_text', function(text, id, opts) {
        sound_triggered = true;
        expect(text).toEqual('chicken');
        expect(id).toEqual(false);
        expect(opts).toEqual({alternate_voice: false, interrupt: false});
      });
      scanner.options = {interval: 10, audio: true};
      scanner.element_index = 0;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(highlighted).toEqual(true);
        expect(sound_triggered).toEqual(true);
      });
    });

    it('should schedule another scan event', function() {
      stub(scanner, 'elements', [
        { dom: scanDom('a') },
        { dom: scanDom('b') }
      ]);
      stub(scanner, 'pick', function() { });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        return RSVP.resolve();
      });
      scanner.options = {interval: 10, focus_overlay: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(scanner.interval).toNotEqual(null);
        runCancel(scanner.interval);
        scanner.interval = null;
      });
    });

    it('should trigger frame_listener events', function() {
      var elB = document.createElement('div');
      elB.id = 'b';
      stub(scanner, 'elements', [
        { dom: scanDom('a', function(str) { return str === 'integration_target'; }) },
        { dom: { 0: elB, id: 'b', hasClass: function(str) { return str === 'integration_target'; } } }
      ]);

      var triggered = false;
      stub(frame_listener, 'trigger_target_event', function(elem, type, aac_type) {
        triggered = true;
        expect(elem).toEqual(elB);
        expect(type).toEqual('scanover');
        expect(aac_type).toEqual('over');
      });
      stub(scanner, 'pick', function() { });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        return RSVP.resolve();
      });
      scanner.options = {interval: 10};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(triggered).toEqual(true);
        expect(highlighted).toEqual(true);
      });
    });

    it('should select instead of advancing if scanning_auto_select set', function() {
      stub(scanner, 'elements', [
        { dom: scanDom('a') },
        { dom: scanDom('b') }
      ]);
      var picked = false;
      stub(scanner, 'pick', function(ref) {
        if (ref === 'auto') { picked = true; }
      });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts.scanning_auto_select).toEqual(true);
        return RSVP.resolve();
      });
      scanner.options = {interval: 10, scanning_auto_select: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return highlighted; });
      runs(function() {
        expect(highlighted).toEqual(true);
        expect(scanner.interval).toNotEqual(null);
        runCancel(scanner.interval);
        scanner.interval = null;
      });
    });
  });

  describe("hide_input", function() {
    it('should call hide if available', function() {
      var accessoryHidden = false;
      stub(window, 'Keyboard', {
        hide: function() { },
        hideFormAccessoryBar: function() { accessoryHidden = true; }
      });
      stub(capabilities, 'toggle_keyboard_accessory', function() { });
      scanner.set('appState', EmberObject.create({ speak_mode: true }));
      scanner.scanning = true;
      stub(scanner, 'find_elem', function(str) {
        if (str === '#hidden_input:focus') {
          return domStub(1);
        }
        return domStub(0);
      });
      scanner.hide_input(true);
      expect(accessoryHidden).toEqual(true);
    });
  });

  describe("listen_for_input", function() {
    function hiddenInputShim() {
      var inputEl = document.createElement('input');
      var shim = domStub(0, {
        0: inputEl,
        attr: function() { return shim; },
        css: function() { return shim; },
        select: function() { shim.selected = true; return shim; },
        focus: function() { shim.focused = true; return shim; }
      });
      return shim;
    }

    it('should focus on the keyboard at first', function() {
      var inputShim = hiddenInputShim();
      stub(scanner, 'find_elem', function(str) {
        if (str === '#hidden_input:focus') { return domStub(0); }
        if (str === '#hidden_input') { return inputShim.length ? inputShim : domStub(0); }
        return domStub(0);
      });
      stub(scanner, 'make_elem', function(tag, opts) {
        expect(tag).toEqual('<input/>');
        inputShim.length = 1;
        return inputShim;
      });
      scanner.keyboard_tried_to_show = false;
      scanner.listen_for_input();
      expect(inputShim.length).toEqual(1);
      expect(inputShim.selected).toEqual(true);
      expect(inputShim.focused).toEqual(true);
    });

    it('should not try to show the keyboard via focus event more than once', function() {
      var inputShim = hiddenInputShim();
      stub(scanner, 'find_elem', function(str) {
        if (str === '#hidden_input:focus') { return domStub(0); }
        if (str === '#hidden_input') { return inputShim.length ? inputShim : domStub(0); }
        return domStub(0);
      });
      stub(scanner, 'make_elem', function() {
        inputShim.length = 1;
        return inputShim;
      });

      scanner.keyboard_tried_to_show = true;
      scanner.listen_for_input();
      expect(inputShim.selected).toEqual(undefined);
      expect(inputShim.focused).toEqual(undefined);
    });
  });

  describe('escape', function() {
    /* escape() had NO test before this. It decides, on a switch user's cancel press, between
       "go back a level" and "quit scanning entirely" — and quitting costs them the highlight
       and usually a caregiver's help to restart, so the distinction is not cosmetic. */
    it('levels up out of a recognised drill-in level', function() {
      var levelled = null, stopped = false;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });
      stub(scanner, 'stop', function() { stopped = true; });

      var top = [{ label: 'row 1' }, { label: 'row 2' }];
      var stubElem = {
        label: 'the prediction rail', higher_level: top, higher_level_index: 1,
        dom: { hasClass: function(c) { return c === 'md-board-detail-prediction-rail'; } }
      };
      scanner.elements = [{ label: 'child' }, stubElem];
      scanner.scanning = true;   // this test asserts RUNNING-scanner behaviour

      scanner.escape();
      expect(levelled).toBe(stubElem);
      expect(stopped).toBe(false);
    });

    it('does not resurrect a scanner that was STOPPED behind a modal', function() {
      /* H2. stop() (scanner.js:595-608) nulls interval/scanning/current_element but LEAVES
         scanner.elements, element_index and options. Every non-scannable modal calls it
         (services/modal.js:115, utils/modal.js:126/188). The switch surface gates on the
         `scanning_enabled` PREFERENCE, not on scanner.scanning (raw_events.js ~675), so a
         cancel press still reaches escape() with scanning already false — and levelling up
         from there re-highlights and re-arms the auto-select timer underneath the open
         modal, which for a scanning_auto_select user activates a button they cannot see.

         This branch widened the exposure: staging allow-listed one class, HEAD added
         md-board-detail-prediction-rail as a second (scanner.js:774).

         Calls the REAL stop() rather than stubbing it, because stop() is what sets
         scanning=false — the mechanism under test supplies its own precondition, which makes
         this a mechanism test rather than a description test. */
      var levelled = null;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });

      var top = [{ label: 'row 1' }, { label: 'row 2' }];
      var stubElem = {
        label: 'the prediction rail', higher_level: top, higher_level_index: 1,
        dom: { hasClass: function(c) { return c === 'md-board-detail-prediction-rail'; } }
      };
      scanner.elements = [{ label: 'child' }, stubElem];
      scanner.scanning = true;   // a RUNNING scanner, drilled into the rail
      /* Guard: prove this level IS one escape would otherwise level up out of, so the
         assertion below cannot pass merely because the fixture was unrecognised. The
         beforeEach leaves scanning false, so without the line above this guard would fail
         under the very fix it is written for — and the test would silently be selecting a
         different fix. */
      scanner.escape();
      expect(levelled).toBe(stubElem);

      levelled = null;
      scanner.elements = [{ label: 'child' }, stubElem];
      scanner.stop();            // a modal opened
      scanner.escape();          // the user presses cancel to dismiss it
      expect(levelled).toBe(null);
    });

    it('STOPS from an unrecognised level — the guaranteed exit switch users depend on', function() {
      /* Generalising escape to "any level with a higher_level" was tried and reverted. It
         removed this guarantee: level_up puts the highlight back on the row just escaped and
         next_element re-arms auto-select, so an auto-select user had to press twice inside one
         scan interval to stop — exactly what a long interval exists to avoid. It also revived a
         STOPPED scanner behind an open modal, because stop() does not clear scanner.elements.
         This test locks the exit in place; changing it is a deliberate product decision that
         needs a scanning-state guard and auto-select suppression first. */
      var levelled = null, stopped = false;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });
      stub(scanner, 'stop', function() { stopped = true; });

      var top = [{ label: 'row 1' }, { label: 'row 2' }];
      var stubElem = { label: 'a board row', higher_level: top, higher_level_index: 1, dom: {} };
      scanner.elements = [{ label: 'child' }, stubElem];

      scanner.escape();
      expect(levelled).toBe(null);
      expect(stopped).toBe(true);
    });

    it('stops when there is nowhere to go back to', function() {
      var levelled = null, stopped = false;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });
      stub(scanner, 'stop', function() { stopped = true; });

      scanner.elements = [{ label: 'row 1' }, { label: 'row 2' }];
      scanner.escape();
      expect(levelled).toBe(null);
      expect(stopped).toBe(true);
    });

    it('stops rather than levelling up into an EMPTY parent level', function() {
      /* higher_level: [] is truthy. Levelling into it sets scanner.elements = [] and
         next_element then dereferences elements[0].dom and dies with no recovery. */
      var levelled = null, stopped = false;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });
      stub(scanner, 'stop', function() { stopped = true; });

      scanner.elements = [{ label: 'child' }, {
        higher_level: [], higher_level_index: 0,
        dom: { hasClass: function(c) { return c === 'md-board-detail-prediction-rail'; } }
      }];
      scanner.escape();
      expect(levelled).toBe(null);
      expect(stopped).toBe(true);
    });
  });

  describe('prediction rail scan row', function() {
    /* The rail row had NO headless coverage: deleting the whole block from start() left the suite
       green, because scannerFindElemStub returns domStub(0) for selectors it does not know. If it
       regressed, a scanning user could not reach any prediction in the DEFAULT placement — the bug
       this branch exists to fix.

       A delegating wrapper rather than teaching the SHARED helper the selector: doing that makes
       14 existing tests fail, because every simple_header() test asserts an exact rows.length and
       positional rows[n], and the rail row is pushed before scan_content() so it shifts each index
       by one. The wrapper also handles the per-tile find_elem(this) calls, which a plain override
       cannot — reload_children passes the element object, which would fall through to domStub(0)
       and yield empty labels. */
    var railFindElem = function(tile_count) {
      var base = scannerFindElemStub({
        '.md-board-detail-prediction-rail:visible': domStub(1, {
          hasClass: function(cls) { return cls === 'md-board-detail-prediction-rail'; },
          find: function(sel) {
            if(sel !== '.md-board-detail-sentence-bar__prediction') { return domStub(0); }
            return domStub(tile_count, {
              each: function(cb) {
                for(var i = 0; i < tile_count; i++) { cb.call({prediction_index: i}); }
              }
            });
          }
        })
      });
      return function(str) {
        if(str && str.prediction_index !== undefined) {
          return domStub(1, { text: function() { return ['cream', 'crunch'][str.prediction_index]; } });
        }
        return base(str);
      };
    };

    it('registers the rail as its own scan row, with its tiles as children', function() {
      var rows = null;
      stub(scanner, 'find_elem', railFindElem(2));
      stubScannerModalClosed();
      stub(scanner, 'scan_content', function() { return { rows: 0, columns: 0, order: [[]] }; });
      stub(scanner, 'scan_elements', function(r) { rows = r; });

      scanner.start({});

      var rail = (rows || []).filter(function(r) {
        return r.dom && r.dom.hasClass && r.dom.hasClass('md-board-detail-prediction-rail');
      })[0];
      expect(!!rail).toEqual(true);
      expect(rail.children.length).toEqual(2);
      expect(rail.children[0].label).toEqual('cream');
    });

    it('does NOT register the row when the rail has no tiles', function() {
      /* The children.length guard is what stops the scan loop parking a user on an empty
         "Suggestions" row. The simple_header tests cannot reach it — they fail the outer
         `if` with length 0 — so it needs its own case. */
      var rows = null;
      stub(scanner, 'find_elem', railFindElem(0));
      stubScannerModalClosed();
      stub(scanner, 'scan_content', function() { return { rows: 0, columns: 0, order: [[]] }; });
      stub(scanner, 'scan_elements', function(r) { rows = r; });

      scanner.start({});
      /* Assert by CLASS, not by a row count. The count was load-bearing on stub internals: with
         content.rows === 0, start() collapses rows to the header row's children, so the `1` was
         actually the #identity menu — adding a second header child flipped it to 3 with production
         code untouched. */
      var railRows = (rows || []).filter(function(r) {
        return r.dom && r.dom.hasClass && r.dom.hasClass('md-board-detail-prediction-rail');
      });
      expect(railRows.length).toEqual(0);
    });
  });

  describe('load_children', function() {
    /* load_children is stubbed out in every other test in this file, so its body was never
       executed by the suite. */
    it('levels back up when the reloaded children are all gone', function() {
      var levelled = null;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });

      var top = [{ label: 'row 1' }, { label: 'row 2' }];
      var group = { label: 'predictions', children: [{ label: 'old' }], reload_children: function() { return []; } };
      var result = scanner.load_children(group, top, 1);

      /* Before this, an emptied group produced a level holding only its own level-up stub —
         the user cycled an empty box. It self-healed only when the container ALSO left the
         DOM, which a container kept mounted to hold layout width never does. */
      expect(!!levelled).toBe(true);
      expect(levelled.higher_level).toBe(top);
      expect(levelled.higher_level_index).toBe(1);
      expect(result).toBe(true);
    });

    it('builds the child level normally when children remain', function() {
      var levelled = null;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });

      var top = [{ label: 'row 1' }];
      var group = { label: 'predictions', reload_children: function() { return [{ label: 'a' }, { label: 'b' }]; } };
      scanner.load_children(group, top, 0);

      expect(levelled).toBe(null);
      expect(scanner.elements.length).toBe(3); // two children plus the level-up stub
      expect(scanner.elements[2].higher_level).toBe(top);
    });

    it('ADVANCES past a group whose children are all gone, instead of re-entering it', function() {
      /* Deliberately does NOT stub level_up. The sibling test above stubs it, so it passes
         identically with and without this behaviour and is not coverage for it.

         Without the advance, `pick('auto')` on an emptied group levels up to the SAME index,
         re-highlights the row that just failed to open, and auto-select picks it again — one
         iteration per scan interval, for ever. A switch user never reaches the board. */
      stub(scanner, 'next_element', function() { });
      var rows = [{ label: 'header' }, { label: 'suggestions' }, { label: 'row 1' }];
      var group = { label: 'suggestions', children: [{ label: 'old' }], reload_children: function() { return []; } };
      scanner.element_index = 1;

      scanner.load_children(group, rows, 1);
      expect(scanner.elements).toBe(rows);
      expect(scanner.element_index).toBe(2);   // NOT 1 — 1 is the closed loop
    });

    it('wraps to the first row when the dead level was the last one', function() {
      stub(scanner, 'next_element', function() { });
      var rows = [{ label: 'header' }, { label: 'suggestions' }];
      var group = { label: 'suggestions', children: [], reload_children: function() { return []; } };

      scanner.load_children(group, rows, 1);
      expect(scanner.element_index).toBe(0);
    });

    it('pins higher_level to the level it was PASSED, not one the element already carried', function() {
      /* Object.assign defaults must come last: with the element last, a stub fed back in
         would override the level we were given and level up to the wrong place. */
      var levelled = null;
      stub(scanner, 'level_up', function(elem) { levelled = elem; });

      var real = [{ label: 'real row' }];
      var stale = [{ label: 'stale row' }];
      var group = {
        label: 'predictions', higher_level: stale, higher_level_index: 99,
        reload_children: function() { return []; }
      };
      scanner.load_children(group, real, 0);

      expect(levelled.higher_level).toBe(real);
      expect(levelled.higher_level_index).toBe(0);
    });
  });

  describe('axis scanning', function() {
    xit('should have specs', function() {
      expect('test').toEqual('todo');
    });
  });
});
