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
import { db_wait, fakeAudio } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import scanner from '../../utils/scanner';
import app_state from '../../utils/app_state';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import frame_listener from '../../utils/frame_listener';
import modal from '../../utils/modal';
import buttonTracker from '../../utils/raw_events';
import EmberObject from '@ember/object';
import { run as emberRun } from '@ember/runloop';

describe('scanner', function() {

  afterEach(function() {
    scanner.stop();
    scanner.last_options = null;
    scanner.current_element = null;
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
        model: {
          grid: {
            rows: 3,
            columns: 3,
            order: [[1, 2, 3], [4, 5, 6], [7, null, null]]
          }
        }
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
        if(search == ".button[data-id='1']:not(.hidden_button)") {
          return {1: true, length: 1};
        } else if(search == ".button[data-id='2']:not(.hidden_button)") {
          return {2: true, length: 1};
        } else if(search == ".button[data-id='3']:not(.hidden_button)") {
          return {3: true, length: 1};
        } else if(search == ".button[data-id='4']:not(.hidden_button)") {
          return {4: true, length: 1};
        } else if(search == ".button[data-id='5']:not(.hidden_button)") {
          return {5: true, length: 1};
        } else if(search == ".button[data-id='6']:not(.hidden_button)") {
          return {6: true, length: 1};
        } else if(search == ".button[data-id='7']:not(.hidden_button)") {
          return {7: true, length: 1};
        } else {
          return {length: 0};
        }
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
      stub(scanner, 'scan_elements', function(r, opts) {
        scan_called = true;
        rows = r;
        options = opts;
      });
    });

    afterEach(function() {
      options = null;
      scan_called = false;
    });

    it('should do nothing if not in speak mode', function() {
      stub(scanner, 'find_elem', function(str) {
        if(str == 'header #speak') { return {length: 0}; }
      });
      var stopped = false;
      stub(scanner, 'stop', function() { stopped = true; });
      scanner.start({});
      expect(stopped).toEqual(true);
    });

    it('should do nothing if a different modal is open', function() {
      var header_search = false;
      stub(scanner, 'find_elem', function(str) {
        if(str == 'header #speak') { return {length: 1}; }
        if(str == 'header') { header_search = true; }
      });
      stub(modal, 'is_open', function(str) {
        if(str == 'highlight') { return false; }
        return true;
      });
      scanner.start({});
      expect(header_search).toEqual(false);
    });

    var simple_header = function() {
      stub(scanner, 'find_elem', function(str) {
        if(str == 'header #speak') { return {length: 1, find: function() { return {each: function() { }}; }}; }
        if(str == 'header') { return {length: 0}; }
        if(str == '#identity a.btn') { return {length: 0}; }
        if(str == '#identity .dropdown-menu a') { return {each: function() { }}; }
        if(str == '#word_suggestions') { return {length: 0}; }
        if(!str) {
          var list = {
            elements: [],
            add: function(elem) { list.elements.push(elem); return list; }
          };
          return list;
        }
      });
      stub(modal, 'is_open', function(str) { return true; });
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
      expect(rows).toEqual([{children: [], dom: {length: 0}, label: "Menu"}]);
      expect(options).toEqual({scan_mode: 'row', interval: 1000, all_elements: [], auto_start: false});
    });

    it('should support scanning the header row', function() {
      stub(scanner, 'find_elem', function(str) {
        if(str == 'header #speak') {
          return {
            length: 1,
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
        if(str == '#identity .dropdown-menu a') {
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
      stub(modal, 'is_open', function(str) { return true; });
      expect(!!scanner.scanning).toEqual(false);
      scanner.start({});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(5);
      expect(rows[0].label).toEqual('Home');
      expect(rows[0].children).toEqual(undefined);
      expect(rows[1].label).toEqual('Back');
      expect(rows[1].children).toEqual(undefined);
      expect(rows[2].label).toEqual('Speak');
      expect(rows[2].children).toEqual(undefined);
      expect(rows[3].label).toEqual('Clear');
      expect(rows[3].children).toEqual(undefined);
      expect(rows[4].label).toEqual('Menu');
      expect(rows[4].children).toNotEqual(undefined);
      expect(rows[4].children.length).toEqual(3);
      expect(rows[4].children[0].label).toEqual('cat');
      expect(rows[4].children[0].children).toEqual(undefined);
      expect(rows[4].children[1].label).toEqual('stat');
      expect(rows[4].children[1].children).toEqual(undefined);
      expect(rows[4].children[2].label).toEqual('splat');
      expect(rows[4].children[2].children).toEqual(undefined);
      expect(options).toEqual({scan_mode: 'row', interval: 1000, all_elements: [], auto_start: false});
    });

    it('should support scanning the word suggestion row if it exists', function() {
      stub(scanner, 'find_elem', function(str) {
        if(str == 'header #speak') {
          return {
            length: 1,
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
        if(str == '#identity .dropdown-menu a') {
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
      stub(modal, 'is_open', function(str) { return true; });
      expect(!!scanner.scanning).toEqual(false);
      scanner.start({});
      expect(scan_called).toEqual(true);
      expect(scanner.scanning).toEqual(true);
      expect(rows.length).toEqual(2);
      expect(rows[0].label).toEqual('Header');
      expect(rows[0].children).toNotEqual(undefined);
      expect(rows[0].children.length).toEqual(5);
      expect(rows[0].children[0].label).toEqual('Home');
      expect(rows[0].children[0].children).toEqual(undefined);
      expect(rows[0].children[1].label).toEqual('Back');
      expect(rows[0].children[1].children).toEqual(undefined);
      expect(rows[0].children[2].label).toEqual('Speak');
      expect(rows[0].children[2].children).toEqual(undefined);
      expect(rows[0].children[3].label).toEqual('Clear');
      expect(rows[0].children[3].children).toEqual(undefined);
      expect(rows[0].children[4].label).toEqual('Menu');
      expect(rows[0].children[4].children).toNotEqual(undefined);
      expect(rows[0].children[4].children.length).toEqual(3);
      expect(rows[0].children[4].children[0].label).toEqual('cat');
      expect(rows[0].children[4].children[0].children).toEqual(undefined);
      expect(rows[0].children[4].children[1].label).toEqual('stat');
      expect(rows[0].children[4].children[1].children).toEqual(undefined);
      expect(rows[0].children[4].children[2].label).toEqual('splat');
      expect(rows[0].children[4].children[2].children).toEqual(undefined);
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
        expect((rows[1].children || []).mapBy('label')).toEqual(['a', 'e', 'b', 'f']);
        expect( rows[2].label).toEqual('Region 2');
        expect((rows[2].children || []).mapBy('label')).toEqual(['i', 'm', 'j', 'n']);
        expect( rows[3].label).toEqual('Region 3');
        expect((rows[3].children || []).mapBy('label')).toEqual(['c', 'g', 'd', 'h']);
        expect( rows[4].label).toEqual('Region 4');
        expect((rows[4].children || []).mapBy('label')).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 2, vertical_chunks: 2, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 3 horizontal chunks and 3 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 3, horizontal_chunks: 3});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(10);
        expect( rows[1].label).toEqual('a');
        expect((rows[1].children || []).mapBy('label')).toEqual([]);
        expect( rows[2].label).toEqual('e');
        expect((rows[2].children || []).mapBy('label')).toEqual([]);
        expect( rows[3].label).toEqual('Region 3');
        expect((rows[3].children || []).mapBy('label')).toEqual(['i', 'm']);
        expect( rows[4].label).toEqual('b');
        expect((rows[4].children || []).mapBy('label')).toEqual([]);
        expect( rows[5].label).toEqual('f');
        expect((rows[5].children || []).mapBy('label')).toEqual([]);
        expect( rows[6].label).toEqual('Region 6');
        expect((rows[6].children || []).mapBy('label')).toEqual(['j', 'n']);
        expect( rows[7].label).toEqual('Region 7');
        expect((rows[7].children || []).mapBy('label')).toEqual(['c', 'd']);
        expect( rows[8].label).toEqual('Region 8');
        expect((rows[8].children || []).mapBy('label')).toEqual(['g', 'h']);
        expect( rows[9].label).toEqual('Region 9');
        expect((rows[9].children || []).mapBy('label')).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 3, vertical_chunks: 3, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 3 horizontal chunks and 2 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 3});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(7);
        expect( rows[1].label).toEqual('Region 1');
        expect((rows[1].children || []).mapBy('label')).toEqual(['a', 'e']);
        expect( rows[2].label).toEqual('Region 2');
        expect((rows[2].children || []).mapBy('label')).toEqual(['i', 'm']);
        expect( rows[3].label).toEqual('Region 3');
        expect((rows[3].children || []).mapBy('label')).toEqual(['b', 'f']);
        expect( rows[4].label).toEqual('Region 4');
        expect((rows[4].children || []).mapBy('label')).toEqual(['j', 'n']);
        expect( rows[5].label).toEqual('Region 5');
        expect((rows[5].children || []).mapBy('label')).toEqual(['c', 'g', 'd', 'h']);
        expect( rows[6].label).toEqual('Region 6');
        expect((rows[6].children || []).mapBy('label')).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 3, vertical_chunks: 2, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 2 horizontal chunks and 3 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 3, horizontal_chunks: 2});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(7);
        expect( rows[1].label).toEqual('Region 1');
        expect((rows[1].children || []).mapBy('label')).toEqual(['a', 'b']);
        expect( rows[2].label).toEqual('Region 2');
        expect((rows[2].children || []).mapBy('label')).toEqual(['e', 'f']);
        expect( rows[3].label).toEqual('Region 3');
        expect((rows[3].children || []).mapBy('label')).toEqual(['i', 'm', 'j', 'n']);
        expect( rows[4].label).toEqual('Region 4');
        expect((rows[4].children || []).mapBy('label')).toEqual(['c', 'd']);
        expect( rows[5].label).toEqual('Region 5');
        expect((rows[5].children || []).mapBy('label')).toEqual(['g', 'h']);
        expect( rows[6].label).toEqual('Region 6');
        expect((rows[6].children || []).mapBy('label')).toEqual(['k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 2, vertical_chunks: 3, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 5 horizontal chunks and 7 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 7, horizontal_chunks: 5});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(17);
        expect( rows[1].label).toEqual('a');
        expect((rows[1].children || []).mapBy('label')).toEqual([]);
        expect( rows[2].label).toEqual('e');
        expect((rows[2].children || []).mapBy('label')).toEqual([]);
        expect( rows[3].label).toEqual('i');
        expect((rows[3].children || []).mapBy('label')).toEqual([]);
        expect( rows[4].label).toEqual('m');
        expect((rows[4].children || []).mapBy('label')).toEqual([]);
        expect( rows[5].label).toEqual('b');
        expect((rows[5].children || []).mapBy('label')).toEqual([]);
        expect( rows[6].label).toEqual('f');
        expect((rows[6].children || []).mapBy('label')).toEqual([]);
        expect( rows[7].label).toEqual('j');
        expect((rows[7].children || []).mapBy('label')).toEqual([]);
        expect( rows[8].label).toEqual('n');
        expect((rows[8].children || []).mapBy('label')).toEqual([]);
        expect( rows[9].label).toEqual('c');
        expect((rows[9].children || []).mapBy('label')).toEqual([]);
        expect( rows[10].label).toEqual('g');
        expect((rows[10].children || []).mapBy('label')).toEqual([]);
        expect( rows[11].label).toEqual('k');
        expect((rows[11].children || []).mapBy('label')).toEqual([]);
        expect( rows[12].label).toEqual('o');
        expect((rows[12].children || []).mapBy('label')).toEqual([]);
        expect( rows[13].label).toEqual('d');
        expect((rows[13].children || []).mapBy('label')).toEqual([]);
        expect( rows[14].label).toEqual('h');
        expect((rows[14].children || []).mapBy('label')).toEqual([]);
        expect( rows[15].label).toEqual('l');
        expect((rows[15].children || []).mapBy('label')).toEqual([]);
        expect( rows[16].label).toEqual('p');
        expect((rows[16].children || []).mapBy('label')).toEqual([]);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 5, vertical_chunks: 7, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 1 horizontal chunks and 1 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 1, horizontal_chunks: 1});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(2);
        expect( rows[1].label).toEqual('Region 1');
        expect((rows[1].children || []).mapBy('label')).toEqual(['a', 'e', 'i', 'm', 'b', 'f', 'j', 'n', 'c', 'g', 'k', 'o', 'd', 'h', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 1, vertical_chunks: 1, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 1 horizontal chunks and 2 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 2, horizontal_chunks: 1});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(3);
        expect( rows[1].label).toEqual('Region 1');
        expect((rows[1].children || []).mapBy('label')).toEqual(['a', 'e', 'b', 'f', 'c', 'g', 'd', 'h']);
        expect( rows[2].label).toEqual('Region 2');
        expect((rows[2].children || []).mapBy('label')).toEqual(['i', 'm', 'j', 'n', 'k', 'o', 'l', 'p']);
        expect(options).toEqual({interval: 1000, scan_mode: 'region', horizontal_chunks: 1, vertical_chunks: 2, all_elements: [], auto_start: false});
      });

      it('should support 4x4 grid with 3 horizontal chunks and 1 vertical chunks', function() {
        four_by_four();
        scanner.start({scan_mode: 'region', vertical_chunks: 1, horizontal_chunks: 3});
        expect(scan_called).toEqual(true);
        expect(scanner.scanning).toEqual(true);
        expect(rows.length).toEqual(4);
        expect( rows[1].label).toEqual('Region 1');
        expect((rows[1].children || []).mapBy('label')).toEqual(['a', 'e', 'i', 'm']);
        expect( rows[2].label).toEqual('Region 2');
        expect((rows[2].children || []).mapBy('label')).toEqual(['b', 'f', 'j', 'n']);
        expect( rows[3].label).toEqual('Region 3');
        expect((rows[3].children || []).mapBy('label')).toEqual(['c', 'g', 'k', 'o', 'd', 'h', 'l', 'p']);
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
        var interval = {a: 1};
        scanner.interval = interval;
        var passed_interval = null;
        stub(emberRun, 'cancel', function(arg) {
          passed_interval = passed_interval || arg;
        });
        scanner.reset();
        waitsFor(function() { return passed_interval; });
        runs(function() {
          expect(passed_interval).toEqual(interval);
        });
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
        var interval = {a: 1};
        scanner.interval = interval;
        var passed_interval = null;
        stub(emberRun, 'cancel', function(arg) {
          passed_interval = arg;
        });
        scanner.stop();
        waitsFor(function() { return passed_interval; });
        runs(function() {
          expect(passed_interval).toEqual(interval);
        });
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

    it("should not start scanning if auto_start is false", function() {
      expect('test').toEqual('todo');
    });
  });

  describe("pick", function() {
    it("should call buttonTracker.track_selection", function() {
      scanner.current_element = {};
      scanner.current_element.dom = document.createElement('div');

      modal.highlight_controller = {};

      var called = false;
      stub(buttonTracker, 'track_selection', function(opts) {
        expect(opts).toEqual({
          event_type: 'click',
          selection_type: 'scanner'
        });
        called = true;
      });
      scanner.current_element = {hasClass: function() { return false; }};

      scanner.pick();
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
      var triggers = [];
      scanner.current_element = {
        dom: {
          hasClass: function(str) { return str == 'btn'; },
          closest: function() { return {length: 1}; },
          trigger: function(e) {
            triggers.push(e);
          }
        }
      };
      stub(modal, 'highlight_controller', {});
      stub(scanner, 'find_elem', function(e) {
        return e;
      });
      scanner.pick();
      expect(triggers.length).toEqual(2);
      expect(triggers[0].pass_through).toEqual(true);
      expect(triggers[0].switch_activated).toEqual(true);
      expect(triggers[1].pass_through).toEqual(true);
      expect(triggers[1].switch_activated).toEqual(undefined);
    });

    it('should handle stepping up to a higher level in the scan hierarchy', function() {
      scanner.current_element = {
        higher_level: {bob: true},
        higher_level_index: 2,
        dom: {
          hasClass: function(str) { return false; }
        }
      };
      stub(modal, 'highlight_controller', {});
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
      stub(scanner, 'load_children', function(elem, elements, index) {
        children_load = elem;
      });
      stub(modal, 'highlight_controller', {});
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
      stub(modal, 'highlight_controller', {});
      stub(editManager, 'find_button', function(id) {
        if(id == 'button_id') {
          return EmberObject.create({
            image: 'image',
            sound: 'sound'
          });
        }
      });
      var picked_button = null;
      stub(app_state, 'controller',
        EmberObject.extend({
          activateButton: function(button, opts) {
            picked_button = button;
            expect(button.image).toEqual('image');
            expect(button.sound).toEqual('sound');
            expect(opts.board).toEqual('board');
          }
        }).create({board: {model: 'board'}})
      );
      scanner.current_element = {
        dom: {
          hasClass: function(str) { return str == 'button'; },
          attr: function() { return 'button_id'; }
        }
      };
      scanner.pick();
      expect(picked_button).toNotEqual(null);
    });

    it('should trigger frame_listener events', function() {
      stub(modal, 'highlight_controller', {});
      var target = null;
      stub(frame_listener, 'trigger_target', function(t) {
        target = t;
      });
      var evented = false;
      stub(frame_listener, 'trigger_target_event', function(dom, type, aac_type) {
        evented = true;
        expect(dom).toEqual({target: true});
        expect(type).toEqual('scanselect');
        expect(aac_type).toEqual('select');
      });
      scanner.current_element = {
        dom: {
          0: {target: true},
          hasClass: function(str) { return str == 'integration_target'; },
          attr: function() { return 'button_id'; }
        }
      };
      scanner.pick();
      expect(target).toEqual({target: true});
      expect('ignore_until').toEqual('to be set');
    });

    it("should call 'next' if not yet scanning and auto_start is disabled", function() {
      expect('test').toEqual('todo');
    });

    it("should debounce correctly", function() {
      expect('test').toEqual('todo');
    });
  });

  describe("next", function() {
    it("should cancel any existing interval", function() {
      db_wait(function() {
        var interval = {a: 1};
        scanner.elements = [{}, {}];
        scanner.interval = interval;
        var passed_interval = null;
        stub(emberRun, 'cancel', function(arg) {
          passed_interval = arg;
        });
        stub(scanner, 'next_element', function() { });
        scanner.next();
        waitsFor(function() { return passed_interval; });
        runs(function() {
          expect(passed_interval).toEqual(interval);
          expect('ignore_until').toEqual('to be set');
        });
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

    it("should debounce correctly", function() {
      expect('test').toEqual('todo');
    });
  });

  describe("next_element", function() {
    it('should call highlight for the next element in the scan list', function() {
      stub(scanner, 'elements', [
        {dom: {id: 'a', hasClass: function() { return false; }}},
        {dom: {id: 'b', hasClass: function() { return false; }}}
      ]);
      var nexted = false;
      stub(scanner, 'next', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts).toEqual({interval: 10, overlay: false, prevent_close: true, auto_start: true, select_anywhere: true});
        return RSVP.reject();
      });
      scanner.options = {interval: 10};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs(function() {
        expect(highlighted).toEqual(true);
      });
    });

    it('should handle overlay options correctly', function() {
      stub(scanner, 'elements', [
        {dom: {id: 'a', hasClass: function() { return false; }}},
        {dom: {id: 'b', hasClass: function() { return false; }}}
      ]);
      var nexted = false;
      stub(scanner, 'next', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts).toEqual({interval: 10, focus_overlay: true, overlay: true, clear_overlay: false, prevent_close: true, auto_start: true, select_anywhere: true});
        return RSVP.reject();
      });
      scanner.options = {interval: 10, focus_overlay: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs(function() {
        expect(highlighted).toEqual(true);
      });
    });

    it('should handle auditory prompts if defined', function() {
      stub(scanner, 'elements', [
        {dom: {id: 'a', hasClass: function() { return false; }}, label: 'chicken'},
        {dom: {id: 'b', hasClass: function() { return false; }}, sound: 'sound'}
      ]);
      var nexted = false;
      stub(scanner, 'next', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts).toEqual({interval: 10, audio: true, overlay: false, prevent_close: true, auto_start: true, select_anywhere: true});
        return RSVP.reject();
      });
      var sound_triggered = false;
      stub(speecher, 'speak_audio', function(url, type, id, opts) {
        sound_triggered = true;
        expect(url).toEqual('sound');
        expect(type).toEqual('text');
        expect(id).toEqual(false);
        expect(opts).toEqual({alternate_voice: true, interrupt: false});
      });
      scanner.options = {interval: 10, audio: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs(function() {
        expect(highlighted).toEqual(true);
        expect(sound_triggered).toEqual(true);
      });
    });

    it('should handle TTS auditory prompts if defined', function() {
      stub(scanner, 'elements', [
        {dom: {id: 'a', hasClass: function() { return false; }}, label: 'chicken'},
        {dom: {id: 'b', hasClass: function() { return false; }}, sound: 'sound'}
      ]);
      var nexted = false;
      stub(scanner, 'next', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('a');
        expect(opts).toEqual({interval: 10, audio: true, overlay: false, prevent_close: true, auto_start: true, select_anywhere: true});
        return RSVP.reject();
      });
      var sound_triggered = false;
      stub(speecher, 'speak_text', function(text, id, opts) {
        sound_triggered = true;
        expect(text).toEqual('chicken');
        expect(id).toEqual(false);
        expect(opts).toEqual({alternate_voice: true, interrupt: false});
      });
      scanner.options = {interval: 10, audio: true};
      scanner.element_index = 0;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs(function() {
        expect(highlighted).toEqual(true);
        expect(sound_triggered).toEqual(true);
      });
    });

    it('should schedule another scan event', function() {
      stub(scanner, 'elements', [
        {dom: {id: 'a', hasClass: function() { return false; }}},
        {dom: {id: 'b', hasClass: function() { return false; }}}
      ]);
      var nexted = false;
      stub(scanner, 'next', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts).toEqual({interval: 10, focus_overlay: true, overlay: true, clear_overlay: false, prevent_close: true, auto_start: true, select_anywhere: true});
        return RSVP.reject();
      });
      scanner.options = {interval: 10, focus_overlay: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs();
    });

    it('should trigger frame_listener events', function() {
      stub(scanner, 'elements', [
        {dom: {0: 'a', id: 'a', hasClass: function(str) { return str == 'integration_target'; }}},
        {dom: {0: 'b', id: 'b', hasClass: function(str) { return str == 'integration_target'; }}}
      ]);

      var triggered = false;
      stub(frame_listener, 'trigger_target_event', function(elem, type, aac_type) {
        triggered = true;
        expect(elem).toEqual('b');
        expect(type).toEqual('scanover');
        expect(aac_type).toEqual('over');
      });
      var nexted = false;
      stub(scanner, 'next', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts).toEqual({auto_start: true, interval: 10, overlay: false, prevent_close: true, select_anywhere: true});
        return RSVP.reject();
      });
      scanner.options = {interval: 10};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs(function() {
        expect(triggered).toEqual(true);
        expect(highlighted).toEqual(true);
      });
    });

    it('should select instead of advancing if scanning_auto_select set', function() {
      stub(scanner, 'elements', [
        {dom: {id: 'a', hasClass: function() { return false; }}},
        {dom: {id: 'b', hasClass: function() { return false; }}}
      ]);
      var nexted = false;
      stub(scanner, 'pick', function() { nexted = true; });
      stub(document.body, 'contains', function() { return true; });
      var highlighted = false;
      stub(modal, 'highlight', function(elem, opts) {
        highlighted = true;
        expect(elem.id).toEqual('b');
        expect(opts).toEqual({interval: 10, overlay: false, prevent_close: true, auto_start: true, select_anywhere: true, scanning_auto_select: true});
        return RSVP.reject();
      });
      scanner.options = {interval: 10, scanning_auto_select: true};
      scanner.element_index = 1;
      scanner.next_element();

      waitsFor(function() { return nexted; });
      runs(function() {
        expect(highlighted).toEqual(true);
      });
    });
  });

  describe("hide_input", function() {
    it('should call hide if available', function() {
      var hidden = false;
      stub(window, 'Keyboard', {
        hide: function() { hidden = true; }
      });
      scanner.hide_input();
      expect(hidden).toEqual(false);
      scanner.scanning = true;
      scanner.hide_input();
      expect(hidden).toEqual(false);
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', true);
      scanner.hide_input();
      expect(hidden).toEqual(false);

      var obj = {};
      stub(scanner, 'find_elem', function(str) {
        return [obj];
      });
      scanner.hide_input();
      expect(hidden).toEqual(true);
    });
  });

  describe("listen_for_input", function() {
    it('should focus on the keyboard at first', function() {
      var obj = null;
      var selected = false;
      var focused = false;
      stub(scanner, 'find_elem', function(str) {
        if(obj) {
          return [obj];
        } else {
          return [];
        }
      });

      stub(scanner, 'make_elem', function(tag, opts) {
        expect(tag).toEqual('<input/>');
        expect(opts).toEqual({
          autocapitalize: 'off',
          autocomplete: 'off',
          autocorrect: 'off',
          id: 'hidden_input',
          spellcheck: 'off',
          type: 'checkbox'
        });
        obj = {
          select: function() { selected = true; return obj; },
          focus: function() { focused = true; return obj; },
          css: function() { }
        };
        return obj;
      });
      scanner.keyboard_tried_to_show = false;
      scanner.listen_for_input();
      expect(obj).toNotEqual(null);
      expect(selected).toEqual(true);
      expect(focused).toEqual(true);
    });

    it('should not try to show the keyboard via focus event more than once', function() {
      var obj = null;
      var selected = false;
      var focused = false;
      stub(scanner, 'find_elem', function(str) {
        if(obj) {
          return [obj];
        } else {
          return [];
        }
      });

      stub(scanner, 'make_elem', function(tag, opts) {
        expect(tag).toEqual('<input/>');
        expect(opts).toEqual({
          autocapitalize: 'off',
          autocomplete: 'off',
          autocorrect: 'off',
          id: 'hidden_input',
          spellcheck: 'off',
          type: 'checkbox'
        });
        obj = {
          select: function() { selected = true; return obj; },
          focus: function() { focused = true; return obj; },
          css: function() { }
        };
        return obj;
      });

      scanner.keyboard_tried_to_show = true;
      scanner.listen_for_input();
      expect(obj).toNotEqual(null);
      expect(selected).toEqual(false);
      expect(focused).toEqual(false);
    });
  });

  describe('axis scanning', function() {
    it('should have specs', function() {
      expect('test').toEqual('todo');
    });
  });
});
