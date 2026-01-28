import LingoLinq from '../../app';
import modal from '../../utils/modal';
import BoardHierarchy from '../../utils/board_hierarchy';
import i18n from '../../utils/i18n';
import { inject as service } from '@ember/service';
import progress_tracker from '../../utils/progress_tracker';
import { action, set as emberSet, get as emberGet } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import capabilities from '../../utils/capabilities';

export default class StartCodesController extends modal.ModalController {
  @service('app-state') appState;
  @service persistence;

  @tracked status = null;
  @tracked new_start_code = null;
  @tracked link_code = null;
  @tracked shallow_clone = null;
  
  @tracked code;
  @tracked locale;
  @tracked symbol_library;
  @tracked premium;
  @tracked premium_symbols;
  @tracked supervisors;
  @tracked home_board_key;
  @tracked user_type;

  opening() {
    this.status = null;
    this.new_start_code = null;
    this.link_code = null;
    this.shallow_clone = null;
    var list = this.org_or_user.start_codes || [];
    list.forEach(function(code) {
      emberSet(code, 'to_delete', false);
      emberSet(code, 'status', null);
    });
  }

  get org_or_user() {
    return this.model.user || this.model.org;
  }

  get invalid_code() {
    return this.code && (this.code.length <= 6 || !this.code.match(/^[8a-zA-Z]/));
  }

  get sorted_start_codes() {
    return (this.org_or_user.start_codes || []).sort(function(a, b) {
      if(a.disabled && !b.disabled) {
        return 1;
      } else if(!a.disabled && b.disabled) {
        return -1;
      } else {
        return 0;
      }
    });
  }

  get locales() {
    var list = i18n.get('locales');
    var res = [];
    res.push({name: i18n.t('dont_set_language', "Don't Set a Language"), id: 'none'});
    for(var key in list) {
      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('unspecified', "Unspecified"), id: ''});
    return res;
  }

  get symbol_libraries() {
    // originally depended on current_user but didn't use it
    var list = [];
    list.push({name: i18n.t('dont_set_preferred_symbols', "Don't Set Preferred Symbols"), id: ''});
    list.push({name: i18n.t('use_opensymbols', "Opensymbols.org free symbol libraries"), id: 'opensymbols'});
    list.push({name: i18n.t('use_lessonpix_with_addon', "LessonPix symbol library (requires paid add-on)"), id: 'lessonpix'});
    list.push({name: i18n.t('use_symbolstix_with_addon', "SymbolStix Symbols (requires paid add-on)"), id: 'symbolstix'});
    list.push({name: i18n.t('use_pcs_with_addon', "PCS Symbols by Tobii Dynavox (requires paid add-on)"), id: 'pcs'});  
    list.push({name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji'});
    list.push({name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project'});
    list.push({name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac'});
    list.push({name: i18n.t('use_tawasol', "Tawasol symbol library"), id: 'tawasol'});

    return list;
  }

  get user_types() {
    var list = [];
    list.push({name: i18n.t('communicator', "Communicator"), id: 'communicator'});
    list.push({name: i18n.t('supporter', "Supporter"), id: 'supporter'});

    return list;
  }

  @action
  new() {
    this.new_start_code = !this.new_start_code;
  }

  @action
  delete(code, check) {
    if(check) {
      emberSet(code, 'to_delete', !emberGet(code, 'to_delete'));
    } else if(emberGet(code, 'to_delete')) {
      var _this = this;
      var path = '/api/v1/users/' + _this.model.user.id + '/start_code';
      if(_this.model.org) {
        path = '/api/v1/organizations/' + _this.model.org.id + '/start_code';
      }
      emberSet(code, 'status', {deleting: true});
      this.persistence.ajax(path, {type: 'POST', data: {
        code: code.code,
        delete: true
      }}).then(function(res) {
        emberSet(code, 'status', null);
        emberSet(code, 'disabled', true);
        _this.org_or_user.reload();
      }, function(err) {
        emberSet(code, 'status', {error: true});
      });
    }
  }

  @action
  copy(code) {
    capabilities.sharing.copy_text(code)
    modal.success(i18n.t('code_copied_to_clipboard', "Code Copied to Clipboard!"));
  }

  @action
  back() {
    this.link_code = null;
  }

  @action
  copy_link() {
    capabilities.sharing.copy_text(this.link_code.url);
    modal.success(i18n.t('link_copied_to_clipboard', "Link Copied to the Clipboard!"));
  }

  @action
  copy_code() {
    var elem = document.querySelector('#qr_code img');
    if(elem) {
      elem.alt = this.link_code.url;
      capabilities.sharing.copy_elem(elem, this.link_code.url);
      modal.success(i18n.t('qr_code_copied_to_clipboard', "QR Code Copied to Clipboard!"));
    } else {
      modal.error(i18n.t('copy_failed_try_manual', "Failed to Copy Image, please try copying manually"));
    }
  }

  @action
  code_link(code) {
    var prefix = location.protocol + "//" + location.host;
    if(capabilities.installed_app && capabilities.api_host) {
      prefix = capabilities.api_host;
    }
    emberSet(code, 'url', prefix + "/register?code=" + encodeURIComponent(code.code) + "&v=" + code.v);
    this.link_code = code;
  }

  @action
  generate() {
    var _this = this;
    if(this.invalid_code) { return; }
    var ovr = {};
    if(this.code) {
      ovr.proposed_code = this.code;
    }
    if(this.locale && this.locale != 'none') {
      ovr.locale = this.locale;
    }
    if(this.shallow_clone) {
      ovr.shallow_clone = true;
    }
    if(this.symbol_library) {
      ovr.symbol_library = this.symbol_library;
    }
    if(this.premium) {
      ovr.premium = true;
      if(this.premium_symbols) {
        ovr.premium_symbols = true;
      }
    }
    if(this.supervisors) {
      ovr.supervisors = [];
      this.supervisors.split(/\s*,\s*/).forEach(function(s) {
        if(s) { ovr.supervisors.push(s); }
      })
    }
    if(this.home_board_key) {
      ovr.home_board_key = this.home_board_key;
    }
    var path = '/api/v1/users/' + this.model.user.id + '/start_code';
    if(this.model.org) {
      path = '/api/v1/organizations/' + this.model.org.id + '/start_code';
      if(this.user_type == 'supporter') {
        ovr.user_type = 'supporter';
      }
    }
    if(this.model.user || this.model.org) {
      this.status = {generating: true};
      this.persistence.ajax(path, {type: 'POST', data: {
        overrides: ovr
      }}).then(function(res) {
        _this.status = null;
        _this.new_start_code = null;
        _this.org_or_user.reload();
      }, function(err) {
        _this.status = {error: true, taken: err.result && err.result == 'code is taken', invalid_home: err.result && err.result == 'invalid home board'};
      });
    }
  }
}
