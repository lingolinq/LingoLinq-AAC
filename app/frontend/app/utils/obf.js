/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

import EmberObject from '@ember/object';
import LingoLinq from '../app';
import evaluation from './eval';
import emergency from './obf-emergency';
import { later as runLater } from '@ember/runloop';
import app_state from './app_state';
import i18n from './i18n';

var handlers = {};
var obf = EmberObject.extend({
  parse: function(json, fallback_key) {
    var hash = JSON.parse(json);
    var id = (hash['id'] || 'b123') + 'b' + (new Date()).getTime() + "x" + Math.round(Math.random() * 9999);
    var board = LingoLinq.store.push({data: {
      id: id,
      type: 'board',
      attributes: {}
    }});
    board.set('local_only', true);
    if(hash['locale']) {
      board.set('locale', hash['locale']);
    }
    board.set('extra_back',  hash['extra_back']);
    board.set('obf_type', hash['obf_type']);
    board.set('grid', hash['grid']);
    
    board.set('id', id);
    board.set('name', hash['name'] || id);
    board.set('permissions', {view: true});
    if(hash['public']) {
      board.set('public', true);
    }
    board.set('license', hash['license'] || {});
    hash['background'] = hash['background'] || {};
    board.set('background', {
      image: hash['background']['image'] || hash['background']['image_url'],
      image_exclusion: hash['background']['ext_lingolinq_image_exclusion'],
      color: hash['background']['color'],
      position: hash['background']['position'],
      text: hash['background']['text'],
      prompt: hash['background']['prompt'] || hash['background']['prompt_text'],
      prompt_timeout: hash['background']['prompt_timeout'] || hash['background']['prompt_text'],
      delay_prompts: hash['background']['delay_prompts'] || hash['background']['delayed_prompts'],
      delay_prompt_timeout: hash['background']['delay_prompt_timeout']
    });
    board.set('text_only', hash['text_only']);
    board.set('hide_empty', true);
    board.set('key', hash['key'] || fallback_key);
    board.set('editable_source_key', hash['source_key']);
    var image_urls = {};
    var sound_urls = {};
    var buttons = [];
    (hash['buttons'] || []).forEach(function(b) {
      var img = b.image_id && hash['images'].find(function(i) { return i.id == b.image_id; });
      if(img) { image_urls[b.image_id] = img.url; }
      var snd = b.sound_id && hash['sounds'].find(function(s) { return s.id == b.sound_id; });
      if(snd) { sound_urls[b.sound_id] = snd.url; }
      buttons.push(b);
    });
    board.set('fallback_images', hash['images']);
    board.set('fallback_sounds', hash['sounds']);
    board.set('buttons', buttons);
    board.set('image_urls', image_urls);
    board.set('sound_urls', sound_urls);
    return board;
  },
  register: function(prefix, render) {
    handlers[prefix] = render;
  },
  lookup: function(key) {
    for(var prefix in handlers) {
      var re = new RegExp("^" + prefix);
      if(key.match(re)) {
        var opts = handlers[prefix](key);
        if(opts) {
          var board = obf.parse(opts.json, "obf/" + key);
          board.set('rendered', (new Date()).getTime());
          if(opts.handler) {
            board.set('button_handler', opts.handler);
          }
          return board;
        }
      }
    }
    return null;
  },
  shell: function(rows, columns) {
    var grid = [];
    for(var idx = 0; idx < rows; idx++) {
      var row = [];
      for(var jdx = 0; jdx < columns; jdx++) {
        row.push(null);
      }
      grid.push(row);
    }
    var shell = {
      format: 'open-board-0.1',
      license: {type: 'private'},
      background: {},
      buttons: [],
      grid: {
        rows: rows,
        columns: columns,
        order: grid
      },
      images: [],
      sounds: []
    };
    shell.id_index = 0;
    shell.to_json = function() {
      return JSON.stringify(shell, 2);
    };
    shell.add_button = function(button, row, col) {
      button.id = button.id || "btn_" + (++shell.id_index);
      if(button.image) {
        var img = Object.assign({}, button.image);
        img.id = "tmpimg_" + (++obf.id_index);
        var existing = LingoLinq.store.peekRecord('image', img.id);
        if(existing && existing.get('incomplete')) {
          existing.set('url', img.url);
        }
        shell.images.push(img);
        button.image_id = img.id;
        delete button['image'];
      }
      if(button.sound) {
        var snd = Object.assign({}, button.sound);
        snd.id = "tmpsnd_" + (++obf.id_index);
        var existing = LingoLinq.store.peekRecord('sound', img.id);
        if(existing && existing.get('incomplete')) {
          existing.set('url', snd.url);
        }
        shell.sounds.push(snd);
        button.sound_id = snd.id;
        delete button['sound'];
      }
      shell.buttons.push(button);
      if(row >= 0 && col >= 0 && row < shell.grid.rows && col < shell.grid.columns) {
        if(!shell.grid.order[row][col]) {
          shell.grid.order[row][col] = button.id;
        }
      }
    };
    return shell;
  }
}).create();

evaluation.register(obf);
emergency.register(obf);
obf.register("stars", function(key) {
  var parts = key.replace(/^stars-?/, '').split(/-/);
  var user_id = parts[0];
  var board_id = parts[1];
  var user = app_state.get('sessionUser');
  if(user_id && user_id != 'self') {
    user = LingoLinq.store.peekRecord('user', user_id);
    if(!user || !user.get('permissions.supervise')) {
      // TODO: error message
    }
  }
  var rows = 3, cols = 4;
  var idx = 0;
  var refs = (user && user.get('stats.starred_board_refs')) || [];
  if(board_id && refs.length) {
    var ref = user.get('stats.starred_board_refs').find(function(b) { return b.id == board_id && b.style && b.style.options; });
    if(ref) {
      var list = [];
      ref.style.options.forEach(function(o) {
        var opt = Object.assign({}, o);
        opt.image_url = opt.url || ref.image_url;
        list.push(opt)
      })
      refs = list;
    }
  }
  var total = refs.length || 0;
  if(user.get('preferences.home_board') && !board_id) {
    total++;
  }
  while(total > rows * cols) {
    if(cols / rows > 1.7) {
      rows++;
    } else {
      cols++;
    }
  }
  var res = obf.shell(rows, cols);
  res.name = i18n.t('starred_boards', "Liked Boards");
  if(user) {
    res.name = i18n.t('starred_boards_for_user', "Liked Boards for %{un}", {un: user.get('user_name')});
    if(user.get('preferences.home_board') && !board_id) {
      var ref = refs.find(function(r) { return r.id == user.get('preferences.home_board.id'); });
      var btn = {
        label: ref ? ref.name : i18n.t('home_board', "Home Board"), 
        meta_home: "obf/" + key,
        home_lock: true, 
        image: {url: "https://opensymbols.s3.amazonaws.com/libraries/noun-project/Home-c167425c69.svg"}, 
        load_board: {
          key: user.get('preferences.home_board.key'), 
          id: user.get('preferences.home_board.id')
        }
      };
      if(ref && ref.image_url) {
        btn.image = {url: ref.image_url};
      }
      res.add_button(btn, 0, 0);
      idx++;
    }
    refs.forEach(function(ref) {
      var col = idx % cols;
      var row = (idx - col) / cols;
      if(ref.style && ref.style.options && !board_id) {
        res.add_button({label: ref.style.name, image: {url: ref.style.image_url}, load_board: {key: "obf/stars-" + user.id + "-" + ref.id}}, row, col);
      } else {
        res.add_button({label: ref.name, meta_home: "obf/" + key, home_lock: true, image: {url: ref.image_url}, load_board: {key: ref.key, id: ref.id}}, row, col);
      }
      // TODO: pass the preferred level as well based on how it looked when it was starred
      idx++;
    });
    if(total == 0) {
      res.background = {text: i18n.t('no_starred_boards', "User Has No Liked Boards")};
      // TODO: include fallback list of boards somehow
    }
  } else {
    res.background = {text: i18n.t('no_user_found', "User Information Not Available")};
  }
  return {json: res.to_json()};
});
obf.id_index = 0;

window.obf = obf;

export default obf;
