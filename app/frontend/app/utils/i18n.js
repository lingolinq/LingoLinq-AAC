/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/
import Ember from 'ember';
import EmberObject from '@ember/object';
import LingoLinq from '../app';
import { set as emberSet, get as emberGet } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { assign as emberAssign } from '@ember/polyfills';
import { computed } from '@ember/object';
import RSVP from 'rsvp';

Ember.templateHelpers = Ember.templateHelpers || {};
Ember.templateHelpers.date = function(date, precision) {
  var now = new Date();
  if(arguments.length == 1) {
    date = now;
  }
  if(typeof date == 'number') {
    if(date * 1000 < now.getTime()) {
      date = date * 1000;
    }
  }
  var moment = window.moment(date);
  if(precision == 'day') {
    return moment.format('MMMM Do YYYY');
  } else if(precision == 'short_day') {
    return moment.format('MMM Do YYYY');
  } else if(precision == 'tiny_day') {
    if(moment._d.getFullYear() == now.getFullYear()) {
      return moment.format('MMM D');
    } else {
      return moment.format('MMM D, YY');
    }
  } else if(precision == 'abbrev') {
    return moment.format('MMM Do YYYY, h:mm a');
  } else {
    return moment.format('MMMM Do YYYY, h:mm a');
  }
};

Ember.templateHelpers.time = function(date) {
  date = date || new Date();
  var moment = window.moment(date);
  return moment.format('h:mma');
};

Ember.templateHelpers.date_ago = function(date, precision) {
  if(typeof(date) == 'number' && date < 1577862000000) {
    date = date * 1000;
  }
  var moment = window.moment(date);
  if(precision == 'day') {
    var pre = window.moment();
    pre.hours(0).minutes(0).seconds(0);
    pre.add(1, 'day');
    var post = window.moment()
    post.hours(0).minutes(0).seconds(0);
    post.add(2, 'day')
    if(moment >= pre && moment <= post) {
      return i18n.t('tomorrow', "tomorrow");
    }
    pre.subtract(1, 'day');
    post.subtract(1, 'day');
    if(moment >= pre && moment <= post) {
      return i18n.t('today', "today");
    }
    pre.subtract(1, 'day');
    post.subtract(1, 'day');
    if(moment >= pre && moment <= post) {
      return i18n.t('yesterday', "yesterday");
    }
  }
  return moment.fromNow();
};

Ember.templateHelpers.delimit = function(num, type) {
  var val = parseFloat(num);
  var pieces = [];
  var leftover = val;
  while(leftover >= 1000) {
    leftover = Math.floor(leftover);
    pieces.push(leftover % 1000);
    leftover = leftover / 1000;
  }
  pieces.push(Math.floor(leftover));
  pieces = pieces.reverse().map(function(p, idx) { p = p.toString(); while(idx > 0 && p.length < 3) { p = "0" + p; } return p; });
  if(pieces.length == 1) {
    return val.toString();
  } else if(pieces.length > 2 && type != 'full') {
    pieces.pop();
    var dec = parseInt(pieces.pop(), 10);
    if(pieces.length == 1 && pieces[0] < 10) {
      pieces[0] = parseInt(pieces[0], 10) + (dec / 1000);
      pieces[0] = Math.round(pieces[0] * 100) / 100;
    }
    return i18n.t('n_million', "%{num}M", {num: pieces.join(',')});
  } else if(pieces.length > 1 && type != 'full') {
    var dec = parseInt(pieces.pop(), 10);
    if(pieces.length == 1 && pieces[0] < 10) {
      pieces[0] = parseInt(pieces[0], 10) + (dec / 1000);
      pieces[0] = Math.round(pieces[0] * 10) / 10;
    }
    return i18n.t('n_thousand', "%{num}k", {num: pieces.join(',')});
  } else {
    return pieces.join(',');
  }
};

Ember.templateHelpers.locale = function(str) {
  str = str.replace(/-/g, '_');
  var pieces = str.split(/_/);
  if(pieces[0]) { pieces[0] = pieces[0].toLowerCase(); }
  if(pieces[1]) { pieces[1] = pieces[1].toUpperCase(); }
  str = pieces[0] + "_" + pieces[1];
  var res = i18n.get('locales')[str];
  if(!res) {
    res = i18n.get('locales')[pieces[0]];
  }
  res = res || i18n.t('unknown_locale', "Unknown");
  return res;
};

Ember.templateHelpers.seconds_ago = function(seconds, distance) {
  seconds = (Math.round(seconds * 10) / 10);
  if(!seconds || seconds <= 0) {
    return "";
  } else if(seconds < 60) {
    if(distance == 'brief') {
      return i18n.t('brief_seconds_ago', "%{n}s", {hash: {n: seconds}});
    } else {
      return i18n.t('seconds_ago', "second", {hash: {count: seconds}});
    }
  } else if(seconds < 3600) {
    var minutes = Math.round(seconds / 60 * 10) / 10;
    if(distance == 'brief') {
      return i18n.t('brief_minutes_ago', "%{n}m", {hash: {n: minutes}});
    } else {
      return i18n.t('minutes_ago', "minute", {hash: {count: minutes}});
    }
  } else {
    var hours = Math.round(seconds / 3600 * 10) / 10;
    if(distance != 'long' || hours < 24) {
      if(hours > 999) {
        hours = Ember.templateHelpers.delimit(hours) + " ";
        distance = 'brief';
      }
      if(distance == 'brief') {
        return i18n.t('brief_hours_ago', "%{n}hr", {hash: {n: hours, number: true}});
      } else {
        return i18n.t('hours_ago', "hour", {hash: {count: hours, number: true}});
      }
    } else {
      var days = Math.round(hours / 24);
      if(days < 7) {
        return i18n.t('days_ago', "day", {hash: {count: days}});
      } else {
        var weeks = Math.round(days / 7 * 10) / 10;
        if(weeks < 12) {
          return i18n.t('weeks_ago', "week", {hash: {count: weeks}});
        } else {
          var months = Math.round(days / 30 * 10) / 10;
          return i18n.t('months_ago', "month", {hash: {count: months}});
        }
      }
    }
  }
};

Ember.templateHelpers.is_equal = function(lhs, rhs) {
  return lhs == rhs;
};


Ember.templateHelpers.duration = function(duration) {
  if(duration && duration > 0) {
    duration = Math.round(duration);
    var result = "";
    var seconds = duration % 60;
    var minutes = Math.floor(duration / 60) % 60;
    var hours = Math.floor(duration / 3600);
    if(hours > 0) {
      result = hours + ":";
      if(minutes < 10) {
        result = result + "0";
      }
      result = result + minutes + ":";
    } else {
      result = minutes + ":";
    }
    if(seconds < 10) {
      result = result + "0";
    }
    result = result + seconds;
    return result;
  } else {
    return "";
  }
};

Ember.templateHelpers.round = function(number) {
  return Math.round(number * 100) / 100;
};

Ember.templateHelpers.t = function(str, options) {
  // TODO: options values are NOT bound, so this doesn't work for our purposes
  // prolly needs to be rewritten as a custom view or something
  return htmlSafe(i18n.t(options.key, str, options));
};

Ember.templateHelpers.safe = function(str, type) {
  if(!str) { return ""; }
  if(type == 'stripped') {
    var div = document.createElement('div');
    div.innerHTML = str;
    return htmlSafe(div.textContent);
  } else {
    return htmlSafe(str);
  }
};

var i18n = EmberObject.extend({
  init: function() {
    this._super();
    for(var idx in this.substitutions) {
      var replaces = {};
      if(idx != 'contractions') {
        for(var jdx in this.substitutions[idx]) {
          for(var kdx in this.substitutions[idx][jdx]) {
            replaces[kdx] = jdx;
          }
        }
        this.substitutions[idx].replacements = replaces;  
      }
    }
  },
  t: function(key, str, options) {
    var terms = str.match(/%{(\w+)}/g);
    var value;
    var localized = false;
    if(i18n.langs && i18n.langs.preferred) {
      if(i18n.langs.preferred == 'backwards') {
        if(!str.match(/\%/))  {
          str = str.split('').reverse().join('');
          localized = true;
        }
      } else {
        var lang_str = (i18n.langs[i18n.langs.preferred] || {})[key] || (i18n.langs[i18n.langs.fallback] || {})[key];
        if(lang_str && lang_str.substring(0, 4) != '*** ') {
          str = lang_str.split(/\s\[\[\s/)[0];
          localized = true;
        }  
      }
    }
    options = emberAssign({}, options);
    if(key && localStorage.track_i18n == 'true') {
      var keys = JSON.parse(localStorage.i18n_keys || "[]")
      if(keys.indexOf(key) == -1) {
        keys.push(key);
        localStorage.i18n_keys = JSON.stringify(keys);
      }
    }
    if(options && !options.hash) { options.hash = options; }
    if(str.match(/%/)) {
      for(var idx = 0; terms && idx < terms.length; idx++) {
        var word = terms[idx].match(/%{(\w+)}/)[1];
        if(options[word] !== undefined && options[word] !== null) {
          value = options[word];
          if(options.increment == word || options.hash.increment == word) { value++; }
          str = str.replace(terms[idx], value);
        } else if(options.hash && options.hash[word] !== undefined && options.hash[word] !== null) {
          value = options.hash[word];
          if(options.increment == word || options.hash.increment == word) { value++; }
          if(options.hashTypes) {
            // TODO: pretty sure this isn't used anymore
            if(options.hashTypes[word] == 'ID') {
              value = emberGet(options.hashContexts[word], options.hash[word].toString());
              value = value || options.hash[word];
            }
          }
          str = str.replace(terms[idx], value);
        }
      }
      str = str.replace(/%app_name%/g, LingoLinq.app_name);
      str = str.replace(/%app_name_upper%/g, LingoLinq.app_name.toUpperCase());
      str = str.replace(/%company_name%/g, LingoLinq.company_name);
    }

    if(options && options.hash && options.hash.count !== undefined) {
      var count = options.hash.count;
      if(count && count.length && !options.hash.number) { count = count.length; }
      if(localized || str.match(/\|/)) {
        if(str.match(/\|/)) {
          var parts = str.split(/\|/);
          if(count == 0) {
            str = parts[0];
          } else if(count == 1) {
            str = parts[1];
          } else {
            str = parts[2];
          }
          str = str || parts[0];
          str = str.sub(/%\{n\}/, count);
        } else if(str.match(/%\{n\}/)) {
          str = str.sub(/%\{n\}/, count.toString());
        } else {
          str = count + " " + str;
        }
      } else {
        if(options.increment == 'count' || options.hash.increment == 'count') { count++; }

        if(count != 1) {
          str = count + " " + this.pluralize(str);
        } else {
          str = count + " " + str;
        }  
      }
    }
    return str;
  },
  pluralize: function(str) {
    // http://www.oxforddictionaries.com/words/plurals-of-nouns
    var check = str.toLowerCase();
    var res = null;
    if(this.substitutions.plurals[check]) {
      res = this.substitutions.plurals[check];
    } else if(check.length > 5 && check.match(/is$/)) {
      res = str.substring(0, str.length - 2) + "es";
    } else if(check.match(/(s|ch|sh|x|z)$/)) {
      res = str + "es";
    } else if(check.match(/[^aeiouy]y$/)) {
      res = str.substring(0, str.length - 1) + "ies";
    } else if(!check.match(/[aeiouy][aeiouy]f$/) && check.match(/[^f]fe?$/)) { // ends in consonant or single vowel, followed by f or fe
      res = str.replace(/fe?$/i, "ves");
    } else {
      res = str + "s";
    }
    return res;
  },
  singularize: function(str) {
    var check = str.toLowerCase();
    var res = null;
    var match = null;
    for(var key in this.substitutions.plurals) {
      if(this.substitutions.plurals[key] == check) {
        match = key;
      }
    }
    if(match) {
      res = match;
    } else if(this.substitutions.singulars[check]) {
      res = this.substitutions.singulars[check];
    } else if(check.length > 5 && check.match(/es$/)) {
      res = str.substring(0, str.length - 2) + "is";
    } else if(check.match(/(s|ch|sh|x|z)es$/)) {
      res = str.substring(0, str.length - 2);
    } else if(check.match(/ies$/)) {
      res = str.substring(0, str.length - 3) + "y";
    } else if(check.match(/ves$/)) { // ends in consonant or single vowel, followed by f or fe
      res = str.substring(0, str.length - 3) + "fe";
    } else if(check.match(/s$/)) {
      res = str.substring(0, str.length - 1);
    } else {
      res = str;
    }
    return res;
  },
  tense: function(str, options) {
    // http://www.englishpage.com/verbpage/verbtenseintro.html
    // http://www.oxforddictionaries.com/us/words/spelling
    // TODO: agent nouns? (jumper, cooker, accelerator)
    // TODO: nominalizations? (swimming, refusal, carelessness)
    // http://www.say-it-in-english.com/SomeRules.html
    var check = str.toLowerCase();
    if(!this.substitutions.tenses[check] && this.substitutions.tenses.replacements[check]) {
      check = this.substitutions.tenses.replacements[check];
    }
    var res = null;
    var modifier = 'ed';
    var vowel_cons = this.vowels.indexOf(check[check.length - 2]) >= 0 && this.vowels.indexOf(check[check.length - 1]) == -1;
    if(check[check.length - 1] == 'x') {
      vowel_cons = false;
    } else if(check.length > 3 && this.vowels.indexOf(check[check.length - 3]) >= 0) {
      vowel_cons = false;
    }
    var syllables = this.syllables(check);
    var ending_stress = true; // TODO: this will be a hard one, methinks
    if(check.match(/^[eiouy]/)) {
      ending_stress = false;
    }
    var sub = this.substitutions.tenses[check];
    // https://www.grammarly.com/blog/verb-tenses/
    // infinitive: to laugh
    // simple present: laugh/laughs
    // simple past/past participle: laughed
    // simple future: will laugh
    // present participle: laughing
    // present continuous: am/is laughing
    // past continuous: was laughing
    // future continuous: will be laughing
    // present perfect: have/has laughed
    // past perfect: had laughed
    // future perfect: will have laughed
    // present perfect continuous: have been laughing
    // past perfect continuous: had been laughing
    // future perfect continuous: will have been laughing
    if(options.simple_past) {
      modifier = 'ed';
      res = sub && sub[1];
    } else if(options.simple_present) {
      // TODO: options should specify whether it's for
      // a he/she/it/someone which adds "s" 
      // or is for I/plural
      modifier = 's';
      res = sub && sub[0];
    } else if(options.past_participle || options.simple_past || options.present_perfect || options.past_perfect || options.future_perfect) {
      // TODO: perfect tenses are sometimes 'en' (i.e. forgotten)
      modifier = 'ed';
      res = sub && sub[2];
    } else if(options.present_participle || options.present_continuous || options.past_continuous || options.future_continuous || options.present_perfect_continuous || options.past_perfect_continuous || options.future_perfect_continuous) {
      modifier = 'ing';
      res = sub && sub[3];
    }

    if(res) {
      // Re-capitalize if we started that way
      if(window.utterance && str == window.utterance.capitalize(str)) {
        res = window.utterance.capitalize(res);
      }
    } else if(options.infinitive) {
      res = "to " + str;
    } else if(check[check.length - 1] == 'e') {
      res = str.substring(0, str.length - 1) + modifier;
      if(check[check.length - 2] == 'e' && (options.present_participle || options.simple_present)) {
        res = str + modifier;
      } else if(options.simple_present) {
        res = str + modifier;
      }
    } else if(check[check.length - 1] == 'c') {
      res = str + 'k' + modifier;
    } else if(check[check.length - 1] == 'x' && options.simple_present) {
      res = str + 'e' + modifier;
    } else if(check[check.length - 1] == 's' && options.simple_present) {
      res = str + 'e' + modifier;
    } else if(check.match(/[^aeiouy]y$/i) && !options.present_participle) {
      if(options.simple_present) {
        modifier = 'es';
      }
      res = str.substring(0, str.length - 1) + 'i' + modifier;
    } else if(vowel_cons && ending_stress && !options.simple_present) { // single vowel plus consonant ending, stress at end of word
      res = str + str[str.length - 1] + modifier;
    } else if(vowel_cons && syllables == 1 && !options.simple_present) { // single vowel plus consonant ending, one syllable
      res = str + str[str.length - 1] + modifier;
    } else {
      res = str + modifier;
    }

    if(options.simple_future) {
      res = "will " + res;
    } else if(options.present_continuous) {
      // TODO: discern between is/am/are
      // "are" if prior is plural/they/we
      // "am" if "I"
      // "is" otherwise
      res = "is " + res;
    } else if(options.past_continuous) {
      res = "was " + res;
    } else if(options.future_continuous) {
      res = "will be " + res;
    } else if(options.present_perfect) {
      res = "have " + res;
    } else if(options.past_perfect) {
      res = "had " + res;
    } else if(options.future_perfect) {
      res = "will have " + res;
    } else if(options.present_perfect_continuous) {
      res = "have been " + res;
    } else if(options.past_perfect_continuous) {
      res = "had been " + res;
    } else if(options.future_perfect_continuous) {
      res = "will haver been " + res;
    }
    return res;
  },
  comparative: function(str, opts) {
    // good == better
    // happy == happier
    // strong == stronger
    // difficult == more difficult
    return this.modify_ad(str, opts && opts.negative ? 'negative' : 'positive');
  },
  negative_comparative: function(str, opts) {
    return "less " + str;
  },
  superlative: function(str) {
    // happy == happiest
    // beautiful == most beautiful (or the most beautiful??)
    // good == best
    // http://en.wikipedia.org/wiki/Superlative
    return this.modify_ad(str, 'superlative');
  },
  possessive: function(str, options) {
    // me == my
    // box == box's
    // bass == bass'
    options = options || {};
    var res = str;
    var check = str.toLowerCase();
    if(!this.substitutions.tenses[check] && this.substitutions.possessives.replacements[check]) {
      check = this.substitutions.possessives.replacements[check];
    }
    if(options.reflexive) {
      res = (this.substitutions.possessives[check] || {})[3];
      res = res || "themselves";
    } else if(options.objective) {
      res = (this.substitutions.possessives[check] || {})[2];
      res = res || "them";
    } else if(this.substitutions.possessives[check]) { // list of exceptions
      res = this.substitutions.possessives[check][options.pronoun ? 1 : 0];
    } else if(check.substring(str.length - 1) == 's') {
      res = str + '\'';
    } else {
      res = str + '\'s';
    }
    return res;
  },
  negation: function(str) {
    return "not " + str;
  },
  ordinal: function(num) {
    var str = num.replace(/,/, '').replace(/[^0-9\.]/g, '');
    var last = str[str.length - 1];
    if(last == '1') {
      str = str + "st";
    } else if(last == '2') {
      str = str + "nd";
    } else if(last == '3') {
      str = str + "rd";
    } else {
      str = str + "th";
    }
    return str;
  },
  negatable_verbs: ['is', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has',
    'had', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should', 'are'],
  verb_negation: function(str) {
    // http://www.grammarly.com/handbook/sentences/negatives/
    // https://www.englishclub.com/vocabulary/contractions-negative.htm
    var check = str.toLowerCase();
    var res = null;
    if(this.negatable_verbs.indexOf(check) != -1) {
      if(this.substitutions.verb_to_be_negations[check]) {
        res = this.substitutions.verb_to_be_negations[check];
      } else if(str.match(/n$/)) {
        res = str + "'t";
      } else {
        res = str + "n't";
      }
    } else {
      res = "not " + str;
    }
    return res;
  },
  syllables: function(word) {
    // http://stackoverflow.com/questions/405161/detecting-syllables-in-a-word
    // https://code.google.com/p/hyphenator/
    // http://www.tug.org/docs/liang/liang-thesis.pdf
    var current_word = word.toLowerCase();
    var num_vowels = 0;
    var last_was_vowel = false;
    for(var idx = 0; idx < current_word.length; idx++) {
      var wc = current_word[idx];
      var found_vowel = false;
      for(var jdx = 0; jdx < this.vowels.length; jdx++) {
        var v = this.vowels[jdx];
        if(v == wc) {
          //don't count diphthongs
          if(!last_was_vowel) {
            num_vowels++;
          }
          found_vowel = true;
          last_was_vowel = true;
        }
      }
      // if full cycle and no vowel found, set lastWasVowel to false;
      if(!found_vowel) {
        last_was_vowel = false;
      }
    }
    //remove es, it's _usually? silent
    if(current_word.length > 2 && current_word.substring(current_word.length - 2) == "es") {
      num_vowels--;
    // remove silent e
    } else if(current_word.length > 1 && current_word.substring(current_word.length - 1) == "e") {
      num_vowels--;
    }
    return num_vowels;
  },
  modify_ad: function(str, type) {
    var most_idx = 0;
    if(type == 'superlative') { most_idx = 1; }
    if(type == 'negative') { most_idx = 2; }
    var res = str;
    var check = str.toLowerCase();
    if(!this.substitutions.tenses[check] && this.substitutions.superlatives_comparatives.replacements[check]) {
      check = this.substitutions.superlatives_comparatives.replacements[check];
    }
    var syllables = this.syllables(str);
    if(this.substitutions.superlatives_comparatives[check]) { // list of exceptions
      res = this.substitutions.superlatives_comparatives[check][most_idx];
    } else if(syllables == 1) { // 1 syllable
      // add the last consonant again if it's not already doubled and
      // the word ends in consonant-vowel-consonant
      var word = str;
      if(check.length >= 3) {
        if(this.vowels.indexOf(check[check.length - 1]) == -1) {
          if(this.vowels.indexOf(check[check.length - 2]) >= 0) {
            if(this.vowels.indexOf(check[check.length - 3]) == -1) {
              word = word + word[word.length - 1];
            }
          }
        }
      }
      if(type == 'superlative') {
        res = word + "est";
      } else if(type == 'negative') {
        res = "less " + str;
      } else {
        res = word + "er";
      }
    } else if(syllables == 2 && check.substring(check.length - 1) == 'y' && check.substring(check.length - 2) != 'ly') { //2-syllable adjective (not adverb) ends in y not ly
      var no_y = str.substring(0, str.length - 1);
      if(type == 'superlative') {
        res = "the " + no_y + "iest";
      } else if(type == 'negative') {
        res = "less " + str;
      } else {
        res = no_y + "ier";
      }
    } else {
      if(type == 'superlative') {
        if(check.substring(check.length - 2) == 'ly') {
          res = "most " + str;
        } else {
          res = "the most " + str;
        }
      } else if(type == 'negative') {
        res = "less " + str;
      } else {
        res = "more " + str;
      }
    }
    return res;
  },
  core_words_map: function(list) {
    var res = [];
    list = this.get('core_words')[list || 'default'] ||  this.get('core_words').default;
    for(var idx = 0; idx < list.length; idx++) {
      var word = list[idx];
      res.push({
        id: idx,
        label: word
      });
    }
    return res;
  },
  load_lang_override: function(lang, store_result) {
    i18n.lang_overrides = i18n.lang_overrides || {}
    if(i18n.lang_overrides[lang] || (i18n.lang_overrides[lang] === false && !store_result)) {
      return;
    }
    if(window.persistence) {
      var path = "/api/v1/lang/" + encodeURIComponent(lang);
      var handle_result = function(res) {
        if(!res) {
          i18n.lang_overrides[lang] = false;
          return;
        }
        var loc = res._locale || lang;
        i18n.lang_overrides[loc] = {
          rules: res.rules,
          default_contractions: res.default_contractions,
          contractions: res.contractions
        }
      };
      var remote_lookup = function() {
        window.persistence.store_json(path).then(function(res) {
          handle_result(res);
        }, function(err) {
          i18n.lang_overrides[lang] = false;
        });  
      };
      if(store_result) {
        remote_lookup();
      } else {
        window.persistence.find_json(path).then(function(res) {
          handle_result(res);
        }, function(err) {
          remote_lookup();
        })
      }
    } else {
      console.error("LINGOLINQ: lang override requested an ajax call too soon");
    }
  },
  key_string: function(keyCode) {
    var codes = this.get('keys');
    return codes[keyCode];
  },
  readable_language: function(locale) {
    var unknown = i18n.t('unknown_language', "Unknown Language");
    if(!locale) { return unknown; }
    var pieces = locale.split(/[-_]/);
    locale = pieces.shift().toLowerCase();
    if(pieces.length > 1) {
      var mid = pieces.shift().toLowerCase();
      mid = mid[0].toUpperCase() + mid.substring(1);
      locale = locale + "_" + mid;
    }

    if(pieces[0]) { locale = locale + "_" + pieces[0].toUpperCase(); }

    var list = i18n.get('locales');
    var res = unknown;
    for(var key in list) {
      if(key == locale) {
        res = list[key];
      }
    }
    if(!res) {
      locale = locale.split(/_/)[0];
      for(var key in list) {
        if(key == locale) {
          res = list[key];
        }
      }
    }
    return res;
  },
  translatable_locales: computed('locales', function() {
    var res = {};
    var locales = i18n.get('locales');
    for(var idx in locales) {
      if(idx == 'zh_Hans' || idx == 'zh_Hant' || (idx != 'zh' && !idx.match(/_/))) {
        res[idx] = locales[idx];
      }
    }
    return res;
  }),
  text_direction: function(locale) {
    locale = locale || navigator.language || 'en-US';
    if(i18n.rtl_locales[locale.replace(/-/, '_')]) {
      return 'rtl';
    } else {
      return 'ltr';
    }
  }
  // http://www.oxforddictionaries.com/us/words/spelling
}).create({
  vowels: ['a', 'e', 'i', 'o', 'u', 'y'],
  substitutions: {
    plurals: {
      'buffalo': 'buffaloes',
      'domino': 'dominoes',
      'echo': 'echoes',
      'embargo': 'embargoes',
      'hero': 'heroes',
      'mosquito': 'mosquitoes',
      'potato': 'potatoes',
      'tomato': 'tomatoes',
      'torpedo': 'torpedoes',
      'veto': 'vetoes',
      'alga': 'algae',
      'alumnus': 'alumni',
      'larva': 'larvae',
      'mouse': 'mice',
      'goose': 'geese',
      'day': 'days',
      'man': 'men',
      'woman': 'women',
      'person': 'people',
      'foot': 'feet',
      'tooth': 'teeth',
      'leaf': 'leaves',
      'sheep': 'sheep',
      'deer': 'deer',
      'moose': 'moose',
      'stomach': 'stomachs',
      'epoch': 'epochs'
    },
    singulars: {
      'halves': 'half',
      'scarves': 'scarf'
    },
    superlatives_comparatives: {
      // http://www.edufind.com/english/grammar/adjectives_irregular_comparative_superlative.php
      // http://www.englishclub.com/vocabulary/irregular-adjectives.htm
      'good': ['better', 'the best', 'less good'],
      'well': ['better', 'the best', 'less good'],
      'bad': ['worse', 'the worst', 'less bad'],
      'little': ['less', 'the least', 'less little'],
      'much': ['more', 'the most', 'less'],
      'far': ['farther', 'the farthest', 'less far']
    },
    verb_to_be_negations: {
      'am': "am not",
      'will': "won't",
      'shall': "shan't",
      'be': "not be",
      'been': "not been",
      'being': "not being"
    },
    possessives: {
      'i': ['my', 'mine', 'me', 'myself'],
      'me': ['my', 'mine', 'me', 'myself'],
      'you': ['your', 'yours', 'you', 'yourself'],
      'he': ['his', 'his', 'him', 'himself'],
      'she': ['her', 'hers', 'her', 'herself'],
      'it': ['its', 'its', 'it', 'itself'],
      'we': ['our', 'ours', 'us', 'ourselves'],
      'they': ['their', 'theirs', 'them', 'themselves'],
      'them': ['their', 'theirs', 'them', 'themselves']
    },
    default_contractions: {
      "I will": "I'll",
      "you will": "you'll",
      "we will": "we'll",
      "he will": "he'll",
      "she will": "she'll",
      "they will": "they'll",
      "it will": "it'll",
      "I would": "I'd",
      "you would": "you'd",
      "we would": "we'd",
      "he would": "he'd",
      "she would": "she'd",
      "they would": "they'd",
      "it would": "it'd",
      "I have": "I've",
      "you have": "you've",
      "we have": "we've",
      "he has": "he's",
      "she has": "she's",
      "they have": "they've",
      "it has": "it's",
      "I had": "I'd",
      "you had": "you'd",
      "we had": "we'd",
      "he had": "he'd",
      "she had": "she'd",
      "they had": "they'd",
      "it had": "it'd",
      "I am": "I'm",
      "you are": "you're",
      "we are": "we're",
      "he is": "he's",
      "she is": "she's",
      "they are": "they're",
      "it is": "it's",
      "who is": "who's",
      "what is": "what's",
      "where is": "where's",
      "how is": "how's",
      "this is": "this's",
      "that is": "that's",
      "there is": "there's",
      "here is": "here's",
      "is not": "isn't",
      "was not": "wasn't",
      "were not": "weren't",
      "do not": "don't",
      "does not": "doesn't",
      "did not": "didn't",
      "have not": "haven't",
      "has not": "hasn't",
      "can not": "can't",
      "could not": "couldn't",
      "will not": "won't",
      "would not": "wouldn't",
      "should not": "shouldn't",
      "are not": "aren't",
    },
    contractions: {
      "is not": "isn't",
      "are not": "aren't",
      "was not": "wasn't",
      "were not": "weren't",
      "do not": "don't",
      "does not": "doesn't",
      "did not": "didn't",
      "have not": "haven't",
      "has not": "hasn't",
      "had not": "hadn't",
      "can not": "can't",
      "could not": "couldn't",
      "will not": "won't",
      "would not": "wouldn't",
      "should not": "shouldn't",
      "I am": "I'm",
      "you are": "you're",
      "we are": "we're",
      "he is": "he's",
      "she is": "she's",
      "they are": "they're",
      "it is": "it's",
      "who is": "who's",
      "what is": "what's",
      "when is": "when's",
      "where is": "where's",
      "why is": "why's",
      "how is": "how's",
      "which is": "which's",
      "I will": "I'll",
      "you will": "you'll",
      "we will": "we'll",
      "he will": "he'll",
      "she will": "she'll",
      "they will": "they'll",
      "it will": "it'll",
      "I would": "I'd",
      "you would": "you'd",
      "we would": "we'd",
      "he would": "he'd",
      "she would": "she'd",
      "they would": "they'd",
      "it would": "it'd",
      "I have": "I've",
      "you have": "you've",
      "we have": "we've",
      "he has": "he's",
      "she has": "she's",
      "they have": "they've",
      "it has": "it's",
      "I had": "I'd",
      "you had": "you'd",
      "we had": "we'd",
      "he had": "he'd",
      "she had": "she'd",
      "they had": "they'd",
      "it had": "it'd",
      "who are": "who're",
      "what are": "what're",
      "when are": "when're",
      "where are": "where're",
      "why are": "why're",
      "how are": "how're",
      "which are": "which're",
      "who have": "who've",
      "what have": "what've",
      "when have": "when've",
      "where have": "where've",
      "why have": "why've",
      "how have": "how've",
      "which have": "which've",
      "who did": "who'd",
      "what did": "what'd",
      "when did": "when'd",
      "where did": "where'd",
      "why did": "why'd",
      "how did": "how'd",
      "which did": "which'd",
      "who will": "who'll",
      "what will": "what'll",
      "when will": "when'll",
      "where will": "where'll",
      "why will": "why'll",
      "how will": "how'll",
      "which will": "which'll",
      "this will": "this'll",
      "these will": "these'll",
      "that will": "that'll",
      "those will": "those'll",
      "there will": "there'll",
      "here will": "here'll",
      "this is": "this's",
      "that is": "that's",
      "there is": "there's",
      "here is": "here's",
      "somebody is": "somebody's",
      "everybody is": "everybody's",
      "anybody is": "anybody's",
      "kind of": "kinda",
      "want to": "wanna",
      "you all": "y'all",
      "you people": "y'uns",
      "all right": "a'ight",
    },
    tenses: {
      // http://www.englishpage.com/irregularverbs/irregularverbs.html
      'am': ['am', 'was', 'been', 'being'],
      'are': ['are', 'were', 'been', 'being'],
      'is': ['is', 'was', 'been', 'being'],
      'arise': ['arises', 'arose', 'arisen', 'arising'],
      'awake': ['awakes', 'awoke', 'awoken', 'awaking'],
      'backslide': ['backslides', 'backslid', 'backslidden', 'backsliding'],
      'be': ['is', 'was', 'been', 'being'],
      'bear': ['bears', 'bore', 'borne', 'bearing'],
      'beat': ['beats', 'beat', 'beaten', 'beating'],
      'become': ['becomes', 'became', 'become', 'becoming'],
      'begin': ['begins', 'began', 'begun', 'beginning'],
      'bend': ['bends', 'bent', 'bent', 'bending'],
      'bet': ['bets', 'bet', 'bet', 'betting'],
      'bid': ['bids', 'bade', 'bidden', 'bidding'],
      'bind': ['binds', 'bound', 'bound', 'binding'],
      'bite': ['bites', 'bit', 'bitten', 'biting'],
      'bleed': ['bleeds', 'bled', 'bled', 'bleeding'],
      'blow': ['blows', 'blew', 'blown', 'blowing'],
      'break': ['breaks', 'broke', 'broken', 'breaking'],
      'breed': ['breeds', 'bred', 'bred', 'breeding'],
      'bring': ['brings', 'brought', 'brought', 'bringing'],
      'broadcast': ['broadcasts', 'broadcasted', 'broadcasted', 'broadcasting'],
      'browbeat': ['browbeats', 'browbeat', 'browbeaten', 'browbeating'],
      'build': ['builds', 'built', 'built', 'building'],
      'burn': ['burns', 'burned', 'burned', 'burning'],
      'burst': ['bursts', 'burst', 'burst', 'bursting'],
      'bust': ['busts', 'busted', 'busted', 'busting'],
      'buy': ['buys', 'bought', 'bought', 'buying'],
      'cast': ['casts', 'cast', 'cast', 'casting'],
      'catch': ['catches', 'caught', 'caught', 'catching'],
      'choose': ['chooses', 'chose', 'chosen', 'choosing'],
      'cling': ['clings', 'clung', 'clung', 'clinging'],
      'clothe': ['clothes', 'clothed', 'clothed', 'clothing'],
      'come': ['comes', 'came', 'come', 'coming'],
      'cost': ['costs', 'cost', 'cost', 'costing'],
      'creep': ['creeps', 'crept', 'crept', 'creeping'],
      'crossbreed': ['crossbreeds', 'crossbred', 'crossbred', 'crossbreeding'],
      'cut': ['cuts', 'cut', 'cut', 'cutting'],
      'daydream': ['daydreams', 'daydreamed', 'daydreamed', 'daydreaming'],
      'deal': ['deals', 'dealt', 'dealt', 'dealing'],
      'dig': ['dig', 'dug', 'dug', 'digging'],
      'disprove': ['disproves', 'disproved', 'disproved', 'disproving'],
      'dive': ['dives', 'dove', 'dived', 'diving'],
      'do': ['does', 'did', 'done', 'doing'],
      'draw': ['draws', 'drew', 'drawn', 'drawing'],
      'dream': ['dreams', 'dreamed', 'dreamed', 'dreaming'],
      'drink': ['drinks', 'drank', 'drunk', 'drinking'],
      'drive': ['drives', 'drove', 'driven', 'driving'],
      'dwell': ['dwells', 'dwelt', 'dwelt', 'dwelling'],
      'eat': ['eats', 'ate', 'eaten', 'eating'],
      'fall': ['falls', 'fell', 'fallen', 'falling'],
      'feed': ['feeds', 'fed', 'fed', 'feeding'],
      'feel': ['feels', 'felt', 'felt', 'feeling'],
      'fight': ['fights', 'fought', 'fought', 'fighting'],
      'find': ['finds', 'found', 'found', 'finding'],
      'fit': ['fits', 'fit', 'fit', 'fitting'],
      'flee': ['flees', 'fled', 'fled', 'fleeing'],
      'fling': ['flings', 'flung', 'flung', 'flinging'],
      'fly': ['flies', 'flew', 'flown', 'flying'],
      'forbid': ['forbids', 'forbade', 'forbidden', 'forbidding'],
      'forecast': ['forecasts', 'forecast', 'forecast', 'forecasting'],
      'forego': ['foregoes', 'forwent', 'foregone', 'foregoing'],
      'foresee': ['foresees', 'foresaw', 'foreseen', 'foreseeing'],
      'foretell': ['foretells', 'foretold', 'foretold', 'foretelling'],
      'forget': ['forgets', 'forgot', 'forgotten', 'forgetting'],
      'forgive': ['forgives', 'forgave', 'forgiven', 'forgiving'],
      'forsake': ['forsakes', 'forsook', 'forsaken', 'forsaking'],
      'freeze': ['freezes', 'froze', 'frozen', 'freezing'],
      'frostbite': ['frostbites', 'frostbit', 'frostbitten', 'frostbiting'],
      'get': ['gets', 'got', 'gotten', 'getting'],
      'give': ['gives', 'gave', 'given', 'giving'],
      'go': ['goes', 'went', 'gone', 'going'],
      'grind': ['grinds', 'ground', 'ground', 'grinding'],
      'grow': ['grows', 'grew', 'grown', 'growing'],
      'hand-feed': ['hand-feeds', 'hand-fed', 'hand-fed', 'hand-feeding'],
      'handwrite': ['handwrites', 'handwrote', 'handwritten', 'handwriting'],
      'hang': ['hangs', 'hung', 'hung', 'hanging'],
      'have': ['has', 'had', 'had', 'having'],
      'hear': ['hears', 'heard', 'heard', 'hearing'],
      'hew': ['hews', 'hewed', 'hewn', 'hewing'],
      'hide': ['hides', 'hid', 'hidden', 'hiding'],
      'hit': ['hits', 'hit', 'hit', 'hitting'],
      'hold': ['holds', 'held', 'held', 'holding'],
      'hurt': ['hurts', 'hurt', 'hurt', 'hurting'],
      'inbreed': ['inbreeds', 'inbred', 'inbred', 'inbreeding'],
      'inlay': ['inlays', 'inlaid', 'inlaid', 'inlaying'],
      'input': ['inputs', 'input', 'input', 'inputting'],
      'interbreed': ['interbreeds', 'interbred', 'interbred', 'interbreeding'],
      'interweave': ['interweaves', 'interwove', 'interwoven', 'interweaving'],
      'interwind': ['interwinds', 'interwound', 'interwound', 'interwinding'],
      'keep': ['keeps', 'kept', 'kept', 'keeping'],
      'kneel': ['kneels', 'knelt', 'knelt', 'kneeling'],
      'knit': ['knits', 'knitted', 'knitted', 'knitting'],
      'know': ['knows', 'knew', 'known', 'knowing'],
      'lay': ['lays', 'laid', 'laid', 'laying'],
      'lead': ['leads', 'led', 'led', 'laying'],
      'lean': ['leans', 'leaned', 'leaned', 'leaning'],
      'leap': ['leaps', 'leaped', 'leaped', 'leaping'],
      'learn': ['learns', 'learned', 'learned', 'learning'],
      'leave': ['leaves', 'left', 'left', 'leaving'],
      'lend': ['lends', 'lent', 'lent', 'lending'],
      'let': ['lets', 'let', 'let', 'letting'],
      'lie': ['lies', 'lied', 'lied', 'lying'],
      'light': ['lights', 'lit', 'lit', 'lighting'],
      'lip-read': ['lip-reads', 'lip-read', 'lip-read', 'lip-reading'],
      'lose': ['loses', 'lost', 'lost', 'losing'],
      'make': ['makes', 'made', 'made', 'making'],
      'mean': ['means', 'meant', 'meant', 'meaning'],
      'meet': ['meets', 'met', 'met', 'meeting'],
      'miscast': ['miscasts', 'miscast', 'miscast', 'miscasting'],
      'misdeal': ['misdeals', 'misdealt', 'misdealt', 'misdealing'],
      'misdo': ['misdoes', 'misdid', 'misdone', 'misdoing'],
      'mishear': ['mishears', 'misheard', 'misheard', 'mishearing'],
      'mislay': ['mislays', 'mislaid', 'mislaid', 'mislaying'],
      'mislead': ['misleads', 'misled', 'misled', 'misleading'],
      'mislearn': ['mislearns', 'mislearned', 'mislearned', 'mislearning'],
      'misread': ['misreads', 'misread', 'misread', 'misreading'],
      'misset': ['missets', 'misset', 'misset', 'missetting'],
      'misspeak': ['misspeaks', 'misspoke', 'misspoken', 'misspeaking'],
      'misspell': ['misspells', 'misspelled', 'misspelled', 'misspelling'],
      'misspend': ['misspends', 'misspent', 'misspent', 'misspending'],
      'mistake': ['mistakes', 'mistook', 'mistaken', 'mistaking'],
      'misteach': ['misteaches', 'mistaught', 'mistaught', 'misteaching'],
      'misunderstand': ['misunderstands', 'misunderstood', 'misunderstood', 'misunderstanding'],
      'miswrite': ['miswrites', 'miswrote', 'miswrote', 'miswriting'],
      'offset': ['offsets', 'offset', 'offset', 'offsetting'],
      'outbid': ['outbids', 'outbid', 'outbid', 'outbidding'],
      'outbreed': ['outbreeds', 'outbred', 'outbred', 'outbreeding'],
      'outdo': ['outdoes', 'outdid', 'outdone', 'outdoing'],
      'outdraw': ['outdraws', 'outdrew', 'outdrawn', 'outdrawing'],
      'outdrink': ['outdrinks', 'outdrank', 'outdrunk', 'outdrinking'],
      'outdrive': ['outdrives', 'outdrove', 'outdriven', 'outdriving'],
      'outfight': ['outfights', 'outfought', 'outfought', 'outfighting'],
      'outfly': ['outflies', 'outflew', 'outflown', 'outflying'],
      'outgrow': ['outgrows', 'outgrew', 'outgrown', 'outgrowing'],
      'outleap': ['outleaps', 'outleaped', 'outleaped', 'outleaping'],
      'outlie': ['outlies', 'outlied', 'outlied', 'outlying'],
      'outride': ['outrides', 'outrode', 'outridden', 'outriding'],
      'outrun': ['outruns', 'outran', 'outrun', 'outrunning'],
      'outsell': ['outsells', 'outsold', 'outsold', 'outselling'],
      'outshine': ['outshines', 'outshined', 'outshined', 'outshining'],
      'outshoot': ['outshoots', 'outshot', 'outshot', 'outshooting'],
      'outsing': ['outsings', 'outsang', 'outsung', 'outsinging'],
      'outsit': ['outsits', 'outsat', 'outsat', 'outsitting'],
      'outsleep': ['outsleeps', 'outslept', 'outslept', 'outsleeping'],
      'outsmell': ['outsmells', 'outsmelled', 'outsmelled', 'outsmelling'],
      'outspeak': ['outspeaks', 'outspoke', 'outspoken', 'outspeaking'],
      'outspeed': ['outspeeds', 'outsped', 'outsped', 'outspeeding'],
      'outspend': ['outspends', 'outspent', 'outspent', 'outspending'],
      'outswear': ['outswears', 'outswore', 'outsworn', 'outswearing'],
      'outswim': ['outswims', 'outswam', 'outswum', 'outswimming'],
      'outthink': ['outthinks', 'outthought', 'outthought', 'outthinking'],
      'outthrow': ['outthrows', 'outthrew', 'outthrown', 'outthrowing'],
      'outwrite': ['outwrites', 'outwrote', 'outwritten', 'outwriting'],
      'overbid': ['overbids', 'overbid', 'overbid', 'overbidding'],
      'overbreed': ['overbreeds', 'overbred', 'overbred', 'overbreeding'],
      'overbuild': ['overbuilds', 'overbuilt', 'overbuilt', 'overbuilding'],
      'overbuy': ['overbuys', 'overbought', 'overbought', 'overbuying'],
      'overcome': ['overcomes', 'overcame', 'overcome', 'overcoming'],
      'overdo': ['overdoes', 'overdid', 'overdone', 'overdoing'],
      'overdraw': ['overdraws', 'overdrew', 'overdrawn', 'overdrawing'],
      'overdrink': ['overdrinks', 'overdrank', 'overdrunk', 'overdrinking'],
      'overeat': ['overeats', 'overate', 'overeaten', 'overeating'],
      'overfeed': ['overfeeds', 'overfed', 'overfed', 'overfeeding'],
      'overhang': ['overhangs', 'overhung', 'overhung', 'overhanging'],
      'overhear': ['overhears', 'overheard', 'overheard', 'overhearing'],
      'overlay': ['overlays', 'overlaid', 'overlaid', 'overlaying'],
      'overpay': ['overpays', 'overpaid', 'overpaid', 'overpaying'],
      'override': ['overrides', 'overrode', 'overridden', 'overriding'],
      'overrun': ['overruns', 'overran', 'overrun', 'overrunning'],
      'oversee': ['oversees', 'oversaw', 'overseen', 'overseeing'],
      'oversell': ['oversells', 'oversold', 'oversold', 'overselling'],
      'oversew': ['oversews', 'oversewed', 'oversewed', 'oversewing'],
      'overshoot': ['overshoots', 'overshot', 'overshot', 'overshooting'],
      'oversleep': ['oversleeps', 'overslept', 'overslept', 'oversleeping'],
      'overspeak': ['overspeaks', 'overspoke', 'overspoken', 'overspeaking'],
      'overspend': ['overspends', 'overspent', 'overspent', 'overspending'],
      'overspill': ['overspills', 'overspilled', 'overspilled', 'overspilling'],
      'overtake': ['overtakes', 'overtook', 'overtaken', 'overtaking'],
      'overthink': ['overthinks', 'overthought', 'overthought', 'overthinking'],
      'overthrow': ['overthrows', 'overthrew', 'overthrown', 'overthrowing'],
      'overwind': ['overwinds', 'overwound', 'overwound', 'overwinding'],
      'overwrite': ['overwrites', 'overwrote', 'overwritten', 'overwriting'],
      'partake': ['partakes', 'partook', 'partaken', 'partaking'],
      'pay': ['pays', 'paid', 'paid', 'paying'],
      'plead': ['pleads', 'pleaded', 'pleaded', 'pleading'],
      'prebuild': ['prebuilds', 'prebuilt', 'prebuilt', 'prebuilding'],
      'predo': ['predoes', 'predid', 'predone', 'predoing'],
      'premake': ['premakes', 'premade', 'premade', 'premaking'],
      'prepay': ['prepay', 'prepaid', 'prepaid', 'prepaying'],
      'presell': ['presells', 'presold', 'presold', 'preselling'],
      'preset': ['presets', 'preset', 'preset', 'presetting'],
      'preshrink': ['preshrinks', 'preshrank', 'preshrunk', 'preshrinking'],
      'proofread': ['proofreads', 'proofread', 'proofread', 'proofreading'],
      'prove': ['proves', 'proved', 'proven', 'proving'],
      'put': ['puts', 'put', 'put', 'putting'],
      'quick-freeze': ['quick-freezes', 'quick-froze', 'quick-frozen', 'quick-freezing'],
      'quit': ['quits', 'quit', 'quit', 'quitting'],
      'read': ['reads', 'read', 'read', 'reading'],
      'reawake': ['reawaks', 'reawoke', 'reawakened', 'reawaking'],
      'rebid': ['rebids', 'rebid', 'rebid', 'rebidding'],
      'rebind': ['rebinds', 'rebound', 'rebound', 'rebinding'],
      'rebroadcast': ['rebroadcasts', 'rebroadcast', 'rebroadcast', 'rebroadcasting'],
      'rebuild': ['rebuilds', 'rebuilt', 'rebuilt', 'rebuilding'],
      'recast': ['recasts', 'recast', 'recast', 'recasting'],
      'recut': ['recuts', 'recut', 'recut', 'recutting'],
      'redeal': ['redeals', 'redealt', 'redealt', 'redealing'],
      'redo': ['redoes', 'redid', 'redone', 'redoing'],
      'redraw': ['redrawas', 'redrew', 'redrawn', 'redrawing'],
      'refit': ['refits', 'refitted', 'refitted', 'refitting'],
      'regrind': ['regrinds', 'reground', 'reground', 'regrinding'],
      'regrow': ['regrows', 'regrew', 'regrown', 'regrowing'],
      'rehang': ['rehangs', 'rehung', 'rehung', 'rehanging'],
      'rehear': ['rehears', 'reheard', 'reheard', 'rehearing'],
      'reknit': ['reknots', 'reknitted', 'reknitted', 'reknitting'],
      'relay': ['relays', 'relayed', 'relayed', 'relaying'],
      'relearn': ['relearns', 'relearned', 'relearned', 'relearning'],
      'relight': ['relights', 'relit', 'relit', 'relighting'],
      'remake': ['remakes', 'remade', 'remade', 'remaking'],
      'repay': ['repays', 'repaid', 'repaid', 'repaying'],
      'reread': ['rereads', 'reread', 'reread', 'rereading'],
      'rerun': ['reruns', 'reran', 'rerun', 'rerunning'],
      'resell': ['resells', 'resole', 'resold', 'reselling'],
      'resend': ['resends', 'resent', 'resent', 'resending'],
      'reset': ['resets', 'reset', 'reset', 'resetting'],
      'resew': ['resews', 'resewed', 'resewed', 'resewing'],
      'retake': ['retakes', 'retook', 'retaken', 'retaking'],
      'reteach': ['reteaches', 'retaught', 'retaught', 'reteaching'],
      'retear': ['retears', 'retore', 'retorn', 'retearing'],
      'retell': ['retells', 'retold', 'retold', 'retelling'],
      'rethink': ['rethinks', 'rethought', 'retought', 'rethinking'],
      'retread': ['retreads', 'retread', 'retread', 'retreading'],
      'retrofit': ['retrofits', 'retrofitted', 'retrofitted', 'retrofitting'],
      'rewake': ['rewakes', 'rewoke', 'rewaken', 'rewaking'],
      'rewear': ['rewears', 'reword', 'reworn', 'rewearing'],
      'reweave': ['reweave', 'rewove', 'rewoven', 'reweaving'],
      'rewed': ['rewers', 'rewed', 'rewed', 'rewedding'],
      'rewet': ['rewets', 'rewet', 'rewet', 'rewetting'],
      'rewin': ['rewins', 'rewon', 'rewon', 'reweinning'],
      'rewind': ['rewinds', 'rewound', 'rewound', 'rewinding'],
      'rewrite': ['rewrites', 'rewrote', 'rewritten', 'rewriting'],
      'rid': ['rids', 'rid', 'rid', 'ridding'],
      'ride': ['rides', 'rode', 'ridden', 'riding'],
      'ring': ['rings', 'rang', 'rung', 'ringing'],
      'rise': ['rises', 'rose', 'risen', 'rising'],
      'roughcast': ['roughcasts', 'roughcast', 'roughcast', 'roughcasting'],
      'run': ['runs', 'ran', 'run', 'running'],
      'sand-cast': ['sand-casts', 'sand-cast', 'sand-cast', 'sand-casting'],
      'saw': ['saws', 'sawed', 'sawn', 'sawing'],
      'say': ['says', 'said', 'said', 'saying'],
      'see': ['sees', 'saw', 'seen', 'seeing'],
      'seek': ['seeks', 'sought', 'sought', 'seeking'],
      'sell': ['sells', 'sold', 'sold', 'selling'],
      'send': ['sends', 'sent', 'sent', 'sending'],
      'set': ['sets', 'set', 'set', 'setting'],
      'sew': ['sews', 'sewed', 'sewn', 'sewing'],
      'shake': ['shakes', 'shook', 'shaken', 'shaking'],
      'shave': ['shaves', 'shaved', 'shaved', 'shaving'],
      'shear': ['shears', 'sheared', 'sheared', 'shearing'],
      'shed': ['sheds', 'shed', 'shed', 'shedding'],
      'shine': ['shines', 'shined', 'shined', 'shining'],
      'shoot': ['shoots', 'shot', 'shot', 'shooting'],
      'show': ['shows', 'showed', 'shown', 'showing'],
      'shrink': ['shrinks', 'shrank', 'shrunk', 'shrinking'],
      'shut': ['shuts', 'shut', 'shut', 'shutting'],
      'sight-read': ['sight-reads', 'sight-read', 'sight-read', 'sight-reading'],
      'sing': ['sings', 'sang', 'sung', 'singing'],
      'sink': ['sinks', 'sank', 'sunk', 'sinking'],
      'sit': ['sits', 'sat', 'sat', 'sitting'],
      'slay': ['slays', 'slew', 'slayed', 'slaying'],
      'sleep': ['sleeps', 'slept', 'slept', 'sleeping'],
      'slide': ['slides', 'slid', 'slid', 'sliding'],
      'sling': ['slings', 'slung', 'slung', 'slinging'],
      'slink': ['slinks', 'slinked', 'slinked', 'slinking'],
      'slit': ['slits', 'slit', 'slit', 'slitting'],
      'smell': ['smells', 'smelled', 'smelled', 'smelling'],
      'sneak': ['sneaks', 'snuck', 'snuck', 'sneaking'],
      'sow': ['sows', 'sowed', 'sown', 'sowing'],
      'speak': ['speaks', 'spoke', 'spoken', 'speaking'],
      'speed': ['speeds', 'sped', 'sped', 'speeding'],
      'spell': ['spells', 'spelled', 'spelled', 'spelling'],
      'spend': ['spends', 'spent', 'spent', 'spending'],
      'spill': ['spills', 'spilled', 'spilled', 'spilling'],
      'spin': ['spins', 'spun', 'spun', 'spinning'],
      'spit': ['spits', 'spat', 'spat', 'spitting'],
      'split': ['splits', 'split', 'split', 'splitting'],
      'spoil': ['spoils', 'spoiled', 'spoiled', 'spoiling'],
      'spoon-feed': ['spoon-feeds', 'spoon-fed', 'spoon-fed', 'spoon-feeding'],
      'spread': ['spreads', 'spread', 'spread', 'spreading'],
      'spring': ['springs', 'sprang', 'sprung', 'springing'],
      'stand': ['stands', 'stood', 'stood', 'standing'],
      'steal': ['steals', 'stole', 'stolen', 'stealing'],
      'stick': ['sticks', 'stuck', 'stuck', 'sticking'],
      'sting': ['stings', 'stung', 'stung', 'stinging'],
      'stink': ['stinks', 'stank', 'stunk', 'stinking'],
      'strew': ['strews', 'strewed', 'strewn', 'strewing'],
      'stride': ['strides', 'strode', 'stridden', 'striding'],
      'strike': ['stikes', 'struck', 'struck', 'striking'],
      'string': ['strings', 'strung', 'strung', 'stringing'],
      'strive': ['strives', 'strove', 'striven', 'striving'],
      'sublet': ['sublets', 'sublet', 'sublet', 'subletting'],
      'sunburn': ['sunburns', 'sunburned', 'sunburned', 'sunburning'],
      'swear': ['swears', 'swore', 'sworn', 'searing'],
      'sweat': ['sweats', 'sweat', 'sweat', 'sweating'],
      'sweep': ['sweeps', 'swept', 'swept', 'sweeping'],
      'swell': ['swells', 'swelled', 'swollen', 'swelling'],
      'swim': ['swims', 'swam', 'swum', 'swimming'],
      'swing': ['swings', 'swung', 'swung', 'swinging'],
      'take': ['takes', 'took', 'taken', 'taking'],
      'teach': ['teaches', 'taught', 'taught', 'teaching'],
      'tear': ['tears', 'tore', 'torn', 'tearing'],
      'telecast': ['telecasts', 'telecast', 'telecast', 'telecasting'],
      'tell': ['tells', 'told', 'told', 'telling'],
      'test-drive': ['test-drives', 'test-drive', 'test-driven', 'test-driving'],
      'test-fly': ['test-flies', 'test-flew', 'test-flown', 'test-flying'],
      'think': ['thinks', 'thought', 'thought', 'thinking'],
      'throw': ['throws', 'threw', 'thrown', 'throwing'],
      'thrust': ['thrusts', 'thrust', 'thrust', 'thrusting'],
      'tread': ['treads', 'trod', 'trodden', 'treading'],
      'typecast': ['typecasts', 'typecast', 'typecast', 'typecasting'],
      'typeset': ['typesets', 'typeset', 'typeset', 'typesetting'],
      'typewrite': ['typewrites', 'typewrote', 'typewritten', 'typewriting'],
      'unbend': ['unbends', 'unbent', 'unbent', 'unbending'],
      'unbind': ['unbinds', 'unbound', 'unbound', 'unbinding'],
      'unclothe': ['unclothes', 'unclothed', 'unclothed', 'unclothing'],
      'underbid': ['underbids', 'underbid', 'underbid', 'underbidding'],
      'undercut': ['undercuts', 'undercut', 'undercut', 'undercutting'],
      'underfeed': ['underfeeds', 'underfed', 'underfed', 'underfeeding'],
      'undergo': ['undergoes', 'underwent', 'undergone', 'undergoing'],
      'underlie': ['underlies', 'underlay', 'underlain', 'underlying'],
      'undersell': ['undersells', 'undersold', 'undersold', 'underselling'],
      'underspend': ['underspends', 'underspent', 'underspent', 'underspending'],
      'understand': ['understands', 'understood', 'understood', 'understanding'],
      'undertake': ['undertakes', 'undertook', 'undertaken', 'undertaking'],
      'underwrite': ['underwrites', 'underwrote', 'underwritten', 'underwriting'],
      'undo': ['undoes', 'undid', 'undone', 'undoing'],
      'unfreeze': ['unfreezes', 'unfroze', 'unfrozen', 'unfreezing'],
      'unhang': ['unhangs', 'unhung', 'unhung', 'unhanging'],
      'unhide': ['unhides', 'unhid', 'unhidden', 'unhiding'],
      'unknit': ['unknots', 'unknitted', 'unknitted', 'unknitting'],
      'unlearn': ['unlearns', 'unlearned', 'unlearned', 'unlearning'],
      'unsew': ['unsews', 'unsewed', 'unsewn', 'unsewing'],
      'unsling': ['unslings', 'unslung', 'unslung', 'unslinging'],
      'unspin': ['unspins', 'unspun', 'unspun', 'unspinning'],
      'unstick': ['unsticks', 'unstuck', 'unstuck', 'unsticking'],
      'unstring': ['unstrings', 'unstrung', 'unstrung', 'unstringing'],
      'unweave': ['unweaves', 'unwove', 'unwoven', 'unweaving'],
      'unwind': ['unwinds', 'unwound', 'unwound', 'unwinding'],
      'uphold': ['upholds', 'upheld', 'upheld', 'upholding'],
      'upset': ['upsets', 'upset', 'upset', 'upsetting'],
      'wake': ['wakes', 'woke', 'woken', 'waking'],
      'waylay': ['waylays', 'waylaid', 'waylaid', 'waylaying'],
      'wear': ['wears', 'wore', 'worn', 'wearing'],
      'weave': ['weaves', 'wove', 'woven', 'weaving'],
      'wed': ['weds', 'wed', 'wed', 'wedding'],
      'weep': ['weeps', 'wept', 'wept', 'weeping'],
      'wet': ['wets', 'wetted', 'wetted', 'wetting'],
      'whet': ['whets', 'whetted', 'whetted', 'whetting'],
      'win': ['wins', 'won', 'won', 'winning'],
      'wind': ['winds', 'wound', 'wound', 'winding'],
      'withdraw': ['withdraws', 'withdrew', 'withdrawn', 'withdrawing'],
      'withhold': ['withholds', 'withheld', 'withheld', 'withholding'],
      'withstand': ['withstands', 'withstood', 'withstood', 'withstanding'],
      'wring': ['wrings', 'wrung', 'wrung', 'wringing'],
      'write': ['writes', 'wrote', 'written', 'writing']
    }
  },
  completions: {
    'a': ["an", "about", "all", "again", "after", "always", "also"],
    'b': ["but", "by", "back", "because", "before", "be", "behind"],
    'c': ["but", "by", "back", "because", "before", "be", "behind"],
    'd': ["do", "don't", "did", "down", "does", "day", "doing"],
    'e': ["even", "ever", "everything", "every", "enough", "everyone", "early"],
    'f': ["for", "from", "food", "first", "fast", "friend", "feel"],
    'g': ["go", "get", "good", "got", "give", "great", "gone"],
    'h': ["here", "have", "how", "has", "her", "he", "him"],
    'i': ["is", "in", "it", "if", "i'm", "it's", "isn't"],
    'j': ["just", "job", "joke", "joy", "join", "junk", "judge"],
    'k': ["keep", "know", "kind", "kid", "kiss", "kitchen", "knew"],
    'l': ["like", "last", "later", "love", "let", "look", "leave"],
    'm': ["my", "me", "more", "make", "myself", "might", "much"],
    'n': ["now", "not", "no", "next", "new", "needs", "never"],
    'o': ["on", "of", "or", "out", "one", "over", "off"],
    'p': ["please", "people", "party", "person", "pretty", "put", "play"],
    'q': ["quick", "question", "quickly", "quiet", "quite", "quality", "quote"],
    'qu': ["quick", "question", "quickly", "quiet", "quite", "quality", "quote"],
    'r': ["right", "really", "ready", "read", "run", "ride", "rest"],
    's': ["so", "soon", "some", "she", "should", "something", "said"],
    't': ["to", "the", "that", "this", "today", "too", "then"],
    'u': ["up", "until", "us", "use", "under", "understand", "unless"],
    'v': ["very", "version", "voice", "visit", "vacation", "visiting", "view"],
    'w': ["with", "will", "was", "when", "what", "would", "we"],
    'x': ["xbox", "except", "extra", "excited", "exciting", "extremely", "exhausted"],
    'y': ["you", "your", "yet", "yesterday", "yeah", "yourself", "yes"],
    'z': ["zero", "zip", "zen", "zoom", "zebra", "zone", "zoo"],
  },
  core_words: {
    'default': [
      // allow picking from core words (source: http://aac.unl.edu/VLAACCU1.html)
      // also consider: http://www.aacandautism.com/common-words
      // http://praacticalaac.org/praactical/aac-vocabulary-lists/
      "I", "to", "you", "the",  "a", "my", "it", "and",
      "is", "in", "me", "that", "have",  "do", "of", "what",
      "was", "for", "get", "on", "I'm", "be", "when", "with",
      "this", "not", "one", "don't", "will", "are", "so",
      "they", "but", "if", "how", "can", "we", "going",
      "know", "want", "at", "like", "out", "I'll", "she",
      "go", "he"
    ]
  },
  keys: {
    8: 'backspace',
    9: 'tab',
    13: 'enter',
    16: 'shift',
    27: 'escape',
    36: 'home',
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    48: '0',
    49: '1',
    50: '2',
    51: '3',
    52: '4',
    53: '5',
    54: '6',
    55: '7',
    56: '8',
    57: '9',
    65: 'a',
    66: 'b',
    67: 'c',
    68: 'd',
    69: 'e',
    70: 'f',
    71: 'g',
    72: 'h',
    73: 'i',
    74: 'j',
    75: 'k',
    76: 'l',
    77: 'm',
    78: 'n',
    79: 'o',
    80: 'p',
    81: 'q',
    82: 'r',
    83: 's',
    84: 't',
    85: 'u',
    86: 'v',
    87: 'w',
    88: 'x',
    89: 'y',
    90: 'z',
    96: 'num 0',
    97: 'num 1',
    98: 'num 2',
    99: 'num 3',
    100: 'num 4',
    101: 'num 5',
    102: 'num 6',
    103: 'num 7',
    104: 'num 8',
    105: 'num 9',
    106: 'num *',
    107: 'num +',
    109: 'num -',
    110: 'num .',
    111: 'num /',
    188: ',',
    190: '.',
    191: '/',
    186: ';',
    222: '\'',
    219: '[',
    221: ']',
    220: '\\',
    192: '`',
    189: '-',
    187: '=',
    32: 'spacebar'
  },
  rtl_locales: {
    ar_DZ: "Arabic (Algeria)",
    ar_BH: "Arabic (Bahrain)",
    ar_EG: "Arabic (Egypt)",
    ar_IQ: "Arabic (Iraq)",
    ar_JO: "Arabic (Jordan)",
    ar_KW: "Arabic (Kuwait)",
    ar_LB: "Arabic (Lebanon)",
    ar_LY: "Arabic (Libya)",
    ar_MA: "Arabic (Morocco)",
    ar_OM: "Arabic (Oman)",
    ar_QA: "Arabic (Qatar)",
    ar_SA: "Arabic (Saudi Arabia)",
    ar_SD: "Arabic (Sudan)",
    ar_SY: "Arabic (Syria)",
    ar_TN: "Arabic (Tunisia)",
    ar_AE: "Arabic (United Arab Emirates)",
    ar_YE: "Arabic (Yemen)",
    ar: "Arabic",
    he_IL: "Hebrew (Israel)",
    he: "Hebrew",
  },
  lang_map: { //https://www.loc.gov/standards/iso639-2/php/code_list.php
    aa: "aar",
    ab: "abk",
    ae: "ave",
    af: "afr",
    ak: "aka",
    am: "amh",
    an: "arg",
    ar: "ara",
    as: "asm",
    av: "ava",
    ay: "aym",
    az: "aze",
    ba: "bak",
    be: "bel",
    bg: "bul",
    bh: "bih",
    bi: "bis",
    bm: "bam",
    bn: "ben",
    bo: "tib",
    br: "bre",
    bs: "bos",
    ca: "cat",
    ce: "che",
    ch: "cha",
    co: "cos",
    cr: "cre",
    cs: "cze",
    cu: "chu",
    cv: "chv",
    cy: "wel",
    da: "dan",
    de: "ger",
    dv: "div",
    dz: "dzo",
    ee: "ewe",
    el: "gre",
    en: "eng",
    eo: "epo",
    es: "spa",
    et: "est",
    eu: "baq",
    fa: "per",
    ff: "ful",
    fi: "fin",
    fj: "fij",
    fo: "fao",
    fr: "fre",
    fy: "fry",
    ga: "gle",
    gd: "gla",
    gl: "glg",
    gn: "grn",
    gu: "guj",
    gv: "glv",
    ha: "hau",
    he: "heb",
    hi: "hin",
    ho: "hmo",
    hr: "hrv",
    ht: "hat",
    hu: "hun",
    hy: "arm",
    hz: "her",
    ia: "ina",
    id: "ind",
    ie: "ile",
    ig: "ibo",
    ii: "iii",
    ik: "ipk",
    io: "ido",
    is: "ice",
    it: "ita",
    iu: "iku",
    ja: "jpn",
    jv: "jav",
    ka: "geo",
    kg: "kon",
    ki: "kik",
    kj: "kua",
    kk: "kaz",
    kl: "kal",
    km: "khm",
    kn: "kan",
    ko: "kor",
    kr: "kau",
    ks: "kas",
    ku: "kur",
    kv: "kom",
    kw: "cor",
    ky: "kir",
    la: "lat",
    lb: "ltz",
    lg: "lug",
    li: "lim",
    ln: "lin",
    lo: "lao",
    lt: "lit",
    lu: "lub",
    lv: "lav",
    mg: "mlg",
    mh: "mah",
    mi: "mao",
    mk: "mac",
    ml: "mal",
    mn: "mon",
    mr: "mar",
    ms: "may",
    mt: "mlt",
    my: "bur",
    na: "nau",
    nb: "nob",
    nd: "nde",
    ne: "nep",
    ng: "ndo",
    nl: "dut",
    nn: "nno",
    no: "nor",
    nr: "nbl",
    nv: "nav",
    ny: "nya",
    oc: "oci",
    oj: "oji",
    om: "orm",
    or: "ori",
    os: "oss",
    pa: "pan",
    pi: "pli",
    pl: "pol",
    ps: "pus",
    pt: "por",
    qu: "que",
    rm: "roh",
    rn: "run",
    ro: "rum",
    ru: "rus",
    rw: "kin",
    sa: "san",
    sc: "srd",
    sd: "snd",
    se: "sme",
    sg: "sag",
    si: "sin",
    sk: "slo",
    sl: "slv",
    sm: "smo",
    sn: "sna",
    so: "som",
    sq: "alb",
    sr: "srp",
    ss: "ssw",
    st: "sot",
    su: "sun",
    sv: "swe",
    sw: "swa",
    ta: "tam",
    te: "tel",
    tg: "tgk",
    th: "tha",
    ti: "tir",
    tk: "tuk",
    tl: "tgl",
    tn: "tsn",
    to: "ton",
    tr: "tur",
    ts: "tso",
    tt: "tat",
    tw: "twi",
    ty: "tah",
    ug: "uig",
    uk: "ukr",
    ur: "urd",
    uz: "uzb",
    ve: "ven",
    vi: "vie",
    vo: "vol",
    wa: "wln",
    wo: "wol",
    xh: "xho",
    yi: "yid",
    yo: "yor",
    za: "zha",
    zh: "chi",
    zu: "zul",
  },
  locales_translated: [
    'en',
    'es*',
    'pl',
    'pt*',
    'ar*',
    'uk*',
    'zh*',
    'ja*',
    'ru*',
    'fr*',
    'backwards',
  ],
  locales_localized: {
    ar: "عربي",
    en: "English",
    de: "German",    
    es: "Español",
    fr: "Français",
    ga: "Gaeilge",
    pl: "Polski",
    ps: "پښتو",
    pt: "Português",
    ja: "日本",
    uk: "український",
    ur: "اردو",
    ru: "русский",
    tl: "ᜏᜒᜃᜅ᜔ ᜆᜄᜎᜓᜄ᜔",
    vi: "Tiếng Việt",
    backwards: "Backwards English",
    zh: "中文"
  },
  other_locales: {
    ar_XA: "Arabic (Standard)",
    bg_BG: "Bulgarian (Bulgaria)",
    cmn_CN: "Mandarin Chinese",
    cmn_TW: "Mandarin Chinese",
    pa_IN: "Punjabi (India)",
    sr_RS: "Serbian (Cyrillic)",
    yue_HK: "Chinese (Hong Kong)"
  },
  locales: {
    af_NA: "Afrikaans (Namibia)",
    af_ZA: "Afrikaans (South Africa)",
    af: "Afrikaans",
    ak_GH: "Akan (Ghana)",
    ak: "Akan",
    sq_AL: "Albanian (Albania)",
    sq: "Albanian",
    am_ET: "Amharic (Ethiopia)",
    am: "Amharic",
    ar_DZ: "Arabic (Algeria)",
    ar_BH: "Arabic (Bahrain)",
    ar_EG: "Arabic (Egypt)",
    ar_IQ: "Arabic (Iraq)",
    ar_JO: "Arabic (Jordan)",
    ar_KW: "Arabic (Kuwait)",
    ar_LB: "Arabic (Lebanon)",
    ar_LY: "Arabic (Libya)",
    ar_MA: "Arabic (Morocco)",
    ar_OM: "Arabic (Oman)",
    ar_QA: "Arabic (Qatar)",
    ar_SA: "Arabic (Saudi Arabia)",
    ar_SD: "Arabic (Sudan)",
    ar_SY: "Arabic (Syria)",
    ar_TN: "Arabic (Tunisia)",
    ar_AE: "Arabic (United Arab Emirates)",
    ar_YE: "Arabic (Yemen)",
    ar: "Arabic",
    hy_AM: "Armenian (Armenia)",
    hy: "Armenian",
    as_IN: "Assamese (India)",
    as: "Assamese",
    asa_TZ: "Asu (Tanzania)",
    asa: "Asu",
    az_Cyrl: "Azerbaijani (Cyrillic)",
    az_Cyrl_AZ: "Azerbaijani (Cyrillic, Azerbaijan)",
    az_Latn: "Azerbaijani (Latin)",
    az_Latn_AZ: "Azerbaijani (Latin, Azerbaijan)",
    az: "Azerbaijani",
    bm_ML: "Bambara (Mali)",
    bm: "Bambara",
    eu_ES: "Basque (Spain)",
    eu: "Basque",
    be_BY: "Belarusian (Belarus)",
    be: "Belarusian",
    bem_ZM: "Bemba (Zambia)",
    bem: "Bemba",
    bez_TZ: "Bena (Tanzania)",
    bez: "Bena",
    bn_BD: "Bengali (Bangladesh)",
    bn_IN: "Bengali (India)",
    bn: "Bengali",
    bs_BA: "Bosnian (Bosnia and Herzegovina)",
    bs: "Bosnian",
    bg_BG: "Bulgarian (Bulgaria)",
    bg: "Bulgarian",
    my_MM: "Burmese (Myanmar [Burma])",
    my: "Burmese",
    ca_ES: "Catalan (Spain)",
    ca: "Catalan",
    tzm_Latn: "Central Morocco Tamazight (Latin)",
    tzm_Latn_MA: "Central Morocco Tamazight (Latin, Morocco)",
    tzm: "Central Morocco Tamazight",
    chr_US: "Cherokee (United States)",
    chr: "Cherokee",
    cgg_UG: "Chiga (Uganda)",
    cgg: "Chiga",
    zh_Hans: "Chinese (Simplified Han)",
    zh_Hans_CN: "Chinese (Simplified Han, China)",
    zh_Hans_HK: "Chinese (Simplified Han, Hong Kong SAR China)",
    zh_Hans_MO: "Chinese (Simplified Han, Macau SAR China)",
    zh_Hans_SG: "Chinese (Simplified Han, Singapore)",
    zh_Hant: "Chinese (Traditional Han)",
    zh_Hant_HK: "Chinese (Traditional Han, Hong Kong SAR China)",
    zh_Hant_MO: "Chinese (Traditional Han, Macau SAR China)",
    zh_Hant_TW: "Chinese (Traditional Han, Taiwan)",
    zh: "Chinese",
    kw_GB: "Cornish (United Kingdom)",
    kw: "Cornish",
    hr_HR: "Croatian (Croatia)",
    hr: "Croatian",
    cs_CZ: "Czech (Czech Republic)",
    cs: "Czech",
    da_DK: "Danish (Denmark)",
    da: "Danish",
    nl_BE: "Dutch (Belgium)",
    nl_NL: "Dutch (Netherlands)",
    nl: "Dutch",
    ebu_KE: "Embu (Kenya)",
    ebu: "Embu",
    en_AS: "English (American Samoa)",
    en_AU: "English (Australia)",
    en_BE: "English (Belgium)",
    en_BZ: "English (Belize)",
    en_BW: "English (Botswana)",
    en_CA: "English (Canada)",
    en_GU: "English (Guam)",
    en_HK: "English (Hong Kong SAR China)",
    en_IN: "English (India)",
    en_IE: "English (Ireland)",
    en_GD: "English (Scotland)",
    en_JM: "English (Jamaica)",
    en_MT: "English (Malta)",
    en_MH: "English (Marshall Islands)",
    en_MU: "English (Mauritius)",
    en_NA: "English (Namibia)",
    en_NZ: "English (New Zealand)",
    en_MP: "English (Northern Mariana Islands)",
    en_PK: "English (Pakistan)",
    en_PH: "English (Philippines)",
    en_SG: "English (Singapore)",
    en_ZA: "English (South Africa)",
    en_TT: "English (Trinidad and Tobago)",
    en_UM: "English (U.S. Minor Outlying Islands)",
    en_VI: "English (U.S. Virgin Islands)",
    en_GB: "English (United Kingdom)",
    en_US: "English (United States)",
    en_ZW: "English (Zimbabwe)",
    en: "English",
    eo: "Esperanto",
    et_EE: "Estonian (Estonia)",
    et: "Estonian",
    ee_GH: "Ewe (Ghana)",
    ee_TG: "Ewe (Togo)",
    ee: "Ewe",
    fo_FO: "Faroese (Faroe Islands)",
    fo: "Faroese",
    fil_PH: "Filipino (Philippines)",
    fil: "Filipino",
    fi_FI: "Finnish (Finland)",
    fi: "Finnish",
    fr_BE: "French (Belgium)",
    fr_BJ: "French (Benin)",
    fr_BF: "French (Burkina Faso)",
    fr_BI: "French (Burundi)",
    fr_CM: "French (Cameroon)",
    fr_CA: "French (Canada)",
    fr_CF: "French (Central African Republic)",
    fr_TD: "French (Chad)",
    fr_KM: "French (Comoros)",
    fr_CG: "French (Congo - Brazzaville)",
    fr_CD: "French (Congo - Kinshasa)",
    fr_CI: "French (Côte d’Ivoire)",
    fr_DJ: "French (Djibouti)",
    fr_GQ: "French (Equatorial Guinea)",
    fr_FR: "French (France)",
    fr_GA: "French (Gabon)",
    fr_GP: "French (Guadeloupe)",
    fr_GN: "French (Guinea)",
    fr_LU: "French (Luxembourg)",
    fr_MG: "French (Madagascar)",
    fr_ML: "French (Mali)",
    fr_MQ: "French (Martinique)",
    fr_MC: "French (Monaco)",
    fr_NE: "French (Niger)",
    fr_RW: "French (Rwanda)",
    fr_RE: "French (Réunion)",
    fr_BL: "French (Saint Barthélemy)",
    fr_MF: "French (Saint Martin)",
    fr_SN: "French (Senegal)",
    fr_CH: "French (Switzerland)",
    fr_TG: "French (Togo)",
    fr: "French",
    ff_SN: "Fulah (Senegal)",
    ff: "Fulah",
    gl_ES: "Galician (Spain)",
    gl: "Galician",
    lg_UG: "Ganda (Uganda)",
    lg: "Ganda",
    ka_GE: "Georgian (Georgia)",
    ka: "Georgian",
    de_AT: "German (Austria)",
    de_BE: "German (Belgium)",
    de_DE: "German (Germany)",
    de_LI: "German (Liechtenstein)",
    de_LU: "German (Luxembourg)",
    de_CH: "German (Switzerland)",
    de: "German",
    el_CY: "Greek (Cyprus)",
    el_GR: "Greek (Greece)",
    el: "Greek",
    gu_IN: "Gujarati (India)",
    gu: "Gujarati",
    guz_KE: "Gusii (Kenya)",
    guz: "Gusii",
    ha_Latn: "Hausa (Latin)",
    ha_Latn_GH: "Hausa (Latin, Ghana)",
    ha_Latn_NE: "Hausa (Latin, Niger)",
    ha_Latn_NG: "Hausa (Latin, Nigeria)",
    ha: "Hausa",
    haw_US: "Hawaiian (United States)",
    haw: "Hawaiian",
    he_IL: "Hebrew (Israel)",
    he: "Hebrew",
    hi_IN: "Hindi (India)",
    hi: "Hindi",
    hu_HU: "Hungarian (Hungary)",
    hu: "Hungarian",
    is_IS: "Icelandic (Iceland)",
    is: "Icelandic",
    ig_NG: "Igbo (Nigeria)",
    ig: "Igbo",
    id_ID: "Indonesian (Indonesia)",
    id: "Indonesian",
    ga_IE: "Irish (Ireland)",
    ga: "Irish",
    it_IT: "Italian (Italy)",
    it_CH: "Italian (Switzerland)",
    it: "Italian",
    ja_JP: "Japanese (Japan)",
    ja: "Japanese",
    kea_CV: "Kabuverdianu (Cape Verde)",
    kea: "Kabuverdianu",
    kab_DZ: "Kabyle (Algeria)",
    kab: "Kabyle",
    kl_GL: "Kalaallisut (Greenland)",
    kl: "Kalaallisut",
    kln_KE: "Kalenjin (Kenya)",
    kln: "Kalenjin",
    kam_KE: "Kamba (Kenya)",
    kam: "Kamba",
    kn_IN: "Kannada (India)",
    kn: "Kannada",
    kk_Cyrl: "Kazakh (Cyrillic)",
    kk_Cyrl_KZ: "Kazakh (Cyrillic, Kazakhstan)",
    kk: "Kazakh",
    km_KH: "Khmer (Cambodia)",
    km: "Khmer",
    ki_KE: "Kikuyu (Kenya)",
    ki: "Kikuyu",
    rw_RW: "Kinyarwanda (Rwanda)",
    rw: "Kinyarwanda",
    kok_IN: "Konkani (India)",
    kok: "Konkani",
    ko_KR: "Korean (South Korea)",
    ko: "Korean",
    khq_ML: "Koyra Chiini (Mali)",
    khq: "Koyra Chiini",
    ses_ML: "Koyraboro Senni (Mali)",
    ses: "Koyraboro Senni",
    lag_TZ: "Langi (Tanzania)",
    lag: "Langi",
    lv_LV: "Latvian (Latvia)",
    lv: "Latvian",
    lt_LT: "Lithuanian (Lithuania)",
    lt: "Lithuanian",
    luo_KE: "Luo (Kenya)",
    luo: "Luo",
    luy_KE: "Luyia (Kenya)",
    luy: "Luyia",
    mk_MK: "Macedonian (Macedonia)",
    mk: "Macedonian",
    jmc_TZ: "Machame (Tanzania)",
    jmc: "Machame",
    kde_TZ: "Makonde (Tanzania)",
    kde: "Makonde",
    mg_MG: "Malagasy (Madagascar)",
    mg: "Malagasy",
    ms_BN: "Malay (Brunei)",
    ms_MY: "Malay (Malaysia)",
    ms: "Malay",
    ml_IN: "Malayalam (India)",
    ml: "Malayalam",
    mt_MT: "Maltese (Malta)",
    mt: "Maltese",
    gv_GB: "Manx (United Kingdom)",
    gv: "Manx",
    mr_IN: "Marathi (India)",
    mr: "Marathi",
    mas_KE: "Masai (Kenya)",
    mas_TZ: "Masai (Tanzania)",
    mas: "Masai",
    mer_KE: "Meru (Kenya)",
    mer: "Meru",
    mfe_MU: "Morisyen (Mauritius)",
    mfe: "Morisyen",
    naq_NA: "Nama (Namibia)",
    naq: "Nama",
    ne_IN: "Nepali (India)",
    ne_NP: "Nepali (Nepal)",
    ne: "Nepali",
    nd_ZW: "North Ndebele (Zimbabwe)",
    nd: "North Ndebele",
    nb_NO: "Norwegian Bokmål (Norway)",
    nb: "Norwegian Bokmål",
    nn_NO: "Norwegian Nynorsk (Norway)",
    nn: "Norwegian Nynorsk",
    nyn_UG: "Nyankole (Uganda)",
    nyn: "Nyankole",
    or_IN: "Oriya (India)",
    or: "Oriya",
    om_ET: "Oromo (Ethiopia)",
    om_KE: "Oromo (Kenya)",
    om: "Oromo",
    ps_AF: "Pashto (Afghanistan)",
    ps: "Pashto",
    fa_AF: "Persian (Afghanistan)",
    fa_IR: "Persian (Iran)",
    fa: "Persian",
    pl_PL: "Polish (Poland)",
    pl: "Polish",
    pt_BR: "Portuguese (Brazil)",
    pt_GW: "Portuguese (Guinea-Bissau)",
    pt_MZ: "Portuguese (Mozambique)",
    pt_PT: "Portuguese (Portugal)",
    pt: "Portuguese",
    pa_Arab: "Punjabi (Arabic)",
    pa_Arab_PK: "Punjabi (Arabic, Pakistan)",
    pa_Guru: "Punjabi (Gurmukhi)",
    pa_Guru_IN: "Punjabi (Gurmukhi, India)",
    pa: "Punjabi",
    ro_MD: "Romanian (Moldova)",
    ro_RO: "Romanian (Romania)",
    ro: "Romanian",
    rm_CH: "Romansh (Switzerland)",
    rm: "Romansh",
    rof_TZ: "Rombo (Tanzania)",
    rof: "Rombo",
    ru_MD: "Russian (Moldova)",
    ru_RU: "Russian (Russia)",
    ru_UA: "Russian (Ukraine)",
    ru: "Russian",
    rwk_TZ: "Rwa (Tanzania)",
    rwk: "Rwa",
    saq_KE: "Samburu (Kenya)",
    saq: "Samburu",
    sg_CF: "Sango (Central African Republic)",
    sg: "Sango",
    seh_MZ: "Sena (Mozambique)",
    seh: "Sena",
    sr_Cyrl: "Serbian (Cyrillic)",
    sr_Cyrl_BA: "Serbian (Cyrillic, Bosnia and Herzegovina)",
    sr_Cyrl_ME: "Serbian (Cyrillic, Montenegro)",
    sr_Cyrl_RS: "Serbian (Cyrillic, Serbia)",
    sr_Latn: "Serbian (Latin)",
    sr_Latn_BA: "Serbian (Latin, Bosnia and Herzegovina)",
    sr_Latn_ME: "Serbian (Latin, Montenegro)",
    sr_Latn_RS: "Serbian (Latin, Serbia)",
    sr: "Serbian",
    sn_ZW: "Shona (Zimbabwe)",
    sn: "Shona",
    ii_CN: "Sichuan Yi (China)",
    ii: "Sichuan Yi",
    si_LK: "Sinhala (Sri Lanka)",
    si: "Sinhala",
    sk_SK: "Slovak (Slovakia)",
    sk: "Slovak",
    sl_SI: "Slovenian (Slovenia)",
    sl: "Slovenian",
    xog_UG: "Soga (Uganda)",
    xog: "Soga",
    so_DJ: "Somali (Djibouti)",
    so_ET: "Somali (Ethiopia)",
    so_KE: "Somali (Kenya)",
    so_SO: "Somali (Somalia)",
    so: "Somali",
    es_AR: "Spanish (Argentina)",
    es_BO: "Spanish (Bolivia)",
    es_CL: "Spanish (Chile)",
    es_CO: "Spanish (Colombia)",
    es_CR: "Spanish (Costa Rica)",
    es_DO: "Spanish (Dominican Republic)",
    es_EC: "Spanish (Ecuador)",
    es_SV: "Spanish (El Salvador)",
    es_GQ: "Spanish (Equatorial Guinea)",
    es_GT: "Spanish (Guatemala)",
    es_HN: "Spanish (Honduras)",
    es_419: "Spanish (Latin America)",
    es_MX: "Spanish (Mexico)",
    es_NI: "Spanish (Nicaragua)",
    es_PA: "Spanish (Panama)",
    es_PY: "Spanish (Paraguay)",
    es_PE: "Spanish (Peru)",
    es_PR: "Spanish (Puerto Rico)",
    es_ES: "Spanish (Spain)",
    es_US: "Spanish (United States)",
    es_UY: "Spanish (Uruguay)",
    es_VE: "Spanish (Venezuela)",
    es: "Spanish",
    sw_KE: "Swahili (Kenya)",
    sw_TZ: "Swahili (Tanzania)",
    sw: "Swahili",
    sv_FI: "Swedish (Finland)",
    sv_SE: "Swedish (Sweden)",
    sv: "Swedish",
    gsw_CH: "Swiss German (Switzerland)",
    gsw: "Swiss German",
    shi_Latn: "Tachelhit (Latin)",
    shi_Latn_MA: "Tachelhit (Latin, Morocco)",
    shi_Tfng: "Tachelhit (Tifinagh)",
    shi_Tfng_MA: "Tachelhit (Tifinagh, Morocco)",
    shi: "Tachelhit",
    dav_KE: "Taita (Kenya)",
    dav: "Taita",
    ta_IN: "Tamil (India)",
    ta_LK: "Tamil (Sri Lanka)",
    ta: "Tamil",
    te_IN: "Telugu (India)",
    te: "Telugu",
    teo_KE: "Teso (Kenya)",
    teo_UG: "Teso (Uganda)",
    teo: "Teso",
    th_TH: "Thai (Thailand)",
    th: "Thai",
    bo_CN: "Tibetan (China)",
    bo_IN: "Tibetan (India)",
    bo: "Tibetan",
    ti_ER: "Tigrinya (Eritrea)",
    ti_ET: "Tigrinya (Ethiopia)",
    ti: "Tigrinya",
    to_TO: "Tonga (Tonga)",
    to: "Tonga",
    tr_TR: "Turkish (Turkey)",
    tr: "Turkish",
    uk_UA: "Ukrainian (Ukraine)",
    uk: "Ukrainian",
    ur_IN: "Urdu (India)",
    ur_PK: "Urdu (Pakistan)",
    ur: "Urdu",
    uz_Arab: "Uzbek (Arabic)",
    uz_Arab_AF: "Uzbek (Arabic, Afghanistan)",
    uz_Cyrl: "Uzbek (Cyrillic)",
    uz_Cyrl_UZ: "Uzbek (Cyrillic, Uzbekistan)",
    uz_Latn: "Uzbek (Latin)",
    uz_Latn_UZ: "Uzbek (Latin, Uzbekistan)",
    uz: "Uzbek",
    vi_VN: "Vietnamese (Vietnam)",
    vi: "Vietnamese",
    vun_TZ: "Vunjo (Tanzania)",
    vun: "Vunjo",
    cy_GB: "Welsh (United Kingdom)",
    cy: "Welsh",
    yo_NG: "Yoruba (Nigeria)",
    yo: "Yoruba",
    zu_ZA: "Zulu (South Africa)",
    zu: "Zulu"
  }
});
window.i18n = window.i18n || i18n;
export default i18n;
