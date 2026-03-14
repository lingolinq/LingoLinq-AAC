import EmberApplication from '@ember/application';
import { isTesting } from '@ember/debug';
import { setOnerror } from '@ember/-internals/error-handling';
import { later as RunLater } from '@ember/runloop';
import Route from '@ember/routing/route';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import DS from 'ember-data';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import capabilities from './utils/capabilities';
import i18n from './utils/i18n';
import persistence from './utils/persistence';
import lingoLinqExtras from './utils/extras';
import { computed } from '@ember/object';

window.onerror = function(msg, url, line, col, obj) {
  // Enhanced debugging for persistence service errors (both null and undefined)
  if(msg && msg.indexOf('Cannot read properties of') !== -1 && (msg.indexOf('null') !== -1 || msg.indexOf('undefined') !== -1) && msg.indexOf('get') !== -1) {
    // console.error('[PERSISTENCE ERROR DEBUG] ... removed ...'); 
  }
  LingoLinq.track_error(msg + " (" + url + "-" + line + ":" + col + ")", false);
};
setOnerror(function(err) {
  // Enhanced debugging for unrecoverable render errors
  if(err && (err.message && err.message.indexOf('unrecoverable error') !== -1 || err.message && err.message.indexOf('Attempted to rerender') !== -1)) {
    console.error('[RENDER ERROR DEBUG] ========== UNRECOVERABLE RENDER ERROR ==========');
    console.error('[RENDER ERROR DEBUG] Error:', err);
    console.error('[RENDER ERROR DEBUG] Message:', err.message);
    console.error('[RENDER ERROR DEBUG] Stack:', err.stack);
    console.error('[RENDER ERROR DEBUG] ================================================');
  }
  if(err.stack) {
    LingoLinq.track_error(err.message, err.stack);
  } else {
    if(err.fakeXHR && (err.fakeXHR.status == 400 || err.fakeXHR.status == 404 || err.fakeXHR.status === 0)) {
      // should already be logged via "ember ajax error"
    } else if(err.status == 400 || err.status == 404 || err.status === 0) {
      // should already be logged via "ember ajax error"
    } else if(err._result && err._result.fakeXHR && (err._result.fakeXHR.status == 400 || err._result.fakeXHR.status == 404 || err._result.fakeXHR.status === 0)) {
      // should already be logged via "ember ajax error"
    } else {
      LingoLinq.track_error(JSON.stringify(err), false);
    }
  }
  // MUST rethrow when testing - required for test framework validation (after logging)
  if(isTesting() || LingoLinq.testing) {
    throw err;
  }
});

var customEvents = {
    'buttonselect': 'buttonSelect',
    'buttonpaint': 'buttonPaint',
    'actionselect': 'actionSelect',
    'symbolselect': 'symbolSelect',
    'rearrange': 'rearrange',
    'tripleclick': 'tripleClick',
    'speakmenuselect': 'speakMenuSelect',
    'clear': 'clear',
    'stash': 'stash',
    'select': 'select'
};

var LingoLinq = EmberApplication.extend({
  modulePrefix: config.modulePrefix,
  podModulePrefix: config.podModulePrefix,
  Resolver: Resolver,
  customEvents: customEvents,
  ready: function() {
    LingoLinq.ready();
  }
});
LingoLinq.ready = function() {
  if(LingoLinq.readying) { return; }
  LingoLinq.readying = true;
  // remove the splash screen if showing
  if(capabilities.installed_app || (navigator && navigator.splashscreen && navigator.splashscreen.hide)) {
    var checkForFooter = function() {
      if(document.querySelector("footer")) {
        if(navigator && navigator.splashscreen && navigator.splashscreen.hide) {
          window.splash_hidden = true;
          RunLater(navigator.splashscreen.hide, 700);
        } else {
          console.log("splash screen expected but not found");
        }
      } else {
        RunLater(checkForFooter, 200);
      }
    };
    RunLater(checkForFooter, 200);
  }
}

LingoLinq.grabRecord = persistence.DSExtend.grabRecord;
LingoLinq.embedded = !!location.href.match(/embed=1/);
LingoLinq.ad_referrer = (location.href.match(/\?ref=([^#]+)/) || [])[1];
LingoLinq.referrer = document.referrer;
LingoLinq.app_name = LingoLinq.app_name || (window.domain_settings || {}).app_name || window.default_app_name || "LingoLinq";
LingoLinq.company_name = LingoLinq.company_name || (window.domain_settings || {}).company_name || window.defualt_company_name || "LingoLinq";
LingoLinq.remote_url = function(url) {
  return url && url.match(/^http/) && !url.match(/^http:\/\/localhost/);
};

LingoLinq.track_error = function(msg, stack) {
  var error = new Error();
  if(window._trackJs) {
    window._trackJs.track(msg);
  } else {
    console.error(msg, stack || error.stack);
  }
  LingoLinq.errors = LingoLinq.errors || [];
  LingoLinq.errors.push({
    message: msg,
    date: (new Date()),
    stack: stack === false ? null : (stack || error.stack)
  });
}

if(capabilities.wait_for_deviceready) {
  document.addEventListener('deviceready', function() {
    var done = function() {
      if(done.completed) { return; }
      done.completed = true;
      if(window.kvstash) {
        console.debug('LINGOLINQ: found native key value store');
      }
      lingoLinqExtras.advance('device');
    };
    // Look up the stashed user name, which is needed for bootstrapping session and user data
    // and possibly is getting lost being set just in a cookie and localStorage
    var klass;
    if(capabilities.system == 'iOS' && capabilities.installed_app) {
      klass = 'iCloudKV';
      var make_stash = function(user_name) {
        window.kvstash = {
          values: {user_name: user_name},
          store: function(key, value) {
            window.kvstash.values[key] = value;
            window.cordova.exec(function() { }, function() { }, klass, 'save', [key.toString(), value.toString()]);
          },
          remove: function(key) {
            delete window.kvstash.values[key];
            window.cordova.exec(function() { }, function() { }, klass, 'remove', [key.toString()]);
          }
        };
        done();
      };
      window.cordova.exec(function(dict) {
        make_stash(dict.user_name);
      }, function() {
        // fall back to key-value lookup, since sync fails for some reason
        window.cordova.exec(function(val) {
          make_stash(val);
        }, done, klass, 'load', ['user_name']);
      }, klass, 'sync', []);
      RunLater(done, 500);
    } else if(capabilities.system == 'Android' && capabilities.installed_app) {
      klass = 'SharedPreferences';
      // Android key value store
      window.cordova.exec(function() {
        var make_stash = function(user_name) {
          window.kvstash = {
            values: {user_name: user_name},
            store: function(key, value) {
              window.kvstash.values[key] = value;
              window.cordova.exec(function() { }, function() { }, klass, 'putString', [key.toString(), value.toString()]);
            },
            remove: function(key) {
              delete window.kvstash.values[key];
              window.cordova.exec(function() { }, function() { }, klass, 'remove', [key.toString()]);
            }
          };
          done();
        };
        window.cordova.exec(function(res) {
          make_stash(res);
        }, function(err) {
          make_stash(null);
        }, klass, 'getString', ['user_name']);
      }, done, klass, 'getSharedPreferences', ['lingolinq_prefs', 'MODE_PRIVATE']);
      RunLater(done, 500);
    } else {
      done();
    }
  });
} else {
  lingoLinqExtras.advance('device');
}


loadInitializers(LingoLinq, config.modulePrefix);

DS.Model.reopen({
  reload: function(ignore_local) {
    if(ignore_local === false) {
      persistence.force_reload = null;
    } else {
      persistence.force_reload = this._internalModel.modelName + "_" + this.get('id');
    }
    return this._super();
  },
  retrieved: DS.attr('number'),
  fresh: computed('retrieved', 'app_state.refresh_stamp', function() {
    var retrieved = this.get('retrieved');
    var now = (new Date()).getTime();
    return (now - retrieved) < (5 * 60 * 1000);
  }),
  really_fresh: computed('retrieved', 'app_state.short_refresh_stamp', function() {
    var retrieved = this.get('retrieved');
    var now = (new Date()).getTime();
    return (now - retrieved) < (30 * 1000);
  }),
  save: function() {
    // TODO: this causes a difficult constraint, because you need to use the result of the
    // promise instead of the original record you were saving in any results, just in case
    // the record object changed. It's not ideal, but we have to do something because DS gets
    // mad now if the server returns a different id, and we use a temporary id when persisted
    // locally.
    if(this.id && this.id.match(/^tmp[_/]/) && persistence.get('online')) {
      var tmp_id = this.id;
      var tmp_key = this.get('key');
      var type = this._internalModel.modelName;
      var attrs = this._internalModel._attributes;
      var rec = this.store.createRecord(type, attrs);
      rec.tmp_key = tmp_key;
      return rec.save().then(function(result) {
        return persistence.remove(type, {}, tmp_id).then(function() {
          return RSVP.resolve(result);
        }, function() {
          return RSVP.reject({error: "failed to remove temporary record"});
        });
      });
    }
    return this._super();
  }
});

Route.reopen({
  update_title_if_present: function() {
    var controller = this.controllerFor(this.routeName);
    var title = this.get('title') || (controller && controller.get('title'));
    if(title) {
      LingoLinq.controller.updateTitle(title.toString());
    }
  },
  activate: function() {
    this.update_title_if_present();
    var controller = this.controllerFor(this.routeName);
    if(controller) {
      controller.addObserver('title', this, function() {
        this.update_title_if_present();
      });
    }
    this._super();
  }
});

LingoLinq.clean_path = function(str) {
  str = str.replace(/^\s+/, '').replace(/\s+$/, '');
  if(str.length == 0) { str = "_"; }
  if(str.match(/^\d/)) { str = "_" + str; }
  str = str.replace(/\'/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+$/, '').replace(/-+/g, '-');
  while(str.length < 3) { str = str + str; }
  return str;  
};

LingoLinq.licenseOptions = [
  {name: i18n.t('private_license', "Private (no reuse allowed)"), id: 'private'},
  {name: i18n.t('cc_by_license', "CC By (attribution only)"), id: 'CC By', url: 'https://creativecommons.org/licenses/by/4.0/'},
  {name: i18n.t('cc_by_sa_license', "CC By-SA (attribution + share-alike)"), id: 'CC By-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/'},
  {name: i18n.t('public_domain_license', "Public Domain"), id: 'public domain', url: 'https://creativecommons.org/publicdomain/zero/1.0/'}
];
LingoLinq.publicOptions = [
  {name: i18n.t('private', "Private"), id: 'private'},
  {name: i18n.t('public', "Public"), id: 'public'},
  {name: i18n.t('unlisted', "Unlisted"), id: 'unlisted'}
];
LingoLinq.board_categories = [
  {name: i18n.t('robust_vocabularies', "Robust Vocabularies"), id: 'robust'},
  {name: i18n.t('cause_and_effect', "Cause and Effect"), id: 'cause_effect'},
  {name: i18n.t('simple_starters', "Simple Starters"), id: 'simple_starts'},
  {name: i18n.t('functional_communication', "Functional Communication"), id: 'functional'},
  {name: i18n.t('phrase_based', "Phrase-Based"), id: 'phrases'},
  {name: i18n.t('keyboards', "Keyboards"), id: 'keyboards'},
];
LingoLinq.registrationTypes = [
  {name: i18n.t('pick_type', "- Choose your Role -"), id: ''},
  {name: i18n.t('registration_type_communicator', "A communicator"), id: 'communicator'},
  {name: i18n.t('registration_type_parent_communicator', "A parent and communicator"), id: 'communicator'},
  {name: i18n.t('registration_type_slp', "A therapist"), id: 'therapist'},
  {name: i18n.t('registration_type_parent', "A supervising parent"), id: 'parent'},
  {name: i18n.t('registration_type_eval', "An evaluation/assessment device"), id: 'eval'},
  {name: i18n.t('registration_type_teacher', "A teacher"), id: 'teacher'},
  {name: i18n.t('registration_type_other', "An aide, caregiver or other supporter"), id: 'other'}
];
LingoLinq.user_statuses = [
  {id: 'unchecked', label: i18n.t('unknown_nothing', "Unknown/Nothing"), on: true},
  {id: 'hourglass', label: i18n.t('waiting_for_evaluation', "Waiting for Evaluation"), on: true},
  {id: 'equalizer', label: i18n.t('waiting_for_results', "Waiting for Recommendation from Eval"), on: true},
  {id: 'piggy-bank', label: i18n.t('temporary_solution_while_waiting', "Temporary Solution, Waiting for Funding"), on: true},
  {id: 'phone', label: i18n.t('waiting_for_device', "Waiting for Device"), on: true},
  {id: 'hand-up', label: i18n.t('training_started', "Training Started"), on: true},
  {id: 'grain', label: i18n.t('implemented_recently', "Implemented Recently"), on: true},
  {id: 'tree-deciduous', label: i18n.t('implemented_making_progress', "Implemented, Making Progress"), on: true},
  {id: 'exclamation-sign', label: i18n.t('needing_additional_supporter', "Needing Additional Support"), on: true},
  {id: 'gift'},
  {id: 'bell'},
  {id: 'flash'},
  {id: 'calendar'},
  {id: 'apple'},
  {id: 'blackboard'},
];
LingoLinq.access_methods = {
  touch: 'hand-up',
  axis_scanning: 'screenshot',
  scanning: 'barcode',
  arrow_dwell: 'arrow-up',
  mouse_dwell: 'arrow-up',
  gaze: 'eye-open',
  head: 'user',
  dwell: 'arrow-up',
  other: 'asterisk'
};


LingoLinq.board_levels = [
  {name: i18n.t('unspecified_empty', "[  ]"), id: ''},
  {name: i18n.t('level_1', "1 - Minimal Targets"), id: '1'},
  {name: i18n.t('level_2', "2 - Basic Core"), id: '2'},
  {name: i18n.t('level_3', "3 - Additional Basic Core"), id: '3'},
  {name: i18n.t('level_4', "4 - Personal/Motivational Fringe"), id: '4'},
  {name: i18n.t('level_5', "5 - Introducing Multiple Levels"), id: '5'},
  {name: i18n.t('level_6', "6 - Broadening Core & Fringe"), id: '6'},
  {name: i18n.t('level_7', "7 - Sentence Supports"), id: '7'},
  {name: i18n.t('level_8', "8 - Additional Fringe Levels"), id: '8'},
  {name: i18n.t('level_9', "9 - Robust Core and Fringe"), id: '9'},
  {name: i18n.t('level_10', "10 - Full Vocabulary"), id: '10'},
];    
LingoLinq.parts_of_speech = [
  {name: i18n.t('unspecified', "Unspecified"), id: ''},
  {name: i18n.t('noun', "Noun (dog, Dad)"), id: 'noun'},
  {name: i18n.t('verb', "Verb (jump, fly)"), id: 'verb'},
  {name: i18n.t('adjective', "Adjective (silly, red)"), id: 'adjective'},
  {name: i18n.t('pronoun', "Pronoun (he, they)"), id: 'pronoun'},
  {name: i18n.t('adverb', "Adverb (kindly, often)"), id: 'adverb'},
  {name: i18n.t('question', "Question (why, when)"), id: 'question'},
  {name: i18n.t('conjunction', "Conjunction (and, or)"), id: 'conjunction'},
  {name: i18n.t('negation', "Negation (not, never)"), id: 'negation'},
  {name: i18n.t('preposition', "Preposition (behind, with)"), id: 'preposition'},
  {name: i18n.t('interjection', "Interjection (ahem, duh, hey)"), id: 'interjection'},
  {name: i18n.t('article', "Article (a, an, the)"), id: 'article'},
  {name: i18n.t('determiner', "Determiner (that, his)"), id: 'determiner'},
  {name: i18n.t('number', "Number (one, two)"), id: 'number'},
  {name: i18n.t('social_phrase', "Social Phrase (hello, thank you)"), id: 'social'},
  {name: i18n.t('other_word_type', "Other word type"), id: 'other'},
  {name: i18n.t('custom_1', "Custom Word Type 1"), id: 'custom_1'},
  {name: i18n.t('custom_2', "Custom Word Type 2"), id: 'custom_2'},
  {name: i18n.t('custom_3', "Custom Word Type 3"), id: 'custom_3'}
];

// derived from http://praacticalaac.org/strategy/communication-boards-colorful-considerations/
// and http://talksense.weebly.com/cbb-8-colour.html
LingoLinq.keyed_colors = [
  {border: "#ccc", fill: "#fff", color: i18n.t('white', "White"), types: ['conjunction', 'number']},
  {border: "#dd0", fill: "#ffa", color: i18n.t('yellow', "Yellow"), hint: i18n.t('people', "people"), types: ['pronoun']},
  {border: "#6d0", fill: "#cfa", color: i18n.t('green', "Green"), hint: i18n.t('actions_lower', "actions"), types: ['verb']},
  {fill: "#fca", color: i18n.t('orange', "Orange"), hint: i18n.t('nouns', "nouns"), types: ['noun', 'nominative']},
  {fill: "#acf", color: i18n.t('blue', "Blue"), hint: i18n.t('describing_words', "describing"), types: ['adjective']},
  {fill: "#caf", color: i18n.t('purple', "Purple"), hint: i18n.t('questions', "questions"), types: ['question']},
  {fill: "#faa", color: i18n.t('red', "Red"), hint: i18n.t('negations', "negations"), types: ['negation', 'expletive', 'interjection']},
  {fill: "#fac", color: i18n.t('pink', "Pink"), hint: i18n.t('social_words', "social words"), types: ['preposition', 'social']},
  {fill: "#ca8", color: i18n.t('brown', "Brown"), hint: i18n.t('adverbs', "adverbs"), types: ['adverb']},
  {fill: "#ccc", color: i18n.t('gray', "Gray"), hint: i18n.t('determiners', "determiners"), types: ['article', 'determiner']},
  {fill: 'rgb(115, 204, 255)', color: i18n.t('bluish', "Bluish"), hint: i18n.t('other_lower', "other"), types: []},
  {fill: "#000", color: i18n.t('black', "Black"), hint: i18n.t('contrast_lower', "contrast"), types: []}
];
LingoLinq.extra_keyed_colors = [
  {border: '#0069e7', fill: '#9fceef', label: 'adj1'},
  {border: '#0069e7', fill: '#e0edf9', label: 'adj2'},
  {border: '#1086e9', fill: '#a0cfee', label: 'adjf'},
  {border: '#b6a39c', fill: '#b6a39c', label: 'adv'},
  {border: '#b6a39c', fill: '#fff', label: 'conj'},
  {border: '#fd0000', fill: '#fff', label: 'morph'},
  {border: '#fd0000', fill: '#fad5d5', label: 'neg'},
  {border: '#ffa019', fill: '#fff', label: 'noun1'},
  {border: '#ffa019', fill: '#fff4e4', label: 'noun2'},
  {border: '#ff6f00', fill: '#ffe2b9', label: 'noun3'},
  {border: '#ffa019', fill: '#ffd7a5', label: 'nounf'},
  {border: '#000', fill: '#fff', label: 'phrs1'},
  {border: '#000', fill: '#e0edf9', label: 'phrs2'},
  {border: '#000', fill: '#a0cfee', label: 'phrs3'},
  {border: '#ffae43', fill: '#ffe1bb', label: 'snd1'},
  {border: '#ffcd38', fill: '#feefbf', label: 'prnn'},
  {border: '#ffcd38', fill: '#fee594', label: 'prnnf'},
  {border: '#b968ec', fill: '#fff', label: 'qstn1'},
  {border: '#b968ec', fill: '#f3dafb', label: 'qstn2'},
  {border: '#9e16e8', fill: '#bea3dc', label: 'qstn3'},
  {border: '#b968ec', fill: '#bba4db', label: 'qstnf'},
  {border: '#ff81de', fill: '#f7b4e0', label: 'prep1'},
  {border: '#ff81de', fill: '#fde5f5', label: 'prep2'},
  {border: '#ff81de', fill: '#f7b4e0', label: 'prepf'},
  {border: '#00c75f', fill: '#b9e7c4', label: 'verb1'},
  {border: '#00c75f', fill: '#ebf8ed', label: 'verb2'},
  {border: '#00c75f', fill: '#9ce8a9', label: 'verbf'},
  {border: '#ff2f25', fill: '#f3a4a4', label: 'else'}
];

LingoLinq.licenseOptions.license_url = function(id) {
  for(var idx = 0; idx < LingoLinq.licenseOptions.length; idx++) {
    if(LingoLinq.licenseOptions[idx].id == id) {
      return LingoLinq.licenseOptions[idx].url;
    }
  }
  return "";
};

LingoLinq.iconUrls = [
    {alt: 'house', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/house.svg'},
    {alt: 'food', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/food.svg'},
    {alt: 'verbs', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/verbs.png'},
    {alt: 'describe', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/to%20explain.png'},
    {alt: 'you', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/you.png'},
    {alt: 'questions', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/ask_2.png'},
    {alt: 'people', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/group%20of%20people_2.png'},
    {alt: 'time', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/clock-watch_6.png'},
    {alt: 'city', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/place.png'},
    {alt: 'world', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/world.svg'},
    {alt: 'clothing', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/clothes.png'},
    {alt: 'cheeseburger', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/cheese%20burger.svg'},
    {alt: 'school', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/school%20bag.svg'},
    {alt: 'fish', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/fish.svg'},
    {alt: 'party', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/party_3.png'},
    {alt: 'shoe', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/shoes_8.png'},
    {alt: 'boy', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/boy_1.png'},
    {alt: 'girl', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/girl_1.png'},
    {alt: 'toilet', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/toilet.svg'},
    {alt: 'car', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/car.png'},
    {alt: 'sun', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/sun.svg'},
    {alt: 'snowman', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/snowman.png'},
    {alt: 'bed', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/bed.png'},
    {alt: 'computer', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/computer_2.png'},
    {alt: 'phone', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/mobile%20phone.png'},
    {alt: 'board', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png'}
];
LingoLinq.avatarUrls = [
  {alt: 'happy female', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/happy.png'},
  {alt: 'happy', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/happy%20look_1.png'},
  {alt: 'teacher', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/teacher%20(female).png'},
  {alt: 'female doctor', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/doctor_3.png'},
  {alt: 'male doctor', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/doctor_1.png'},
  {alt: 'speech therapist', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/speech%20therapist_1.png'},
  {alt: 'mother', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/mother.png'},
  {alt: 'father', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/father.png'},
  {alt: 'girl', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/girl_2.png'},
  {alt: 'girl face', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/girl_3.png'},
  {alt: 'boy', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/boy_3.png'},
  {alt: 'boy face', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/boy_2.png'},
  {alt: 'boy autism', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/autistic%20boy.png'},
  {alt: 'girl autism', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/autistic%20girl.png'},
  {alt: 'cat', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/cat.svg'},
  {alt: 'dog', url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/dog.png'},
  {alt: 'car', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/car.svg'},
  {alt: 'train', url: 'https://opensymbols.s3.amazonaws.com/libraries/mulberry/train.svg'},
  {alt: 'bees', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/bees.png'},
  {alt: 'butterfly', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/butterfly2.png'},
  {alt: 'robocat', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/cat_cub.png'},
  {alt: 'caterpillar', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/caterpiller.png'},
  {alt: 'cauldron', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/cauldron.png'},
  {alt: 'cupcake', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/cupcake.png'},
  {alt: 'cyclops', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/cyclops.png'},
  {alt: 'dragon', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/dragon.png'},
  {alt: 'dragonfly', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/dragonfly.png'},
  {alt: 'earth', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/earth.png'},
  {alt: 'fairy', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/fairy_flying.png'},
  {alt: 'fairy with ruffles', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/fairyruffles.png'},
  {alt: 'book', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/fairytale.png'},
  {alt: 'lizard', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/findragon.png'},
  {alt: 'flower', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/flower.png'},
  {alt: 'gears', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/gears.png'},
  {alt: 'gryphon', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/gryphon.png'},
  {alt: 'hearts', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/hearts.png'},
  {alt: 'horse', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/horse.png'},
  {alt: 'ladybug', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/ladybug.png'},
  {alt: 'firefly', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/lightningbug.png'},
  {alt: 'lion', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/lion.png'},
  {alt: 'harp', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/lyre.png'},
  {alt: 'medusa', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/medusa.png'},
  {alt: 'rainbow', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/rainbow.png'},
  {alt: 'roar', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/roar.png'},
  {alt: 'robot', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/robot.png'},
  {alt: 'scorpion', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/scorpion.png'},
  {alt: 'mermaid', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/siren.png'},
  {alt: 'snakes', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/snakes.png'},
  {alt: 'sprite', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/sprite.png'},
  {alt: 'sun', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/sun2.png'},
  {alt: 'tiger', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/tiger.png'},
  {alt: 'frog', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/toad.png'},
  {alt: 'triceratops', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/triceratops.png'},
  {alt: 'wizard', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/wizard.png'},
  {alt: 'zombie', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/zombie.png'},
  {alt: 'stegosaurus', url: 'https://opensymbols.s3.amazonaws.com/libraries/language-craft/stegosaurus.png'}
];
LingoLinq.Lessons = {
  track: function(url) {
    return new RSVP.Promise(function(resolve, reject) {
      var lesson = LingoLinq.Lessons.assert_lesson();
      lesson.restart(url);
    });
  },
  assert_lesson: function() {
    LingoLinq.Lessons.lesson = LingoLinq.Lessons.lesson || EmberObject.extend({
      restart: function(url) {
        this.set('state', null);
      }
    }).create();
  }
};
LingoLinq.Videos = {
  players: {},
  track: function(dom_id, callback) {
    return new RSVP.Promise(function(resolve, reject) {
      LingoLinq.Videos.waiting = LingoLinq.Videos.waiting || {};
      LingoLinq.Videos.waiting[dom_id] = LingoLinq.Videos.waiting[dom_id] || [];
      var found = false;
      LingoLinq.Videos.waiting[dom_id].push(function(player) {
        found = true;
        if(callback) {
          player.addListener(callback);
        }
        console.log('player ready!', dom_id);
        resolve(player);
      });
      setTimeout(function() {
        reject("player never initialized");
      }, 5000);
    });
  },
  untrack: function(dom_id, callback) {
    var player = LingoLinq.Videos.players[dom_id];
    if(player) {
      player.removeListener(callback);
    }
  },
  player_ready: function(dom, window) {
    if(!dom.id) { return; }
    if(LingoLinq.Videos.players[dom.id] && LingoLinq.Videos.players[dom.id]._dom == dom) {
      return;
    }
    console.log("initializing player", dom.id);
    if(LingoLinq.Videos.players[dom.id]) {
      LingoLinq.Videos.players[dom.id].cleanup();
    }
    var player = EmberObject.extend({
      _target_window: window,
      _dom: dom,
      current_time: function() {
        return player.get('time');
      },
      cleanup: function() {
        player.set('disabled', true);
      },
      pause: function() {
        player._target_window.postMessage({video_message: true, action: 'pause'}, '*');
      },
      play: function() {
        player._target_window.postMessage({video_message: true, action: 'play'}, '*');
      },
      addListener: function(callback) {
        if(!callback) { return; }
        player.listeners = player.listeners || [];
        player.listeners.push(callback);
      },
      removeListener: function(callback) {
        if(!callback) { return; }
        player.listeners = (player.listeners || []).filter(function(c) { return c != callback; });
      },
      trigger: function(event) {
        (player.listeners || []).forEach(function(callback) {
          callback(event);
        });
      }
    }).create({state: 'initialized'});
    LingoLinq.Videos.players[dom.id] = player;
    LingoLinq.Videos.waiting = LingoLinq.Videos.waiting || {};
    (LingoLinq.Videos.waiting[dom.id] || []).forEach(function(callback) {
      callback(player);
    });
    LingoLinq.Videos.waiting[dom.id] = [];
  },
  player_status: function(event) {
    var frame = null;
    try {
      frame = event.frameRef || event.source.frameElement;
    } catch(e) { }
    if(!frame) {
      var frames = document.getElementsByTagName('IFRAME');
      for(var idx = 0; idx < frames.length; idx++) {
        if(!frame && frames[idx].contentWindow == event.source) {
          frame = frames[idx];
        }
      }
    }
    if(frame && frame.id) {
      LingoLinq.Videos.player_ready(frame, event.source);
      var player = LingoLinq.Videos.players[frame.id];
      if(player) {
        if(event.data && event.data.time !== undefined) {
          player.set('time', event.data.time);
          player.set('started', true);
        }
        if(event.data && event.data.duration !== undefined) {
          player.set('duration', event.data.duration);
        }
        var last_state = player.get('state');
        if(event.data.state !== last_state) {
          player.set('state', event.data.state);
          player.trigger(event.data.state);
        }
        player.set('paused', player.get('state') != 'playing');
      }
    }
  }
};

window.addEventListener('message', function(event) {
  if(event.data && event.data.video_status) {
    var frame = null;
    try {
      frame = event.frameRef || event.source.frameElement;
    } catch(e) { }
    if(!frame) {
      var frames = document.getElementsByTagName('IFRAME');
      for(var idx = 0; idx < frames.length; idx++) {
        if(!frame && frames[idx].contentWindow == event.source) {
          frame = frames[idx];
        }
      }
    }
    if(frame && frame.id) {
      var dom_id = frame.id;
      var elem = frame;
      event.frameRef = frame;
      LingoLinq.Videos.player_status(event);
    }
  } else if(event.data && event.data.lesson_status) {
    var lesson = LingoLinq.Lessons.assert_lesson();
    lesson.set('duration', event.data.duration);
    lesson.set('state', event.data.state);
  }
});


// LingoLinq.YT = {
//   track: function(player_id, callback) {
//     return new RSVP.Promise(function(resolve, reject) {
//       if(!LingoLinq.YT.ready) {
//         var tag = document.createElement('script');
//         tag.src = "https://www.youtube.com/iframe_api";
//         var firstScriptTag = document.getElementsByTagName('script')[0];
//         firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
//         window.onYouTubeIframeAPIReady = function() {
//           LingoLinq.YT.ready = true;
//           LingoLinq.YT.track(player_id, callback).then(function(player) {
//             resolve(player);
//           }, function() { reject('no_player'); });
//         };
//       } else {
//         setTimeout(function() {
//           var player = EmberObject.extend({
//             current_time: function() {
//               var p = this.get('_player');
//               return p && p.getCurrentTime && p.getCurrentTime();
//             },
//             cleanup: function() {
//               this.set('disabled', true);
//             },
//             pause: function() {
//               var p = this.get('_player');
//               if(p && p.pauseVideo) {
//                 p.pauseVideo();
//               }
//             },
//             play: function() {
//               var p = this.get('_player');
//               if(p && p.playVideo) {
//                 p.playVideo();
//               }
//             }
//           }).create();
//           player.set('_player', new window.YT.Player(player_id, {
//             events: {
//               'onStateChange': function(event) {
//                 if(callback) {
//                   if(event.data == window.YT.PlayerState.ENDED) {
//                     callback('end');
//                     player.set('paused', false);
//                   } else if(event.data == window.YT.PlayerState.PAUSED) {
//                     callback('pause');
//                     player.set('paused', true);
//                   } else if(event.data == window.YT.PlayerState.CUED) {
//                     callback('pause');
//                     player.set('paused', true);
//                   } else if(event.data == window.YT.PlayerState.PLAYING) {
//                     callback('play');
//                     player.set('paused', false);
//                   }
//                 }
//               },
//               'onError': function(event) {
//                 if(callback) {
//                   if(event.data == 5 || event.data == 101 || event.data == 150) {
//                     callback('embed_error');
//                     player.set('paused', true);
//                   } else {
//                     callback('error');
//                     player.set('paused', true);
//                   }
//                 }
//               }
//             }
//           }));
//           LingoLinq.YT.players = LingoLinq.YT.players || [];
//           LingoLinq.YT.players.push(player);
//           resolve(player);
//         }, 200);
//       }
//     });
//   },
//   poll: function() {
//     (LingoLinq.YT.players || []).forEach(function(player) {
//       if(!player.get('disabled')) {
//         var p = player.get('_player');
//         if(p && p.getDuration) {
//           player.set('duration', Math.round(p.getDuration()));
//         }
//         if(p && p.getCurrentTime) {
//           player.set('time', Math.round(p.getCurrentTime()));
//         }
//         if(p && p.getPlayerState) {
//           var state = p.getPlayerState();
//           if(state == window.YT.PlayerState.PLAYING) {
//             player.set('paused', false);
//             if(!p.started) {
//               p.started = true;
//               player.set('started', true);
//             }
//           } else {
//             player.set('paused', true);
//           }
//         }
//       }
//     });
//     RunLater(LingoLinq.YT.poll, 100);
//   }
// };
// if(!isTesting()) {
//   RunLater(LingoLinq.YT.poll, 500);
// }

LingoLinq.Visualizations = {
  wait: function(name, callback) {
    if(!LingoLinq.Visualizations.ready) {
      LingoLinq.Visualizations.callbacks = LingoLinq.Visualizations.callbacks || [];
//       var found = LingoLinq.Visualizations.callbacks.find(function(cb) { return cb.name == name; });
//       if(!found) {
        LingoLinq.Visualizations.callbacks.push({
          name: name,
          callback: callback
        });
//       }
      LingoLinq.Visualizations.init();
    } else {
      callback();
    }
  },
  handle_callbacks: function() {
    LingoLinq.Visualizations.initializing = false;
    LingoLinq.Visualizations.ready = true;
    (LingoLinq.Visualizations.callbacks || []).forEach(function(obj) {
      obj.callback();
    });
    LingoLinq.Visualizations.callbacks = [];
  },
  init: function() {
    if(LingoLinq.Visualizations.initializing || LingoLinq.Visualizations.ready) { return; }
    LingoLinq.Visualizations.initializing = true;
    if(!window.google || !window.google.visualization || !window.google.maps) {
      var script = document.createElement('script');
      script.type = 'text/javascript';

      var one_done = function(type) {
        one_done[type] = true;
        if(one_done.graphs && one_done.maps) {
          if(!window.google || !window.google.charts || !window.google.charts.load) {
            setTimeout(function() {
              one_done('both');
            }, 500);
          } else {
            window.google.charts.load('current', {packages:["corechart", "sankey"], callback: LingoLinq.Visualizations.handle_callbacks});
          }
        }
      };

      window.ready_to_load_graphs = function() {
        one_done('graphs');
      };
      script.src = 'https://www.gstatic.com/charts/loader.js';
      document.body.appendChild(script);
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.appendChild(document.createTextNode("window.ready_to_load_graphs();"));
      document.body.appendChild(script);

      window.ready_to_do_maps = function() {
        one_done('maps');
      };
      script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      // TODO: pull api keys out into config file?
      script.src = 'https://maps.googleapis.com/maps/api/js?v=3.exp&loading=async&' +
          'callback=ready_to_do_maps&key=' + window.maps_key;
      document.body.appendChild(script);
    } else {
      RunLater(LingoLinq.Visualizations.handle_callbacks);
    }

  }
};

LingoLinq.boxPad = 17;
LingoLinq.borderPad = 5;
LingoLinq.labelHeight = 15;
LingoLinq.customEvents = customEvents;
LingoLinq.expired = function() {
  var keys = window.app_version.match(/(\d+)\.(\d+)\.(\d+)/);
  var version = parseInt(keys[1] + keys[2] + keys[3], 10);
  var now = parseInt(window.moment().format('YYYYMMDD'), 10);
  var diff = now - version;
  return diff > 30;
};
LingoLinq.log = {
  start: function() {
    LingoLinq.log.started = (new Date()).getTime();
  },
  track: function(msg) {
    if(!LingoLinq.loggy) { return; }
    var now = (new Date()).getTime();
    if(LingoLinq.log.started) {
      console.debug("TRACK:" + msg, now - LingoLinq.log.started);
    }
  }
};
window.LingoLinq = LingoLinq;
window.LingoLinq.VERSION = window.app_version;
// Set verboseDebug=true in console or localStorage lingolinq_verbose_debug='true' for verbose debug logs
window.LingoLinq.verboseDebug = window.LingoLinq.verboseDebug || (typeof localStorage !== 'undefined' && localStorage.getItem('lingolinq_verbose_debug') === 'true');

export default LingoLinq;
