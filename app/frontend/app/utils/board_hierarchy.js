import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import i18n from './i18n';
import { computed } from '@ember/object';

var BoardHierarchy = EmberObject.extend({
  init: function() {  
    this.load_boards();
  },
  load_boards: function() {
    var _this = this;
    var board = this.get('board');
    var downstreams = {};
    (board.get('downstream_board_ids') || []).forEach(function(id) {
      downstreams[id] = false;
    });
    var button_set = this.get('button_set');
    var any_meta = (button_set.get('buttons') || []).find(function(b) { return b.meta_home_id; });
    var traversed_boards = {};
    var all_boards = [];
    var traverse_board = function(board_id, board_key) {
      downstreams[board_id] = true;
      var hierarchy_board = EmberObject.create({
        id: board_id,
        key: board_key,
        user_name: board_key.split(/\//)[0],
        selected: true,
        children: [],
        parent: null,
        clones: []
      });
      traversed_boards[board_id] = hierarchy_board;
      all_boards.push(hierarchy_board);
      hierarchy_board.addObserver('selected', function() {
        if(!this.get('selected')) {
          // set everything underneath to unselected as well
          _this.set_downstream(this, 'selected', false);
        } else {
          if(this.get('parent')) {
            this.set('parent.selected', true);
          }
          if(!this.get('open')) {
            // set everything underneath to selected as well
            _this.set_downstream(this, 'selected', true);
          }
        }
        var selected = this.get('selected');
        (this.get('clones') || []).forEach(function(brd) {
          brd.set('selected', selected);
        });
      });
      hierarchy_board.addObserver('open', function() {
        if(this.get('open') && this.get('parent')) {
          this.set('parent.open', true);
        }
      });
      hierarchy_board.addObserver('disabled', function() {
        if(this.get('children')) {
          this.get('children').forEach(function(c) { c.set('disabled', true); });
        }
      });
      hierarchy_board.set('visible', !!(button_set.get('buttons') || []).find(function(b) { return b.board_id == board_id; }));
      var linked_buttons = (button_set.get('buttons') || []).filter(function(b) { return b.board_id == board_id && b.linked_board_id; });
      linked_buttons.forEach(function(btn) {
        var linked_board = traversed_boards[btn.linked_board_id];
        if(!linked_board) {
          var sub_board = traverse_board(btn.linked_board_id, btn.linked_board_key);
          sub_board.set('parent', hierarchy_board);
          if(sub_board.get('user_name') != hierarchy_board.get('user_name')) {
            hierarchy_board.set('open', true);
            if(_this.get('options.deselect_on_different')) {
              sub_board.set('selected', false);
            }
            if(_this.get('options.prevent_different')) {
              sub_board.set('disabled', true);
            }
          } else if(!hierarchy_board.get('selected')) {
            sub_board.set('selected', false);
          } else if(_this.get('options.prevent_keyboard') && sub_board.get('key').match(/keyboard$/)) {
            sub_board.set('selected', false);
          }
          traversed_boards[board_id].get('children').push(sub_board);
        } else {
          var clone = EmberObject.create({
            already_linked: true,
            id: linked_board.get('id'),
            key: linked_board.get('key'),
            selected: linked_board.get('selected'),
            disabled: true
          });
          linked_board.get('clones').push(clone);
          hierarchy_board.get('children').push(clone);
        }
      });
      return hierarchy_board;
    };
    var root_board = traverse_board(board.get('id'), board.get('key'));
    if(this.get('options.expand_all')) {
      all_boards.forEach(function(brd) {
        if((brd.get('children') || []).length > 0) {
          brd.set('open', true);
        }
      });
    }
    var any_missing = false;
    for(var id in downstreams) {
      if(downstreams[id] === false) {
        any_missing = true;
      }
    }
    this.set('boards_missing', !!any_missing);
    this.set('boards_meta_missing', !!any_missing && !!any_meta);
    if(any_missing && !this.get('tried_button_set_reload')) {
      this.set('tried_button_set_reload', true);
      var _this = this;
      board.load_button_set(true).then(function() {
        _this.set('boards_missing', null);
        _this.load_boards();
      });
    }
    this.set('all_boards', all_boards);
    this.set('root', root_board);
  },
  root_deselected: computed('root.selected', function() {
    return !this.get('root.selected');
  }),
  selected_board_ids: function() {
    var ids = [];
    this.get('all_boards').forEach(function(b) {
      if(b.get('selected') && !b.get('disabled')) {
        ids.push(b.get('id'));
      }
    });
    return ids;
  },
  set_downstream(board, attribute, value) {
    var _this = this;
    if(!board) {
      board = this.get('root');
      board.set(attribute, value);
    }
    (board.get('children') || []).forEach(function(b) {
      b.set(attribute, value);
      _this.set_downstream(b, attribute, value);
    });
  },
  toggle: function(board_id, state) {
    this.get('all_boards').forEach(function(b) {
      if(b.get('id') == board_id || board_id == 'all') {
        state = (state === null || state === undefined) ? !b.get('open') : state;
        b.set('open', state);
      }
    });
  }
});
BoardHierarchy.load_with_button_set = function(board, opts) {
  opts = opts || {};
  // Copy-board modal (links_copy): board.reload() can hang indefinitely on board-detail,
  // leaving "Loading..." forever. Callers pass skipBoardReloadForCopyModal when the
  // board is already the live editor model. All other flows keep reload for freshness.
  var reload_board = opts.skipBoardReloadForCopyModal
    ? RSVP.resolve(board)
    : board.reload().then(null, function() {
    }, function(err) {
      return RSVP.reject(i18n.t('loading_board_failed', "Failed loading board for copying"));
    });

  var downstream = reload_board.then(function() {
    var copyModal = !!opts.skipBoardReloadForCopyModal;
    // Always force:true here so LingoLinq.Buttonset.load_button_set clears pending_promises[id].
    // With force:false, a prior stuck promise can be returned and no new XHR runs ("no calls").
    // skipBoardReloadForCopyModal still skips board.reload + Ember buttonset reload noise.
    return board.load_button_set(true, copyModal).then(function(bs) {
      return bs;
    });
  });

  var load_hierarchy = downstream.then(function(button_set) {
    if(!button_set) {
      return RSVP.resolve(null);
    }
    opts = opts || {};

    return RSVP.resolve(BoardHierarchy.create({board: board, button_set: button_set, options: opts}));
  }, function() {
    return RSVP.reject(i18n.t('loading_board_links_failed', "Failed loading board links for copying"));
  });

  return load_hierarchy;
};

export default BoardHierarchy;
