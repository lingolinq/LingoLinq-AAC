import Controller from '@ember/controller';
import modal from '../../utils/modal';
import { computed, observer } from '@ember/object';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/string';
import LingoLinq from '../../app';

export default Controller.extend({
  opening: function() {
    var _this = this;
    _this.set('status', null);
    if(_this.get('model.saml_metadata_url')) {
      _this.set('external_auth', true);
    }
    _this.set('allow_support_target', !!_this.get('model.support_target'));
    _this.set('support_email', _this.get('model.support_target.email'));
    _this.set('model.parent_org_id', _this.get('model.parent_org.id'));
  },
  lookup_parent_org: observer('model.parent_org_id', function() {
    var _this = this;
    var lookup_id = _this.get('model.parent_org_id');
    if(!lookup_id || !lookup_id.match(/\d+_\d+/)) { return; }
    if(lookup_id && _this.get('model.parent_org.id') != lookup_id) {
      _this.set('model.parent_org', {
        name: i18n.t('loading', "Loading..."),
        pending: true
      });
      LingoLinq.store.findRecord('organization', lookup_id).then(function(res) {
        if(lookup_id == _this.get('model.parent_org_id')) {
          _this.set('model.parent_org', {
            id: res.get('id'),
            name: res.get('name'),
            pending: true
          });
        }
      }, function() {
        if(lookup_id == _this.get('model.parent_org_id')) {
          _this.set('model.parent_org', {
            error: true,
            pending: true,
            name: i18n.t('error_loading_org', "Error Loading Organization")
          })
        }        
      });
    }
  }),
  no_communicator_profile: computed('model.communicator_profile_id', function() {
    var id = this.get('model.communicator_profile_id');
    return !!(id == 'none' || id == '' || !id);
  }),
  no_supervisor_profile: computed('model.supervisor_profile_id', function() {
    var id = this.get('model.supervisor_profile_id');
    return !!(id == 'none' || id == '' || !id);
  }),
  home_board_key_lines: computed('model.home_board_keys', function() {
    return (this.get('model.home_board_keys') || []).join('\n');
  }),
  board_keys_placeholder: computed(function() {
  return htmlSafe(i18n.t('board_keys_examples', "board keys or URLS\none per line"));
  }),
  premium_symbol_library: computed('symbols_list', 'model.preferred_symbols', function() {
    return ['pcs', 'lessonpix', 'symbolstix'].indexOf(this.get('model.preferred_symbols')) != -1;
  }),
  symbols_list: computed(function() {
    var list = [
      {name: i18n.t('original_symbols', "Use the board's original symbols"), id: 'original'},
      {name: i18n.t('use_opensymbols', "Opensymbols.org free symbol libraries"), id: 'opensymbols'},

      {name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix'},
      {name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix'},
      {name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs'},

      {name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji'},
      {name: i18n.t('use_noun-project', "The Noun Project black outlines"), id: 'noun-project'},
      {name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac'},
      {name: i18n.t('use_tawasol', "Tawasol symbol library"), id: 'tawasol'},
    ];
    return list;
  }),
  locale_list: computed(function() {
    var list = i18n.get('locales');
    var res = [{name: i18n.t('choose_locale', '[Choose a Language]'), id: ''}];
    for(var key in list) {
      res.push({name: list[key], id: key});
    }
    res.push({name: i18n.t('unspecified', "Unspecified"), id: ''});
    return res;
  }),
  actions: {
    modify_templates: function() {
      var _this = this;
      modal.open('modals/note-templates', {note_templates: this.get('model.note_templates')}).then(function(res) {
        if(res && res.note_templates) {
          _this.set('model.note_templates', res.note_templates);
        }
      });
    },
    manage_start_codes: function() {
      var _this = this;
      modal.open('modals/start-codes', {org: _this.get('model')});
    },
    cancel: function() {
      this.transitionToRoute('organization', this.get('model.id'));
    },
    save: function() {
      var _this = this;
      if(!_this.get('external_auth')) {
        _this.set('model.saml_metadata_url', null);
        _this.set('model.saml_sso_url', null);
      }
      if(_this.get('home_board_key_lines.length') > 0) {
        _this.set('model.home_board_keys', _this.get('home_board_key_lines').split(/\n/));
      }
      _this.set('model.support_target', null);
      if(_this.get('allow_support_target') && _this.get('support_email')) {
        _this.set('model.support_target', {email: _this.get('support_email')})
      }
      var org = _this.get('model');
      _this.set('status', {saving: true});
      org.save().then(function() {
        _this.set('status', null);
        _this.transitionToRoute('organization', _this.get('model.id'));
      }, function() {
        _this.set('status', {error: true});
      });
    }
  }
});
