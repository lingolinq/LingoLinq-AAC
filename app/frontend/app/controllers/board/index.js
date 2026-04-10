import Controller from '@ember/controller';
import RSVP from 'rsvp';
import $ from 'jquery';
import boundClasses from '../../utils/bound_classes';
import word_suggestions from '../../utils/word_suggestions';
import editManager from '../../utils/edit_manager';
import LingoLinq from '../../app';
import capabilities from '../../utils/capabilities';
import { inject as service } from '@ember/service';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';
import Button from '../../utils/button';
import frame_listener from '../../utils/frame_listener';
import { set as emberSet, get as emberGet } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { later as runLater } from '@ember/runloop';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';

var cached_images = {};
var last_redraw = (new Date()).getTime();

export default Controller.extend({
  appState: service('app-state'),
  app_state: alias('appState'),
  stashes: service('stashes'),
  persistence: service('persistence'),
  title: computed('model.name', function() {
    var name = this.get('model.name');
    var title = "Board";
    if(name) {
      title = title + " - " + name;
    }
    return title;
  }),
  ordered_buttons: null,
  processButtons: observer('appState.board_reload_key', function(ignore_fast_html) {
    var _vb = (window.LingoLinq || {}).verboseDebug;
    if (_vb) { console.log('[BOARD-DEBUG] board/index processButtons() start', { hasModel: !!(this && this.get && this.get('model')), modelKey: this && this.get && this.get('model.key') }); }
    if(!this || typeof this.get !== 'function' || !this.appState) { if (_vb) { console.log('[BOARD-DEBUG] board/index processButtons() early return (no this/appState)'); } return; }
    if(!this.get('model')) { if (_vb) { console.log('[BOARD-DEBUG] board/index processButtons() early return (no model - route likely torn down)'); } return; }
    this.update_button_symbol_class();
    boundClasses.add_rules(this.get('model.buttons'));
    this.computeHeight();
    if (this.appState.get('speak_mode')) { runLater(() => { this._setupSpeakBarObserver(); }, 200); }
    if (_vb) { console.log('[BOARD-DEBUG] board/index processButtons() calling editManager.process_for_displaying'); }
    editManager.process_for_displaying(ignore_fast_html);
    if (_vb) { console.log('[BOARD-DEBUG] board/index processButtons() done'); }
  }),
  check_for_share_approval: observer(
    'model.id',
    'appState.currentUser.pending_board_shares',
    'appState.default_mode',
    'appState.speak_mode',
    function() {
      var board_id = this.get('model.id');
      var _this = this;
      if(board_id && _this.appState.get('currentBoardState')) {
        var shares = _this.appState.get('currentUser.pending_board_shares') || [];
        var matching_shares = shares.filter(function(s) { return s.board_id && s.board_id == board_id; });
        if(matching_shares.length > 0) {
          // If not in Speak Mode, or just barely launched into Speak Mode
          if(_this.appState.get('default_mode') || (_this.appState.get('speak_mode') && _this.stashes.get('boardHistory.length') > 0)) {
            // Only prompt once if in Speak Mode
            var already = (_this.appState.get('speak_mode') && this.get('already_checked_boards')) || {};
            if(!already[board_id]) {
              already[board_id] = true;
              this.set('already_checked_boards', already);
              modal.open('approve-board-share', {board: _this.get('model'), shares: matching_shares});
            }
          }
        }
      }
    }
  ),
  updateSuggestions: observer(
    'appState.button_list',
    'this.appState.button_list.[]',
    'appState.currentUser',
    'appState.shift',
    'appState.inflection_shift',
    function() {
      if(!this.get('model.word_suggestions')) { return; }
      var _this = this;
      var button_list = this.get('appState.button_list');
      var last_button = button_list[button_list.length - 1];
      var current_button = null;
      if(last_button && last_button.in_progress) {
        current_button = last_button;
        last_button = button_list[button_list.length - 2];
      }
      var last_finished_word = ((last_button && (last_button.vocalization || last_button.label)) || "").toLowerCase();
      var word_in_progress = ((current_button && (current_button.vocalization || current_button.label)) || "").toLowerCase();
      if(capabilities.system == 'Android') {
        _this.set('suggestions.pending', true);
      }
      runLater(function() {
        word_suggestions.lookup({
          last_finished_word: last_finished_word,
          word_in_progress: word_in_progress,
          board_ids: [_this.appState.get('currentUser.preferences.home_board.id'), _this.stashes.get('temporary_root_board_state.id')]
        }).then(function(result) {
          // this delay prevents a weird use case on android
          // where it hits the next button before listeners are
          // attached and triggers a HashChangeEvent which causes
          // navigation back to the index page
          runLater(function() {
            _this.set('suggestions.pending', null);
          }, 200);
          _this.set('suggestions.list', result);
        }, function() {
          _this.set('suggestions.list', []);
        });
      });
    }
  ),
  saveButtonChanges: function() {
    var orderedButtons = this.get('ordered_buttons') || [];
    var pendingImage = false;
    for(var ri = 0; ri < orderedButtons.length && !pendingImage; ri++) {
      var row = orderedButtons[ri];
      for(var ci = 0; ci < row.length && !pendingImage; ci++) {
        var btn = row[ci];
        if(btn && btn.get && btn.get('image_id') && btn.get('pending_image')) {
          pendingImage = true;
        }
      }
    }
    if(pendingImage) {
      modal.warning(i18n.t('wait_for_images', "Please wait for all images to finish loading before saving."), true);
      return;
    }

    var state = editManager.process_for_saving();

    if(this.get('model.license')) {
      this.set('model.license.copyright_notice_url', LingoLinq.licenseOptions.license_url(this.get('model.license.type')));
    }
    var _this = this;

    var button_locale = this.get('model.button_locale') || this.appState.get('label_locale');
    var update_locale = false;
    var needs_redraw = false;
    // If editing for a non-default locale, we
    // will need to revert all the localized values and
    // apply them as a translation instead
    if(button_locale && button_locale != this.get('model.locale')) {
      var changes = this.get('model').changedAttributes();
      update_locale = button_locale;
      if(changes.name && changes.name[0] != changes.name[1]) {
        var trans = this.get('model.translations') || {};
        trans.board_name = trans.board_name || {};
        trans.board_name[button_locale] = changes.name[1];
        trans.board_name[this.get('model.locale')] = trans.board_name[this.get('model.locale')] || changes.name[0];
        this.set('model.name', changes.name[0]);
        this.set('model.translations', trans);
      }
      var old_name = this.get('model.name');
      if(old_name)
      needs_redraw = true;
      var _this = this;
      state.buttons.forEach(function(btn) {
        // Record the button changes as a translation
        btn.translations = btn.translations || []
        var btn_trans = btn.translations.find(function(t) { return t.locale == button_locale} );
        if(!btn_trans) {
          btn_trans = {
            code: button_locale,
            locale: button_locale,
          };
          btn.translations.push(btn_trans);
        }
        emberSet(btn_trans, 'label', btn_trans.label || btn.label);
        emberSet(btn_trans, 'vocalization', btn_trans.vocalization || btn.vocalization);
        emberSet(btn_trans, 'inflections', btn_trans.inflections || btn.inflections);

        // Revert the actual button value to what it was before
        var trans = btn.translations.find(function(t) { return t.locale == _this.get('model.locale')})
        trans = trans || ((_this.get('model.translations') || {})[btn.id] || {})[_this.get('model.locale')];
        if(trans) {
          // Either find it in the translations hash...
          emberSet(btn, 'vocalization', null);
          emberSet(btn, 'inflections', null);
          for(var key in trans) {
            if(key != 'code' && key != 'locale') {
              emberSet(btn, key, trans[key]);
            }
          }
        } else {
          // Or on the original button itself
          var old_btn = _this.get('model.buttons').find(function(b) { return b.id == btn.id; });
          if(old_btn) {
            emberSet(btn, 'label', old_btn.label);
            emberSet(btn, 'vocalization', old_btn.vocalization);
            emberSet(btn, 'inflections', old_btn.inflections);  
          }
        }
      });
    }

    this.set('model.buttons', state.buttons);
    this.set('model.grid', state.grid);
    boundClasses.setup(true);
    this.processButtons();

    if(this.appState.get('currentBoardState.id') && this.stashes.get('copy_on_save') == this.appState.get('currentBoardState.id')) {
      this.appState.controller.send('tweakBoard', {update_locale: update_locale});
      return;
    }
    this.appState.toggle_mode('edit');

    var board = this.get('model');
    var needs_refresh = board.get('update_visibility_downstream');
    // Preserve image_urls before save - server response can be incomplete for newly-created/edited boards,
    // causing images to disappear after save. Merge our local URLs back in so display stays correct.
    var imageUrlsBeforeSave = board.get('image_urls') ? Object.assign({}, board.get('image_urls')) : {};
    // Include URLs from ordered_buttons for any images not yet in image_urls (newly added in-session)
    (orderedButtons || []).forEach(function(btnRow) {
      (btnRow || []).forEach(function(btn) {
        var imgId = btn && (btn.get ? btn.get('image_id') : btn.image_id);
        if(imgId && !imageUrlsBeforeSave[imgId]) {
          var url = (btn.get ? btn.get('local_image_url') : btn.local_image_url) || (btn.get ? btn.get('image_url') : btn.image_url);
          if(url) {
            imageUrlsBeforeSave[imgId] = url;
          }
        }
      });
    });
    // Ensure images are pushed/available before save so backend can resolve all image_ids
    var pushPromise = (this.persistence.get('online') && board.get && board.find_content_locally) ?
      (board.set('fetched', false), board.find_content_locally()) : RSVP.resolve();
    pushPromise.catch(function() {
      return RSVP.resolve();
    }).then(function() {
      return board.save();
    }).then(function(brd) {
      var fromServer = brd.get('image_urls') || {};
      var merged = Object.assign({}, fromServer, imageUrlsBeforeSave);
      brd.set('image_urls', merged);
      if(update_locale) {
        _this.stashes.persist('label_locale', update_locale);
        _this.appState.set('label_locale', update_locale);
        _this.stashes.persist('vocalization_locale', update_locale);
        _this.appState.set('vocalization_locale', update_locale);
      }
      board.set('update_visibility_downstream', false);
      if(needs_refresh) {
        _this.appState.set('board_reload_key', Math.random() + "-" + (new Date()).getTime());
      }
      editManager.process_for_displaying();
      if(brd.get('protected_material') && brd.get('visibility') != 'private') {
        modal.notice(i18n.t('remember_fallbacks', "This board has premium content, any users who access it without premium access will see free alternatives instead."), true, false, {timeout: 5000});
      }
    }, function(err) {
      console.error(err);
      modal.error(i18n.t('board_save_failed', "Failed to save board"));
    });
  },
  valid_fast_html: computed(
    'model.fast_html',
    'appState.currentBoardState.level',
    'model.fast_html.width',
    'width',
    'model.fast_html.height',
    'height',
    'model.focus_id',
    'model.fast_html.focus_id',
    'model.fast_html.revision',
    'model.current_revision',
    'model.fast_html.inflection_prefix',
    'appState.inflection_prefix',
    'model.fast_html.inflection_shift',
    'appState.inflection_shift',
    'model.fast_html.label_locale',
    'appState.label_locale',
    'appState.referenced_user.preferences.skin',
    'appState.referenced_user.preferences.preferred_symbols',
    function() {
      var res = !!(this.get('model.fast_html') && this.get('model.fast_html.width') == this.get('width') 
            && this.get('model.fast_html.height') == this.get('height') 
            && this.get('model.current_revision') == this.get('model.fast_html.revision') 
            && this.get('model.fast_html.label_locale') == this.appState.get('label_locale') 
            && this.get('model.fast_html.display_level') == this.get('model.display_level') 
            && this.appState.get('inflection_prefix') == this.get('model.fast_html.inflection_prefix') 
            && this.appState.get('inflection_shift') == this.get('model.fast_html.inflection_shift') 
            && this.appState.get('referenced_user.preferences.skin') == this.get('model.fast_html.skin') 
            && this.appState.get('referenced_user.preferences.preferred_symbols') == this.get('model.fast_html.symbols') 
            && this.get('model.focus_id') == this.get('model.fast_html.focus_id'));
      return res;
    }
  ),
  has_rendered_material: computed(
    'ordered_buttons',
    'valid_fast_html',
    'model.fast_html',
    'appState.currentBoardState.level',
    'model.fast_html.width',
    'width',
    'model.fast_html.height',
    'height',
    'model.focus_id',
    'model.fast_html.focus_id',
    'model.fast_html.revision',
    'model.current_revision',
    'model.fast_html.inflection_prefix',
    'appState.inflection_prefix',
    'model.fast_html.inflection_shift',
    'appState.inflection_shift',
    'model.fast_html.label_locale',
    'appState.label_locale',
    'appState.referenced_user.preferences.skin',
    'appState.referenced_user.preferences.preferred_symbols',
    function() {
      var res = !!(this.get('ordered_buttons') || this.get('valid_fast_html'));
      return res;
    }
  ),
  check_for_updated_board: observer(
    'appState.currentBoardState.reload_token',
    'has_rendered_material',
    'appState.speak_mode',
    function() {
      // When you exit out of speak mode, go ahead and try to reload the board, that
      // will give people a consistent, reliable way to check for updates in case
      // their board got out of sync.
    var persistenceService = this.persistence;
      if(persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('online') && this.get('has_rendered_material') && this.get('appState.currentBoardState.reload_token') && !this.get('appState.speak_mode')) {
        var _this = this;
        _this.set('appState.currentBoardState.reload_token', null);
        _this.get('model').reload().then(function(brd) {
          if(brd && brd.get('permissions.view')) {
            _this.set('model.fast_html', null);
            editManager.process_for_displaying();
          }
        }, function() { });
      }
    }
  ),
  update_current_board_state: observer(
    'model.id',
    'model.global_id',
    'model.integration',
    'model.integration_name',
    'model.locale',
    'model.locales',
    function() {
      if(this.get('model.id') && this.appState.get('currentBoardState.id') == (this.get('model.global_id') || this.get('model.id'))) {
        this.appState.setProperties({
          'currentBoardState.integration_name': this.get('model.integration') && this.get('model.integration_name'),
          'currentBoardState.text_direction': i18n.text_direction(this.get('model.locale')),
          'currentBoardState.translatable': (this.get('model.locales') || []).length > 1
        });
      }
    }
  ),
  height: 400,
  computeHeight: observer(
    'appState.speak_mode',
    'appState.edit_mode',
    'appState.revision_id',
    'appState.focus_words.list',
    'model.word_suggestions',
    'model.description',
    'model.focus_id',
    'appState.sidebar_pinned',
    'appState.sidebar_visible',
    'long_description',
    'appState.currentUser.preferences.word_suggestion_images',
    'text_position',
    'this.stashes.board_level',
    'appState.inflection_prefix',
    'appState.inflection_shift',
    'appState.flipped',
    function() {
      var inner_width = window.innerWidth;    
      var height = window.innerHeight;
      if(capabilities.system == 'iOS') {
        inner_width = $("header").width() || window.innerWidth;
      }
      var width = inner_width;
      var sidebar_width = window.innerWidth <= 767 ? 75 : 100;
      if(this.appState.get('sidebar_visible')) {
        width = inner_width - sidebar_width; // TODO: make sidebar size configurable, or have it match top bar
      }
      this.set('window_inner_width', inner_width);
      this.appState.set('window_inner_width', inner_width);
      this.appState.set('window_inner_height', height);
      var show_description = !this.appState.get('edit_mode') && !this.appState.get('speak_mode') && this.get('long_description');
      var topHeight = this.appState.get('header_height') + 5 + (this.appState.get('extra_header_height') || 0);
      var sidebarTopHeight = topHeight;
      this.set('show_word_suggestions', this.get('model.word_suggestions') && this.appState.get('speak_mode'));
      if(this.get('show_word_suggestions')) {
        topHeight = topHeight + 55;
        var style = this.get('get_style');
        var position = this.get('text_position');
        if(style == 'text_small') { topHeight = topHeight - 4; }
        else if(style == 'text_large') { topHeight = topHeight + 4; }
        else if(style == 'text_huge') { topHeight = topHeight + 17; }
        if(this.get('appState.currentUser.preferences.word_suggestion_images') !== false && position != 'text_only') {
          topHeight = topHeight + 50;
          this.set('show_word_suggestion_images', true);
        } else {
          this.set('show_word_suggestion_images', false);
        }
      }
      if(this.appState.controller && this.appState.controller.get('setup_footer')) {
        height = height - 56;
      }
      var columns = this.get('current_grid.columns') || this.get('model.grid.columns') || 1;
      var column_width = inner_width / columns;
      this.appState.set('skinny_sidebar', column_width < 160);

      if((!this.get('model.public') || this.get('model.license.type') != 'private') && !this.appState.get('edit_mode') && this.stashes.get('current_mode') != 'speak') {
        show_description = show_description || this.get('model.name');
        if(!this.get('model.public')) {
          if(this.get('model.protected_material')) {
            show_description = show_description + " - protected";
          } else {
            show_description = show_description + " - private";
          }
        }
      } else if(this.get('model.has_fallbacks') && !this.appState.get('speak_mode')) {
        show_description = (show_description || "") + " - fallback resources used";
      }
      if(show_description) {
        topHeight = topHeight + 30;
      }
      if(this.appState.controller) {
        this.appState.controller.set('sidebar_style', htmlSafe("height: " + (height - sidebarTopHeight + 20) + "px;"));
      }
      this.setProperties({
        'height': height - topHeight,
        'width': width,
        'teaser_description': show_description
      });
      if(this.get('model.fast_html') && (
            this.get('model.fast_html.width') != this.get('width') 
            || this.get('model.fast_html.height') != this.get('height') 
            || this.get('model.fast_html.revision') != this.get('model.current_revision') 
            || this.get('model.fast_html.inflection_prefix') != this.appState.get('inflection_prefix') 
            || this.get('model.fast_html.inflection_shift') != this.appState.get('inflection_shift') 
            || this.get('model.fast_html.skin') != this.appState.get('referenced_user.preferences.skin') 
            || this.get('model.fast_html.symbols') != this.appState.get('referenced_user.preferences.preferred_symbols') 
            || this.get('model.focus_id') != this.get('model.fast_html.focus_id'))) {
        this.appState.set('suggestion_id', null);
        this.set('model.fast_html', null);
        editManager.process_for_displaying();
        var _thisCtrl = this;
        runLater(function() {
          if(_thisCtrl && _thisCtrl.appState && typeof _thisCtrl.appState.refresh_suggestions === 'function') {
            _thisCtrl.appState.refresh_suggestions();
          }
        });
      }
    }
  ),
  _speakBarObserver: null,
  _watchSpeakMode: observer('appState.speak_mode', function() {
    var _this = this;
    if (_this.appState.get('speak_mode')) {
      runLater(function() { _this._setupSpeakBarObserver(); }, 100);
    } else {
      _this._teardownSpeakBarObserver();
      _this.appState.set('extra_header_height', 0);
      document.documentElement.style.removeProperty('--speak-bar-extra');
    }
  }),
  _setupSpeakBarObserver() {
    if (this._speakBarObserver) { return; }
    var _this = this;
    var innerHeader = document.getElementById('inner_header');
    if (!innerHeader) { return; }
    this._speakBarObserver = new ResizeObserver(function() {
      _this._updateFromSpeakBarResize();
    });
    this._speakBarObserver.observe(innerHeader);
    this._updateFromSpeakBarResize();
  },
  _teardownSpeakBarObserver() {
    if (this._speakBarObserver) {
      this._speakBarObserver.disconnect();
      this._speakBarObserver = null;
    }
  },
  _updateFromSpeakBarResize() {
    var innerHeader = document.getElementById('inner_header');
    if (!innerHeader || !this.appState.get('speak_mode')) { return; }
    var actualHeight = innerHeader.offsetHeight;
    var topbarHeight = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')
    ) || this.appState.get('header_height') || 0;
    var extra = Math.max(0, actualHeight - topbarHeight);
    var prevExtra = this.appState.get('extra_header_height') || 0;
    if (prevExtra === extra) { return; }
    this.appState.set('extra_header_height', extra);
    document.documentElement.style.setProperty('--speak-bar-extra', extra + 'px');
    this.computeHeight();
  },
  willDestroy() {
    this._super(...arguments);
    this._teardownSpeakBarObserver();
    this.appState.set('extra_header_height', 0);
    document.documentElement.style.removeProperty('--speak-bar-extra');
  },
  board_style: computed('height', 'model.background.color', function() {
    var str = "position: relative; height: " + (this.get('height') + 5) + "px;";
    if(this.get('model.background.color') && window.tinycolor) {
      var clr = window.tinycolor(this.get('model.background.color'));
      if(clr && clr.toRgbString()) {
        str = str + " background: " + clr.toRgbString();
      }
    }
    return htmlSafe(str);
  }),
  bg_class: computed('model.background.position', function() {
    var pos = (this.get('model.background.position') || '').split(',');
    var fit = 'stretch';
    if(pos[0] == 'center') {
      fit = 'contain';
    }
    return htmlSafe(fit);
  }),
  bg_style: computed(
    'model.background.image',
    'model.grid.rows',
    'model.grid.columns',
    'model.background.position',
    'model.background.color',
    function() {
      var rows = this.get('model.grid.rows');
      var cols = this.get('model.grid.columns');
      var pos = (this.get('model.background.position') || '').split(',');
      var xmin = Math.max(parseInt(pos[1], 10) || 0, 0), xmax = Math.min(parseInt(pos[3], 10) || cols - 1, cols - 1) + 1,
          ymin = Math.max(parseInt(pos[2], 10) || 0, 0), ymax = Math.min(parseInt(pos[4], 10) || rows - 1, rows - 1) + 1;

      var width = 100 * (xmax - xmin) / cols;
      var height = 100 * (ymax - ymin) / rows;
      var left = 100 * xmin / cols;
      var top = 100 * ymin / rows;
      
      var str = 'position: absolute; top: ' + top + '%; left: ' + left + '%; width: ' + width + '%; height: ' + height + '%; overflow: hidden;'
      if(this.get('model.background.color') && window.tinycolor) {
        var clr = window.tinycolor(this.get('model.background.color'));
        if(clr && clr.toRgbString()) {
          str = str + ' background: ' + clr.toRgbString();
        }
      }
      return htmlSafe(str);
    }
  ),
  bg_img_style: computed(
    'model.background.image',
    'model.grid.rows',
    'model.grid.columns',
    'model.background.position',
    function() {
      var pos = (this.get('model.background.position') || '').split(',');
      // center, stretch, cover, or pos,x%,y%,w%,h% as row/col units
      var fit = 'fill';
      if(pos[0] == 'center') {
        fit = 'contain';
      } else if(pos[0] == 'cover') {
        fit = 'cover';
      }
      return htmlSafe('object-fit: ' + fit + '; object-position: center;');
    }
  ),
  redraw_if_needed: function() {
    var now = (new Date()).getTime();
    if(now - last_redraw > 100) {
      this.redraw();
    }
  },
  redraw: observer(
    'model.id',
    'extra_pad',
    'inner_pad',
    'base_text_height',
    'text_style',
    'text_position',
    'ordered_buttons',
    'border_style',
    'height',
    'width',
    'button_style',
    'appState.edit_mode',
    'nothing_visible',
    'appState.currentUser.preferences.stretch_buttons',
    function(klass, change, redraw_button_id) {
      LingoLinq.log.track('redrawing');
      var foundy = Math.round(10 * Math.random());
      var draw_id = redraw_button_id ? this.get('last_draw_id') : Math.random();
      this.set('last_draw_id', draw_id);
      var grid = this.get('current_grid');
      var ob = this.get('ordered_buttons');
      if(!grid || !ob || !Array.isArray(ob) || !ob.length) {
        return;
      }
      last_redraw = (new Date()).getTime();

      var starting_height = Math.floor((this.get('height') / (grid.rows || 2)) * 100) / 100;
      var starting_width = Math.floor((this.get('width') / (grid.columns || 2)) * 100) / 100;
      var extra_pad = this.get('extra_pad');
      var inner_pad = this.get('inner_pad');
      var double_pad = inner_pad * 2;
      var radius = 4;
      var context = null;
      var style = Button.style(this.get('button_style'));

      var currentLabelHeight = this.get('base_text_height') - 3;
      this.set('model.text_size', 'normal');
      if(starting_height < 35) {
        this.set('model.text_size', 'really_small_text');
        // Scale label down so images stay visible on dense grids
        currentLabelHeight = Math.min(currentLabelHeight, Math.max(Math.floor(starting_height * 0.25), 8));
      } else if(starting_height < 75) {
        this.set('model.text_size', 'small_text');
        // Scale label down so images stay visible on dense grids
        currentLabelHeight = Math.min(currentLabelHeight, Math.max(Math.floor(starting_height * 0.3), 10));
      }

      var $canvas = $("#board_canvas");
      // TODO: I commented out the canvas element because, while it was a few
      // seconds faster rendering a large board, it also causes a lot of headaches with
      // things like tabindex, edit mode, switch access, etc.
      if($canvas[0]) {
        if(parseInt($canvas.attr('width'), 10) != this.get('width') * 3) {
          $canvas.attr('width', this.get('width') * 3);
        }
        if(parseInt($canvas.attr('height'), 10) != this.get('height') * 3) {
          $canvas.attr('height', this.get('height') * 3);
        }
        $canvas.css({width: this.get('width'), height: this.get('height')});
        context = $canvas[0].getContext('2d');
        var width = $canvas[0].width;
        var height = $canvas[0].height;
        if(!redraw_button_id) {
          context.clearRect(0, 0, width, height);
        }
      }


      var _this = this;
      var stretchable = !_this.appState.get('edit_mode') && _this.appState.get('currentUser.preferences.stretch_buttons') && _this.appState.get('currentUser.preferences.stretch_buttons') != 'none'; // not edit mode and user-enabled
      var buttons = ob;

      var img_checker = function(url, callback) {
        if(cached_images[url]) {
          callback(cached_images[url]);
        } else {
          var img = new Image();
          img.draw_id = draw_id;
          img.src = url;
          img.onload = function() {
            cached_images[url] = img;
            if(_this.get('last_draw_id') == img.draw_id) {
              callback(img);
            }
          };
        }
      };
      var directions = function(ob, i, j) {
        var res = {};
        res.up = ob[i - 1] && ob[i - 1][j] && ob[i - 1][j].get('empty_or_hidden');
        res.upleft = ob[i - 1] && ob[i - 1][j - 1] && ob[i - 1][j - 1].get('empty_or_hidden');
        res.left = ob[i][j - 1] && ob[i][j - 1].get('empty_or_hidden');
        res.right = ob[i][j + 1] && ob[i][j + 1].get('empty_or_hidden');
        res.upright = ob[i - 1] && ob[i - 1][j + 1] && ob[i - 1][j + 1].get('empty_or_hidden');
        res.down = ob[i + 1] && ob[i + 1][j] && ob[i + 1][j].get('empty_or_hidden');
        res.downleft = ob[i + 1] && ob[i + 1][j - 1] && ob[i + 1][j - 1].get('empty_or_hidden');
        res.downright = ob[i + 1] && ob[i + 1][j + 1] && ob[i + 1][j + 1].get('empty_or_hidden');
        return res;
      };

      LingoLinq.log.track('computing dimensions');
      ob.forEach(function(row, i) {
        row.forEach(function(button, j) {
          var button_height = starting_height - (extra_pad * 2);
          if(button_height > 30) {
  //          button_height = button_height;
          }
          var button_width = starting_width - (extra_pad * 2);
          if(button_width > 30) {
  //          button_width = button_width;
          }
          var top = extra_pad + (i * starting_height);
          var left = extra_pad + (j * starting_width) - 2;

          if(stretchable) {
            var can_go = directions(ob, i, j);
            var went_up = false;
            var went_left = false;
            if(can_go.up) {
              if(stretchable == 'prefer_tall' || (can_go.upleft && can_go.upright)) {
                top = top - (extra_pad + (button_height / 2));
                button_height = button_height + extra_pad + (button_height / 2);
                went_up = true;
                var upper_can_go = directions(ob, i - 1, j);
                if(upper_can_go.up !== false && stretchable == 'prefer_tall' && !can_go.upright && !can_go.upleft) {
                  top = top - (extra_pad + (button_height / 2)) + (starting_height / 4);
                  button_height = button_height + extra_pad + (button_height / 2) - (starting_height / 4);
                }
              }
            }
            if(can_go.down) {
              if(stretchable == 'prefer_tall' || (can_go.downleft && can_go.downright)) {
                button_height = button_height + extra_pad + (button_height / 2);
                if(went_up) {
                  button_height = button_height - (starting_height / 4);
                }
                var lower_can_go = directions(ob, i + 1, j);
                if(lower_can_go.down !== false && stretchable == 'prefer_tall' && !can_go.downright && !can_go.downleft) {
                  button_height = button_height + extra_pad + (button_height / 2) - (starting_height / 4);
                }
              }
            }
            if(can_go.left) {
              if(stretchable == 'prefer_wide' || (can_go.upleft && can_go.downleft)) {
                left = left - (extra_pad + (button_width / 2));
                button_width = button_width + extra_pad + (button_width / 2);
                went_left = true;
                var lefter_can_go = directions(ob, i, j - 1);
                if(lefter_can_go.left !== false && stretchable == 'prefer_wide' && !can_go.upleft && !can_go.downleft) {
                  left = left - (extra_pad + (button_width / 2)) + (starting_width / 4);
                  button_width = button_width + extra_pad + (button_width / 2) - (starting_width / 4);
                }
              }
            }
            if(can_go.right) {
              if(stretchable == 'prefer_wide' || (can_go.upright && can_go.downright)) {
                button_width = button_width + extra_pad + (button_width / 2);
                if(went_left) {
                  button_width = button_width - (starting_width / 4);
                }
                var righter_can_go = directions(ob, i, j + 1);
                if(righter_can_go.right !== false && stretchable == 'prefer_wide' && !can_go.upright && !can_go.downright) {
                  button_width = button_width + extra_pad + (button_width / 2) - (starting_width / 4);
                }
              }
            }
          }
          var image_height = (button_height - currentLabelHeight - LingoLinq.boxPad - (inner_pad * 2) + 8) * 0.9;
          var image_width = (button_width - LingoLinq.boxPad - (inner_pad * 2) + 8) * 0.9;

          var top_margin = currentLabelHeight + LingoLinq.labelHeight - 8;
          if(_this.get('model.text_size') == 'really_small_text') {
            if(currentLabelHeight > 0) {
              image_height = image_height + currentLabelHeight - LingoLinq.labelHeight + 25;
              top_margin = 0;
            }
          } else if(_this.get('model.text_size') == 'small_text') {
            if(currentLabelHeight > 0) {
              image_height = image_height + currentLabelHeight - LingoLinq.labelHeight + 10;
              top_margin = top_margin - 10;
            }
          }
          if(button_height < 50) {
            image_height = image_height + (inner_pad * 2);
          }
          if(button_width < 50) {
            image_width = image_width + (inner_pad * 2) + (extra_pad * 2);
          }
          if(currentLabelHeight === 0 || _this.get('text_position') != 'text_position_top') {
            top_margin = 0;
          }
          button.set('positioning', {
            top: top,
            left: left, // - inner_pad - inner_pad,
            width: Math.floor(button_width), 
            // decimal widths cause layout quirks in safari, 
            // i.e. the folder corner can't line up against the edge, 
            // you get a thin line between the corner and border
            height: Math.floor(button_height),
            image_height: image_height,
            image_width: image_width,
            font_family: style.font_family,
            image_square: Math.max(Math.min(image_height, image_width), 0),
            image_top_margin: top_margin,
            border: inner_pad
          });
          button.get('fast_html');

          if(context) {
            if(!button.get('empty_or_hidden') && (!redraw_button_id || redraw_button_id == button.id)) {
              var image_left = (button_width - image_height) / 2 - inner_pad;
              var image_top = inner_pad + 2;
              var text_top = image_height + image_top + 3;

              var w = (button_width - double_pad) * 3 + 3.5; // FIX: added 3.5 here
              var h = (button_height - double_pad) * 3 + 2; // FIX: added 2 here
              var x = left * 3 - 1.5; // FIX: minused 1.5 here
              var y = top * 3 + 8; // FIX: added 8 here to make it work
              var r = radius * 3 ;

              if(redraw_button_id) {
                context.clearRect(x - 9, y - 9, w + 18, h + 18);
              }

              context.beginPath();
              context.strokeStyle = button.get('border_color') || '#ccc';
              context.fillStyle = button.get('background_color') || '#fff';
              context.lineWidth = 3;
              var extra = 0;
              if(button.get('touched')) {
                context.fillStyle = button.get('dark_background_color');
                context.strokeStyle = button.get('dark_border_color');
                context.lineWidth = 9;
                extra = 3;
              } else if(button.get('hover')) {
                console.log(button.get('dark_background_color'));
                context.fillStyle = button.get('dark_background_color');
                context.strokeStyle = button.get('dark_border_color');
                context.lineWidth = 6;
                extra = 3;
              }

              context.moveTo(x + r - extra, y - extra);
              context.lineTo(x + w - r + extra, y - extra);
              context.quadraticCurveTo(x + w + extra, y - extra, x + w + extra, y + r - extra);
              context.lineTo(x + w + extra, y + h - r + extra);
              context.quadraticCurveTo(x + w + extra, y + h + extra, x + w - r + extra, y + h + extra);
              context.lineTo(x + r - extra, y + h + extra);
              context.quadraticCurveTo(x - extra, y + h + extra, x - extra, y + h - r + extra);
              context.lineTo(x - extra, y + r - extra);
              context.quadraticCurveTo(x - extra, y - extra, x + r - extra, y - extra);
              context.closePath();

      //           context.rect(left * 3, top * 3, width * 3, height * 3);
              if(foundy == j) {
    //            context.fillStyle = 'rgb(255, 255, 170)';
              }
              context.fill();
              context.stroke();
              context.lineWidth = 3;

              context.save();
              context.textAlign = 'center';
              context.textBaseline = 'top';
              context.font = "36px serif";
              context.rect(left * 3, (top + text_top) * 3, button_width * 3, 60);
              context.clip();

              context.fillStyle = button.get('text_color') || '#000';
              context.fillText(button.get('label'), (left + (button_width / 2) - inner_pad) * 3, (top + text_top) * 3 - 8); //FIX: minused 8

              context.restore();

              context.beginPath();
              context.rect((left + image_left) * 3, (top + image_top) * 3, image_height * 3, image_height * 3);
              context.fillStyle = '#fff';
              context.closePath();
              context.fill();

              var draw_action = function() {
                if(button.get('action_image') && !button.get('talkAction')) {
                  img_checker(button.get('action_image'), function(img) {
                    context.drawImage(img, x + w - 60 - 6, y, 60, 60);
                  });
                }
              };
              draw_action();

              var url = button.get('image.best_url');
              img_checker(url, function(img) {
                // TODO: proportionally-fit centered in square area
                context.drawImage(img, (left + image_left) * 3 - 1, (top + image_top) * 3 + 3, image_height * 3 + 1.5, image_height * 3); // FIX: added 2 here
                draw_action();
              });
            }
          }
        });
      });
      this.appState.set('board_virtual_dom.ordered_buttons', ob);
      this.appState.align_button_list();
      LingoLinq.log.track('done computing dimensions');
    }
  ),
  long_description: computed('model.description', 'model.name', function() {
    var desc = "";
    if(this.get('model.name') && this.get('model.name') != 'Unnamed Board') {
      desc = this.get('model.name');
      if(this.get('model.copy_version')) {
        desc = desc + " (" + this.get('model.copy_version') + ")";
      }
      if(this.get('model.description')) {
        desc = desc + " - ";
      }
    }
    if(this.get('model.description')) {
      desc = desc + this.get('model.description');
    }
    return desc;
  }),
  cc_license: computed('model.license.type', function() {
    return (this.get('model.license.type') || "").match(/^CC\s/);
  }),
  pd_license: computed('model.license.type', function() {
    return this.get('model.license.type') == 'public domain';
  }),
  starImage: computed('model.starred', function() {
    var prefix = capabilities.browserless ? "" : "/";
    return prefix + (this.get('model.starred') ? 'images/star.png' : 'images/star_gray.png');
  }),
  starAlt: computed('model.starred', function() {
    return this.get('model.starred') ? i18n.t('already_starred', "Already liked") : i18n.t('star_this_board', "Like this board");
  }),
  current_level: computed(
    'model.default_level',
    'this.stashes.board_level',
    'preview_level',
    function() {
      return this.get('preview_level') || this.stashes.get('board_level') || this.get('model.default_level') || 10;
    }
  ),
  button_levels: computed('ordered_buttons.@each.level_modifications', 'levels_change', function() {
    var levels = [];
    (this.get('ordered_buttons') || []).forEach(function(row) {
      (row || []).forEach(function(button) {
        var mods = button.get('level_modifications') || {};
        for(var idx in mods) {
          var lvl = parseInt(idx, 10);
          if(lvl > 0 && levels.indexOf(lvl) == -1) {
            levels.push(lvl);
          }
        }
      });
    });
    this.clear_levels_change();
    return levels.uniq().sort(function(a, b) { return a - b; });
  }),
  clear_levels_change() {
    this.set('levels_change', false);
  },
  preview_levels: computed('appState.edit_mode', 'preview_levels_mode', function() {
    return this.get('appState.edit_mode') && this.get('preview_levels_mode');
  }),
  noUndo: true,
  noRedo: true,
  paint_mode: false,
  paintColor: computed('paint_mode', function() {
    var mode = this.get('paint_mode');
    if(mode) {
      if(mode.hidden === true) {
        return htmlSafe("<span class='glyphicon glyphicon-minus-sign'></span>");
      } else if(mode.hidden === false) {
        return htmlSafe("<span class='glyphicon glyphicon-ok-sign'></span>");
      } else if(mode.close_link === true) {
        return htmlSafe("<span class='glyphicon glyphicon-remove-sign'></span>");
      } else if(mode.close_link === false) {
        return htmlSafe("<span class='glyphicon glyphicon-plus-sign'></span>");
      } else if(mode.level) {
        return htmlSafe("<span class='glyphicon glyphicon-signal'></span>");
      } else {
        return htmlSafe("<span class='swatch' style='width: 14px; height: 14px; border-color: " + mode.border + "; background-color: " + mode.fill + ";'></span>");
      }
    } else {
      return '';
    }
  }),
  current_grid: computed('ordered_buttons', function() {
    var ob = this.get('ordered_buttons');
    if(!ob || !Array.isArray(ob) || !ob.length) {
      return { rows: 0, columns: 0 };
    }
    return {
      rows: ob.length,
      columns: (ob[0] && Array.isArray(ob[0]) && ob[0].length) || 0
    };
  }),
  extra_pad: computed(
    'appState.currentUser.preferences.device.button_spacing',
    'appState.window_inner_width',
    function() {
      var spacing = this.appState.get('currentUser.preferences.device.button_spacing') || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_spacing);
      if(spacing == 'none') {
        return 0;
      } else if(spacing == 'minimal' || this.appState.get('window_inner_width') < 600) {
        return 1;
      } else if(spacing == "extra-small" || this.appState.get('window_inner_width') < 750) {
        return 2;
      } else if(spacing == "medium") {
        return 10;
      } else if(spacing == "large") {
        return 20;
      } else if(spacing == "huge") {
        return 45;
      } else {
        return 4;
      }
    }
  ),
  inner_pad: computed(
    'appState.currentUser.preferences.device.button_border',
    'window_inner_width',
    function() {
      var spacing = this.appState.get('currentUser.preferences.device.button_border') || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_border);
      if(spacing == "none") {
        return 0;
      } else if(this.appState.get('window_inner_width') < 600) {
        return 1;
      } else if(spacing == "medium" || this.appState.get('window_inner_width') < 750) {
        return 2;
      } else if(spacing == "large") {
        return 5;
      } else if(spacing == "huge") {
        return 10;
      } else {
        return 1;
      }
    }
  ),
  base_text_height: computed(
    'appState.currentUser.preferences.device.button_text',
    'appState.referenced_user.preferences.device.button_text',
    'appState.referenced_user.preferences.device.button_text_position',
    function() {
      var user = this.appState.get('speak_mode') ? this.appState.get('referenced_user') : this.appState.get('currentUser');
      var text = (user && user.get && user.get('preferences.device.button_text')) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text);
      var position = (user && user.get && user.get('preferences.device.button_text_position')) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text_position);
      if(text == "small") {
        return 14;
      } else if(text == "none" || position == "none") {
        return 0;
      } else if(text == "large") {
        return 22;
      } else if(text == "huge") {
        return 35;
      } else {
        return 18;
      }
    }
  ),
  text_style: computed(
    'appState.currentUser.preferences.device.button_text',
    'appState.currentUser.preferences.device.button_text_position',
    'appState.referenced_user.preferences.device.button_text',
    'appState.referenced_user.preferences.device.button_text_position',
    'appState.speak_mode',
    function() {
      var user = this.appState.get('speak_mode') ? this.appState.get('referenced_user') : this.appState.get('currentUser');
      var size = (user && user.get && user.get('preferences.device.button_text')) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text);
      var position = (user && user.get && user.get('preferences.device.button_text_position')) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text_position);
      if(position == 'none') {
        size = 'none';
      }
      if(size != 'none') {
        if(this.appState.get('window_inner_width') < 600) {
          size = 'small';
        } else if(this.appState.get('window_inner_width') < 750 && size != 'small') {
          size = 'medium';
        }
      }
      return "text_" + size;
    }
  ),
  text_position: computed(
    'model.text_only',
    'appState.currentUser.preferences.device.button_text_position',
    'appState.referenced_user.preferences.device.button_text_position',
    'appState.speak_mode',
    function() {
      if(this.get('model.text_only')) {
        return 'text_position_text_only';
      }
      var user = this.appState.get('speak_mode') ? this.appState.get('referenced_user') : this.appState.get('currentUser');
      var position = (user && user.get && user.get('preferences.device.button_text_position')) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text_position);
      return "text_position_" + (position || 'top');
    }
  ),
  symbol_background: computed('appState.currentUser.preferences.symbol_background', function() {
    var bg = this.appState.get('currentUser.preferences.symbol_background');
    if(!bg) {
      if(this.appState.get('currentUser')) {
        bg = 'white';
      } else {
        bg = (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.symbol_background) || 'white';
      }
    }
    return "symbol_background_" + bg;
  }),
  border_style: computed('appState.currentUser.preferences.device.button_border', function() {
    var spacing = this.appState.get('currentUser.preferences.device.button_border') || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_border);
    return "border_" + spacing;
  }),
  button_style: computed('appState.currentUser.preferences.device.button_style', function() {
    return this.appState.get('currentUser.preferences.device.button_style');
  }),
  editModeNormalText: computed('appState.edit_mode', 'model.text_size', function() {
    return this.appState.get('edit_mode') && this.get('model.text_size') != 'really_small_text';
  }),
  nothing_visible_not_edit: computed('nothing_visible', 'appState.edit_mode', function() {
    return this.get('nothing_visible') && !this.appState.get('edit_mode');
  }),
  display_class: computed(
    'stashes.all_buttons_enabled',
    'stashes.current_mode',
    'paint_mode',
    'appState.edit_mode',
    'border_style',
    'text_style',
    'model.finding_target',
    'model.hide_empty',
    'appState.currentUser.preferences.hidden_buttons',
    'appState.currentUser.hide_symbols',
    'appState.referenced_user.hide_symbols',
    'appState.speak_mode',
    'appState.currentUser.preferences.folder_icons',
    'appState.currentUser.preferences.stretch_buttons',
    'appState.eval_mode',
    'appState.currentUser.preferences.high_contrast',
    function() {
      var res = "board advanced_selection ";
      if(this.appState.get('edit_mode')) {
        res = res + "edit ";
      }
      if(!this.appState.get('currentUser.preferences.folder_icons')) {
        res = res + "colored_icons ";
      }
      if(this.appState.get('currentUser.preferences.high_contrast')) {
        res = res + "high_contrast ";
      }
      if(this.get('model.finding_target')) {
        res = res + "finding_target ";
      }
      if(this.get('stashes.current_mode')) {
        res = res + this.get('stashes.current_mode')  + " ";
      }
      var stretchable = !this.appState.get('edit_mode') && this.appState.get('currentUser.preferences.stretch_buttons') && this.appState.get('currentUser.preferences.stretch_buttons') != 'none'; // not edit mode and user-enabled
      if(!this.appState.get('eval_mode')) {
        if(this.get('stashes.all_buttons_enabled')) {
          res = res + 'show_all_buttons ';
        } else if(!stretchable && this.appState.get('currentUser.preferences.hidden_buttons') == 'hint' && !this.get('model.hide_empty')) {
          res = res + 'hint_hidden_buttons ';
        } else if(!stretchable && this.appState.get('currentUser.preferences.hidden_buttons') == 'grid' && !this.get('model.hide_empty')) {
          res = res + 'grid_hidden_buttons ';
        }
      }
      var displayUser = this.appState.get('speak_mode') ? this.appState.get('referenced_user') : this.appState.get('currentUser');
      if((displayUser && displayUser.get && displayUser.get('hide_symbols'))) {
        res = res + 'show_labels ';
      }
      if(this.get('paint_mode')) {
        res = res + "paint ";
      }
      if(this.get('border_style')) {
        res = res + this.get('border_style') + " ";
      }
      if(this.get('text_style')) {
        res = res + this.get('text_style') + " ";
      }
      if(this.get('text_position')) {
        res = res + this.get('text_position') + " ";
      }
      if(this.get('symbol_background')) {
        res = res + this.get('symbol_background') + " ";
      }
      if(this.get('button_style')) {
        var style = Button.style(this.get('button_style'));
        if(style.upper) {
          res = res + "upper ";
        } else if(style.lower) {
          res = res + "lower ";
        }
        if(style.font_class) {
          res = res + style.font_class + " ";
        }
      }
      return res;
    }
  ),
  suggestion_class: computed(
    'button_style',
    'text_style',
    'appState.currentUser.preferences.word_suggestion_images',
    'appState.currentUser.preference.high_contrast',
    function() {
      var res = "advanced_selection ";
      if(this.get('text_style')) {
        res = res + this.get('text_style') + " ";
      }
      if(this.get('text_position')) {
        res = res + this.get('text_position') + " ";
      }
      if(this.get('button_style')) {
        var style = Button.style(this.get('button_style'));
        if(style.upper) {
          res = res + "upper ";
        } else if(style.lower) {
          res = res + "lower ";
        }
        if(style.font_class) {
          res = res + style.font_class + " ";
        }
      }
      if(this.get('appState.currentUser.preferences.high_contrast')) {
        res = res + "high_contrast ";
      }

      if(this.get('appState.currentUser.preferences.word_suggestion_images')) {
        res = res + "with_images ";
      }
      return res;
    }
  ),
  update_button_symbol_class: observer(
    'model.text_only',
    'appState.currentUser.hide_symbols',
    'appState.currentUser.preferences.device.button_text_position',
    'appState.referenced_user.hide_symbols',
    'appState.referenced_user.preferences.device.button_text_position',
    'appState.speak_mode',
    function() {
      var res = "button-label-holder ";
      var displayUser = this.appState.get('speak_mode') ? this.appState.get('referenced_user') : this.appState.get('currentUser');
      if((displayUser && displayUser.get && displayUser.get('hide_symbols')) || this.get('model.text_only')) {
        res = res + "no_image ";
      }
      var devicePrefs = displayUser && displayUser.get && displayUser.get('preferences.device');
      var position = (devicePrefs && devicePrefs.button_text_position) || (window.user_preferences && window.user_preferences.device && window.user_preferences.device.button_text_position);
      if(position == 'top' && !this.get('model.text_only')) {
        res = res + "top ";
      }
      this.appState.set('button_symbol_class', res);
      this.set('button_symbol_class', res);
      this.set('text_only_button_symbol_class', (res + " no_image").replace(/top/, ''));
      this.appState.set('text_only_button_symbol_class', this.get('text_only_button_symbol_class'));
      return res;
    }
  ),
  reload_on_connect: observer('persistence.online', function() {
    if(!this || typeof this.get !== 'function') { return; }
    var persistenceService = this.get('persistence') || this.persistence;
    if(persistenceService && typeof persistenceService.get === 'function' && persistenceService.get('online') && !this.get('model.id')) {
      try {
        this.send('refreshData');
      } catch(e) { }
//       var _this = this;
//       var obj = this.store.findRecord('board', editManager.get('last_board_key'));
//       return obj.then(function(data) {
//         _this.set('model', data);
//       }, function() { });
    }
  }),

  _extractButtonId: function(id, event) {
    if (id && typeof id === 'object' && id.target) {
      event = id;
      id = $(id.target).closest('.button').attr('data-id') || $(id.target).attr('id');
    }
    return { id: id, event: event };
  },

  boardMenuOpen: false,

  actions: {
    toggleBoardMenu: function() {
      this.toggleProperty('boardMenuOpen');
      if(this.get('boardMenuOpen')) {
        var _this = this;
        var handler = function(e) {
          if(!e.target.closest('.la-board-mobile-menu') && !e.target.closest('.la-board-hamburger')) {
            _this.set('boardMenuOpen', false);
            document.removeEventListener('click', handler, true);
          }
        };
        setTimeout(function() {
          document.addEventListener('click', handler, true);
        }, 10);
      }
    },
    boardDetails: function() {
      this.set('boardMenuOpen', false);
      modal.open('board-details', {board: this.get('model')});
    },
    buttonSelect: function(id, event) {
      var _this = this;
      var controller = this;
      var board = this.get('model');
      var extracted = this._extractButtonId(id, event);
      id = extracted.id;
      event = extracted.event;
      if(!id) { return; }
      if(_this.appState.get('edit_mode')) {
        if(editManager.finding_target()) {
          editManager.apply_to_target(id);
        } else {
          if(typeof(event) != 'string') {
            event = null;
          }
          var button = editManager.find_button(id);
          button.state = event || 'general';
          modal.open('button-settings', {button: button, board: board});
        }
      } else {
        var button = editManager.find_button(id); //(board.get('buttons') || []).find(function(b) { return b.id == id; });
        if(!button) { return; }
        var app = _this.appState.controller;
        app.activateButton(button, {board: board, event: event});
      }
    },
    buttonPaint: function(id) {
      id = this._extractButtonId(id).id;
      if(id) { editManager.paint_button(id); }
    },
    complete_word: function(word) {
      try {
        var _this = this;
        var text = word.word;
        var button = editManager.fake_button();
        button.set('label', text);
        button.set('vocalization', ":complete");
        var list = _this.appState.get('button_list') || [];
        if(!emberGet(list[0] || {}, 'in_progress')) {
          button.set('vocalization', ":predict");
        }
        button.set('completion', text);
        if(word.original_image) {
          button.set('image', LingoLinq.store.createRecord('image'));
          button.set('image.url', word.original_image);
        }
        button.set('empty', false);

        var controller = this;
        var board = this.get('model');
        var app = _this.appState.controller;
        app.activateButton(button, {board: board, trigger_source: 'completion'});
      } catch(e) { debugger }
    },
    symbolSelect: function(id) {
      var _this = this;
      id = this._extractButtonId(id).id;
      if(!_this.appState.get('edit_mode') || !id) { return; }
      var button = editManager.find_button(id);
      if(!button) { return; }
      button.state = 'picture';
      modal.open('button-settings', {button: button, board: this.get('model')});
    },
    actionSelect: function(id) {
      var _this = this;
      id = this._extractButtonId(id).id;
      if(!_this.appState.get('edit_mode') || !id) { return; }
      var button = editManager.find_button(id);
      if(!button) { return; }
      button.state = 'action';
      modal.open('button-settings', {button: button, board: this.get('model')});
    },
    rearrangeButtons: function(dragId, dropId) {
      editManager.switch_buttons(dragId, dropId);
    },
    clear_button: function(id) {
      id = this._extractButtonId(id).id;
      if(id) { editManager.clear_button(id); }
    },
    stash_button: function(id) {
      id = this._extractButtonId(id).id;
      editManager.stash_button(id || editManager.stashed_button_id);
      modal.success(i18n.t('button_stashed', "Button stashed!"));
      var $stash_hover = $("#stash_hover");
      $stash_hover.removeClass('on_button').data('button_id', null);
    },
    word_data: function(id) {
      var _this = this;
      var button = editManager.find_button(id || editManager.stashed_button_id);
      if(button && (button.label || button.vocalization)) {
        modal.open('word-data', {word: (button.label || button.vocalization), button: button, usage_stats: null, user: _this.appState.get('currentUser')});
      }
      var $stash_hover = $("#stash_hover");
      $stash_hover.removeClass('on_button').data('button_id', null);
    },
    toggleEditMode: function(decision) {
      var _this = this;
      _this.appState.check_for_needing_purchase().then(function() {
        _this.appState.toggle_edit_mode(decision);
      }, function() { });
    },
    compute_height: function(force) {
      this.computeHeight(force);
    },
    redraw: function(id) {
      this.redraw(this, 'redraw_button', id);
    },
    button_event: function(action, a, b) {
      this.send(action, a, b);
    }
  }
});
