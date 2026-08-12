import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import contentGrabbers from '../utils/content_grabbers';
import stashes from '../utils/_stashes';
import i18n from '../utils/i18n';
import LingoLinq from '../app';
import utterance from '../utils/utterance';
import speecher from '../utils/speecher';
import capabilities from '../utils/capabilities';
import persistence from '../utils/persistence';
import boundClasses from '../utils/bound_classes';
import Button from '../utils/button';
import Utils from '../utils/misc';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { htmlSafe } from '@ember/template';
import progress_tracker from '../utils/progress_tracker';
import { filterRootBoards, dedupeByName, sortByNameNatural, boardsPagePreferUserNames } from '../utils/board-roots';
import { groupBoardsByBrand } from '../utils/board-brands';

export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  contentGrabbers: service('content-grabbers'),
  tagName: '',

  // True only in the Modern (board-detail) view. The relocated Color/Stash/Word
  // Data nav actions route through editManager's controller, which only defines
  // those actions in board-detail; in Classic (board-alt) board/index lacks
  // open_color_picker (would throw) and its word_data expects an id. Classic
  // never had these items, so gate them on Modern.
  is_modern: computed('appState.currentUser.preferences.board_view_style', function() {
    return this.get('appState.currentUser.preferences.board_view_style') !== 'classic';
  }),
  // Text-position preference (top / bottom / text_only) for the button-mockup
  // previews (header + Color tab) so they render the label/symbol the same way the
  // board does in speak mode. Mirrors board-detail's `button_text_position` default
  // of 'top'. Prefer the referenced communicator's pref; fall back to the editor's.
  button_text_position: computed('appState.referenced_user.preferences.device.button_text_position', 'appState.currentUser.preferences.device.button_text_position', function() {
    return this.get('appState.referenced_user.preferences.device.button_text_position') ||
           this.get('appState.currentUser.preferences.device.button_text_position') || 'top';
  }),
  // Board-wide text-only pref OR this button's per-button text_only flag.
  preview_text_only: computed('button_text_position', 'model.text_only', function() {
    return this.get('button_text_position') == 'text_only' || !!this.get('model.text_only');
  }),
  preview_text_on_top: computed('button_text_position', function() {
    return this.get('button_text_position') == 'top';
  }),

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'button-settings';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    var self = this;
    this.set('ctrlAction', function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        // Append the runtime arguments to any pre-bound ones, then strip a
        // trailing DOM event (click handlers) so it isn't forwarded as a value.
        // Without this, a <BoundSelect> @action callback — invoked as
        // callback(value) — had its value dropped, so updateModel*(value)
        // received undefined and the selected action's pane never rendered.
        // Matches the ctrlAction in copying-board / search-board-jump.
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    });
    this.set('onNothing', function(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      self.send('nothing');
    });
    this.set('ctrlActionEventValue', function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    });
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    var opts = this.get('model');
    var button = opts && opts.button;
    if (!button) { return; }
    button.load_image('remote');
    button.load_sound('remote');
    this.set('board', opts.board);
    this.set('search_locale', this.get('board.locale') || 'en');
    this.set('last_values', null);
    this.set('safe_search', true);
    this.set('model', button);
    button.set('translations_hash', this.get('board').translations_for_button(button.id));
    this.set('handle_updates', true);
    this.set('fresh_picture_url', null);
    contentGrabbers.setup(button, this);
    var _this = this;

    // Size the header button-preview mockup to the ACTUAL board button (its speak-mode
    // width/height). The board is still rendered behind the modal and every grid
    // button is the same size, so measure one and publish its dimensions as CSS vars
    // the preview reads; falls back to the CSS default when no modern board button is
    // on the page. Measured synchronously — the board rendered before this modal opened.
    try {
      var _card = document.querySelector('.md-board-detail-symbol-card');
      if(_card && this.element) {
        var _r = _card.getBoundingClientRect();
        if(_r.width > 1 && _r.height > 1) {
          this.element.style.setProperty('--bs-preview-w', Math.round(_r.width) + 'px');
          this.element.style.setProperty('--bs-preview-h', Math.round(_r.height) + 'px');
        }
      }
    } catch(e) { /* preview keeps its CSS-default size */ }

    if(button.get('folderAction')) { this.load_board_collection(); }
    // Snapshot the button's colors so the Color tab's "Revert Color" can restore
    // them (board-level Discard still reverts everything via a server reload).
    this.set('original_background_color', button.get('background_color'));
    this.set('original_border_color', button.get('border_color'));

    contentGrabbers.check_for_dropped_file();
    // Default to the Quick Actions (help) tab unless the modal was opened
    // targeting a SPECIFIC tab (edit-picture/action jumps set button.state to
    // 'picture'/'action'/etc.). 'general' is the generic open-fallback, not a
    // real target, so treat it as "no target" and land on Quick Actions.
    var state = (button.state && button.state !== 'general') ? button.state : 'help';
    this.set('auto_help', true);
    if(!button.get('level_style')) {
      if(!button.get('level_modifications') || Object.keys(button.get('level_modifications')).length == 0) {
        button.set('level_style', 'none');
      } else {
        var mods = button.get('level_modifications');
        var json = {};
        var hidden_level = null, link_disabled_level = null;
        var advanced = false;
        var strip = function(list) { return (list || []).filter(function(k) { return k != 'hidden' && k != 'link_disabled'; }) };
        for(var idx in mods) {
          if(idx == 'pre') {
            var keys = Object.keys(mods[idx]).sort();
            var extra_keys = strip(keys);
            if(extra_keys.length > 0) {
              advanced = true;
            } else if(mods[idx]['hidden'] != undefined && mods[idx]['hidden'] != true) {
              advanced = true;
            } else if(mods[idx]['link_disabled'] != undefined & mods[idx]['link_disabled'] != true) {
              advanced = true;
            }
            if(advanced) { json[idx] = mods[idx]; }
          } else if(parseInt(idx, 10) > 0) {
            var keys = Object.keys(mods[idx]).sort();
            var extra_keys = strip(keys);
            if(extra_keys.length > 0) {
              advanced = true;
            } else if(mods[idx]['hidden'] != undefined && (hidden_level || mods[idx]['hidden'] !== false)) {
              advanced = true;
            } else if(mods[idx]['link_disabled'] != undefined && (link_disabled_level || mods[idx]['link_disabled'] !== false)) {
              advanced = true;
            } else if(mods[idx]['hidden'] === false) {
              hidden_level = parseInt(idx, 10);
            } else if(mods[idx]['link_disabled'] === false) {
              link_disabled_level = parseInt(idx, 10);
            }
            if(advanced) { json[idx] = mods[idx]; }
          }
        }
        if(advanced) {
          button.set('level_style', 'advanced');
          _this.update_level_json();
        } else if(hidden_level || link_disabled_level) {
          button.set('level_style', 'basic');
          button.set('hidden_level', hidden_level);
          button.set('link_disabled_level', link_disabled_level);
        } else {
          button.set('level_style', 'none');
        }
      }
    }

    this.set('state', state);
    this.set('original_image_license', $.extend({}, button.get('image.license')));
    this.set('original_sound_license', $.extend({}, button.get('sound.license')));

    var fallback = 'personal';
    if(this.get('board.user_name') != this.get('appState').get('currentUser.user_name')) {
      fallback = 'current_user';
    }
    this.set('board_search_type', stashes.get('last_board_search_type') || fallback);
    var unstashed_library = (this.get('appState').get('currentUser') && this.get('appState').get('currentUser').preferred_symbol_library(this.get('board'))) || 'opensymbols';
    var now = (new Date()).getTime();
    var lookup = parseInt(stashes.get('last_image_library_at') || 0, 10);
    if(lookup > (now - (15 * 60 * 1000) && !(stashes.get('last_image_library') || "").match(/required/))) {
      this.set('image_library', stashes.get('last_image_library'));
    } else if(this.get('appState').get('currentUser.preferences.preferred_symbols')) {
      this.set('image_library', unstashed_library);
    }
    this.set('model.image_field', this.get('model.label'));

    this.set('has_supervisees', this.get('appState').get('sessionUser.supervisees.length') > 0 || this.get('appState').get('sessionUser.managed_orgs.length') > 0);
    var _this = this;
    _this.set('premium_symbols', this.get('appState').get('currentUser.subscription.extras_enabled'));
    (this.get('appState').get('currentUser.supervisees') || []).forEach(function(sup) {
      if(sup.user_name == _this.get('board.user_name') && sup.extras_enabled) {
        _this.set('premium_symbols', true);
      }
    });
    _this.set('lessonpix_enabled', false);
    var find_integration = this.get('appState').get('currentUser').find_integration('lessonpix', this.get('board.user_name'));
    find_integration.then(function(res) {
      _this.set('lessonpix_enabled', true);
      if(stashes.get('last_image_library') == 'lessonpix') {
        runLater(function() {
          _this.set('image_library', 'lessonpix');
        });
      }
    }, function(err) {
      if(stashes.get('last_image_library') == 'lessonpix') {
        _this.set('image_library', null);
      }
    });
    this.set_inflection_hashes();
  },
  update_loaded_licenses: observer('model.image.license', 'model.sound.license', function() {
    if(!this.get('original_image_license.type') && this.get('model.image.license.type')) {
      this.set('original_image_license', this.get('model.image.license'))
    }
    if(!this.get('original_sound_license.type') && this.get('model.sound.license.type')) {
      this.set('original_sound_license', this.get('model.sound.license'))
    }
  }),

  _runClosing() {
    stashes.set('last_board_search_type', this.get('board_search_type'));
    contentGrabbers.clear();

    var loc_hash = {nw: 0, n: 1, ne: 2, w: 3, e: 4, sw: 5, s: 6, se: 7};
    if(this.get('inflections_hash')) {
      var any_set = false;
      var list = [];
      var hash = this.get('inflections_hash');
      for(var loc in hash) {
        if(hash[loc] && loc_hash[loc] != null) {
          list[loc_hash[loc]] = hash[loc];
          any_set = true;
        }
      }
      if(any_set) {
        this.set('model.inflections', list);
      } else {
        this.set('model.inflections', null);
      }
    }
    if(this.get('rules_string')) {
      this.set('model.rules', editManager.parse_rules(this.get('rules_string')));
    }
    if(this.get('model.translations')) {
      this.get('model.translations').forEach(function(trans) {
        var hash = emberGet(trans, 'inflections_hash');
        if(hash) {
          var any_set = false;
          var list = [];
          for(var loc in hash) {
            if(hash[loc] && loc_hash[loc] != null) {
              list[loc_hash[loc]] = hash[loc];
              any_set = true;
            }
          }
          if(any_set) {
            emberSet(trans, 'inflections', list);
          } else {
            emberSet(trans, 'inflections', null);
          }
        }
        if(emberGet(trans, 'rules_string')) {
          emberSet(trans, 'rules', editManager.parse_rules(emberGet(trans, 'rules_string')));
        }
        delete trans['rules_string'];
        delete trans['inflections_hash'];
        delete trans['inflections_suggestions'];
      });
    }
    editManager.update_color_key_id();
  },

  willDestroyElement() {
    this._super(...arguments);
    this.onClose = null;
    this.onOpening = null;
    this.onClosing = null;
    if (this.get('model') && this.get('model.id')) {
      this._runClosing();
    }
  },

  labelChanged: observer('model.label', function() {
    if(!this.get('handle_updates')) { return; }
    editManager.change_button(this.get('model.id'), {
      label: this.get('model.label')
    });
  }),
  // The URL field is bound with a plain `set-field model.url`, which updates ONLY the
  // in-modal Button model — it never reached board.buttons the way labelChanged does.
  // board-detail speak mode rebuilds its display buttons from board.buttons (via
  // contextualized_buttons), so an un-synced url meant the tapped button had no url
  // (and, combined with a stale load_board, navigated instead of opening the link).
  // Sync url through change_button so the authoritative board button carries it.
  urlChanged: observer('model.url', function() {
    if(!this.get('handle_updates')) { return; }
    editManager.change_button(this.get('model.id'), {
      url: this.get('model.url')
    });
  }),
  // A URL link can resolve to an in-app popup resource: `resource_from_url`
  // (utils/button.js) sets model.video for a YouTube link and model.book for a Tarheel
  // book. Those popups are what let the link open a video/book PANE in speak mode
  // (app_state.launch_url → inline-video / tarheel) instead of a browser tab. Like
  // urlChanged, sync them to the authoritative board button so select_button's
  // launcher sees the popup and opens the pane rather than window_open-ing the raw URL.
  // Observes `model.video.popup` (and `.start` / `.end`) as well as the object
  // itself: the "Show video in a popup" checkbox and the start/end fields mutate
  // properties ON the video object rather than replacing it, so a reference-only
  // observer never refires and the change would reach board.buttons only by the
  // accident of the two sharing an object identity.
  videoChanged: observer('model.video', 'model.video.popup', 'model.video.start', 'model.video.end', function() {
    if(!this.get('handle_updates')) { return; }
    editManager.change_button(this.get('model.id'), {
      video: this.get('model.video')
    });
  }),
  bookChanged: observer('model.book', function() {
    if(!this.get('handle_updates')) { return; }
    editManager.change_button(this.get('model.id'), {
      book: this.get('model.book')
    });
  }),
  // Folder/link action options edited via `set-field` (model-only) — sync to the
  // authoritative board button so board-detail select_button honors them: home_lock
  // (set the linked board as a temporary home on nav), add_to_vocalization (also add
  // the button to the vocalization box), and link_disabled (skip the link action).
  // link_disabled is also mirrored by update_hidden below; syncing here too keeps
  // board.buttons authoritative for select_button regardless of which path ran.
  linkOptionsChanged: observer('model.home_lock', 'model.add_to_vocalization', 'model.add_vocalization', 'model.link_disabled', function() {
    if(!this.get('handle_updates')) { return; }
    editManager.change_button(this.get('model.id'), {
      home_lock: this.get('model.home_lock'),
      add_to_vocalization: this.get('model.add_to_vocalization'),
      add_vocalization: this.get('model.add_vocalization'),
      link_disabled: this.get('model.link_disabled')
    });
  }),
  update_hidden: observer(
    'model',
    'model.id',
    'model.hidden',
    'model.link_disabled',
    function(obj, attr) {
      var hash = {'model.hidden': 'hidden', 'model.link_disabled': 'link_disabled'};
      var ref = hash[attr];
      var vals = this.get('last_values') || {};
      if(this.get('model.id') && ref) {
        var mod = vals[this.get('model.id')] || {};
        if(mod[ref] == undefined) {
        } else if(mod[ref] != this.get(attr)) {
          Button.set_attribute(this.get('model'), ref, this.get(attr));
        }
        mod[ref] = this.get(attr);
        vals[this.get('model.id')] = mod;
        this.set('last_values', vals);
      }
    }
  ),
  buttonActions: computed(function() {
    var res = [
      {name: i18n.t('talk', "Speak & Add to the vocalization box"), id: "talk"},
      {name: i18n.t('folder', "Open/Link to another board"), id: "folder"},
      {name: i18n.t('link_tab', "Open a web site in a browser tab"), id: "link"},
      {name: i18n.t('launch_app', "Launch an application"), id: "app"}
    ];
    res.push({name: i18n.t('integration', "Activate a connected tool"), id: "integration"});
    return res;
  }),
  book_link_options: computed(function() {
    return [
      {name: i18n.t('large_links', "Large navigation links"), id: 'large'},
      {name: i18n.t('huge_links', "Huge navigation links"), id: 'huge'},
      {name: i18n.t('small_links', "Small navigation links"), id: 'small'}
    ];
  }),
  skin_options: computed(function() {
    return [
      {name: i18n.t('preferred_skin_color', "[ Skin Tone Preference ]"), id: ''},
      {name: i18n.t('user_preferred_tone', "User-Preferred Tone"), id: 'default'},
      {name: "🧑 " + i18n.t('original_tone', "Original Tone"), id: 'original'},
      {name: "🧑🏿 " + i18n.t('dark_skin_tone', "Dark Skin Tone"), id: 'dark'},
      {name: "🧑🏾 " + i18n.t('medium_dark_skin_tone', "Medium-Dark Skin Tone"), id: 'medium-dark'},
      {name: "🧑🏽 " + i18n.t('medium_skin_tone', "Medium Skin Tone"), id: 'medium'},
      {name: "🧑🏼 " + i18n.t('medium_light_skin_tone', "Medium-Light Skin Tone"), id: 'medium-light'},
      {name: "🧑🏻 " + i18n.t('light_skin_tone', "Light Skin Tone"), id: 'light'},
    ];
  }),
  book_background_options: computed(function() {
    return [
      {name: i18n.t('white_background', "White background"), id: 'white'},
      {name: i18n.t('black_background', "Black background"), id: 'black'}
    ];
  }),
  book_text_positioning_options: computed(function() {
    return [
      {name: i18n.t('text_below', "Show text below images"), id: 'text_below'},
      {name: i18n.t('text_above', "Show text above images"), id: 'text_above'}
    ];
  }),
  image_matches_book: computed('book_status.image', 'model.image.source_url', function() {
    return this.get('book_status.image') && this.get('book_status.image') == this.get('model.image.source_url');
  }),
  image_matches_video_thumbnail: computed('model.video.thumbnail_url', 'model.image.source_url', function() {
    return this.get('model.video.thumbnail_url') && this.get('model.video.thumbnail_url') == this.get('model.image.source_url');
  }),
  non_https: computed('model.url', function() {
    return (this.get('model.url') || '').match(/^http:/);
  }),
  // "Also speak & add to the vocalization box" checkbox — reads the EFFECTIVE preference,
  // which activate_button computes as `add_vocalization ?? add_to_vocalization`. Legacy/
  // copied boards persist these bool fields as the STRINGS "true"/"false", so coerce both.
  // Binding the checkbox to model.add_to_vocalization alone showed it UNCHECKED for a
  // button whose value lives in add_vocalization (even though speak & add works). set()
  // writes add_to_vocalization and clears add_vocalization so the field is authoritative
  // going forward; both are synced to board.buttons by linkOptionsChanged.
  speak_and_add: computed('model.add_vocalization', 'model.add_to_vocalization', {
    get() {
      var av = this.get('model.add_vocalization');
      if(av != null) { return av === true || av === 'true'; }
      var atv = this.get('model.add_to_vocalization');
      return atv === true || atv === 'true';
    },
    set(key, value) {
      value = !!value;
      this.set('model.add_vocalization', null);
      this.set('model.add_to_vocalization', value);
      return value;
    }
  }),
  vocalization_sound_conflict: computed('model.vocalization', 'model.sound_id', function() {
    return this.get('model.vocalization') && this.get('model.sound_id');
  }),
  load_book: observer('model.book.id', function() {
    var _this = this;
    var id = _this.get('model.book.id');
    if(id) {
      _this.set('book_status', {loading: true});
      persistence.ajax("/api/v1/search/external_resources?source=tarheel_book&q=" + encodeURIComponent(id), {type: 'GET'}).then(function(list) {
        if(_this.get('model.book.id') == id) {
          var image_page = list.find(function(page) { return !page.small_image; }) || {};
          _this.set('book_status', {
            image: image_page.image,
            content_type: image_page.image_content_type || 'image/jpeg',
            title: list[0].title
          });
        }
      }, function(err) {
        _this.set('book_status', {error: true});
      });
    }
  }),
  tool_action_types: computed(function() {
    return [
      {name: i18n.t('trigger_webhook', "Trigger an external action"), id: 'webhook'},
      {name: i18n.t('render_page', "Load a tool-rendered page"), id: 'render'}
    ];
  }),
  levelTypes: computed(function() {
    return [
      {name: i18n.t('no_levels', "No Level Overrides"), id: 'none'},
      {name: i18n.t('basic_levels', "Basic Level Overrides"), id: 'basic'},
      {name: i18n.t('advanced_levels', "Custom Level Overrides"), id: 'advanced'}
    ];
  }),
  board_levels: computed(function() {
    return LingoLinq.board_levels;
  }),
  basic_level_style: computed('model.level_style', function() {
    return this.get('model.level_style') == 'basic';
  }),
  advanced_level_style: computed('model.level_style', function() {
    return this.get('model.level_style') == 'advanced';
  }),
  update_level_json: observer('model.level_style', function() {
    var button = this.get('model.button') || this.get('model');
    var mods = button.get('level_modifications');
    var json = {};
    for(var idx in mods) {
      if(idx == 'pre' || idx == 'override') {
        json[idx] = mods[idx];
      } else if(parseInt(idx, 10) > 0) {
        json[idx] = mods[idx];
      }
    }
    button.set('level_json', JSON.stringify(json, null, 2));
  }),
  level_overrides: computed('model.level_modifications.override', function() {
    var overrides = this.get('model.level_modifications.override') || {};
    var res = {};
    for(var key in overrides) {
      res[key] = {};
      res[key]["set_" + overrides[key].toString()] = true;
    }
    return res;
  }),
  tool_types: computed('user_integrations', function() {
    var res = [];
    res.push({name: i18n.t('select_tool', "[Select Tool]"), id: null});
    (this.get('user_integrations') || []).forEach(function(tool) {
      res.push({name: tool.get('name'), id: tool.get('id')});
    });
    return res;
  }),
  set_inflection_hashes: function() {
    var inflections = {};
    var inflection_defaults = {};
    var grid_map = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    grid_map.forEach(function(m) {
      inflections[m] = null;
      inflection_defaults[m] = null;
    });
    (this.get('model.inflections') || []).forEach(function(str, idx) {
      if(str && grid_map[idx]) {
        inflections[grid_map[idx]] = str;
      }
    });
    if(this.get('model.translations')) {
      this.get('model.translations').forEach(function(trans) {
        var i = {}, id = {};
        grid_map.forEach(function(m) {
          i[m] = null;
          id[m] = null;
        });
        if(trans.inflections) {
          trans.inflections.forEach(function(str, idx) {
            if(str && grid_map[idx]) {
              i[grid_map[idx]] = str;
            }
          });
        }
        emberSet(trans, 'inflections_hash', i);
        emberSet(trans, 'rules_string', editManager.stringify_rules(trans.rules));
        emberSet(trans, 'inflections_suggestions', id);
      });
    }
    this.set('inflections_hash', inflections);
    this.set('rules_string', editManager.stringify_rules(this.get('model.rules')));
    this.set('inflections_suggestions', inflection_defaults);
  },
  update_integration: observer('integration_id', 'user_integrations', function() {
    var _this = this;
    if(!this.get('user_integrations.length')) { return; }
    if(this.get('integration_id')) {
      var tool = (_this.get('user_integrations') || []).find(function(t) { return t.get('id') == _this.get('integration_id'); });
      if(tool) {
        var action_type = (!tool.get('has_multiple_actions') && tool.get('render')) ? 'render' : 'webhook';
        var local_url = null;
        if(tool.get('button_webhook_local') && tool.get('button_webhook_url')) {
          local_url = tool.get('button_webhook_url');
        }
        _this.set('model.integration', {
          user_integration_id: tool.id,
          local_url: local_url,
          action_type: action_type
        });
        _this.set('selected_integration', tool);
      }
    } else {
      _this.set('selected_integration', null);
      _this.set('model.integration', null);
    }
  }),
  update_integration_id: observer('model.integration.user_integration_id', function() {
    if(!this.get('integration_id') && this.get('model.integration.user_integration_id')) {
      this.set('integration_id', this.get('model.integration.user_integration_id'));
    }
  }),
  missing_library: computed('image_library', function() {
    var res = false;
    if(this.get('image_library') == 'lessonpix_required') {
      res = {lessonpix: true};
    } else if(this.get('image_library') == 'pcs_required') {
      res = {pcs: true};
    } else if(this.get('image_library') == 'symbolstix_required') {
      res = {symbolstix: true};
    }
    return res;
  }),
  current_library: computed('image_library', function() {
    var res = {};
    res[this.get('image_library')] = true;
    return res;
  }),
  search_prompt: computed('model.label', function() {
    return "\"" + this.get('model.label') + "\"" + " or URL or search term";
  }),
  image_libraries: computed('lessonpix_enabled', 'premium_symbols', function() {
    var res = [
      {name: i18n.t('open_symbols_org', "opensymbols.org (default)"), id: 'opensymbols'}
    ];
    if(this.get('lessonpix_enabled') || this.get('premium_symbols')) {
      res.push({name: i18n.t('lessonpix_images', "LessonPix Images"), id: 'lessonpix'});
    }
    if(this.get('premium_symbols')) {
      res.push({name: i18n.t('pcs_images', "PCS (BoardMaker) Symbols by Tobii Dynavox"), id: 'pcs'});
      res.push({name: i18n.t('symbolstix_images', "SymbolStix Symbols"), id: 'symbolstix'});
    }
    if(window.flickr_key) {
      res.push({name: i18n.t('flickr', "Flickr Creative Commons"), id: 'flickr'});
    }
    if(window.custom_search_key) {
      res.push({name: i18n.t('public_domain', "Public Domain Images"), id: 'public_domain'});
    }
    if(window.pixabay_key) {
      res.push({name: i18n.t('pixabay_photos', "Pixabay Photos"), id: 'pixabay_photos'});
      res.push({name: i18n.t('pixabay_vectors', "Pixabay Vector Images"), id: 'pixabay_vectors'});
    }
    if(window.giphy_key) {
      res.push({name: i18n.t('giphy_asl', "GIPHY ASL Signs"), id: 'giphy_asl'});
    }
    if(!this.get('lessonpix_enabled') && !this.get('premium_symbols')) {
      res.push({name: i18n.t('lessonpix_images', "LessonPix Images"), id: 'lessonpix_required'});
    }
    if(!this.get('premium_symbols')) {
      res.push({name: i18n.t('pcs_images', "PCS (BoardMaker) Symbols by Tobii Dynavox"), id: 'pcs_required'});
      res.push({name: i18n.t('symbolstix_images', "SymbolStix Symbols"), id: 'symbolstix_required'});
    }
    // res.push({name: i18n.t('tawasol', "Tawasol"), id: 'tawasol'});

//    res.push({name: i18n.t('openclipart', "OpenClipart"), id: 'openclipart'});

    if(res.length == 1) { return []; }
    return res;
  }),
  export_formats: computed(function() { return []; }),
  print_sizes: computed(function() { return []; }),
  audio_delay_options: computed(function() { return []; }),
  integration_user_actions: computed(function() { return []; }),
  feature_toggle_options: computed(function() { return []; }),
  toggle_options: computed(function() { return []; }),
  block_toggle_options: computed(function() { return []; }),
  random_sources: computed(function() { return []; }),
  random_actions: computed(function() { return []; }),
  toggle_speak_mode_options: computed(function() { return []; }),
  gaze_options: computed(function() { return []; }),
  integration: alias('selected_integration'),
  load_user_integrations: observer(
    'model.integrationOrWebhookAction',
    'model.integration_user_id',
    function() {
      var user_id = this.get('model.integration_user_id') || 'self';
      var _this = this;
      if(this.get('model.integrationOrWebhookAction')) {
        if(!this.get('user_integrations.length')) {
          _this.set('user_integrations', {loading: true});
          Utils.all_pages('integration', {user_id: user_id, for_button: true}, function() {
          }).then(function(res) {
            _this.set('user_integrations', res);
          }, function(err) {
            _this.set('user_integrations', {error: true});
          });
        }
      } else {
        _this.set('user_integrations', []);
      }
    }
  ),
  parts_of_speech: computed(function() {
    return LingoLinq.parts_of_speech;
  }),
  licenseOptions: computed(function() {
    return LingoLinq.licenseOptions;
  }),
  board_search_options: computed('board.user_name', function() {
    var res = [];
    if(this.get('board.user_name') != this.get('appState').get('currentUser.user_name')) {
      res.push({name: i18n.t('their_boards', "This User's Boards"), id: 'current_user'});
      res.push({name: i18n.t('public_boards', "Public Boards"), id: 'public'});
      res.push({name: i18n.t('their_starred_boards', "This User's Liked Boards"), id: 'current_user_starred'});
      res.push({name: i18n.t('my_public_boards', "My Public Boards"), id: 'personal_public'});
      res.push({name: i18n.t('my_liked_public_boards', "My Liked Public Boards"), id: 'personal_public_starred'});
      res.push({name: i18n.t('all_my_boards_includes_shared', "All My Boards"), id: 'personal'});
      // TODO: add My Private Boards, but warn and have option to auto-share if selected
    } else {
      res.push({name: i18n.t('my_boards_includes_shared', "My Boards"), id: 'personal'});
      res.push({name: i18n.t('public_boards', "Public Boards"), id: 'public'});
      res.push({name: i18n.t('my_starred_boards', "My Liked Boards"), id: 'personal_starred'});
    }
    return res;
  }),
  inflection_overrides_placeholder: computed(function() {
    return htmlSafe(i18n.t('inflection_overrides_examples', "any inflection overrides, such as:\nI want=something\nhe (verb)=:pointer_id\nI [like|hate]=:favorites_link (a pointer id)\nsomething=_text only result (no image)\nsome &words=wordless (remove ampersanded words)\n:shift_id=manual inflection"));
  }),
  webcam_unavailable: computed(function() {
    return !contentGrabbers.pictureGrabber.webcam_available();
  }),
  recorder_unavailable: computed(function() {
    return !contentGrabbers.soundGrabber.recorder_available();
  }),
  notSetPrivateImageLicense: observer(
    'image_preview',
    'image_preview.license.type',
    'model.image.license.type',
    function() {
      if(this.get('image_preview.license')) {
        this.set('image_preview.license.private', this.get('image_preview.license.type') == 'private');
      }
      if(this.get('model.image.license')) {
        this.set('model.image.license.private', this.get('model.image.license.type') == 'private');
      }
    }
  ),
  notSetPrivateSoundLicense: observer(
    'sound_preview',
    'sound_preview.license.type',
    'model.sound.license',
    'model.sound.license.type',
    function() {
      if(this.get('sound_preview.license')) {
        this.set('sound_preview.license.private', this.get('sound_preview.license.type') == 'private');
      }
      if(this.get('model.sound.license')) {
        this.set('model.sound.license.private', this.get('model.sound.license.type') == 'private');
      }
    }
  ),
  generateButtonStyle: observer('model.background_color', 'model.border_color', function() {
    boundClasses.add_rule({
      background_color: this.get('model.background_color'),
      border_color: this.get('model.border_color')
    });
    boundClasses.add_classes(this.get('model'));
  }),
  focus_on_state_change: observer('state', function() {
    var _this = this;
    runLater(function() {
      var $elem = $(".modal-body:visible .content :input:visible:not(button):not(.skip_select):first");
      $elem.focus().select();
    });
  }),
  re_find: observer('board_search_type', function() {
    if(this.get('linkedBoardName')) {
      this.send('find_board');
    }
  }),

  // ── Board-collection picker (destination card) ─────────────────────
  // Mirrors the Find Boards page's left panel (.md-board-collection): loads the
  // user's own boards plus the public/community catalog, groups the latter by
  // brand family (Quick Core / Vocal Flair / …) via groupBoardsByBrand, and
  // filters client-side by panel_filter — same shaping the search page uses.
  panel_filter: '',
  _collection_filter_boards: function(boards) {
    var q = (this.get('panel_filter') || '').trim().toLowerCase();
    if(!q || !boards) { return boards || []; }
    return boards.filter(function(b) {
      if(!b) { return false; }
      var name = ((b.get ? b.get('name') : b.name) || '').toLowerCase();
      var key = ((b.get ? b.get('key') : b.key) || '').toLowerCase();
      return name.indexOf(q) !== -1 || key.indexOf(q) !== -1;
    });
  },
  collection_my_boards: computed('collection_personal_results.results', 'panel_filter', 'appState.currentUser.id', function() {
    var boards = filterRootBoards(this.get('collection_personal_results.results') || [], this.get('appState.currentUser.id'));
    return this._collection_filter_boards(boards);
  }),
  collection_online_groups: computed('collection_online_results.results', function() {
    var online = this.get('collection_online_results');
    if(!online || !online.results) { return []; }
    return groupBoardsByBrand(online.results);
  }),
  collection_online_filtered: computed('collection_online_groups', 'panel_filter', function() {
    var _this = this;
    return (this.get('collection_online_groups') || []).map(function(g) {
      return { id: g.id, label_key: g.label_key, default_label: g.default_label, boards: _this._collection_filter_boards(g.boards || []) };
    }).filter(function(g) { return g.boards.length > 0; });
  }),
  collection_loading: computed('collection_online_results.loading', 'collection_personal_results.loading', function() {
    return !!(this.get('collection_online_results.loading') || this.get('collection_personal_results.loading'));
  }),
  collection_empty: computed('collection_loading', 'collection_my_boards.length', 'collection_online_filtered.length', function() {
    return !this.get('collection_loading') && !this.get('collection_my_boards.length') && !this.get('collection_online_filtered.length');
  }),
  load_board_collection: function() {
    var _this = this;
    if(!persistence.get('online')) {
      _this.set('collection_online_results', {results: []});
      _this.set('collection_personal_results', {results: []});
      return;
    }
    _this.set('collection_online_results', {loading: true, results: []});
    _this.set('collection_personal_results', {loading: true, results: []});
    var locale = (this.get('board.locale') || (i18n.langs || {}).preferred || window.navigator.language || 'en').split(/-/)[0];
    var prefer = boardsPagePreferUserNames(this.get('appState'));
    LingoLinq.store.query('board', {q: '', locale: locale, sort: 'popularity'}).then(function(res) {
      if(_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
      _this.set('collection_online_results', {results: dedupeByName(sortByNameNatural(res.slice()), { preferUserNames: prefer })});
    }, function() {
      if(_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
      _this.set('collection_online_results', {results: []});
    });
    var userId = this.get('appState.currentUser.id');
    if(userId) {
      LingoLinq.store.query('board', {q: '', user_id: userId, locale: locale, allow_job: true}).then(function(res) {
        if(_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        if(res.meta && res.meta.progress) {
          progress_tracker.track(res.meta.progress, function(event) {
            if(_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
            if(event.status == 'errored') {
              _this.set('collection_personal_results', {results: []});
            } else if(event.status == 'finished') {
              var result = [];
              event.result.board.forEach(function(board) {
                result.push(LingoLinq.store.push({ data: { id: board.id, type: 'board', attributes: board }}));
              });
              _this.set('collection_personal_results', {results: sortByNameNatural(result)});
            }
          });
        } else {
          _this.set('collection_personal_results', {results: sortByNameNatural(res.slice())});
        }
      }, function() {
        if(_this.get('isDestroyed') || _this.get('isDestroying')) { return; }
        _this.set('collection_personal_results', {results: []});
      });
    } else {
      _this.set('collection_personal_results', {results: []});
    }
  },
  // Load the collection the first time the folder pane is shown (observers don't
  // fire on init, so didInsertElement also kicks this when the button starts as
  // a folder button).
  maybe_load_collection: observer('model.folderAction', function() {
    if(this.get('model.folderAction') && !this.get('collection_personal_results') && !this.get('collection_online_results')) {
      this.load_board_collection();
    }
  }),
  // Bring the SELECTED/SELECTING BOARD card into view after a pick renders.
  // Double rAF waits past Ember's render flush (avoids the runloop scheduler).
  _scroll_to_selected_card: function() {
    var raf = window.requestAnimationFrame;
    if(!raf) { return; }
    raf(function() {
      raf(function() {
        var root = document.getElementById('button_settings');
        var el = root && root.querySelector('.md-bs-card--selected');
        if(!el) { return; }
        // Find the nearest scrollable ancestor (the modal's scroll region) and
        // scroll it all the way to the bottom so the SELECTED/SELECTING card and
        // its actions are fully in view.
        var node = el.parentElement;
        var container = null;
        while(node && node !== document.body) {
          var oy = window.getComputedStyle(node).overflowY;
          if((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 1) {
            container = node;
            break;
          }
          node = node.parentElement;
        }
        if(container) {
          if(container.scrollTo) { container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }); }
          else { container.scrollTop = container.scrollHeight; }
        } else if(el.scrollIntoView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });
    });
  },
  state: 'general',
  helpState: computed('state', function() {
    return this.get('state') == 'help';
  }),
  generalState: computed('state', function() {
    return this.get('state') == 'general';
  }),
  colorState: computed('state', function() {
    return this.get('state') == 'color';
  }),
  // Standard fill+border swatches (window.LingoLinq.keyed_colors, decorated with a
  // `style` string by the color_keys initializer).
  color_swatches: computed(function() {
    return LingoLinq.keyed_colors || (window.LingoLinq && window.LingoLinq.keyed_colors) || [];
  }),
  // Hex values for the native <input type="color"> custom pickers. The button
  // stores colors as rgb()/hex strings; convert for the picker, which needs hex.
  custom_fill_hex: computed('model.background_color', function() {
    try { return window.tinycolor(this.get('model.background_color') || '#ffffff').toHexString(); }
    catch(e) { return '#ffffff'; }
  }),
  custom_border_hex: computed('model.border_color', function() {
    try { return window.tinycolor(this.get('model.border_color') || '#cccccc').toHexString(); }
    catch(e) { return '#cccccc'; }
  }),
  pictureState: computed('state', function() {
    return this.get('state') == 'picture';
  }),
  actionState: computed('state', function() {
    return this.get('state') == 'action';
  }),
  soundState: computed('state', function() {
    return this.get('state') == 'sound';
  }),
  languageState: computed('state', function() {
    return this.get('state') == 'language';
  }),
  extrasState: computed('state', function() {
    return this.get('state') == 'extras';
  }),
  modifiers: computed('model.vocalization', function() {
    var voc = (this.get('model.vocalization') || "");
    if(!voc || !voc.match(/^(:|\+)/)) {
      if(!voc.match(/\&\&/) && !voc.match(/:/)) {
        return null;
      }
    }
    var parts = voc.split(/\s*&&\s*/);
    var list = [];
    var any_basic = false;
    parts.forEach(function(part) {
      var special = LingoLinq.find_special_action(part);
      if(special && !special.completion) {
        var description = "unknown";
        if(special.description) {
          description = special.description;
        } else if(special.description_callback) {
          description = special.description_callback(part.match(special.match));
        } else {
          description = special.action;
        }

        if(special.modifier) {
          any_basic = true;
          list.push({modifier: part, basic: true, special: description});
        } else {
          list.push({modifier: part, special: description});
        }
      } else if(part.match(/^\+/)) {
        list.push({basic: true, modifier: part});
        any_basic = true;
      } else if(part == ':space') {
        list.push({modifier: part, basic: true, special: i18n.t('finish_word', "Finish the current word")});
      } else if(part.match(/^\:[^\s\&]+$/)) {
        list.push({modifier: part + " (??)"});
      } else {
        var re = /:[^\s\&]+/g;
        var match = null;
        var matches = [];
        while((match = re.exec(part)) != null) {
          matches.unshift(match);
        }
        var orig = part;
        if(matches.length > 0) {
          matches.forEach(function(match) {
            var action = LingoLinq.find_special_action(match[0]);
            if(action && action.inline_description) {
              var desc = action.inline_description.toString();
              if(action.inline_description.call) {
                if(action.match) {
                  desc = action.inline_description(match[0].match(action.match));
                } else {
                  desc = action.inline_description(match[0]);
                }                
              }
              part = part.slice(0, match.index) + "[" + desc + "]" + part.slice(match.index + match[0].length);
            } else {
            }
          });
        }
        list.push({text: part, original: orig, matches: matches});
      }
    });
    if(any_basic) {
      emberSet(list, 'any_basic', true);
    } else {
      emberSet(list, 'none_basic', true);
    }
    return list;
  }),
  ios_search: computed('app_find_mode', function() {
    return this.get('app_find_mode') == 'ios' || !this.get('app_find_mode');
  }),
  android_search: computed('app_find_mode', function() {
    return this.get('app_find_mode') == 'android';
  }),
  web_search: computed('app_find_mode', function() {
    return this.get('app_find_mode') == 'web';
  }),
  track_video: observer('model.video.popup', 'model.video.test_url', function() {
    if(this.get('model.video.popup') && this.get('model.video.test_url') && !this.get('player')) {
      var _this = this;
      LingoLinq.Videos.track('link_video_preview').then(function(player) {
        _this.set('player', player);
      }, function() {
        // LingoLinq.Videos.track rejects with "player never initialized" 5s after a
        // preview iframe that never loads a player (offline, blocked embed, or the
        // modal closed first). Without a rejection handler that surfaces as an
        // UNHANDLED rejection: harmless at runtime, but under test QUnit attributes
        // it to whichever unrelated test happens to be running 5s later, which reads
        // as a random failing test somewhere else in the suite. Nothing to do but
        // leave `player` unset — the preview simply stays inert.
      });
    }
  }),
  video_test_url: computed(
    'model.video.id',
    'model.video.type',
    'model.video.start',
    'model.video.end',
    function() {
      var host = capabilities.video_player_host();
      if(this.get('model.video.id') && this.get('model.video.type')) {
        return host + "/videos/" + this.get('model.video.type') + "/" + this.get('model.video.id') + "?testing=true&start=" + (this.get('model.video.start') || '') + "&end=" + (this.get('model.video.end') || '');
      } else {
        return null;
      }
    }
  ),
  ios_status_class: computed('model.apps.ios', function() {
    var res = "glyphicon ";
    if(this.get('model.apps.ios')) {
      res = res + "glyphicon-check ";
    } else {
      res = res + "glyphicon-unchecked ";
    }
    return res;
  }),
  android_status_class: computed('model.apps.android', function() {
    var res = "glyphicon ";
    if(this.get('model.apps.android')) {
      res = res + "glyphicon-check ";
    } else {
      res = res + "glyphicon-unchecked ";
    }
    return res;
  }),
  web_status_class: computed('model.apps.web.launch_url', function() {
    var res = "glyphicon ";
    if(this.get('model.apps.web.launch_url')) {
      res = res + "glyphicon-check ";
    } else {
      res = res + "glyphicon-unchecked ";
    }
    return res;
  }),
  fake_button_class: computed('model.display_class', function() {
    var res = "fake_button ";
    if(this.get('model.display_class')) {
      res = res + this.get('model.display_class') + " ";
    }
    return res;
  }),
  webcam_class: computed('webcam.snapshot', function() {
    var res = "button_image ";
    if(this.get('webcam.snapshot')) {
      res = res + "hidden ";
    } else {
      res = res + "shown ";
    }
    return res;
  }),
  locales: computed('board.locale', function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('english', "English"), id: 'en'}];
    var short_locale = (this.get('board.locale') || "").split(/-|_/)[0].toLowerCase();
    if(short_locale) {
      for(var key in list) {
        if(key == short_locale && key != 'en') {
          res.push({name: list[key], id: key});
        }
      }
    }
    return res;
  }),
  multi_locales: computed('locales', function() {
    return (this.get('locales') || []).length > 1;
  }),
  premium_symbol_library: computed('image_library', function() {
    return ['lessonpix', 'pcs', 'symbolstix'].indexOf(this.get('image_library')) != -1;
  }),
  show_libraries: computed(
    'image_search.previews',
    'image_search.previews_loaded',
    'image_search.error',
    function() {
      return true;
  //     var previews = this.get('image_search.previews');
  //     return (previews && previews.length > 0) || this.get('image_search.previews_loaded') || this.get('image_search.error');
    }
  ),
  // Switch the button's action TYPE, clearing every OTHER action field.
  // The button's action is DERIVED from its fields (utils/button.js `updateAction`,
  // which prioritizes load_board over url/apps/integration), and board-detail's
  // `select_button` navigates ANY button that still has a load_board. So switching the
  // action type MUST clear the conflicting fields — otherwise a stale field wins.
  // Reported bug: a folder button switched to "Open a web site in a browser tab" kept
  // its load_board, so tapping it navigated to the old board (404 → "player never
  // initialized") instead of opening the URL; and once the user typed the URL,
  // updateAction re-fired and (load_board still set) reset buttonAction back to 'folder'.
  // Single source of truth for BOTH entry points — the action dropdown
  // (updateModelButtonAction) and the "Quick actions" shortcuts (quick_action). Update
  // the model AND the board's button data (editManager) so speak-mode select_button sees
  // the cleared fields, then re-assert buttonAction LAST because clearing a field re-fires
  // updateAction (which would otherwise reset buttonAction to the newly-derived value).
  _apply_button_action: function(value) {
    var _this = this;
    var id = this.get('model.id');
    var clears = {};
    if(value !== 'folder')      { clears.load_board = null; }
    if(value !== 'link')        { clears.url = null; }
    if(value !== 'app')         { clears.apps = null; }
    if(value !== 'integration') { clears.integration = null; }
    Object.keys(clears).forEach(function(k) { _this.set('model.' + k, clears[k]); });
    if(id && Object.keys(clears).length) { editManager.change_button(id, clears); }
    this.set('model.buttonAction', value);
  },
  actions: {
    updateHideLabel(checked) {
      if(!this.get('handle_updates') || !this.get('model.id')) { return; }
      this.set('model.hide_label', !!checked);
      editManager.change_button(this.get('model.id'), { hide_label: !!checked });
    },
    updateTextOnly(checked) {
      if(!this.get('handle_updates') || !this.get('model.id')) { return; }
      this.set('model.text_only', !!checked);
      editManager.change_button(this.get('model.id'), { text_only: !!checked });
    },
    // Quick actions (left nav, below Extras) relocated from the removed per-button
    // edit menu. Each closes THIS modal, then (on the next runloop, so the close
    // settles before the color picker / word-data modal opens) runs the matching
    // board-detail action for the CURRENT button via editManager's controller —
    // self-contained, so it also works after in-modal button navigation.
    _run_button_action: function(action_name) {
      var button = this.get('model');
      modal.close();
      runLater(null, function() {
        var ctrl = editManager.get('controller');
        if(ctrl && button) { ctrl.send(action_name, button); }
      }, 0);
    },
    color_button: function() { this.send('_run_button_action', 'open_color_picker'); },
    stash_this_button: function() { this.send('_run_button_action', 'stash_button'); },
    word_data_this_button: function() { this.send('_run_button_action', 'word_data'); },
    updateModelPartOfSpeech(value) { this.set('model.part_of_speech', value); },
    updateImageLibrary(value) { this.set('image_library', value); },
    updateSkinPreference(value) { this.set('skin_preference', value); },
    updateModelButtonAction(value) {
      // Action dropdown (BoundSelect) → shared action-switch logic (clears conflicting
      // fields; see _apply_button_action). The Quick-actions shortcuts route here too.
      this._apply_button_action(value);
    },
    updateBoardSearchType(value) { this.set('board_search_type', value); },
    updatePendingBoardForUserId(value) {
      var p = this.get('pending_board');
      if (p) { p.set('for_user_id', value); }
    },
    updateModelIntegrationUserId(value) { this.set('model.integration_user_id', value); },
    updateIntegrationId(value) {
      var id = value && typeof value.get === 'function' ? value.get('id') : value;
      this.set('integration_id', id);
    },
    updateIntegrationAccount(value) { this.set('integration_account', value); },
    updateIntegrationFieldValue(field, value) { if (field) { field.set('value', value); } },
    updateIntegrationFieldLocale(field, value) { if (field) { field.set('locale', value); } },
    updateIntegrationGroup(value) { this.set('integration_group', value); },
    updateModelExportFormat(value) { this.set('model.export_format', value); },
    updateModelPrintSize(value) { this.set('model.print_size', value); },
    updateModelAudioDelay(value) { this.set('model.audio_delay', value); },
    updateModelIntegrationUserActionKey(value) { this.set('model.integration_user_action_key', value); },
    updateModelFeatureToggleKey(value) { this.set('model.feature_toggle_key', value); },
    updateModelToggleAction(value) { this.set('model.toggle_action', value); },
    updateModelBlockAction(value) { this.set('model.block_action', value); },
    updateModelRandomSource(value) { this.set('model.random_source', value); },
    updateModelRandomAction(value) { this.set('model.random_action', value); },
    updateModelToggleSpeakMode(value) { this.set('model.toggle_speak_mode', value); },
    updateModelGazeAction(value) { this.set('model.gaze_action', value); },
    updateModelLevelStyle(value) { this.set('model.level_style', value); },
    updateModelHiddenLevel(value) { this.set('model.hidden_level', value); },
    updateModelLinkDisabledLevel(value) { this.set('model.link_disabled_level', value); },
    opening() {},
    closing() {},
    set_volume: function(act) {
      if (capabilities.set_volume) {
        capabilities.set_volume(act);
      }
    },
    nothing: function() {
      // I had some forms that were being used mainly for layout and I couldn't
      // figure out other than this how to get them to stop submitting when the
      // enter key was hit in some text fields. Weird thing was it wasn't all text
      // fields..
    },
    toggle_color: function(type) {
      var $elem = $("#" + type);

      if(!$elem.hasClass('minicolors-input')) {
        $elem.minicolors();
      }
      if($elem.next().next(".minicolors-panel:visible").length > 0) {
        $elem.minicolors('hide');
      } else {
        $elem.minicolors('show');
      }
    },
    move: function(direction) {
      var _this = this;
      var row = null, col = null;
      var board = this.get('board');
      var new_button_id = null;
      var old_button_id = this.get('model.id');
      var grid = editManager.get('controller.ordered_buttons') || this.get('board.grid.order') || [];
      grid.forEach(function(list, r) {
        (list || []).forEach(function(button_id, c) {
          button_id = emberGet(button_id, 'id') || button_id;
          if(button_id != null && old_button_id != undefined && button_id.toString() == old_button_id.toString()) {
            row = r;
            col = c;
          }
        })
      })
      if(row !== null && col !== null) {
        if(direction == 'up') {
          new_button_id = (grid[row - 1] || [])[col];
        } else if(direction == 'down') {
          new_button_id = (grid[row + 1] || [])[col];
        } else if(direction == 'right') {
          new_button_id = grid[row][col + 1];
        } else if(direction == 'left') {
          new_button_id = grid[row][col - 1];
        }
      }
      if(new_button_id) {
        new_button_id = emberGet(new_button_id, 'id') || new_button_id;
        var modalService = _this.get('modal');
        var openNextButtonSettings = function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          modalService.close();
          runLater(function() {
            if (_this.isDestroyed || _this.isDestroying) { return; }
            var button = editManager.find_button(new_button_id);
            if(!button) { return; }
            button.state = 'general';
            modalService.open('button-settings', {button: button, board: board});
          }, 100);
        };
        var onSaveFailure = function() {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          modal.error(i18n.t('error_saving_content', "There was an error saving content, please try again"));
        };
        _this.get('contentGrabbers').save_pending().then(openNextButtonSettings, onSaveFailure);
      }
    },
    setState: function(state) {
      this.set('state', state);
    },
    clear_button: function() {
      var _this = this;
      _this.set('show_clear_confirm', true);
    },
    confirm_clear_button: function() {
      editManager.clear_button(this.get('model.id'));
      this.set('show_clear_confirm', false);
      this.get('modal').close(true);
    },
    cancel_clear_button: function() {
      this.set('show_clear_confirm', false);
    },
    clear_override: function(attr) {
      var button = this.get('model');
      var mods = button.get('level_modifications');
      if(!mods) { return; }
      if(mods.override && mods.override[attr] != undefined) {
        delete mods.override[attr];
      }
      if(Object.keys(mods.override).length == 0) {
        delete mods.override;
      }
      button.set('level_modifications', Object.assign({}, mods));
    },
    swapButton: function() {
      editManager.prep_for_swap(this.get('model.id'));
      this.get('modal').close(true);
    },
    stash_button: function() {
      editManager.stash_button(this.get('model.id'));
      this.set('stashed', true);
    },
    webcamPicture: function() {
      contentGrabbers.pictureGrabber.start_webcam();
    },
    swapStreams: function() {
      contentGrabbers.pictureGrabber.swap_streams();
    },
    webcamToggle: function(takePic) {
      // toggle_webcam() is a pure toggle on webcam.snapshot (capture ⇄ clear); the
      // modal re-fire's duplicate click would CAPTURE then immediately CLEAR the photo.
      // De-dupe HERE (not by swallowing the native click — that breaks the
      // getUserMedia gesture on the "Take photo" open). Ignore a repeat within 250ms.
      var now = Date.now();
      if(this._lastWebcamToggle && (now - this._lastWebcamToggle) < 250) { return; }
      this._lastWebcamToggle = now;
      contentGrabbers.pictureGrabber.toggle_webcam(!takePic);
    },
    find_board: function() {
      contentGrabbers.boardGrabber.find_board();
    },
    build_board: function() {
      contentGrabbers.boardGrabber.build_board();
    },
    plus_minus: function(direction, attribute) {
      var value = parseInt(this.get(attribute), 10);
      if(direction == 'minus') {
        value = value - 1;
      } else {
        value = value + 1;
      }
      value = Math.min(Math.max(1, value), 20);
      this.set(attribute, value);
    },
    cancel_build_board: function() {
      contentGrabbers.boardGrabber.cancel_build_board();
    },
    shareFoundBoard: function(board) {
      contentGrabbers.boardGrabber.share_board(board);
    },
    clear_confirm_board: function() {
      // "Change" from the choose card: drop the pending board so the user can
      // pick another from the collection (still shown above), and scroll back
      // up to it.
      this.set('confirm_found_board', null);
      this.set('linkedBoardName', null);
      var raf = window.requestAnimationFrame;
      if(raf) {
        raf(function() {
          raf(function() {
            var root = document.getElementById('button_settings');
            var el = root && root.querySelector('.md-bs-card--destination');
            if(el && el.scrollIntoView) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          });
        });
      }
    },
    pick_color: function(color) {
      // In-memory only (so board Discard reverts it). The button's add_classes
      // observer re-renders the live board tile from these.
      if(!color) { return; }
      this.set('model.background_color', color.fill);
      this.set('model.border_color', color.border);
    },
    revert_color: function() {
      this.set('model.background_color', this.get('original_background_color'));
      this.set('model.border_color', this.get('original_border_color'));
    },
    set_custom_fill: function(value) { this.set('model.background_color', value); },
    set_custom_border: function(value) { this.set('model.border_color', value); },
    preview_confirm_board: function(board) {
      // Open the read-only Board Preview overlay for the board being confirmed.
      // 'return' → the preview shows a single Close that returns to this modal
      // (see board-preview return_only). The modal stays open underneath.
      if(!board) { return; }
      board.preview_option = 'return';
      var locale = (board.get ? board.get('locale') : board.locale);
      modal.board_preview(board, locale, false, null);
    },
    selectFoundBoard: function(board, force) {
      contentGrabbers.boardGrabber.pick_board(board, force);
      // Picking sets confirm_found_board (community board) or load_board (own
      // board); either way the SELECTED/SELECTING BOARD card is what the user
      // needs to see next, so scroll it into view once it has rendered.
      this._scroll_to_selected_card();
    },
    change_linked_board: function() {
      // "Change" → go back to the picker. Clear the link on the modal's model
      // DIRECTLY so {{#unless model.load_board.key}} re-renders the destination
      // picker even if editManager.find_button resolves a different instance,
      // AND via editManager so the board grid + persistence stay in sync.
      this.set('model.load_board', null);
      editManager.change_button(this.get('model.id'), { load_board: null });
      // Clearing load_board fires button.js's updateAction observer, which resets
      // buttonAction to 'talk' (no action props left). Re-assert 'folder' LAST so
      // the destination picker stays shown instead of flipping to the Speech pane.
      this.set('model.buttonAction', 'folder');
      this.set('linkedBoardName', null);
      this.set('confirm_found_board', null);
      // Make sure the collection is populated when we return to the picker.
      if(this.get('model.folderAction') && !this.get('collection_personal_results') && !this.get('collection_online_results')) {
        this.load_board_collection();
      }
    },
    copy_found_board: function() {
      contentGrabbers.boardGrabber.copy_found_board();
    },
    create_board: function() {
      contentGrabbers.boardGrabber.create_board({source_id: this.get('board.id')});
    },
    set_alternate: function() {
      var library = this.get('image_library');
      if(library == 'original') { library = 'opensymbols'; }
      var editor = this.get('image_preview');
      if(editor) {
        var alternate = {
          library: library,
          url: editor.url,
          license: editor.license,
          content_type: editor.content_type
        }
        contentGrabbers.pictureGrabber.set_alternate(alternate);
        contentGrabbers.pictureGrabber.clear();  
      }
    },
    clearImageWork: function() {
      contentGrabbers.pictureGrabber.clear();
    },
    clear_image_preview: function() {
      contentGrabbers.pictureGrabber.clear_image_preview();
    },
    clear_sound_work: function() {
      contentGrabbers.soundGrabber.clear_sound_work();
    },
    clear_sound: function() {
      this.set('model.sound', null);
      this.set('model.sound_id', null);
    },
    pick_preview: function(preview) {
      contentGrabbers.pictureGrabber.pick_preview(preview);
    },
    set_locale: function(loc) {
      this.set('search_locale', loc);
    },
    find_picture: function() {
      var text = this.get('model.image_field');
      if(!text) {
        this.set('model.image_field', this.get('model.label'));
        text = this.get('model.label');
      }
      if(this.get('image_library') == this.get('appState').get('currentUser').preferred_symbol_library(this.get('board'))) {
        stashes.persist('last_image_library', null);
        stashes.persist('last_image_library_at', null);  
      } else {
        stashes.persist('last_image_library', this.get('image_library'));
        stashes.persist('last_image_library_at', (new Date()).getTime());  
      }
      var locale = this.get('search_locale') || this.get('board.button_locale') || this.get('board.locale') || 'en';
      contentGrabbers.pictureGrabber.find_picture(text, this.get('board.user_name'), locale);
    },
    set_as_button_image: function(url, content_type) {
      var _this = this;
      var preview = {
        url: url,
        content_type: content_type,
        protected: false
      };

      var save = contentGrabbers.pictureGrabber.save_image_preview(preview);

      var id = _this.get('model.id');
      save.then(function(image) {
        image.set('source_url', url);
        var button = editManager.find_button(id);
        if(_this.get('model.id') == id && button) {
          emberSet(button, 'image_id', image.id);
          emberSet(button, 'image', image);
        }
      }, function() {
        alert('nope');
      });
    },
    edit_image_preview: function() {
      contentGrabbers.pictureGrabber.edit_image_preview();
    },
    edit_image: function() {
      contentGrabbers.pictureGrabber.edit_image();
    },
    word_art: function() {
      var text = this.get('model.image_field') || this.get('model.vocalization') || this.get('model.label');
      contentGrabbers.pictureGrabber.word_art(text);
    },
    clear_image: function() {
      contentGrabbers.pictureGrabber.clear_image();
    },
    select_image_preview: function(url) {
      contentGrabbers.pictureGrabber.select_image_preview(url);
    },
    library_options: function() {
      // The modal's AAC pointer layer (raw_events.modalDialogClickRelease) re-fires a
      // synthetic click on top of the native one, so a plain toggle flips ON then OFF
      // and appears to do nothing. De-dupe the duplicate HERE (at the action) — NOT by
      // swallowing the native click, which breaks user-gesture-gated actions like
      // getUserMedia / the file picker that need the trusted native click. Ignore a
      // repeat call within 250ms.
      var now = Date.now();
      if(this._lastLibToggle && (now - this._lastLibToggle) < 250) { return; }
      this._lastLibToggle = now;
      this.set('show_library_options', !this.get('show_library_options'));
    },
    testVocalization: function() {
      // TODO: this doesn't handle multi-part vocaliations well
      // like "what the && :beep"
      var text = this.get('model.vocalization') || this.get('model.label');
      if(this.get('modifiers.length')) {
        var pre = null;
        if(this.get('modifier_text')) {
          pre = Button.create({label: this.get('modifier_text')});
        }
        var chunks = [];
        this.get('modifiers').forEach(function(mod) {
          if(mod.basic) {
            if(pre) {
              pre.set('in_progress', true);
              var b = utterance.modify_button(pre, Button.create({label: mod.modifier}));
              pre = null;
              chunks.push({text: b.label});
            } else {
              chunks.push({text: b.label});
            }
          } else if(!mod.modifier) {
            var str = mod.original || mod.text;
            if(mod.matches) {
              var inline_actions = [];
              mod.matches.forEach(function(match) {
                var action = LingoLinq.find_special_action(match[0]);
                if(action) {
                  action = Object.assign({}, action);
                  action.str = match[0];
                  action.index = match.index;
                  inline_actions.push(action);
                }
              });
              chunks = chunks.concat(utterance.process_inline_content(str, inline_actions));
            } else {
              chunks.push({text: str});
            }
          }
        });
        chunks.forEach(function(c) {
          c.sound = c.sound_url;
          if(c.sound_url && c.sound_url.match(/_url$/)) {
            c.sound = speecher[c.sound_url];
          }
        });
        speecher.speak_collection(utterance.combine_content(chunks), Math.round(Math.random() * 99999) + "-" + (new Date()).getTime());
      } else {
        utterance.speak_text(text);
      }
    },
    record_sound: function() {
      contentGrabbers.soundGrabber.record_sound();
    },
    toggle_recording_sound: function(action) {
      contentGrabbers.soundGrabber.toggle_recording_sound(action);
    },
    select_sound_preview: function() {
      contentGrabbers.soundGrabber.select_sound_preview();
    },
    close: function() {
      var _this = this;
      if(this.get('model.vocalization')) {
        this.send('clear_sound');
        this.send('clear_sound_work');
        this.set('model.sound_id', null);
      }
      // Sync color values from DOM inputs (minicolors jQuery plugin may bypass Ember bindings)
      var fillEl = document.getElementById('fill');
      var borderEl = document.getElementById('border');
      if(fillEl && fillEl.value) {
        this.set('model.background_color', fillEl.value);
      }
      if(borderEl && borderEl.value) {
        this.set('model.border_color', borderEl.value);
      }
      if(this.get('model.id')) {
        editManager.change_button(this.get('model.id'), {
          background_color: this.get('model.background_color'),
          border_color: this.get('model.border_color')
        });
      }
      this.get('contentGrabbers').save_pending().then(function() {
        if(_this && !_this.isDestroyed && !_this.isDestroying) { _this.get('modal').close(); }
      }, function() {
        if(_this && !_this.isDestroyed && !_this.isDestroying) { _this.get('modal').close(); }
      });
    },
    find_app: function() {
      contentGrabbers.linkGrabber.find_apps();
    },
    pick_app: function(app) {
      contentGrabbers.linkGrabber.pick_app(app);
    },
    set_app_find_mode: function(mode) {
      contentGrabbers.linkGrabber.set_app_find_mode(mode);
    },
    set_custom: function() {
      contentGrabbers.linkGrabber.set_custom();
    },
    set_time: function(time_attr) {
      if(this.get('player')) {
        var time = Math.round(this.get('player').current_time());
        if(time) {
          this.get('model').set('video.' + time_attr, time);
        }
      }
    },
    clear_times: function() {
      this.get('model').setProperties({
        'video.start': '',
        'video.end': ''
      });
    },
    browse_audio: function() {
      contentGrabbers.soundGrabber.browse_audio();
    },
    audio_selected: function(sound) {
      this.set('model.sound', sound);
      this.set('model.sound_id', sound.id);
      contentGrabbers.soundGrabber.clear_sound_work();
    },
    quick_action: function(action) {
      var _this = this;
      if(action == 'picture') {
        _this.set('state', 'picture');
        runLater(function() {
          _this.send('find_picture');
        }, 200);
      } else if(action == 'label') {
        _this.set('state', 'general');
      } else if(action == 'sound') {
        _this.set('state', 'sound');
      } else if(action == 'folder') {
        // Route through the shared action-switch so conflicting fields (url/apps/
        // integration) are cleared — NOT a bare set (which left stale fields, so the
        // derived buttonAction could flip back). See _apply_button_action.
        _this._apply_button_action('folder');
        _this.set('state', 'action');
      } else if(action == 'url') {
        // Same shared path: clears load_board (and apps/integration) so the URL action
        // actually takes effect. Without this, a folder button switched here kept its
        // load_board and speak-mode tap navigated to the old board ("player never
        // initialized") instead of opening the URL.
        _this._apply_button_action('link');
        _this.set('state', 'action');
      } else if(action == 'hide') {
        _this.set('model.hidden', !(this.get('model.hidden')));
        _this.set('paint_hide_reminder', true);
      }
    },
    enable_auto_help: function() {
      var user = this.get('appState').get('currentUser');
      if(user) {
        this.set('auto_help', true);
        user.set('preferences.disable_button_help', false);
        user.save();
      }
    },
    disable_auto_help: function() {
      var user = this.get('appState').get('currentUser');
      if(user) {
        this.set('auto_help', false);
        user.set('preferences.disable_button_help', true);
        user.save();
      }
    }
  }
});
