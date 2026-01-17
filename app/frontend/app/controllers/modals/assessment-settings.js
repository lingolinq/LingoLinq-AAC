import i18n from '../../utils/i18n';
import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import app_state from '../../utils/app_state';
import evaluation from '../../utils/eval';
import { set as emberSet } from '@ember/object';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';
import LingoLinq from '../../app';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    this.set('aborting', false);
    this.update_symbol_options();
    // TODO: on for_user update, check for that user's preferred 
    // library and default to that if it's an eval library
    var settings = Object.assign({}, this.get('model.assessment'));
    if(!settings.user_id) {
      settings.user_id = this.appState.get('currentUser.id') || settings.initiator_user_id;
      settings.user_name = this.appState.get('currentUser.name') || settings.initiator_user_name;
    }
    if(settings.user_id && !settings.for_user) {
      settings.for_user = {user_id: settings.user_id, user_name: settings.user_name};
    }
    if(settings.for_user.user_id == this.appState.get('sessionUser.id')) {
      settings.for_user.user_id = 'self';
    }
    settings.prompts_delay || '';
    if(settings.name == 'Unnamed Eval') {
      settings.name = "";
    }
    this.set('settings', settings);
    if(this.appState.get('currentUser.preferences.preferred_symbols')) {
      var pref = this.appState.get('currentUser.preferences.preferred_symbols');
      if((evaluation.libraries || []).indexOf(pref) != -1) {
        this.set('settings.default_library', pref);
      }
    }
  },
  update_user_name: observer('settings.for_user.user_id', function() {
    var user_id = this.get('settings.for_user.user_id');
    if(user_id) {
      // this.set('settings.for_user.user_name', 'user');
      if(user_id == 'self' || user_id == this.appState.get('currentUser.id')) {
        this.set('settings.for_user.user_name', this.appState.get('currentUser.user_name'));
      } else {  
        var _this = this;
        this.appState.get('currentUser.known_supervisees').forEach(function(u) {
          if(u.id == user_id) {
            _this.set('settings.for_user.user_name', u.user_name);
          }
        });
        var u = LingoLinq.store.peekRecord('user', user_id);
        u = u || (this.appState.get('quick_users') || {})[user_id];
        if(u) {
          _this.set('settings.for_user.user_name', u.user_name);
        }
      }
    }
  }),
  name_placeholder: computed('settings.user_name', 'settings.for_user.user_name', function() {
    return i18n.t('eval_for', "Eval for ") + (this.get('settings.for_user.user_name') || this.get('settings.user_name') || this.appState.get('currentUser.user_name')) + " - " + window.moment().format('MMM Do YYYY');
  }),
  save_option: computed('model.action', function() {
    return this.get('model.action') == 'results';
  }),
  symbol_libraries: computed('app_state.currentUser.subscription.extras_enabled', 'app_state.currentUser.subscription.lessonpix', function() {
    var res = [
      {name: i18n.t('open_symbols', "OpenSymbols (default)"), id: 'default'},
      {name: i18n.t('photos', "Photos"), id: 'photos'},
    ];
    var lessonpix_added = false;
    if(this.appState.get('currentUser')) {
      this.appState.get('currentUser').find_integration('lessonpix').then(function(integration) {
        if(!lessonpix_added) {
          lessonpix_added = true;
          res.pushObject({
            name: i18n.t('lessonpix_symbols', "LessonPix Symbols"),
            id: 'lessonpix'
          });
        }
      }, function(err) { });
    }
    if(this.appState.get('currentUser.subscription.lessonpix') && !lessonpix_added) {
      lessonpix_added = true;
      res.push({
        name: i18n.t('lessonpix_symbols', "LessonPix Symbols"),
        id: 'lessonpix'
      });
    }
    if(this.appState.get('currentUser.subscription.extras_enabled')) {
      res.pushObject({
        name: i18n.t('pcs_boardmaker', "PCS (BoardMaker) symbols from Tobii-Dynavox"),
        id: 'pcs'
      });
      res.pushObject({
        name: i18n.t('pcs_hc', "High-Contrast PCS (BoardMaker) symbols from Tobii-Dynavox"),
        id: 'pcs_hc'
      });
      res.pushObject({
        name: i18n.t('symbolstix_images', "SymbolStix Symbols"),
        id: 'symbolstix'
      });
      if(!lessonpix_added) {
        lessonpix_added = true;
        res.pushObject({
          name: i18n.t('lessonpix_symbols', "LessonPix Symbols"),
          id: 'lessonpix'
        });
      }
    }
    return res;
  }),
  update_symbol_options: observer('symbol_libraries', 'symbol_libraries.length', 'settings.default_library', function() {
    var res = [
      {image_names: ['cat'], label: i18n.t('cat', "Cat")},
      {image_names: ['dog'], label: i18n.t('dog', "Dog")},
      {image_names: ['fish'], label: i18n.t('fish', "Fish")},
      {image_names: ['bird'], label: i18n.t('bird', "Bird")},
      {id: 'animals', image_names: ['cat', 'dog', 'fish', 'bird'], label: i18n.t('animals', "Animals (alternating)")},
      {image_names: ['car'], label: i18n.t('car', "Car")},
      {image_names: ['truck'], label: i18n.t('truck', "Truck")},
      {image_names: ['airplane'], label: i18n.t('airplane', "Airplane")},
      {image_names: ['motorcycle'], label: i18n.t('motorcycle', "Motorcycle")},
      {image_names: ['train'], label: i18n.t('train', "Train")},
      {id: 'vehicles', image_names: ['car', 'truck', 'airplane', 'motorcycle', 'train'], label: i18n.t('vehicles', "Vehicles (alternating)")},
      {image_names: ['sandwich'], label: i18n.t('sandwich', "Sandwich")},
      {image_names: ['burrito'], label: i18n.t('burrito', "Burrito")},
      {image_names: ['spaghetti'], label: i18n.t('spaghetti', "Spaghetti")},
      {image_names: ['hamburger'], label: i18n.t('hamburger', "Hamburger")},
      {image_names: ['taco'], label: i18n.t('taco', "Taco")},
      {id: 'food', image_names: ['sandwich', 'burrito', 'spaghetti', 'hamburger', 'taco'], label: i18n.t('food', "Food (alternating)")},
      {image_names: ['apple'], label: i18n.t('apple', "Apple")},
      {image_names: ['banana'], label: i18n.t('banana', "Banana")},
      {image_names: ['strawberry'], label: i18n.t('strawberry', "Strawberry")},
      {image_names: ['blueberry'], label: i18n.t('blueberry', "Blueberry")},
      {id: 'fruit', image_names: ['apple', 'banana', 'strawberry', 'blueberry'], label: i18n.t('fruit', "Fruit (alternating)")},
      {image_names: ['planet'], label: i18n.t('planet', "Planet")},
      {image_names: ['sun'], label: i18n.t('sun', "Sun")},
      {image_names: ['comet'], label: i18n.t('comet', "Comet")},
      {image_names: ['asteroid'], label: i18n.t('asteroid', "Asteroid")},
      {id: 'space', image_names: ['planet', 'sun', 'comet', 'asteroid'], label: i18n.t('space', "Space (alternating)")},
    ];

    var library = this.get('settings.default_library') || 'default';
    res.forEach(function(r) {
      r.id = r.id || r.image_names[0];
      var list = [];
      (r.image_names || []).forEach(function(name) {
        var wrd = evaluation.words.find(function(w) { return w.label == name; });
        if(wrd && wrd.urls) {
          list.push(wrd.urls[library] || wrd.urls['default']);//wrd.urls[library] || wrd.urls['default']);
        }
      });
      r.images = list;
    });
    this.set('symbol_options', res);
  }),
  current_option: computed('settings.label', 'symbol_options', function() {
    var option_id = this.get('settings.label');
    var res = (this.get('symbol_options') || []).find(function(o) { return o.id == option_id});
    res = res || (this.get('symbol_options') || [])[0] || {label: i18n.t('choose_blank', "[Choose]")};
    return res;
  }),
  actions: {
    choose: function(id) {
      this.set('settings.label', id);
    },
    abort: function(confirm) {
      if(confirm) {
        if(this.appState.get('speak_mode')) {
          app_state.toggle_speak_mode();
        }
        app_state.return_to_index();
      } else {
        this.set('aborting', true);
      }
    },
    confirm: function() {
      // update assessment settings
      this.modal.close();
      if(this.get('settings.prompts_delay')) {
        var del = parseInt(this.get('settings.prompts_delay'), 10);
        if(del && del > 0) {
          this.set('settings.prompts_delay', del);
        }
      }
      if(!this.get('settings.name')) {
        this.set('settings.name', this.get('name_placeholder'));
      }
      evaluation.update(this.get('settings'), this.get('model.action') != 'results');
      if(this.get('model.action') == 'results') {
        evaluation.persist(this.get('settings'));
      }
    }
  }
});
