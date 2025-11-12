import LingoLinq from '../app';
import $ from 'jquery';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import modal from '../utils/modal';
import { set as emberSet } from '@ember/object';
import { computed, observer } from '@ember/object';
import { htmlSafe } from '@ember/string';

export default modal.ModalController.extend({
  opening: function() {
    var board = this.get('model.board');
    this.set('model', board);
    this.set('starting_vis', board.get('visibility'));
    this.set('visibility_changed', false);
    if(!board.get('button_locale')) {
      board.set('button_locale', app_state.get('label_locale') || board.get('locale'));
    }
    this.set('advanced', false);
    this.set('originally_public', board.get('public'));
    this.set('protected_vocabulary', !!board.get('protected_settings.vocabulary'));
    if((board.get('categories') || []).indexOf('unprotected_vocabulary') != -1) {
      this.set('protected_vocabulary', false);
    }
  },
  closing: function() {
    if(this.get('model.translations.board_name') && this.get('model.locale')) {
      var trans = this.get('model.translations');
      trans.board_name[this.get('model.locale')] = this.get('model.name');
      this.set('model.translations', trans);
    }
    var cats = []
    if(this.get('model.home_board')) {
      (this.get('board_categories') || []).forEach(function(cat) {
        if(cat.selected) {
          cats.push(cat.id);
        }
      });
    }
    if(this.get('model.visibility_setting.private')) {
      cats.push(this.get('protected_vocabulary') ? 'protected_vocabulary' : 'unprotected_vocabulary')
    }
    this.set('model.categories', cats);
    if(this.get('model.intro')) {
      this.set('model.intro.unapproved', false);
    }
  },
  update_visibility_changed: observer('starting_vis', 'model.visibility', function() {
    if(this.get('starting_vis') != this.get('model.visibility')) {
      this.set('visibility_changed', true);
      this.set('model.update_visibility_downstream', true)
    } else {
      this.set('visibility_changed', false);
      this.set('model.update_visibility_downstream', false)
    }
  }),
  update_background: observer('background_enabled', function() {
    if(this.get('background_enabled')) {
      this.set('model.background', {});
    }
  }),
  board_categories: computed('model.home_board', 'model.id', 'model.categories', function() {
    var res = [];
    var _this = this;
    var cats = {};
    (this.get('model.categories') || []).forEach(function(str) { cats[str] = true; });
    LingoLinq.board_categories.forEach(function(c) {
      var cat = $.extend({}, c);
      if(cats[c.id]) { cat.selected = true; }
      res.push(cat);
    });
    return res;
  }),
  locales: computed(function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('choose_locale', '[Choose a Language]'), id: ''}];
    for(var key in list) {
      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('unspecified', "Unspecified"), id: ''});
    return res;
  }),
  licenseOptions: LingoLinq.licenseOptions,
  public_options: LingoLinq.publicOptions,
  iconUrls: LingoLinq.iconUrls,
  bg_style: computed('model.background.color', function() {
    var str = "display: inline-block; border-width: 3px; border: 2px dotted #ccc; height: 34px; width: 70px; vertical-align: bottom;";
    if(this.get('model.background.color')) {
      if(window.tinycolor) {
        var bg = window.tinycolor(this.get('model.background.color'));
        if(bg && bg.isValid()) {
          str = "display: inline-block; border-width: 3px; border: 2px solid #444; height: 34px; width: 70px; vertical-align: bottom;"
          str = str + "background: " + bg.toRgbString() + ";";
        }
      }
    }
    return htmlSafe(str);
  }),
  attributable_license_type: computed('model.license.type', function() {
    if(!this.get('model.license')) { return; }
    if(this.get('model.license') && this.get('model.license.type') != 'private') {
      this.update_license();
    }
    return this.get('model.license.type') != 'private';
  }),
  update_license() {
    this.set('model.license.author_name', this.get('model.license.author_name') || app_state.get('currentUser.name'));
    this.set('model.license.author_url',this.get('model.license.author_url') || app_state.get('currentUser.profile_url'));
  },
  actions: {
    close: function() {
      modal.close();
    },
    pickImageUrl: function(url) {
      this.set('model.image_url', url);
    },
    show_advanced: function() {
      this.set('advanced', true);
    },
    add_board_intro_section: function() {
      var intro = this.get('model.intro') || {};
      emberSet(intro, 'unapproved', false);
      var sections = intro.sections || [];
      sections.pushObject({});
      emberSet(intro, 'sections', sections);
      this.set('model.intro', intro);
    },
    set_position: function(str) {
      if(this.get('model.background')) {
        this.set('model.background.position', str);
      }
    },
    delete_board_intro_section: function(section) {
      if(!this.get('model.intro.sections')) { return; }
      var sections = this.get('model.intro.sections') || [];
      sections = sections.filter(function(s) { return s != section; });
      this.set('model.intro.sections', sections);
    },
    toggle_color: function() {
      var $elem = $("#background");

      if(!$elem.hasClass('minicolors-input')) {
        $elem.minicolors();
      }
      if($elem.next().next(".minicolors-panel:visible").length > 0) {
        $elem.minicolors('hide');
      } else {
        $elem.minicolors('show');
      }

    }
  }
});
