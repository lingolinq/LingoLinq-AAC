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
import RSVP from 'rsvp';
import contentGrabbers from '../../utils/content_grabbers';
import BoardHierarchy from '../../utils/board_hierarchy';
import LingoLinq from '../../app';

describe('boardHierarchy', function() {
  afterEach(function() {
    queryLog.fixtures = null;
  });

  it('should generate a valid hierarchy', function() {
    var bs = LingoLinq.store.createRecord('buttonset', {
      buttons: [
        {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
        {board_id: '234', linked_board_id: '345', linked_board_key: 'asdf/345'},
        {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
        {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
        {board_id: '567'},
      ]
    });
    var brd = LingoLinq.store.createRecord('board', {
      id: '123', key: 'asdf/123'
    });
    var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {}});
    expect(bh.get('root.id')).toEqual('123');
    expect(bh.get('root.selected')).toEqual(true);
    expect(bh.get('root.open')).toEqual(undefined);
    expect(bh.get('root.disabled')).toEqual(undefined);
    expect(bh.get('root.children').length).toEqual(1);
    expect(bh.get('root.children')[0].get('id')).toEqual('234');
    expect(bh.get('root.children')[0].get('selected')).toEqual(true);
    expect(bh.get('root.children')[0].get('open')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('disabled')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children').length).toEqual(2);
    expect(bh.get('root.children')[0].get('children')[0].get('id')).toEqual('345');
    expect(bh.get('root.children')[0].get('children')[0].get('selected')).toEqual(true);
    expect(bh.get('root.children')[0].get('children')[0].get('open')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children')[0].get('disabled')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children')[0].get('children').length).toEqual(1);
    expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('id')).toEqual('567');
    expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('selected')).toEqual(true);
    expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('open')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('disabled')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('children').length).toEqual(0);
    expect(bh.get('root.children')[0].get('children')[1].get('id')).toEqual('456');
    expect(bh.get('root.children')[0].get('children')[1].get('selected')).toEqual(true);
    expect(bh.get('root.children')[0].get('children')[1].get('open')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children')[1].get('disabled')).toEqual(undefined);
    expect(bh.get('root.children')[0].get('children')[1].get('children').length).toEqual(0);
    expect(bh.get('all_boards').length).toEqual(5);
  });
  it('should expand the hierarchy when requested for copy selection', function() {
    var bs = LingoLinq.store.createRecord('buttonset', {
      buttons: [
        {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
        {board_id: '234', linked_board_id: '345', linked_board_key: 'asdf/345'},
        {board_id: '345'},
      ]
    });
    var brd = LingoLinq.store.createRecord('board', {
      id: '123', key: 'asdf/123'
    });
    var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {expand_all: true}});
    expect(bh.get('root.open')).toEqual(true);
    expect(bh.get('root.children')[0].get('open')).toEqual(true);
    expect(bh.get('root.children')[0].get('children')[0].get('open')).toEqual(undefined);
  });
  it('should use the board global id when the record id is a key', function() {
    var bs = LingoLinq.store.createRecord('buttonset', {
      buttons: [
        {board_id: '1_123', linked_board_id: '1_234', linked_board_key: 'asdf/child'},
        {board_id: '1_234'},
      ]
    });
    var brd = LingoLinq.store.createRecord('board', {
      id: 'asdf/root',
      _actual_id: '1_123',
      key: 'asdf/root',
      downstream_board_ids: ['1_234']
    });
    var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {}});
    expect(bh.get('root.id')).toEqual('1_123');
    expect(bh.get('root.children.length')).toEqual(1);
    expect(bh.get('root.children')[0].get('id')).toEqual('1_234');
    expect(bh.get('boards_missing')).toEqual(false);
  });
  it('should use live board links when the button set root links are missing', function() {
    var bs = LingoLinq.store.createRecord('buttonset', {
      buttons: [
        {board_id: '1_234'}
      ]
    });
    var brd = LingoLinq.store.createRecord('board', {
      id: 'asdf/root',
      _actual_id: '1_123',
      key: 'asdf/root',
      buttons: [
        {id: 1, load_board: {id: '1_234', key: 'asdf/child'}}
      ],
      downstream_board_ids: ['1_234']
    });
    var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {}});
    expect(bh.get('root.id')).toEqual('1_123');
    expect(bh.get('root.children.length')).toEqual(1);
    expect(bh.get('root.children')[0].get('id')).toEqual('1_234');
    expect(bh.get('root.children')[0].get('key')).toEqual('asdf/child');
  });
  it('should recursively load live links when the button set cannot load', function() {
    queryLog.defineFixture({
      method: 'GET',
      type: 'board',
      id: '1_234',
      response: RSVP.resolve({board: {
        id: '1_234',
        key: 'asdf/child',
        buttons: [
          {id: 1, load_board: {id: '1_345', key: 'asdf/grandchild'}}
        ]
      }})
    });
    queryLog.defineFixture({
      method: 'GET',
      type: 'board',
      id: '1_345',
      response: RSVP.resolve({board: {
        id: '1_345',
        key: 'asdf/grandchild',
        buttons: []
      }})
    });
    var brd = LingoLinq.store.createRecord('board', {
      id: 'asdf/root',
      _actual_id: '1_123',
      key: 'asdf/root',
      buttons: [
        {id: 1, load_board: {id: '1_234', key: 'asdf/child'}}
      ]
    });
    var bh = null;
    BoardHierarchy.load_from_live_links(brd, {expand_all: true}).then(function(hierarchy) {
      bh = hierarchy;
    });
    waitsFor(function() { return bh; });
    runs(function() {
      expect(bh.get('root.children.length')).toEqual(1);
      expect(bh.get('root.children')[0].get('id')).toEqual('1_234');
      expect(bh.get('root.children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('children.length')).toEqual(1);
      expect(bh.get('root.children')[0].get('children')[0].get('id')).toEqual('1_345');
      expect(bh.get('live_links_incomplete')).toEqual(false);
    });
  });
  describe('options', function() {
    it('should apply options.deselect_on_different', function() {
      var bs = LingoLinq.store.createRecord('buttonset', {
        buttons: [
          {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
          {board_id: '234', linked_board_id: '345', linked_board_key: 'jkl/345'},
          {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
          {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
          {board_id: '567'},
        ]
      });
      var brd = LingoLinq.store.createRecord('board', {
        id: '123', key: 'asdf/123'
      });
      var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {deselect_on_different: true}});
      expect(bh.get('root.id')).toEqual('123');
      expect(bh.get('root.selected')).toEqual(true);
      expect(bh.get('root.open')).toEqual(undefined);
      expect(bh.get('root.disabled')).toEqual(undefined);
      expect(bh.get('root.children').length).toEqual(1);
      expect(bh.get('root.children')[0].get('id')).toEqual('234');
      expect(bh.get('root.children')[0].get('selected')).toEqual(true);
      expect(bh.get('root.children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children').length).toEqual(2);
      expect(bh.get('root.children')[0].get('children')[0].get('id')).toEqual('345');
      expect(bh.get('root.children')[0].get('children')[0].get('selected')).toEqual(false);
      expect(bh.get('root.children')[0].get('children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[0].get('children').length).toEqual(1);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('id')).toEqual('567');
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('selected')).toEqual(false);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('open')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('children').length).toEqual(0);
      expect(bh.get('root.children')[0].get('children')[1].get('id')).toEqual('456');
      expect(bh.get('root.children')[0].get('children')[1].get('selected')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[1].get('open')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[1].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[1].get('children').length).toEqual(0);
      expect(bh.get('all_boards').length).toEqual(5);
    });
    it('should apply options.prevent_different', function() {
      var bs = LingoLinq.store.createRecord('buttonset', {
        buttons: [
          {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
          {board_id: '234', linked_board_id: '345', linked_board_key: 'jkl/345'},
          {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
          {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
          {board_id: '567'},
        ]
      });
      var brd = LingoLinq.store.createRecord('board', {
        id: '123', key: 'asdf/123'
      });
      var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {deselect_on_different: true, prevent_different: true}});
      expect(bh.get('root.id')).toEqual('123');
      expect(bh.get('root.selected')).toEqual(true);
      expect(bh.get('root.open')).toEqual(undefined);
      expect(bh.get('root.disabled')).toEqual(undefined);
      expect(bh.get('root.children').length).toEqual(1);
      expect(bh.get('root.children')[0].get('id')).toEqual('234');
      expect(bh.get('root.children')[0].get('selected')).toEqual(true);
      expect(bh.get('root.children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children').length).toEqual(2);
      expect(bh.get('root.children')[0].get('children')[0].get('id')).toEqual('345');
      expect(bh.get('root.children')[0].get('children')[0].get('selected')).toEqual(false);
      expect(bh.get('root.children')[0].get('children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('disabled')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('children').length).toEqual(1);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('id')).toEqual('567');
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('selected')).toEqual(false);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('open')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('disabled')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('children').length).toEqual(0);
      expect(bh.get('root.children')[0].get('children')[1].get('id')).toEqual('456');
      expect(bh.get('root.children')[0].get('children')[1].get('selected')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[1].get('open')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[1].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[1].get('children').length).toEqual(0);
      expect(bh.get('all_boards').length).toEqual(5);
    });
    it('should apply options.prevent_keyboard correctly', function() {
      expect('test').toEqual('todo');
    });
  });
  describe('disabled', function() {
    it('should mark all boards under a disabled board as disabled', function() {
      var bs = LingoLinq.store.createRecord('buttonset', {
        buttons: [
          {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
          {board_id: '234', linked_board_id: '345', linked_board_key: 'jkl/345'},
          {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
          {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
          {board_id: '567'},
        ]
      });
      var brd = LingoLinq.store.createRecord('board', {
        id: '123', key: 'asdf/123'
      });
      var bh = BoardHierarchy.create({board: brd, button_set: bs, options: {deselect_on_different: true, prevent_different: true}});
      expect(bh.get('root.id')).toEqual('123');
      expect(bh.get('root.selected')).toEqual(true);
      expect(bh.get('root.open')).toEqual(undefined);
      expect(bh.get('root.disabled')).toEqual(undefined);
      expect(bh.get('root.children').length).toEqual(1);
      expect(bh.get('root.children')[0].get('id')).toEqual('234');
      expect(bh.get('root.children')[0].get('selected')).toEqual(true);
      expect(bh.get('root.children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children').length).toEqual(2);
      expect(bh.get('root.children')[0].get('children')[0].get('id')).toEqual('345');
      expect(bh.get('root.children')[0].get('children')[0].get('selected')).toEqual(false);
      expect(bh.get('root.children')[0].get('children')[0].get('open')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('disabled')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('children').length).toEqual(1);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('id')).toEqual('567');
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('selected')).toEqual(false);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('open')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('disabled')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[0].get('children')[0].get('children').length).toEqual(0);
      expect(bh.get('root.children')[0].get('children')[1].get('id')).toEqual('456');
      expect(bh.get('root.children')[0].get('children')[1].get('selected')).toEqual(true);
      expect(bh.get('root.children')[0].get('children')[1].get('open')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[1].get('disabled')).toEqual(undefined);
      expect(bh.get('root.children')[0].get('children')[1].get('children').length).toEqual(0);
      expect(bh.get('all_boards').length).toEqual(5);
    });
  });
});
