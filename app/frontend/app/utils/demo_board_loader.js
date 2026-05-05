import RSVP from 'rsvp';

var BASE_PATH = '/demo-boards/';
var manifestPromise = null;
var boardPromises = {};

function fetch_json(path) {
  return fetch(path).then(function(response) {
    if(!response.ok) {
      throw new Error('Unable to load demo board asset: ' + path);
    }
    return response.json();
  });
}

function image_url_for(board, image_id) {
  var images = board.images || [];
  var image = images.find(function(img) { return img.id === image_id; });
  return image && (image.url || (image.path && ('/' + image.path)));
}

function normalize_button(board, button, row_index, column_index) {
  if(!button) {
    return {
      id: 'empty_' + row_index + '_' + column_index,
      empty: true
    };
  }
  var normalized = Object.assign({}, button);
  normalized.part_of_speech = normalized.part_of_speech || normalized.ext_lingolinq_part_of_speech || normalized.ext_coughdrop_part_of_speech;
  normalized.image_url = normalized.image_url || image_url_for(board, normalized.image_id);
  normalized.board = board;
  if(normalized.load_board) {
    normalized.part_of_speech = normalized.part_of_speech || 'folder';
  }
  return normalized;
}

function ordered_buttons_for(board) {
  var by_id = {};
  (board.buttons || []).forEach(function(button) {
    by_id[button.id] = button;
  });
  var order = (board.grid && board.grid.order) || [];
  return order.map(function(row, row_index) {
    return (row || []).map(function(button_id, column_index) {
      return normalize_button(board, by_id[button_id], row_index, column_index);
    });
  });
}

function normalize_board(board, source_path) {
  board = Object.assign({}, board);
  board.source_path = source_path;
  board.has_background = !!(board.background && (board.background.image || board.background.color || board.background.text));
  board.ordered_buttons = ordered_buttons_for(board);
  return board;
}

function load_manifest() {
  if(!manifestPromise) {
    manifestPromise = fetch_json(BASE_PATH + 'manifest.json');
  }
  return manifestPromise;
}

function load_board(path) {
  if(!path) {
    return RSVP.reject(new Error('Missing demo board path'));
  }
  if(!boardPromises[path]) {
    boardPromises[path] = fetch_json(BASE_PATH + path).then(function(board) {
      return normalize_board(board, path);
    });
  }
  return boardPromises[path];
}

export default {
  load_root: function() {
    return load_manifest().then(function(manifest) {
      return RSVP.hash({
        manifest: manifest,
        board: load_board(manifest.root)
      });
    });
  },

  load_board: load_board,

  reset_cache: function() {
    manifestPromise = null;
    boardPromises = {};
  }
};
