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
              return { suggestions: {} };
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
        return true;
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
      var last_finished_word = options.last_finished_word;
      if(last_finished_word) { last_finished_word = last_finished_word.replace(/\s+$/, '').toLowerCase(); }
      var second_to_last_word = options.second_to_last_word;
      if(second_to_last_word) { second_to_last_word = second_to_last_word.replace(/\s+$/, '').toLowerCase(); }
      var word_in_progress = options.word_in_progress;
      if(word_in_progress) { word_in_progress = word_in_progress.replace(/\s+$/, '').toLowerCase(); }

      var pre_string = "";
      if(!word_in_progress) {
        pre_string = last_finished_word;
        if(second_to_last_word) {
          pre_string = second_to_last_word + " " + pre_string;
        }
      }

      var max_results = options.max_results || _this.max_results;
      var result = [];
      if(pre_string) {
        pre_string = pre_string.toLocaleLowerCase();
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
      if(_this.last_finished_word != last_finished_word || _this.word_in_progress != word_in_progress || _this.second_to_last_word != second_to_last_word || _this.last_shift != last_shift) {
        _this.last_finished_word = last_finished_word;
        _this.last_shift = last_shift;
        _this.second_to_last_word = second_to_last_word;
        // TODO: is there an easy way to include two prior words?
        _this.word_in_progress = word_in_progress;
        // searches the next-words list, looking for best matches based
        // on the current partial spelling if there is one
        var find_lookups = function(list) {
          if(!list) { return; }
          for(var idx = 0; idx < list.length && result.length < max_results; idx++) {
            var str = list[idx];
            if(typeof(str) != 'string') { str = str[0]; }
            if(!_this.filtered_words[str.toLowerCase()]) {
              var word_string = do_cap ? utterance.capitalize(list[idx][0]) : list[idx][0];
              if(word_in_progress) {
                if(str.substring(0, word_in_progress.length) == word_in_progress) {
                  result.push({word: word_string});
                }
              } else if(str[0] != "<") {
                result.push({word: word_string});
              }
            }
          }
          return result;
        };
        // find the most common next-words
        find_lookups(_this.ngrams[last_finished_word]);
        // if not enough found, add in the most common starting words
        if(result.length < max_results && _this.ngrams[''] && _this.ngrams[''].length) { find_lookups(_this.ngrams['']); }
        // if still not enough found, find the closest spelling
        if(result.length < max_results) {
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
              var word_string = do_cap ? utterance.capitalize(e[0]) : e[0];
              result.push({word: word_string});
            }
          });
        }
        //if(result.length < max_results) { find_lookups(Ember.keys(_this.ngrams)); }
        var word_to_check = word_in_progress || last_finished_word;

        if(word_to_check.match(/^[\d\,\.]+$/)) {
          result.unshift({
            word: i18n.ordinal(word_to_check)
          });
        }
        result = Utils.uniq(result, 'word');
        _this.last_result = result;
        _this.fallback_url().then(function(url) {
          result.forEach(function(word) {
            emberSet(word, 'fallback_image', url);
            if(!emberGet(word, 'image')) {
              emberSet(word, 'image', url);
            }
          });
        });
        // search for button images for any words in the specified vocab
        if(options.board_ids) {
          var words = {};
          var images = LingoLinq.store.peekAll('image');
          result.forEach(function(w) { words[w.word.toLowerCase()] = w; w.depth = 999; });
          options.board_ids.forEach(function(board_id) {
            if(!board_id) { return; }
            LingoLinq.store.findRecord('board', board_id).then(function(board) {
              board.load_button_set().then(function(button_set) {
                var buttons = button_set.redepth(board_id);
                buttons.forEach(function(button) {
                  var word = words[button.label] || words[button.vocalization];
                  if(word && button.depth < word.depth) {
                    word.depth = button.depth;
                    LingoLinq.Buttonset.fix_image(button, images).then(function() {
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
              }, function() { });
            }, function() { });
          });
        }
        return RSVP.resolve(result);
      } else {
        return RSVP.resolve(_this.last_result);
      }
    });
  },
  fallback_url: function() {
    if(this.fallback_url_result) {
      return RSVP.resolve(this.fallback_url_result);
    } else {
      var _this = this;
      var persistenceService = word_suggestions.get_persistence();
      return persistenceService.find_url('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg').then(function(url) {
        _this.fallback_url_result = url;
        return url;
      }, function() { return RSVP.resolve('https://opensymbols.s3.amazonaws.com/libraries/mulberry/paper.svg'); });
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

export default word_suggestions;
