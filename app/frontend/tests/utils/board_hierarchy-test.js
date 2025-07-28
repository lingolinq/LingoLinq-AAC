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
import contentGrabbers from '../../utils/content_grabbers';
import BoardHierarchy from '../../utils/board_hierarchy';
import LingoLinqAAC from '../../app';

describe('boardHierarchy', function() {
  it('should generate a valid hierarchy', function() {
    var bs = LingoLinqAAC.store.createRecord('buttonset', {
      buttons: [
        {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
        {board_id: '234', linked_board_id: '345', linked_board_key: 'asdf/345'},
        {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
        {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
        {board_id: '567'},
      ]
    });
    var brd = LingoLinqAAC.store.createRecord('board', {
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
  describe('options', function() {
    it('should apply options.deselect_on_different', function() {
      var bs = LingoLinqAAC.store.createRecord('buttonset', {
        buttons: [
          {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
          {board_id: '234', linked_board_id: '345', linked_board_key: 'jkl/345'},
          {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
          {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
          {board_id: '567'},
        ]
      });
      var brd = LingoLinqAAC.store.createRecord('board', {
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
      var bs = LingoLinqAAC.store.createRecord('buttonset', {
        buttons: [
          {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
          {board_id: '234', linked_board_id: '345', linked_board_key: 'jkl/345'},
          {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
          {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
          {board_id: '567'},
        ]
      });
      var brd = LingoLinqAAC.store.createRecord('board', {
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
      var bs = LingoLinqAAC.store.createRecord('buttonset', {
        buttons: [
          {board_id: '123', linked_board_id: '234', linked_board_key: 'asdf/234'},
          {board_id: '234', linked_board_id: '345', linked_board_key: 'jkl/345'},
          {board_id: '234', linked_board_id: '456', linked_board_key: 'asdf/456'},
          {board_id: '345', linked_board_id: '567', linked_board_key: 'asdf/567'},
          {board_id: '567'},
        ]
      });
      var brd = LingoLinqAAC.store.createRecord('board', {
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
