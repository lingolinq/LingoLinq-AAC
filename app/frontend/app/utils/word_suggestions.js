import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import RSVP from 'rsvp';
import persistence from './persistence';
import capabilities from './capabilities';
import utterance from './utterance';
import app_state from './app_state';
import Utils from './misc';
import i18n from './i18n';
import LingoLinq from '../app';
import config from '../config/environment';
import ai_word_predictor from './ai_word_predictor';
import templateHelpers from './template_helpers';

var FREQ_STORAGE_KEY = 'lingolinq_word_freq';
var BIGRAM_STORAGE_KEY = 'lingolinq_word_bigrams';
var SYNC_QUEUE_KEY = 'lingolinq_prediction_sync_queue';
var FREQ_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
var _sync_timer = null;

var normalize_prediction_key = function(phrase) {
  return (phrase || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
};

var time_of_day_bucket_for_date = function(d) {
  var date = d instanceof Date ? d : new Date(d);
  var h = date.getHours();
  if(h >= 5 && h < 12) { return 'morning'; }
  if(h >= 12 && h < 17) { return 'afternoon'; }
  if(h >= 17 && h < 21) { return 'evening'; }
  return 'night';
};

var time_of_day_bucket_for_hour = function(h) {
  var hour = Number(h);
  if(hour !== hour) { return 'night'; }
  if(hour >= 5 && hour < 12) { return 'morning'; }
  if(hour >= 12 && hour < 17) { return 'afternoon'; }
  if(hour >= 17 && hour < 21) { return 'evening'; }
  return 'night';
};

var decayed_freq_score = function(entry, now_ms) {
  if(!entry || typeof entry.s !== 'number') { return 0; }
  var t = entry.t || now_ms;
  var age = Math.max(0, now_ms - t);
  return entry.s * Math.pow(0.5, age / FREQ_HALF_LIFE_MS);
};

var load_freq_state = function(raw_json, now_ms) {
  var parsed = null;
  try {
    parsed = raw_json ? JSON.parse(raw_json) : null;
  } catch(e) {
    parsed = null;
  }
  var entries = (parsed && parsed.entries && typeof parsed.entries === 'object') ? parsed.entries : {};
  var next = {};
  for(var k in entries) {
    if(!Object.prototype.hasOwnProperty.call(entries, k)) { continue; }
    var e = entries[k];
    if(!e || typeof e !== 'object') { continue; }
    var s = decayed_freq_score({ s: e.s, t: e.t }, now_ms);
    if(s > 0.0005) {
      next[k] = { s: s, t: now_ms };
    }
  }
  return { v: 1, entries: next };
};

var serialize_freq_state = function(state) {
  return JSON.stringify(state || { v: 1, entries: {} });
};

var load_bigram_state = function(raw_json, now_ms) {
  var parsed = null;
  try {
    parsed = raw_json ? JSON.parse(raw_json) : null;
  } catch(e) {
    parsed = null;
  }
  var entries = (parsed && parsed.entries && typeof parsed.entries === 'object') ? parsed.entries : {};
  var next = {};
  for(var k in entries) {
    if(!Object.prototype.hasOwnProperty.call(entries, k)) { continue; }
    var e = entries[k];
    var s = decayed_freq_score(e, now_ms);
    if(s > 0.0005) {
      next[k] = { s: s, t: now_ms, prefix: e.prefix, word: e.word };
    }
  }
  return { v: 1, entries: next };
};

var serialize_bigram_state = function(state) {
  return JSON.stringify(state || { v: 1, entries: {} });
};

var load_sync_queue = function() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
  } catch(e) {
    return [];
  }
};

var smart_phrases = {
  // Question starters (AAC-friendly, frequent)
  'when': ['do you', 'can I', 'will you', 'is it', 'are we', 'did you'],
  'what': ['do you', 'is it', 'can I', 'are we', 'should we', 'happened'],
  'where': ['is it', 'are we', 'do we', 'can I', 'should we', 'did you'],
  'why': ['did you', 'are we', 'is it', 'do we', 'can I', 'should we'],
  'how': ['do you', 'can I', 'are we', 'is it', 'should we'],

  // Common AAC phrase pivots
  'can': ['I', 'you', 'we', 'we do', 'I have', 'I go'],
  'could': ['I', 'you', 'we', 'we go'],
  'will': ['you', 'we', 'it', 'I', 'you help', 'you do'],
  'do': ['you', 'we', 'I', 'it'],
  'did': ['you', 'we', 'I', 'it'],
  'is': ['it', 'this', 'that', 'there'],
  'are': ['you', 'we', 'they', 'there'],

  // Needs/wants
  'i need': ['help', 'a break', 'water', 'to go', 'to rest', 'to eat'],
  'i want': ['to', 'more', 'help', 'that', 'this', 'a'],
  'i': ['want', 'need', 'like', 'feel', 'can', 'will'],
  'you': ['can', 'want', 'need', 'are', 'will'],
  'we': ['can', 'need', 'should', 'will', 'are'],

  // Time/day patterns
  'good': ['morning', 'night', 'job', 'idea'],
  'good morning': ['i', 'we', 'how', 'what'],
  'good night': ['i', 'love you', 'see you', 'sleep well']
};

// Time-of-day rerank weights (lightweight, local)
var time_of_day_weights = {
  morning: {
    'breakfast': 1.5,
    'school': 1.2,
    'good morning': 1.3,
    'wake up': 1.2,
    'coffee': 1.1
  },
  afternoon: {
    'lunch': 1.2,
    'outside': 1.1,
    'play': 1.1,
    'help': 1.0
  },
  evening: {
    'dinner': 1.3,
    'home': 1.1,
    'bath': 1.1,
    'tv': 1.0
  },
  night: {
    'sleep': 1.6,
    'bed': 1.4,
    'good night': 1.5,
    'tired': 1.2
  }
};

var helpers = {
  "I": ['really', 'have', 'did'],
  "will be": ['ready', 'your'],
  "have been": ['ready', 'waiting'],
  "will": ['see', 'we'],
  "my": ['turn', 'self'],
  "is": ['she', 'he', 'that'],
  "can": ['she', 'he', 'we'],
  "was": ['she', 'he', 'that'],
  "are": ['they', 'we'],
  "were": ['they', 'we'],
  "going": ['to', 'away', 'back'],
  "to": ['take', 'have', 'give', 'listen', 'see'],
  "take": ['a break', 'a nap', 'a picture', 'a bath'],
  "a": ['little', 'lot'],
  "little": ['while', 'bit'],
  "lot": ['of', 'will', 'can'],
  "thank you": ['very'],
  "very": ['much', 'big'],
  "go": ['away'],
  "tell": ['me'],
  "tell me": ['something', 'a story'],
  "something": ['about', 'we', 'will', 'can'],
  "the": ['best'],
  "somebody": ['else', 'will', 'can'],
  "someone": ['else', 'will', 'can'],
  "what": ['happened', 'we', 'will', 'can'],
  "picture": ['of'],
  "getting": ['tired', 'ready'],
  "tired": ['of'],
  "get": ['ready', 'dressed'],
  "listen to": ['music', 'something'],
  "feel": ['really', 'good', 'so'],
  "your": ['turn'],
  "[verb]": [':ed', ':s', ':ing'],
  "[adjective]": [':er', ':est'],
  "really": ['good'],
  "turn": ['over', 'the page'],
//        "to": ['+o'],
  "too": ['much', 'many'],
  "this": ['one'],
  "that": ['one'],
  "these": ['ones'],
  "those": ['ones'],
  "figure": ['it'],
  "in": ['trouble'],
  "look": ['for', 'at', 'out'],
  // "+er": ['than'],
  // "[adj]": [':er', ':est'],
  "I don't": ['know', 'get it', 'understand'],
  "need": ['help', 'a break', 'a hug'],
  "want": ['some', 'a turn'],
  "give": ['it'],
  "give it": ['to', 'back'],
  "give that": ['back'],
  "come": ['back', 'here', 'away'],
  "come here": ['now'],
  "come back": ['later'],
  "play": ['again'],
  "with": ['me'],
  "stop": ['it'],
  "put": ['it'],
  "I am": ['ready'],
  "I am not": ['ready'],
  "for": ['now', 'you'],
};

var word_suggestions = EmberObject.extend({
  load: function() {
    var _this = this;
    if(this.ngrams) {
      return RSVP.resolve();
    } else if(capabilities.installed_app && !this.local_failed) {
      return $.ajax({
        url: 'ngrams.arpa.json',
        type: 'GET',
        dataType: 'json'
      }).then(function(data) {
        _this.ngrams = data;
        return true;
      }, function() {
        _this.local_failed = true;
//         return _this.load();
        return RSVP.reject();
      });
    } else if(this.error) {
      return RSVP.reject();
    } else if(this.loading) {
      this.watchers = this.watchers || [];
      var defer = RSVP.defer();
      this.watchers.push(defer);
      return defer.promise;
    } else {
      _this.loading = true;
      var promises = [];
      var ngrams = {};
      var previous = RSVP.resolve();
      var data_type = "json";
      // TODO: concurrent downloads can happen just fine as long as you
      // receive them as text instead of json, and call JSON.parse one
      // at a time.
      // Skip remote ngrams in development to avoid CORS/404 console noise (file may not exist on S3)
      var is_dev = typeof window !== 'undefined' && window.location && /localhost|127\.0\.0\.1/.test(window.location.origin || '');
      ['trimmed'].forEach(function(idx) {
        var defer = RSVP.defer();
        promises.push(defer.promise);
        previous.then(function() {
          var store_key = "arpa-." + idx + "." + _this.pieces + ".json";
          var bucket = config.staticS3Bucket || 'lingolinq-prod-static';
          var remote_url = 'https://' + bucket + '.s3.amazonaws.com/language/ngrams.arpa.' + idx + '.' + _this.pieces + '.json';
          var persistenceService = word_suggestions.get_persistence();
          if(!persistenceService || typeof persistenceService.find !== 'function') {
            runLater(function() { defer.resolve(); });
            return;
          }
          var find_or_store = persistenceService.find('settings', store_key).then(null, function() {
            if(is_dev) {
              // In dev, try loading from local public/ directory first
              return $.ajax({
                url: '/language/ngrams.arpa.' + idx + '.' + _this.pieces + '.json',
                type: 'GET',
                dataType: data_type
              }).then(function(res) {
                if(data_type == 'text') { res = JSON.parse(res.text); }
                return res;
              }, function() {
                return { suggestions: {} };
              });
            }
            return $.ajax({
              url: remote_url,
              type: "GET",
              dataType: data_type
            }).then(function(res) {
              if(data_type == 'text') {
                res = JSON.parse(res.text);
              }
              res.storageId = store_key;
              return persistenceService && typeof persistenceService.store === 'function' ? persistenceService.store('settings', {suggestions: res}, store_key) : res;
            }, function() {
              // Remote ngrams file missing (404) or CORS - fail gracefully
              return { suggestions: {} };
            });
          });
          find_or_store.then(function(res) {
            if(res && res.suggestions) {
              for(var k in res.suggestions) {
                ngrams[k] = ngrams[k] || [];
                ngrams[k] = ngrams[k].concat(res.suggestions[k]);
              }
            }
            runLater(function() {
              defer.resolve();
            });
          }, function() {
            defer.reject();
          });
        });
        previous = defer.promise;
      });
      var res = RSVP.all(promises).then(function() {
        _this.loading = false;
        _this.ngrams = ngrams;
        _this.ngrams[''] = _this.ngrams[''] || [];
        if(_this.watchers) {
          _this.watchers.forEach(function(d) {
            d.resolve();
          });
        }
        _this.watchers = null;
        return word_suggestions.load_spelling_words();
      }, function() {
        _this.loading = false;
        _this.error = true;
        if(_this.watchers) {
          _this.watchers.forEach(function(d) {
            d.reject();
          });
        }
        _this.watchers = null;
        return false;
      });
      promises.forEach(function(p) { p.then(null, function() { }); });
      return res;
    }
  },
  filtered_words: {
    "4r5e":1, "5h1t":1, "5hit":1, a55:1, anal:1, anus:1, ar5e:1,
    arrse:1, arse:1, ass:1,"ass-fucker":1,asses:1,assfucker:1,assfukka:1,
    asshole:1,assholes:1,asswhole:1,a_s_s:1,"b!tch":1,b00bs:1,b17ch:1,
    b1tch:1,badass:1,ballbag:1,balls:1,ballsack:1,bastard:1,beastial:1,beastiality:1,
    bellend:1,bestial:1,bestiality:1,"bi+ch":1,biatch:1,bitch:1,bitcher:1,
    bitchers:1,bitches:1,bitchin:1,bitching:1,bloody:1,"blow job":1,
    bitchy:1,bitched:1,"bitchin'":1,bitchiness:1,asshat:1,
    blowjob:1,blowjobs:1,boiolas:1,bollock:1,bollok:1,boner:1,boob:1,
    boobs:1,booobs:1,boooobs:1,booooobs:1,booooooobs:1,breasts:1,bullshit:1,
    buceta:1,bugger:1,bum:1,"bunny fucker":1,butt:1,butthole:1,buttmuch:1,
    buttplug:1,c0ck:1,c0cksucker:1,"carpet muncher":1,cawk:1,chink:1,chickenshit:1,
    cipa:1,cl1t:1,clit:1,clitoris:1,clits:1,cnut:1,cock:1,"cock-sucker":1,
    cockface:1,cockhead:1,cockmunch:1,cockmuncher:1,cocks:1,"cocksuck ":1,
    "cocksucked ":1,cocksucker:1,cocksucking:1,"cocksucks ":1,cocksuka:1,
    cocksukka:1,cok:1,cokmuncher:1,coksucka:1,coon:1,cox:1,crap:1,cum:1,
    cummer:1,cumming:1,cums:1,cumshot:1,cunilingus:1,cunillingus:1,
    cunnilingus:1,cunt:1,"cuntlick ":1,"cuntlicker ":1,"cuntlicking ":1,
    cunts:1,cyalis:1,cyberfuc:1,"cyberfuck ":1,"cyberfucked ":1,
    cyberfucker:1,cyberfuckers:1,"cyberfucking ":1,dammit:1,d1ck:1,damn:1,
    damned:1,
    dick:1,dicks:1,dickhead:1,dickless:1,dildo:1,dildos:1,dink:1,dinks:1,dirsa:1,
    dlck:1,"dog-fucker":1,doggin:1,dogging:1,donkeyribber:1,doosh:1,dickheads:1,
    duche:1,dyke:1,ejaculate:1,ejaculated:1,"ejaculates ":1,"ejaculating ":1,
    ejaculatings:1,ejaculation:1,ejakulate:1,"f u c k":1,"f u c k e r":1,
    f4nny:1,fag:1,fagging:1,faggitt:1,faggot:1,faggs:1,fagot:1,fagots:1,
    fags:1,fanny:1,fannyflaps:1,fannyfucker:1,fanyy:1,fatass:1,fcuk:1,
    fcuker:1,fcuking:1,feck:1,fecker:1,felching:1,fellate:1,fellatio:1,
    "fingerfuck ":1,"fingerfucked ":1,"fingerfucker ":1,fingerfuckers:1,
    "fingerfucking ":1,"fingerfucks ":1,fistfuck:1,"fistfucked ":1,
    "fistfucker ":1,"fistfuckers ":1,"fistfucking ":1,"fistfuckings ":1,
    "fistfucks ":1,flange:1,fook:1,fooker:1,fuck:1,fucka:1,fucked:1,
    fucker:1,fuckers:1,fuckhead:1,fuckheads:1,fuckin:1,fucking:1,
    fucken:1,fucktard:1,fuckface:1,
    fuckings:1,fuckingshitmotherfucker:1,"fuckme ":1,fucks:1,
    fuckwhit:1,fuckwit:1,"fudge packer":1,fudgepacker:1,fuk:1,
    fuker:1,fukker:1,fukkin:1,fuks:1,fukwhit:1,fukwit:1,fux:1,
    fux0r:1,f_u_c_k:1,gangbang:1,"gangbanged ":1,"gangbangs ":1,gaylord:1,
    gaysex:1,goatse:1,god:1,"god-dam":1,"god-damned":1,goddamn:1,goddammit:1,
    goddamned:1,"hardcoresex ":1,hell:1,heshe:1,hoar:1,hoare:1,hoer:1,
    homo:1,hore:1,horniest:1,horny:1,hotsex:1,"jack-off ":1,jackoff:1,
    jap:1,"jerk-off ":1,jism:1,"jiz ":1,"jizm ":1,jizz:1,kawk:1,knob:1,
    knobead:1,knobed:1,knobend:1,knobhead:1,knobjocky:1,knobjokey:1,
    kock:1,kondum:1,kondums:1,kum:1,kummer:1,kumming:1,kums:1,kunilingus:1,
    "l3i+ch":1,l3itch:1,labia:1,lmfao:1,lust:1,lusting:1,m0f0:1,m0fo:1,
    m45terbate:1,ma5terb8:1,ma5terbate:1,masochist:1,"master-bate":1,
    masterb8:1,"masterbat*":1,masterbat3:1,masterbate:1,masterbation:1,
    masterbations:1,masturbate:1,"mo-fo":1,mof0:1,mofo:1,mothafuck:1,
    mothafucka:1,mothafuckas:1,mothafuckaz:1,"mothafucked ":1,mothafucker:1,
    mothafuckers:1,mothafuckin:1,"mothafucking ":1,mothafuckings:1,
    mothafucks:1,"mother fucker":1,motherfuck:1,motherfucked:1,motherfucker:1,
    motherfuckers:1,motherfuckin:1,motherfucking:1,motherfuckings:1,
    motherfuckka:1,motherfucks:1,muff:1,mutha:1,muthafecker:1,muthafuckker:1,
    muther:1,mutherfucker:1,n1gga:1,n1gger:1,nazi:1,nigg3r:1,nigg4h:1,nigga:1,
    niggah:1,niggas:1,niggaz:1,nigger:1,"niggers ":1,nob:1,"nob jokey":1,
    nobhead:1,nobjocky:1,nobjokey:1,numbnuts:1,nutsack:1,"orgasim ":1,
    "orgasims ":1,orgasm:1,"orgasms ":1,p0rn:1,pawn:1,pecker:1,penis:1,penisfucker:1,
    phonesex:1,phuck:1,phuk:1,phuked:1,phuking:1,phukked:1,phukking:1,phuks:1,
    phuq:1,pigfucker:1,pimpis:1,piss:1,pissed:1,pisser:1,pissers:1,"pisses ":1,
    pissflaps:1,"pissin ":1,pissing:1,"pissoff ":1,poop:1,porn:1,porno:1,
    pornography:1,pornos:1,prick:1,"pricks ":1,pron:1,pube:1,pusse:1,pussi:1,
    pussies:1,pussy:1,"pussys ":1,rectum:1,retard:1,rimjaw:1,rimming:1,"s hit":1,
    "s.o.b.":1,sadist:1,schlong:1,screwing:1,scroat:1,scrote:1,scrotum:1,
    semen:1,sex:1,"sh!+":1,"sh!t":1,sh1t:1,shag:1,shagger:1,shaggin:1,shagging:1,
    shemale:1,"shi+":1,shit:1,shitdick:1,shite:1,shited:1,shitey:1,shitfuck:1,
    shitfull:1,shithead:1,shiting:1,shitings:1,shits:1,shitted:1,shitter:1,
    "shitters ":1,shitting:1,shittings:1,"shitty ":1,skank:1,slut:1,sluts:1,
    shitty:1,shitbag:1,slutty:1,
    smegma:1,smut:1,snatch:1,"son-of-a-bitch":1,spac:1,spunk:1,s_h_i_t:1,t1tt1e5:1,
    t1tties:1,teets:1,teez:1,testical:1,testicle:1,tit:1,titfuck:1,tits:1,
    titt:1,tittie5:1,tittiefucker:1,titties:1,tittyfuck:1,tittywank:1,titwank:1,
    tosser:1,turd:1,tw4t:1,twat:1,twathead:1,twatty:1,twunt:1,twunter:1,
    v14gra:1,v1gra:1,vagina:1,viagra:1,vulva:1,w00se:1,wang:1,wank:1,wanker:1,
    wanky:1,whoar:1,whore:1,willies:1,willy:1,xrated:1,xxx:1
  },
  lookup: function(options) {
//  find_buttons: function(str, from_board_id, user, include_home_and_sidebar) {
    var _this = this;
    return this.load().then(function() {
      var appState = word_suggestions.get_app_state();
      var last_shift = appState.get('shift');
      var locale = options.locale || (appState && appState.get && appState.get('label_locale')) || 'en';
      var locale_root = locale.split(/-|_/)[0];
      var use_english_corpus = locale_root === 'en';
      var last_finished_word = options.last_finished_word;
      if(last_finished_word) { last_finished_word = last_finished_word.replace(/\s+$/, '').toLowerCase(); }
      var second_to_last_word = options.second_to_last_word;
      if(second_to_last_word) { second_to_last_word = second_to_last_word.replace(/\s+$/, '').toLowerCase(); }
      var word_in_progress = options.word_in_progress;
      if(word_in_progress) { word_in_progress = word_in_progress.replace(/\s+$/, '').toLowerCase(); }
      var topic_context = options.topic_context || options.topic || '';
      var normalized_topic = normalize_prediction_key(topic_context);
      var now_ms = options.now_ms || Date.now();
      var time_bucket = options.time_of_day || time_of_day_bucket_for_date(new Date(now_ms));

      var pre_string = "";
      if(!word_in_progress) {
        pre_string = last_finished_word;
        if(second_to_last_word) {
          pre_string = second_to_last_word + " " + pre_string;
        }
      }

      var max_results = options.max_results || _this.max_results;
      var result = [];
      if(use_english_corpus && pre_string) {
        pre_string = pre_string.toLocaleLowerCase();

        // Smart phrase suggestions first (AAC patterns), then legacy helpers.
        var add_phrase_list = function(list) {
          if(!list) { return; }
          list.forEach(function(wrd) {
            result.push({ word: wrd });
          });
        };

        // Exact + suffix match support (e.g. "i want" and "want")
        for(var sp_key in smart_phrases) {
          var ref2 = pre_string.slice(-1 * sp_key.length);
          if(ref2 == sp_key) {
            add_phrase_list(smart_phrases[sp_key]);
          }
        }
        for(var key in helpers) {
          var ref = pre_string.slice(-1 * key.length);
          if(ref == key) {
            helpers[key].forEach(function(wrd) {
              result.push({word: wrd});
            })
          }
        }
      }

      var do_cap = appState.get('shift') || (word_in_progress && utterance.capitalize(word_in_progress) == word_in_progress);
      if(_this.last_finished_word != last_finished_word || _this.word_in_progress != word_in_progress || _this.second_to_last_word != second_to_last_word || _this.last_shift != last_shift || _this.last_time_bucket != time_bucket || _this.last_topic_context != normalized_topic || _this.last_locale != locale) {
        _this.last_finished_word = last_finished_word;
        _this.last_shift = last_shift;
        _this.second_to_last_word = second_to_last_word;
        _this.last_time_bucket = time_bucket;
        _this.last_topic_context = normalized_topic;
        _this.last_locale = locale;
        // TODO: is there an easy way to include two prior words?
        _this.word_in_progress = word_in_progress;

        var _safe_cap = function(str) {
          if(!do_cap) { return str; }
          // Capitalize the first character of the first token only.
          return utterance.capitalize(str);
        };

        var _passes_filter = function(str, wip) {
          if(_this.filtered_words[str.toLowerCase()]) { return false; }
          if(!wip) { return str[0] != "<"; }
          return str.substring(0, wip.length) == wip;
        };

        if(word_in_progress) {
          var spelling_seen = {};
          var add_spelling_match = function(match, source) {
            if(result.length >= max_results) { return; }
            var key = (match.word || '').toLowerCase();
            if(!key || spelling_seen[key]) { return; }
            spelling_seen[key] = true;
            result.push({ word: _safe_cap(match.word), source: source || match.source || 'core' });
          };
          if(options.button_sets || options.board_ids) {
            word_suggestions.collect_vocabulary_prefix_matches(
              word_in_progress,
              options,
              max_results
            ).forEach(function(match) {
              add_spelling_match(match, 'vocab');
            });
          }
          if(use_english_corpus) {
            word_suggestions.collect_core_prefix_matches(
              word_in_progress,
              max_results,
              spelling_seen
            ).forEach(function(match) {
              add_spelling_match(match, 'core');
            });
          }
        }

        // searches the next-words list, looking for best matches based
        // on the current partial spelling if there is one
        var find_lookups = function(list) {
          if(!list) { return; }
          for(var idx = 0; idx < list.length && result.length < max_results; idx++) {
            var str = list[idx];
            if(typeof(str) != 'string') { str = str[0]; }
            var base = (typeof(list[idx]) != 'string') ? list[idx][0] : list[idx];
            if(base && _passes_filter(base, word_in_progress)) {
              result.push({word: _safe_cap(base)});
            }
          }
          return result;
        };

        // Apply capitalization + filter to phrase entries from smart helpers
        if(use_english_corpus && result && result.length) {
          result = result.filter(function(item) {
            var w = (item || {}).word;
            if(!w) { return false; }
            return _passes_filter(w.toLowerCase(), word_in_progress);
          }).map(function(item) {
            var w = item.word;
            return { word: _safe_cap(w) };
          });
        }

        // find the most common next-words
        if(use_english_corpus) { find_lookups(_this.ngrams[last_finished_word]); }
        // if not enough found, add in the most common starting words
        if(use_english_corpus && result.length < max_results && _this.ngrams[''] && _this.ngrams[''].length) { find_lookups(_this.ngrams['']); }
        // if still not enough found, find the closest spelling
        if(use_english_corpus && result.length < max_results) {
          var edits = [];
          var min = word_in_progress.length / 2;
          var max = word_in_progress.length * 2;
          if(word_in_progress.length > 10) { 
            min = word_in_progress.length - 5;
            max = word_in_progress.length + 5; 
          }
          (_this.ngrams[''] || []).forEach(function(str) {
            if(str[0] && (str[0].length > min && str[0].length < max)) {
              if(!_this.filtered_words[str[0].toLowerCase()]) {
                var dist = _this.edit_distance(word_in_progress, str[0]);
                edits.push([str[0], dist, str[1]]);
              }
            }
          });
          edits = edits.sort(function(a, b) {
            if(a[1] == b[1]) {
              return b[2] - a[2];
            } else {
              return a[1] - b[1];
            }
          }).slice(0, max_results);
          edits.forEach(function(e) {
            if(result.length < max_results) {
              result.push({word: _safe_cap(e[0])});
            }
          });
        }
        //if(result.length < max_results) { find_lookups(Ember.keys(_this.ngrams)); }
        var word_to_check = word_in_progress || last_finished_word;

        if(use_english_corpus && word_to_check && word_to_check.match(/^[\d\,\.]+$/)) {
          result.unshift({
            word: i18n.ordinal(word_to_check)
          });
        }
        if(!use_english_corpus && result.length < max_results && (options.button_sets || options.board_ids)) {
          var vocab_exclude = {};
          result.forEach(function(item) {
            vocab_exclude[normalize_prediction_key(item.word)] = true;
          });
          word_suggestions.collect_vocabulary_next_words(
            last_finished_word,
            options,
            max_results - result.length,
            vocab_exclude
          ).forEach(function(match) {
            if(result.length >= max_results) { return; }
            var label = match.word;
            if(!label || !_passes_filter(label.toLowerCase(), word_in_progress)) { return; }
            result.push({ word: _safe_cap(label), source: match.source || 'vocab' });
          });
        }
        result = Utils.uniq(result, 'word');

        // Context-aware reranking (local): usage frequency + time-of-day + topic context
        (function() {
          var now = now_ms;
          var topic = normalize_prediction_key(topic_context);
          var topic_tokens = topic ? topic.split(/\s+/).filter(Boolean) : [];
          var topic_set = {};
          topic_tokens.forEach(function(t) { topic_set[t] = true; });
          var bucket = time_bucket || 'night';
          var weights = time_of_day_weights[bucket] || {};

          var raw = null;
          try { raw = localStorage.getItem(FREQ_STORAGE_KEY); } catch(e) { raw = null; }
          var freq_state = load_freq_state(raw, now);
          var entries = freq_state.entries || {};
          var bigram_raw = null;
          try { bigram_raw = localStorage.getItem(BIGRAM_STORAGE_KEY); } catch(e2) { bigram_raw = null; }
          var bigram_state = load_bigram_state(bigram_raw, now);
          var prefix_key = normalize_prediction_key(last_finished_word);

          var original_order = {};
          result.forEach(function(item, idx) {
            original_order[normalize_prediction_key(item.word)] = idx;
          });

          var score_for = function(word) {
            var key = normalize_prediction_key(word);
            var base = 0;
            var freq = decayed_freq_score(entries[key] || { s: 0, t: now }, now);
            base += Math.min(freq, 20) * 2.0; // cap influence
            if(prefix_key) {
              var bigram_key = prefix_key + '->' + key;
              var bigram = bigram_state.entries[bigram_key];
              if(bigram) {
                base += Math.min(decayed_freq_score(bigram, now), 20) * 3.0;
              }
            }
            if(weights[key]) {
              base += weights[key] * 2.5;
            }
            if(topic_set && Object.keys(topic_set).length) {
              // token match boost
              key.split(/\s+/).forEach(function(tok) {
                if(topic_set[tok]) { base += 1.25; }
              });
            }
            return base;
          };

          result.sort(function(a, b) {
            var sa = score_for(a.word);
            var sb = score_for(b.word);
            if(sb !== sa) { return sb - sa; }
            var ka = normalize_prediction_key(a.word);
            var kb = normalize_prediction_key(b.word);
            return (original_order[ka] || 0) - (original_order[kb] || 0);
          });
        })();

        _this.last_result = result;
        _this.fallback_url().then(function(url) {
          result.forEach(function(word) {
            emberSet(word, 'fallback_image', url);
            if(!emberGet(word, 'image')) {
              emberSet(word, 'image', url);
              // Plain-object property updates don't auto-trigger Glimmer
              // re-render. The image_update callback lets the caller
              // (e.g. board-detail's updateSuggestions) flush the
              // suggestion-list view so the just-attached fallback or
              // board-button image actually paints.
              if(word.image_update) { word.image_update(url); }
            }
          });
        });
        // search for button images for any words in the specified vocab
        if(options.button_sets || options.board_ids) {
          var words = {};
          var images = LingoLinq.store.peekAll('image');
          result.forEach(function(w) { words[w.word.toLowerCase()] = w; w.depth = 999; });
          // Track buttonsets we've already iterated. Multiple input
          // sources (e.g. home + a starred sub-board reachable from
          // home) often resolve to the same buttonset; iterating that
          // set twice would just race against itself.
          var seen_buttonset_ids = {};
          // Inner worker: extracted so the buttonset-input path and the
          // legacy board-id-input path can share the matching loop.
          var process_buttonset = function(button_set, fallback_root_id) {
            if(!button_set) { return; }
            /* GLOBAL id, not the record id. `redepth` walks `board_id` (models/buttonset.js:379-401)
               and every button carries a GLOBAL board id (board_downstream_button_set.rb:584 via
               json_api/button_set.rb:11-12). But lookup_board_ids pushes sidebar board KEYS
               (:1345-1347 below), and the application serializer rewrites a buttonset's record id
               to whatever was REQUESTED, parking the real one on `_actual_id`
               (serializers/application.js:100-108). So for a key-loaded set the record id is
               'example/keyboard', no button matches it, redepth returns [], and the ENTIRE set —
               every sub-board in it — contributes zero symbols. `global_id` resolves the pair
               (models/buttonset.js:30-32) and equals the id the buttons carry.
               The dedupe is keyed on it too: otherwise the same set loaded once by key and once by
               id passes as two entries and both walks race on the same word. */
            var bs_id = button_set.get('global_id') || button_set.get('id');
            if(bs_id && seen_buttonset_ids[bs_id]) { return; }
            if(bs_id) { seen_buttonset_ids[bs_id] = true; }
            var buttons = button_set.redepth(bs_id || fallback_root_id);
            buttons.forEach(function(button) {
              // Only image-bearing buttons can attach an image to a
              // predicted word. Text-only buttons (no image_id) would
              // still "match" by label and then poison the slot:
              // fix_image returns blank.gif, word.image gets set to
              // that placeholder, and the depth-lock blocks any
              // later image-bearing match in a different buttonset
              // from overriding. Skipping them here lets the search
              // walk past pronoun-style text buttons (e.g. "I" on a
              // keyboard board) and land on the symbol-bearing copy
              // somewhere else in the user's vocabulary tree.
              if(!button.image_id) { return; }
              var word = words[(button.label || '').toLowerCase()] || words[(button.vocalization || '').toLowerCase()];
              // Three guards that have to all pass before doing the
              // (expensive, IndexedDB-touching) fix_image work:
              //   1. word exists in our predictions
              //   2. this button is shallower than any prior match
              //   3. word doesn't ALREADY have an image attached
              // Without #3, every tap re-ran fix_image for every
              // matched word across every buttonset — even though the
              // attachment guard below would just no-op. That produced
              // the "used retrieved image …" console spam on every
              // button press and unnecessarily warmed the persistence
              // url cache on every prediction cycle.
              if(word && !word_suggestions.resolve_word_image(word) && button.depth < word.depth) {
                /* The depth claim is PROVISIONAL until we know this button really has a symbol.
                   fix_image is async, so the claim has to be staked now to de-dupe in-flight
                   work for the same word (guard 3 above) — but it must be GIVEN BACK when the
                   button turns out to have none. Otherwise `button.depth < word.depth` rejects
                   every deeper button afterwards and the word stays bare even though its symbol
                   exists further down the tree. */
                var prev_depth = word.depth;
                word.depth = button.depth;
                LingoLinq.Buttonset.fix_image(button, images).then(function() {
                  /* fix_image ALWAYS leaves button.image truthy: it stamps images/blank.gif
                     whenever the matching store record has an empty best_url, or the server sent
                     no url at all (models/buttonset.js:1226, board_downstream_button_set.rb:590).
                     blank.gif is a 1x1 OPAQUE WHITE gif, and the rail paints the prediction image
                     full-bleed with object-fit:contain (app.scss:74432-74459), so writing it here
                     replaced the VISIBLE square.svg placeholder with a solid white square — and
                     did so late, as a microtask, so it also clobbered symbols that had already
                     resolved correctly.
                     Every other writer into a suggestion's image already filters through
                     is_placeholder_image (:1287, :1401, controllers/user/board-detail.js:1146
                     and :1442). This was the only one that did not. */
                  if(word_suggestions.is_placeholder_image(button.image)) {
                    word.depth = prev_depth;
                    return;
                  }
                  if(!emberGet(word, 'original_image') && button.image) {
                    emberSet(word, 'original_image', button.original_image);
                    emberSet(word, 'safe_image', emberGet(word, 'image'));
                    emberSet(word, 'image', button.image);
                    emberSet(word, 'image_license', button.image_license);
                    emberSet(word, 'hc_image', !!button.image);
                    if(button.image.match(/^data/) || !button.image.match(/^http/)) {
                      emberSet(word, 'safe_image', button.image);
                    }
                    if(word.image_update) {
                      word.image_update(button.image);
                    }
                  }
                });
              }
            });
          };
          // Preferred input: pre-loaded buttonsets. Skips the per-call
          // `Buttonset.load_button_set` and its `load_buttons` side
          // effects (which were re-running on every lookup, causing
          // grid observers to re-fire and the board's images to flicker
          // on every button press). Callers warm the cache once at
          // board entry via `User.load_button_sets()` and pass the
          // array in.
          if(options.button_sets) {
            options.button_sets.forEach(function(bs) {
              process_buttonset(bs, bs && bs.get && bs.get('id'));
            });
          } else if(options.board_ids) {
            // Legacy input: list of board ids/keys to resolve. Kept for
            // the classic board view which still passes board_ids.
            // Note: this path *does* call load_button_set per id, which
            // can cause re-render churn — callers in hot paths should
            // migrate to `button_sets` instead.
            options.board_ids.forEach(function(board_id) {
              if(!board_id) { return; }
              LingoLinq.Buttonset.load_button_set(board_id).then(function(button_set) {
                process_buttonset(button_set, board_id);
              }, function() { });
            });
          }
        }
        return RSVP.resolve(result);
      } else {
        return RSVP.resolve(_this.last_result);
      }
    });
  },
  record_selection: function(phrase, now_ms, prefix, locale) {
    var key = normalize_prediction_key(phrase);
    if(!key) { return; }
    locale = locale || 'en';
    var now = now_ms || Date.now();
    try {
      var raw = localStorage.getItem(FREQ_STORAGE_KEY);
      var state = load_freq_state(raw, now);
      var prev = state.entries[key] || { s: 0, t: now };
      var decayed = decayed_freq_score(prev, now);
      state.entries[key] = { s: decayed + 1, t: now };
      localStorage.setItem(FREQ_STORAGE_KEY, serialize_freq_state(state));
    } catch(e) { }

    var prefixKey = normalize_prediction_key(prefix);
    if(prefixKey) {
      try {
        var bigramRaw = localStorage.getItem(BIGRAM_STORAGE_KEY);
        var bigramState = load_bigram_state(bigramRaw, now);
        var entryKey = prefixKey + '->' + key;
        var prevBigram = bigramState.entries[entryKey] || { s: 0, t: now, prefix: prefixKey, word: key };
        var decayedBigram = decayed_freq_score(prevBigram, now);
        bigramState.entries[entryKey] = {
          s: decayedBigram + 1,
          t: now,
          prefix: prefixKey,
          word: key
        };
        localStorage.setItem(BIGRAM_STORAGE_KEY, serialize_bigram_state(bigramState));
        word_suggestions.queue_sync({
          locale: locale,
          prefix: prefixKey,
          next_word: key,
          delta: 1,
          source: 'selection'
        });
      } catch(e2) { }
    }

    word_suggestions.log_prediction_telemetry({
      prefix: prefixKey || '',
      selected: key,
      source: 'selection',
      locale: locale
    });
  },
  fallback_url: function() {
    if(this.fallback_url_result) {
      return RSVP.resolve(this.fallback_url_result);
    } else {
      // Use the same "missing image" icon the board buttons fall back to
      // (Button.broken_image -> images/square.svg) rather than a remote
      // Mulberry symbol. It's a local bundled asset, so no remote lookup is
      // needed, and is_placeholder_image() already recognizes square.svg, so
      // an un-imaged prediction is still treated as "no real image found".
      this.fallback_url_result = templateHelpers.path('images/square.svg');
      return RSVP.resolve(this.fallback_url_result);
    }
  },
  edit_distance: function(a, b) {
    var alen = a.length;
    var blen = b.length;
    // Compute the edit distance between the two given strings
    if(alen === 0) { return blen; }
    if(blen === 0) { return alen; }

    var cur_col, next_col, i, j, tmp;
    var prev_row = [];
    var bchar = [];

    for (i=0; i<blen; ++i) {
      prev_row[i] = i;
      bchar[i] = b.charCodeAt(i);
    }
    prev_row[blen] = blen;
    var str_cmp;
    // calculate current row distance from previous row without collator
    for (i = 0; i < alen; ++i) {
      next_col = i + 1;

      for (j = 0; j < blen; ++j) {
        cur_col = next_col;

        // substution
        str_cmp = a.charCodeAt(i) === bchar[j];

        next_col = prev_row[j] + (str_cmp ? 0 : 1);

        // insertion
        tmp = cur_col + 1;
        if (next_col > tmp) {
          next_col = tmp;
        }
        // deletion
        tmp = prev_row[j + 1] + 1;
        if (next_col > tmp) {
          next_col = tmp;
        }

        // copy current col value into previous (in preparation for next iteration)
        prev_row[j] = cur_col;
      }

      // copy last col value into previous (in preparation for next iteration)
      prev_row[j] = next_col;
    }
    return next_col;
  }
}).create({pieces: 10, max_results: 5});

word_suggestions._server_entry_cache = {};

word_suggestions.sentence_from_options = function(options) {
  options = options || {};
  if(options.sentence) { return options.sentence.toString().trim(); }
  if(options.words && options.words.length) {
    return options.words.join(' ').trim();
  }
  var parts = [];
  if(options.last_finished_word) { parts.push(options.last_finished_word); }
  if(options.word_in_progress) { parts.push(options.word_in_progress); }
  return parts.join(' ').trim();
};

word_suggestions._is_spelling_label = function(label) {
  var key = (label || '').toString().trim().toLowerCase();
  if(!key) { return true; }
  if(key.length === 1 && key.match(/^[a-z0-9]$/)) { return true; }
  if(key.match(/^\[[^\]]+\]$/)) { return true; }
  if(key === '.' || key === '?') { return true; }
  return false;
};

word_suggestions.load_spelling_words = function() {
  var _this = word_suggestions;
  if(_this._spelling_words_loaded) {
    return RSVP.resolve();
  }
  return $.ajax({
    url: '/language/spelling_core_words.json',
    type: 'GET',
    dataType: 'json'
  }).then(function(data) {
    _this.spelling_words = (data && data.words) || [];
    _this._build_spelling_word_index();
    _this._spelling_words_loaded = true;
  }, function() {
    _this.spelling_words = [];
    _this._build_spelling_word_index();
    _this._spelling_words_loaded = true;
  });
};

word_suggestions._build_spelling_word_index = function() {
  var words = {};
  var add = function(w) {
    w = (w || '').toString().trim().toLowerCase();
    if(!w || word_suggestions._is_spelling_label(w)) { return; }
    if(word_suggestions.filtered_words[w]) { return; }
    words[w] = true;
  };
  var ngrams = word_suggestions.ngrams || {};
  Object.keys(ngrams).forEach(function(key) {
    (ngrams[key] || []).forEach(function(entry) {
      add(typeof entry === 'string' ? entry : entry[0]);
    });
  });
  (word_suggestions.spelling_words || []).forEach(add);
  word_suggestions._spelling_word_index = Object.keys(words).sort();
};

word_suggestions.collect_core_prefix_matches = function(prefix, cap, seen) {
  prefix = (prefix || '').toLowerCase();
  if(!prefix) { return []; }
  cap = cap || 5;
  var index = word_suggestions._spelling_word_index || [];
  var matches = [];
  for(var idx = 0; idx < index.length && matches.length < cap; idx++) {
    var word = index[idx];
    if(word.substring(0, prefix.length) !== prefix) { continue; }
    if(seen && seen[word]) { continue; }
    matches.push({ word: word, source: 'core' });
  }
  return matches;
};

word_suggestions._translation_entry = function(translations, button_id, locale) {
  var trans = translations || {};
  var entry = trans[button_id];
  if(!entry && button_id != null) {
    entry = trans[String(button_id)];
  }
  if(!entry || !locale) { return null; }
  return entry[locale] || entry[locale.split(/-|_/)[0]] || null;
};

word_suggestions._localized_vocab_label = function(button, options) {
  options = options || {};
  var label = (button && (button.label || button.vocalization) || '').toString().trim();
  if(!label) { return ''; }
  var locale = options.locale;
  var translations = options.translations;
  var board_locale = options.board_locale || 'en';
  if(!translations || !locale) { return label; }
  var label_root = locale.split(/-|_/)[0];
  var board_root = board_locale.split(/-|_/)[0];
  var entry = word_suggestions._translation_entry(translations, button.id, locale);
  if(entry && entry.label) {
    if(label_root !== board_root || entry.label !== label) {
      return entry.label.trim();
    }
  }
  return label;
};

word_suggestions.collect_vocabulary_prefix_matches = function(prefix, options, cap) {
  prefix = (prefix || '').toLowerCase();
  if(!prefix) { return []; }
  cap = cap || 5;
  var matches = [];
  var seen = {};
  var sets = options.button_sets || [];
  var from_board_id = (options.board_ids && options.board_ids[0]) || null;
  var add_label = function(label, depth) {
    var key = (label || '').toString().trim().toLowerCase();
    if(!key || seen[key] || word_suggestions.filtered_words[key]) { return; }
    if(word_suggestions._is_spelling_label(key)) { return; }
    if(key.substring(0, prefix.length) !== prefix) { return; }
    seen[key] = true;
    matches.push({ word: label.trim(), depth: depth || 999, source: 'vocab' });
  };
  sets.forEach(function(bs) {
    if(!bs || !bs.redepth) { return; }
    var root_id = from_board_id || (bs.get && bs.get('id'));
    (bs.redepth(root_id) || []).forEach(function(button) {
      if(matches.length >= cap) { return; }
      if(!button || button.hidden) { return; }
      add_label(word_suggestions._localized_vocab_label(button, options), button.depth);
    });
  });
  matches.sort(function(a, b) {
    if(a.depth !== b.depth) { return a.depth - b.depth; }
    return a.word.length - b.word.length;
  });
  return matches.slice(0, cap);
};

word_suggestions.collect_vocabulary_next_words = function(last_word, options, cap, exclude_keys) {
  cap = cap || 5;
  exclude_keys = exclude_keys || {};
  last_word = (last_word || '').toLowerCase();
  var pool = [];
  var seen = Object.assign({}, exclude_keys);
  if(last_word) { seen[last_word] = true; }
  var sets = options.button_sets || [];
  var from_board_id = (options.board_ids && options.board_ids[0]) || null;
  sets.forEach(function(bs) {
    if(!bs || !bs.redepth) { return; }
    var root_id = from_board_id || (bs.get && bs.get('id'));
    (bs.redepth(root_id) || []).forEach(function(button) {
      if(!button || button.hidden) { return; }
      var label = word_suggestions._localized_vocab_label(button, options);
      var key = label.toLowerCase();
      if(!key || seen[key] || word_suggestions.filtered_words[key]) { return; }
      if(word_suggestions._is_spelling_label(key)) { return; }
      seen[key] = true;
      pool.push({ word: label, depth: button.depth || 999, source: 'vocab' });
    });
  });
  pool.sort(function(a, b) {
    if(a.depth !== b.depth) { return a.depth - b.depth; }
    return a.word.length - b.word.length;
  });
  return pool.slice(0, cap);
};

word_suggestions.merge_suggestions = function(localResults, aiWords, maxResults, options) {
  maxResults = maxResults || 5;
  options = options || {};
  var prefix = (options.word_in_progress || '').toLowerCase();
  var seen = {};
  var merged = [];
  var push_item = function(item, source) {
    if(merged.length >= maxResults) { return; }
    var word = (typeof item === 'string') ? item : (item && item.word);
    if(!word) { return; }
    var key = normalize_prediction_key(word);
    if(!key || seen[key]) { return; }
    if(prefix && key.substring(0, prefix.length) !== prefix) { return; }
    seen[key] = true;
    if(typeof item === 'string') {
      merged.push({ word: word, source: source || 'ai' });
    } else {
      merged.push({
        word: item.word,
        image: item.image,
        fallback_image: item.fallback_image,
        original_image: item.original_image,
        source: item.source || source || 'local'
      });
    }
  };

  if(prefix) {
    (localResults || []).forEach(function(item) { push_item(item, 'local'); });
    (aiWords || []).forEach(function(w) { push_item(w, 'ai'); });
  } else {
    (aiWords || []).forEach(function(w) { push_item(w, 'ai'); });
    (localResults || []).forEach(function(item) { push_item(item, 'local'); });
  }

  return merged.slice(0, maxResults);
};

word_suggestions.fetch_user_entries = function(prefix, locale) {
  var cacheKey = (locale || 'en') + ':' + normalize_prediction_key(prefix);
  if(word_suggestions._server_entry_cache[cacheKey]) {
    return RSVP.resolve(word_suggestions._server_entry_cache[cacheKey]);
  }
  var persistenceService = word_suggestions.get_persistence();
  if(!persistenceService || typeof persistenceService.ajax !== 'function') {
    return RSVP.resolve([]);
  }
  return persistenceService.ajax(
    '/api/v1/prediction_entries?prefix=' + encodeURIComponent(normalize_prediction_key(prefix)) +
    '&locale=' + encodeURIComponent(locale || 'en'),
    { type: 'GET', dataType: 'json' }
  ).then(function(res) {
    var entries = (res && res.entries) || [];
    word_suggestions._server_entry_cache[cacheKey] = entries;
    return entries;
  }, function() { return []; });
};

word_suggestions.lookup_with_ai = function(options) {
  var _this = word_suggestions;
  options = options || {};
  var appState = word_suggestions.get_app_state();
  var aiEnabled = ai_word_predictor.is_enabled(appState);
  var locale = options.locale || (appState && appState.get && appState.get('label_locale')) || 'en';
  /* The CALLER's cap wins. board-detail sizes this to the board's row count so the
     vertical rail fills the height it already reserves; reading only `_this.max_results`
     meant an options.max_results passed by any caller was silently ignored, which made
     the obvious fix (set it in the options hash) a no-op. `lookup()` below already
     honours options.max_results (:457); this brings the AI path in line. */
  var maxResults = options.max_results || _this.max_results || 5;

  var localPromise = _this.lookup(options).then(function(results) {
    return results || [];
  }, function() {
    return [];
  });
  if(!aiEnabled) {
    return localPromise;
  }

  var sentence = word_suggestions.sentence_from_options(options);
  var aiPromise = sentence ?
    ai_word_predictor.predict(sentence, { locale: locale, count: maxResults, appState: appState }) :
    RSVP.resolve([]);
  var serverPromise = options.last_finished_word ?
    word_suggestions.fetch_user_entries(options.last_finished_word, locale) :
    RSVP.resolve([]);

  return RSVP.all([localPromise, aiPromise, serverPromise]).then(function(results) {
    var localResults = results[0] || [];
    var aiWords = results[1] || [];
    var serverEntries = results[2] || [];
    var merged = word_suggestions.merge_suggestions(localResults, aiWords, maxResults, options);
    serverEntries.forEach(function(entry) {
      if(merged.length >= maxResults) { return; }
      var key = normalize_prediction_key(entry.next_word);
      if(!key) { return; }
      var exists = merged.some(function(item) {
        return normalize_prediction_key(item.word) === key;
      });
      if(!exists) {
        merged.push({ word: entry.next_word, source: entry.source || 'server' });
      }
    });
    merged = merged.slice(0, maxResults);
    word_suggestions.log_prediction_telemetry({
      prefix: options.last_finished_word || '',
      offered: merged.map(function(item) { return item.word; }),
      source: aiWords.length ? 'merged' : 'local',
      locale: locale
    });
    /* Give every suggestion an image. AI words arrive as bare strings and become
       `{ word, source }` (:1086); server entries the same (:1166). merge_suggestions only
       COPIES an image from a local item, it never supplies one — so those suggestions reached
       the template with no `image`, the `{{#if suggestion.image}}` gate rendered no <img> at
       all, and the tile showed an empty box.
       `lookup()` has always stamped the placeholder on its own results (:686); this brings the
       AI path in line rather than inventing a second mechanism. Only fills what is MISSING, so
       a real symbol is never overwritten. */
    return word_suggestions.fallback_url().then(function(url) {
      merged.forEach(function(item) {
        if(!item.fallback_image) { item.fallback_image = url; }
        if(!item.image) { item.image = url; }
      });
      return merged;
    }, function() { return merged; });
  });
};

word_suggestions.queue_sync = function(entry) {
  try {
    var queue = load_sync_queue();
    queue.push(entry);
    if(queue.length > 200) { queue = queue.slice(-200); }
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    word_suggestions.schedule_sync_flush();
  } catch(e) { }
};

word_suggestions.schedule_sync_flush = function() {
  if(_sync_timer) { return; }
  _sync_timer = runLater(function() {
    _sync_timer = null;
    word_suggestions.flush_sync_queue();
  }, 5000);
};

word_suggestions.flush_sync_queue = function() {
  var persistenceService = word_suggestions.get_persistence();
  if(!persistenceService || typeof persistenceService.ajax !== 'function') {
    return RSVP.resolve();
  }
  var queue = load_sync_queue();
  if(!queue.length) { return RSVP.resolve(); }
  return persistenceService.ajax('/api/v1/prediction_entries/sync', {
    type: 'POST',
    dataType: 'json',
    data: JSON.stringify({ prediction_entries: queue })
  }).then(function() {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, '[]');
    } catch(e) { }
  }, function() { });
};

word_suggestions.log_prediction_telemetry = function(meta) {
  var appState = word_suggestions.get_app_state();
  if(!appState || !appState.get || !appState.get('feature_flags.product_telemetry')) { return; }
  var persistenceService = word_suggestions.get_persistence();
  if(!persistenceService || typeof persistenceService.ajax !== 'function') { return; }
  persistenceService.ajax('/api/v1/telemetry_events', {
    type: 'POST',
    dataType: 'json',
    data: JSON.stringify({
      telemetry_events: [{
        event_type: meta.selected ? 'word_prediction_selected' : 'word_prediction_offered',
        feature_area: 'word_prediction',
        occurred_at: new Date().toISOString(),
        data: {
          prefix: meta.prefix || '',
          offered: meta.offered || [],
          selected: meta.selected || '',
          source: meta.source || 'local',
          locale: meta.locale || 'en'
        }
      }]
    })
  }).then(null, function() { });
};

// Static service registry for app_state and persistence
word_suggestions._services = {
  appState: null,
  persistence: null
};
word_suggestions.register_services = function(appStateService, persistenceService) {
  if(appStateService) { word_suggestions._services.appState = appStateService; }
  if(persistenceService) { word_suggestions._services.persistence = persistenceService; }
};
word_suggestions.get_app_state = function() {
  return word_suggestions._services.appState || app_state;
};
word_suggestions.get_persistence = function() {
  return word_suggestions._services.persistence || persistence;
};
word_suggestions.is_placeholder_image = function(url) {
  if(!url || typeof url !== 'string') { return true; }
  if(/\/blank\.gif(\?|$)/i.test(url) || /\/square\.svg(\?|$)/i.test(url)) {
    return true;
  }
  return /mulberry\/(paper\.svg|pencil(%20| )and(%20| )paper)/i.test(url);
};
word_suggestions.resolve_word_image = function(word) {
  if(!word) { return null; }
  var candidates = [word.data_image, word.original_image, word.image];
  for(var idx = 0; idx < candidates.length; idx++) {
    if(candidates[idx] && !word_suggestions.is_placeholder_image(candidates[idx])) {
      return candidates[idx];
    }
  }
  return null;
};
word_suggestions.button_sets_for_board_ids = function(board_ids) {
  var sets = [];
  var seen = {};
  (board_ids || []).forEach(function(id) {
    if(!id) { return; }
    var candidates = [];
    var direct = LingoLinq.store.peekRecord('buttonset', id);
    if(direct) { candidates.push(direct); }
    LingoLinq.store.peekAll('buttonset').forEach(function(bs) {
      if(bs && ((bs.get('board_ids') || []).indexOf(id) !== -1 || bs.get('key') === id)) {
        candidates.push(bs);
      }
    });
    candidates.forEach(function(bs) {
      var bs_id = bs.get && bs.get('id');
      if(!bs_id || seen[bs_id]) { return; }
      if((bs.get('buttons') && bs.get('buttons').length) || bs.get('root_url')) {
        seen[bs_id] = true;
        sets.push(bs);
      }
    });
  });
  return sets;
};
word_suggestions.lookup_board_ids = function(appState, stashes, extra_ids) {
  var ids = [];
  var push = function(id) {
    if(id && ids.indexOf(id) === -1) { ids.push(id); }
  };
  if(appState && appState.get) {
    push(appState.get('currentUser.preferences.home_board.id'));
    push(appState.get('currentBoardState.id'));
    var user = appState.get('currentUser');
    if(user) {
      (user.get('preferences.sidebar_boards') || []).forEach(function(b) {
        if(b && b.key) { push(b.key); }
      });
      if(user.get('preferences.sync_starred_boards')) {
        (user.get('stats.starred_board_refs') || []).forEach(function(ref) {
          if(ref && ref.id) { push(ref.id); }
        });
      }
    }
    (appState.get('sidebar_boards') || []).forEach(function(brd) {
      if(brd && (brd.id || brd.key)) { push(brd.id || brd.key); }
    });
  }
  if(stashes && stashes.get) {
    push(stashes.get('temporary_root_board_state.id'));
    push(stashes.get('root_board_state.id'));
  }
  (extra_ids || []).forEach(push);
  return ids;
};
word_suggestions.load_vocabulary_button_sets = function(appState, stashes, extra_ids) {
  var ids = word_suggestions.lookup_board_ids(appState, stashes, extra_ids);
  var warmed = word_suggestions.button_sets_for_board_ids(ids);
  var covered = {};
  warmed.forEach(function(bs) {
    if(!bs || !bs.get) { return; }
    /* A set with NO buttons yet covers NOTHING. button_sets_for_board_ids admits a record on
       `root_url` alone (see its `|| bs.get('root_url')` branch) — meaning "this set exists"
       rather than "this set is usable". Counting such a record as coverage marked its own id
       as satisfied, so it was dropped from `missing` and load_button_set was never called for
       it. `redepth` over an empty button array returns [], so every symbol lookup through that
       set found nothing, and — since nothing else ever triggered the load — the word stayed
       bare for the rest of the session. That is why a predicted word whose symbol is on the
       parent board resolved there (the local on-screen matcher found it) but not from any
       other board. `board_ids` is derived from the buttons (models/buttonset.js:40-48), so it
       is empty for such a record anyway; only the id/key claims were doing damage. */
    if(!((bs.get('buttons') || []).length)) { return; }
    covered[bs.get('id')] = true;
    (bs.get('board_ids') || []).forEach(function(bid) { covered[bid] = true; });
    if(bs.get('key')) { covered[bs.get('key')] = true; }
  });
  var missing = ids.filter(function(id) { return id && !covered[id]; });
  if(!missing.length) {
    return RSVP.resolve(warmed);
  }
  return RSVP.all_wait(missing.filter(function(id) { return !!id; }).map(function(id) {
    return LingoLinq.Buttonset.load_button_set(id).then(function(bs) { return bs; }, function() { return null; });
  })).then(function(loaded) {
    var seen = {};
    var all = [];
    warmed.concat(loaded || []).forEach(function(bs) {
      if(!bs || !bs.get) { return; }
      var bs_id = bs.get('id');
      if(!bs_id || seen[bs_id]) { return; }
      seen[bs_id] = true;
      all.push(bs);
    });
    return all;
  });
};
var _exact_button_candidates_for_label = function(label, sets) {
  var key = (label || '').toLowerCase();
  if(!key) { return []; }
  var matches = [];
  (sets || []).forEach(function(bs) {
    if(!bs) { return; }
    // Same reason as process_buttonset above: redepth matches on the buttons' GLOBAL board id,
    // and a key-loaded set's record id is the key, which matches nothing.
    var buttons = bs.redepth(bs.get('global_id') || bs.get('id'));
    (buttons || []).forEach(function(button) {
      if(!button || !button.image_id) { return; }
      var bl = (button.label || '').toLowerCase();
      var bv = (button.vocalization || '').toLowerCase();
      if(bl === key || bv === key) { matches.push(button); }
    });
  });
  // Shallowest first: the nearest copy of the word in the vocabulary tree is the one the user
  // is most likely to recognise.
  matches.sort(function(a, b) { return (a.depth || 0) - (b.depth || 0); });
  return matches;
};
/* Every match for the label, shallowest first. Kept separate from the single-best accessor
   below because `image_id` is only a PROMISE of a symbol: it can point at an image the server
   could not resolve (board_downstream_button_set.rb:590 sends `image: nil`) or at a store
   record with no usable url, and either way fix_image stamps a placeholder. A caller that
   takes only the shallowest match and gives up therefore lets ONE symbol-less duplicate
   permanently shadow a good button deeper in the tree — the word shows the placeholder even
   though its symbol is right there in the vocabulary. */
word_suggestions._exact_button_candidates_for_label = _exact_button_candidates_for_label;
word_suggestions._best_exact_button_for_label = function(label, sets) {
  return _exact_button_candidates_for_label(label, sets)[0] || null;
};
word_suggestions.attach_image_for_label = function(label, board_ids, on_image, context) {
  if(!label || !on_image) { return RSVP.resolve(null); }
  var key = label.toLowerCase();
  var appState = context && context.appState;
  var stashes = context && context.stashes;
  var lookup_ids = board_ids || [];
  var deliver = function(img, word) {
    if(img && !word_suggestions.is_placeholder_image(img)) {
      on_image(img, word);
    }
  };
  var load_sets = appState ?
    word_suggestions.load_vocabulary_button_sets(appState, stashes, lookup_ids) :
    RSVP.resolve(word_suggestions.button_sets_for_board_ids(lookup_ids));
  return load_sets.then(function(sets) {
    var images = LingoLinq.store.peekAll('image');
    var candidates = word_suggestions._exact_button_candidates_for_label(label, sets);
    if(candidates.length) {
      /* Walk the matches shallowest-first until one yields a REAL symbol. Previously only the
         SHALLOWEST match was tried: fix_image ran on it, and if the result was a placeholder
         `deliver` dropped it and the whole lookup returned that placeholder. So a single
         symbol-less duplicate of the word — one whose image_id the server could not resolve —
         permanently shadowed a perfectly good button deeper in the tree, and the word showed
         the placeholder on every board. It also returned the placeholder url to callers that
         use the return value rather than the callback (board-detail.js:8424-8430); returning
         null instead lets those fall through to their own fallback.
         Capped: fix_image can touch IndexedDB per candidate (models/buttonset.js:1227+), and
         this runs per predicted word on every keystroke. Common words legitimately appear on
         many boards, so an uncapped walk would be unbounded work on the typing path. */
      var MAX_IMAGE_CANDIDATES = 5;
      var limit = Math.min(candidates.length, MAX_IMAGE_CANDIDATES);
      var try_candidate = function(idx) {
        if(idx >= limit) { return RSVP.resolve(null); }
        var button = candidates[idx];
        return LingoLinq.Buttonset.fix_image(button, images).then(function() {
          if(word_suggestions.is_placeholder_image(button.image)) {
            return try_candidate(idx + 1);
          }
          deliver(button.image, { word: label, image: button.image, original_image: button.original_image });
          return button.image;
        }, function() { return try_candidate(idx + 1); });
      };
      return try_candidate(0);
    }
    return word_suggestions.lookup({
      word_in_progress: label,
      board_ids: lookup_ids,
      button_sets: sets
    }).then(function(result) {
      var match = (result || []).find(function(w) {
        return w.word && w.word.toLowerCase() === key;
      });
      if(!match) { return null; }
      var finish = function() {
        deliver(word_suggestions.resolve_word_image(match), match);
      };
      match.image_update = function() { finish(); };
      finish();
      return word_suggestions.resolve_word_image(match);
    });
  });
};

// Expose helpers for unit tests
word_suggestions._test = {
  time_of_day_bucket_for_hour: time_of_day_bucket_for_hour,
  load_freq_state: load_freq_state,
  serialize_freq_state: serialize_freq_state,
  load_bigram_state: load_bigram_state,
  serialize_bigram_state: serialize_bigram_state,
  normalize_prediction_key: normalize_prediction_key,
  merge_suggestions: word_suggestions.merge_suggestions,
  collect_vocabulary_prefix_matches: word_suggestions.collect_vocabulary_prefix_matches,
  collect_vocabulary_next_words: word_suggestions.collect_vocabulary_next_words,
  localized_vocab_label: word_suggestions._localized_vocab_label,
  collect_core_prefix_matches: word_suggestions.collect_core_prefix_matches,
  build_spelling_word_index: word_suggestions._build_spelling_word_index
};

export default word_suggestions;
