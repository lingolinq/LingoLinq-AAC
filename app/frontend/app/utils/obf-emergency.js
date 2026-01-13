/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

import Ember from 'ember';
import app_state from './app_state';
import speecher from './speecher';
import persistence from './persistence';
import { later as runLater } from '@ember/runloop';
import utterance from './utterance';
import obf from './obf';
import modal from './modal';
import i18n from './i18n';
import $ from 'jquery';
import { htmlSafe } from '@ember/template';
import stashes from './_stashes';
import capabilities from './capabilities';
import { set as emberSet, observer } from '@ember/object';


// select language when starting assessment

var emergency = {
  register: function(obf) {
    obf.register("emergency", emergency.callback);
    obf.emergency = emergency;
  },
};
var colors = {
  'green': {bg: 'rgb(204, 255, 170)', border:  'rgb(102, 221, 0)'},
  'yellow': {bg: 'rgb(255, 255, 170)', border:  'rgb(221, 221, 0)'},
  'blue': {bg: 'rgb(170, 204, 255)', border:  'rgb(17, 112, 255)'},
  'red': {bg: 'rgb(255, 170, 170)', border:  'rgb(255, 17, 17)'},
  'purple': {bg: 'rgb(204, 170, 255)', border:  'rgb(112, 17, 255)'},
  'gray': {bg: 'rgb(204, 204, 204)', border:  'rgb(128, 128, 128)'},
}

var words = {
  "germs": {path: "bacteria.svg", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Bacteria_480_g.svg", license: {type: "CC-By", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/us/", source_url: "Maxim Kulikov", author_name: "Blair Adams", author_url: "http://thenounproject.com/maxim221"}},
  "virus": {path: "virus.png", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/virus.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "http://catedu.es/arasaac/", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}},
  "coronavirus": {path: "bacteria2.svg", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Bacteria_851_g.svg", license: {type: "CC-By", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/us/", source_url: "http://thenounproject.com/", author_name: "Blair Adams", author_url: "http://thenounproject.com/blairwolf"}},
  "sick": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to%20get%20sick.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "http://catedu.es/arasaac/", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "sick.png"},
  "pandemic": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/Earth.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "https://mulberrysymbols.org/", author_name: "Paxtoncrafts Charitable Trust", author_url: "http://straight-street.org/lic.php"}, path: "pandemic.svg"},
  "quarantine": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/barrier_285_136215.svg", license: {type: "CC By", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/us/", source_url: "http://thenounproject.com/", author_name: "Tyler Glaude", author_url: "http://thenounproject.com/tyler.glaude"}, path: "quarantine.svg"},
  "safe": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/security.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "http://catedu.es/arasaac/", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "safe.png"},
  "social-distancing": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/take%20away_2.pnghttps://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/take%20away_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "http://catedu.es/arasaac/", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "social-distancing.png"},
  "dont-touch": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/don't touch!.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "dont-touch.png"},
  "soap": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/soap.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "soap.png"},
  "sanitizer": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/liquid soap.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "sanitizer.svg"},
  "dirty": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/dirty.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "dirty.png"},
  "clean-hands": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/clean hands.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "clean-hands.svg"},
  "20-seconds": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/timer_398_g.svg", license: {type: "CC By", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/us/", source_url: "", author_name: "Dmitry Mamaev", author_url: "http://thenounproject.com/shushpo"}, path: "20-seconds.svg"},
  "wash-hands": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to wash one's hands.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "wash-hands.png"},
  "dry-hands": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/dry hands , to.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "dry-hands.svg"},
  "blanket": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/blanket_1.png", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "blanket.png"},
  "hot": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hot.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "hot.png"},
  "cold": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/cold_3.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "cold.png"},
  "lay": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to lay down in the bed_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "lay.png"},
  "yawn": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/yawn_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "yawn.png"},
  "snak": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/mid-morning snack_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "snak.png"},
  "drink": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to have.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "drink.png"},
  "thirsty": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/thirsty_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "thirsty.png"},
  "hungry": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/hungry.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "hungry.png"},
  "face-mask": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f637.svg", license: {type: "CC BY", copyright_notice_url: "https://creativecommons.org/licenses/by/4.0/", source_url: "https://raw.githubusercontent.com/twitter/twemoji/gh-pages/svg/1f637.svg", author_name: "Twitter. Inc.", author_url: "https://www.twitter.com"}, path: "face-mask.svg"},
  "theater": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Theater-2fc9e1c8d3.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/", source_url: "http://thenounproject.com/site_media/svg/76610707-1ef3-4650-ba07-57cadb8d56c5.svg", author_name: "Chiara Cozzolino", author_url: "http://thenounproject.com/chlapa"}, path: "theater.svg"},
  "mall": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/tawasol/Mall.png", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/4.0/", source_url: "", author_name: "Mada, HMC and University of Southampton", author_url: "http://www.tawasolsymbols.org/"}, path: "mall.png"},
  "park": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/tawasol/Park.png", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/4.0/", source_url: "", author_name: "Mada, HMC and University of Southampton", author_url: "http://www.tawasolsymbols.org/"}, path: "park.png"},
  "apart": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to grow apart_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "apart.png"},
  "shake-hands": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/shake hands.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "shake-hands.png"},
  "smell": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sense of smell.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "smell.png"},
  "quiet": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Quiet-Space_281_g.svg", license: {type: "public domain", copyright_notice_url: "https://creativecommons.org/publicdomain/zero/1.0/", source_url: "", author_name: "Iconathon", author_url: "http://thenounproject.com/Iconathon1"}, path: "quiet.svg"},
  "not": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/former.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "not.png"},
  "leave": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/tawasol/leave.jpg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/4.0/", source_url: "", author_name: "Mada, HMC and University of Southampton", author_url: "http://www.tawasolsymbols.org/"}, path: "leave.jpg"},
  "noisy": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/noisy.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "noisy.png"},
  "when": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Time-880d4b0e2b.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/", source_url: "http://thenounproject.com/site_media/svg/13234e94-6b08-4d4d-abb8-03c7af444b62.svg", author_name: "Wayne Middleton", author_url: "http://thenounproject.com/Wayne25uk"}, path: "when.svg"},
  "medication": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/medicine.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "medication.png"},
  "flashlight": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f526.svg", license: {type: "CC BY", copyright_notice_url: "https://creativecommons.org/licenses/by/4.0/", source_url: "https://raw.githubusercontent.com/twitter/twemoji/gh-pages/svg/1f526.svg", author_name: "Twitter. Inc.", author_url: "https://www.twitter.com"}, path: "flashlight.svg"},
  "water": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/drink.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "water.png"},
  "food": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/food.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "food.svg"},
  "money": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Money-20ed6d2342.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/", source_url: "http://thenounproject.com/term/money/", author_name: "Atelier Iceberg", author_url: "http://thenounproject.com/Atelier Iceberg"}, path: "money.svg"},
  "help": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/I need help.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "help.png"},
  "sand-box": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sandbox.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "sand-box.png"},
  "headphones": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Headphones-c99fe70250.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/", source_url: "http://thenounproject.com/site_media/svg/c0707be8-cb67-4715-93d1-619cc7d82e35.svg", author_name: "Kevin Wynn", author_url: "http://thenounproject.com/imamkevin"}, path: "headphones.svg"},
  "cover-ears": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/ear ache_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "cover-ears.png"},
  "calm": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/nice_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "calm.png"},
  "ask": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/ask_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "ask.png"},
  "why": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/why.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "why.svg"},
  "happening": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/what are you studying.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "happening.png"},
  "dont-know": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/I do not know.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "dont-know.png"},
  "home": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f3e0.svg", license: {type: "CC BY", copyright_notice_url: "https://creativecommons.org/licenses/by/4.0/", source_url: "https://raw.githubusercontent.com/twitter/twemoji/gh-pages/svg/1f3e0.svg", author_name: "Twitter. Inc.", author_url: "https://www.twitter.com"}, path: "home.svg"},
  "school": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/high school - secondary school.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "school.png"},
  "friends": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/friends_3.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "friends.png"},
  "ask2": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/so do i.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "ask2.png"},
  "take-off": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/take off cap , to.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "take-off.svg"},
  "want": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to want.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "want.png"},
  "off": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/turn off the light_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "off.png"},
  "on": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/turn on the light.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "on.png"},
  "breathe": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to breathe_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "breathe.png"},
  "mask": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/mask_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "mask.png"},
  "excited": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f604.svg", license: {type: "CC BY", copyright_notice_url: "https://creativecommons.org/licenses/by/4.0/", source_url: "https://raw.githubusercontent.com/twitter/twemoji/gh-pages/svg/1f604.svg", author_name: "Twitter. Inc.", author_url: "https://www.twitter.com"}, path: "excited.svg"},
  "happy": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/happy_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "happy.png"},
  "scared": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/scared_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "scared.png"},
  "bored": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to get tired.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "bored.png"},
  "sad": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/sad.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "sad.png"},
  "frustrated": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to get angry with_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "frustrated.png"},
  "mad": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to get angry with_4.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "mad.png"},
  "ok": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/ok.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "ok.png"},
  "brave": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/adventure.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "brave.png"},
  "look": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/What are yopu looking at.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "look.png"},
  "next-time": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/next month.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "next-time.svg"},
  "ipad": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/iPad-c88c4045fa.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/", source_url: "http://thenounproject.com/site_media/svg/6cecc96d-a585-4100-b65c-dd73322c1aed.svg", author_name: "Michael Loupos", author_url: "http://thenounproject.com/mikeydoesit"}, path: "ipad.svg"},
  "tv": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/watch TV_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "tv.png"},
  "house": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/icomoon/house.svg", license: {type: "CC By-SA 3.0", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/3.0/us/", source_url: "http://www.entypo.com/", author_name: "Daniel Bruce", author_url: "http://danielbruce.se/"}, path: "house.svg"},
  "bed": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/bed.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "bed.png"},
  "pet": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/pet.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "pet.png"},
  "family": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/family_5.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "family.png"},
  "blanket2": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/blanket.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "blanket2.svg"},
  "stay-at-home": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/home.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "stay-at-home.png"},
  "that-was-scary": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/noun-project/Scared_176_320418.svg", license: {type: "CC By", copyright_notice_url: "http://creativecommons.org/licenses/by/3.0/us/", source_url: "", author_name: "Oliviu Stoian", author_url: "http://thenounproject.com/smashicons"}, path: "that-was-scary.svg"},
  "go-home": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/home.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "go-home.png"},
  "miss-friends": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/friends.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "miss-friends.png"},
  "stop": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/sclera/stop.png", license: {type: "CC BY-NC", copyright_notice_url: "http://creativecommons.org/licenses/by-nc/2.0/", source_url: "", author_name: "Sclera", author_url: "http://www.sclera.be/en/picto/copyright"}, path: "stop.png"},
  "who": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/who.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "who.png"},
  "what": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/what.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "what.png"},
  "where": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/where.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "where.svg"},
  "can": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/can you see it_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "can.png"},
  "in": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/in.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "in.svg"},
  "up": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/mulberry/up.svg", license: {type: "CC BY-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-sa/2.0/uk", source_url: "", author_name: "Paxtoncrafts Charitable Trust ", author_url: "http://straight-street.org/lic.php"}, path: "up.svg"},
  "she": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/she.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "she.png"},
  "you": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/you.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "you.png"},
  "put": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/put in a safe place_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "put.png"},
  "open": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/open.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "open.png"},
  "different": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/different.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "different.png"},
  "good": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/good.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "good.png"},
  "get": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to receive.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "get.png"},
  "finished": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/finish.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "finished.png"},
  "here": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/here_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "here.png"},
  "it": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/that_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "it.png"},
  "some": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/some_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "some.png"},
  "all": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/all - everything.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "all.png"},
  "that": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/that_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "that.png"},
  "same": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/the same_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "same.png"},
  "do": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to do exercise_2.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "do.png"},
  "he": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/he.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "he.png"},
  "I": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/I.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "I.png"},
  "turn": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/turn.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "turn.png"},
  "go": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to go_3.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "go.png"},
  "more": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/more_1.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "more.png"},
  "make": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/make - do - write.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "make.png"},
  "like": {url: "https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/to like.png", license: {type: "CC BY-NC-SA", copyright_notice_url: "http://creativecommons.org/licenses/by-nc-sa/3.0/", source_url: "", author_name: "Sergio Palao", author_url: "http://www.catedu.es/arasaac/condiciones_uso.php"}, path: "like.png"},
}
/*
  Converters::ObfLocal.save_local to save copies of any added words
*/
for(var key in words) {
  if(words[key] && words[key].path) {
    words[key].url = Ember.templateHelpers.path(("images/emergency/" + words[key].path));
  }
}


emergency.callback = function(key) {
  var suffix = key.replace(/^emergency-/, '');
  var parts = suffix.split(/_/);
  var locale = parts.length > 1 ? parts[0] : 'en';
  var id = parts.length > 1 ? parts[1] : parts[0];
  var ref = null;
  if(emergency.boards[locale]) {
    ref = emergency.boards[locale].find(function(b) { return b.id == id; }) || emergency.boards[locale][0];
  }
  ref = ref || emergency.boards.en[0];
  obf.offline_urls = obf.offline_urls || [];
  if(!words.prefetched) {
    for(var key in words) {
      if(words[key] && words[key].url.match(/^http/)) {
        obf.offline_urls.push(words[key].url);
      }
    }
    words.prefetched = true;
    emergency.words = words;
  }
  var res = {};
  var board = obf.shell(ref.rows, ref.cols);
  board.name = ref.name || ref.id;
  board.public = true;
  board.locale = locale;
  board.extra_back = ref.starter ? 'emergency' : null;
  board.obf_type = 'emergency';
  board.source_key = ref.key;
  board.license = ref.license;
  ref.buttons.forEach(function(row, idx) {
    row.forEach(function(button, jdx) {
      if(button && button.label) {
        var btn = {
          label: button.label
        };
        if(words[button.label] || words[button.word]) {
          btn.image = (words[button.label] || words[button.word]);
        }
        if(button.color && colors[button.color]) {
          btn.background_color = colors[button.color].bg;
          btn.border_color = colors[button.color].border;
        }
        board.add_button(btn, idx, jdx)  
      }
    });
  });
  res.handler = function(button, obj) {

    // runLater(function() {
    //   app_state.jump_to_board({key: 'obf/eval-' + working.level + "-" + working.step + "-" + working.attempts});
    //   app_state.set_history([]);  
    //   utterance.clear();
    // }, button.id == 'button_done' ? 200 : 1000);
    // return {ignore: true, highlight: false, sound: false};
    return {auto_return: false};
  };
  if(board) {
    res.json = board.to_json();
  }
  return res;
};

/* Load a board, output buttons list and any missing word-symbols
Converters::ObfLocal.generate_local(locale, path)
*/

emergency.boards = {
  // http://www.project-core.com/36-location/
  // https://ussaac.org/news/communication_tools_category/communication-tools/
  en: [
    {id: 'project-core', name: "Project Core - 36 Location Universal Core (6 x 6)", rows: 6, cols: 6, key: 'wahlquist/projectcore-36universalcore', starter: true, buttons: [
      [{label: "like", color: 'green'}, {label: "want", color: 'green'}, {label: "get", color: 'green'}, {label: "make", color: 'green'}, {label: "good", color: 'blue'}, {label: "more", color: 'gray'}],
      [{label: "not", color: 'red'}, {label: "go", color: 'green'}, {label: "look", color: 'green'}, {label: "turn", color: 'green'}, {label: "help", color: 'green'}, {label: "different", color: 'blue'}],
      [{label: "I", color: 'yellow'}, {label: "he", color: 'yellow'}, {label: "open", color: 'green'}, {label: "do", color: 'green'}, {label: "put", color: 'green'}, {label: "same", color: 'blue'}],
      [{label: "you", color: 'yellow'}, {label: "she", color: 'yellow'}, {label: "that", color: 'gray'}, {label: "up", color: 'blue'}, {label: "all", color: 'gray'}, {label: "some", color: 'gray'}],
      [{label: "it", color: 'yellow'}, {label: "here", color: 'blue'}, {label: "in", color: 'blue'}, {label: "on", color: 'blue'}, {label: "can", color: 'purple'}, {label: "finished", color: 'blue'}],
      [{label: "where", color: 'purple'}, {label: "what", color: 'purple'}, {label: "why", color: 'purple'}, {label: "who", color: 'purple'}, {label: "when", color: 'purple'}, {label: "stop", color: 'red'}]
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-covid-1', name: "USSAAC - Covid General Terms (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-covid-1', starter: true, buttons: [
      [{label: "germs"}, {label: "virus"}, {label: "coronavirus"}, {label: "sick"}],
      [{label: "pandemic"}, {label: "quarantine"}, {label: "stay safe", word: "safe"}, {label: "social distancing", word: "social-distancing"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    // {id: 'ussaac-emergency-1'},
    {id: 'ussaac-emotions-1', name: "USSAAC - Emotions (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-emotions-1', starter: true, buttons: [
      [{label: "I am mad", word: "mad"}, {label: "I am frustrated", word: "frustrated"}, {label: "I am sad", word: "sad"}, {label: "OK", word: "ok"}],
      [{label: "I am bored", word: "bored"}, {label: "I am scared", word: "scared"}, {label: "I am happy", word: "happy"}, {label: "I am excited", word: "excited"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-hand-washing-1', name: "USSAAC - Hand Washing (2 x 4)", rows: 2, cols: 4, starter: true, key: 'emergency/ussaac-hand-washing-1', buttons: [
      [{label: "wash hands", word: "wash-hands"}, {label: "20 seconds", word: "20-seconds"}, {label: "dry hands", word: "dry-hands"}, {label: "clean hands", word: "clean-hands"}],
      [{label: "dirty hands", word: "dirty"}, {label: "hand sanitizer", word: "sanitizer"}, {label: "use soap", word: "soap"}, {label: "don't touch surfaces", word: "dont-touch"}],
    ]},
    {id: 'ussaac-needs-1-2', name: "USSAAC - Needs (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-needs-1-2', starter: true, buttons: [
      [{label: "I am hungry", word: "hungry"}, {label: " I am thirsty", word: "thirsty"}, {label: "Can I have a drink?", word: "drink"}, {label: "Can I have a snack?", word: "snak"}],
      [{label: "I am tired", word: "yawn"}, {label: "Can I Lay Down?", word: "lay"}, {label: "I am cold", word: "cold"}, {label: "Can I have a blanket?", word: "blanket"}],
    ]},
    {id: 'ussaac-mask-1', name: "USSAAC - Mask Wearing (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-mask-1', starter: true, buttons: [
      [{label: "Where is my mask?", word: "mask"}, {label: "I can't breathe", word: "breathe"}, {label: "face mask", word: "face-mask"}, {label: "on"}],
      [{label: "off"}, {label: "I need a mask", word: "want"}, {label: "Can I take my mask off?", word: "take-off"}, {label: "Do I need a mask?", word: "ask2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-questions-1', name: "USSAAC - Questions (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-questions-1', starter: true, buttons: [
      [{label: "Where are my friends?", word: "friends"}, {label: "When can I go back to school?", word: "school"}, {label: "When can we go home?", word: "home"}, {label: "Why me?", word: "dont-know"}],
      [{label: "What is happening?", word: "happening"}, {label: "Why us?", word: "why"}, {label: "What are we going to do?", word: "ask"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},    
    {id: 'ussaac-red-cross-1', name: "USSAAC - Red Cross (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-red-cross-1', starter: true, buttons: [
      [{label: "I need help", word: "help"}, {label: "I need money", word: "money"}, {label: "I need food", word: "food"}, {label: "I need water", word: "water"}],
      [{label: "I need a flashlight", word: "flashlight"}, {label: "I need a blanket", word: "blanket"}, {label: "I am out of my medication", word: "medication"}, {label: "How long will we be in a shelter?", word: "when"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-sensory-needs-1', name: "USSAAC - Sensory Needs (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-sensory-needs-1', starter: true, buttons: [
      [{label: "I need to calm myself down!", word: "calm"}, {label: "I need to cover my ears", word: "cover-ears"}, {label: "I need a weighted blanket", word: "blanket"}, {label: "I need noise canceling headphones", word: "headphones"}],
      [{label: "I need the sand box", word: "sand-box"}, {label: "I need a quiet space", word: "quiet"}, {label: "I need", word: "help"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},    
    {id: 'ussaac-shelter-sensory-1', name: "USSAAC - Shelter Sensory Board (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-shelter-sensory-1', starter: true, buttons: [
      [{label: "It is too noisy!", word: "noisy"}, {label: "When are we going?", word: "leave"}, {label: "I don't want to be here!", word: "not"}, {label: "I need a quiet place.", word: "quiet"}],
      [{label: "It smells.", word: "smell"}, {label: "It is hot!", word: "hot"}, {label: "It is cold!", word: "cold"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-social-distancing-1', name: "USSAAC - Social Distancing (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-social-distancing-1', starter: true, buttons: [
      [{label: "stay at home", word: "home"}, {label: "don't shake hands", word: "shake-hands"}, {label: "6 feet apart", word: "apart"}, {label: "no park", word: "park"}],
      [{label: "no mall", word: "mall"}, {label: "no theater", word: "theater"}, {label: "wear a face mask", word: "face-mask"}, {label: "stay safe", word: "safe"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-statement-after-1', name: "USSAAC - Statements After the Fact (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-statement-after-1', starter: true, buttons: [
      [{label: "That was scary!", word: "scared"}, {label: "How will we be safe next time?", word: "next-time"}, {label: "What will happen now?", word: "look"}, {label: "Go Home", word:"home"}],
      [{label: "I don't want to be here!", word: "not"}, {label: "I will be brave!", word: "brave"}, {label: "We will be ok!", word: "ok"}, {label: "Stay together", word: "friends"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-statement-missing-1', name: "USSAAC - Statements of Missing (2 x 4)", rows: 2, cols: 4, key: 'emergency/ussaac-statement-missing-1', starter: true, buttons: [
      [{label: "I miss my family", word: "family"}, {label: "I miss my friends", word: "friends"}, {label: "I miss my pet", word: "pet"}, {label: "I miss my bed", word: "bed"}],
      [{label: "I miss my house", word: "house"}, {label: "I miss my TV", word: "tv"}, {label: "I miss my iPad", word: "ipad"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
  ],
  es: [
    {id: 'ussaac-covid-1-es', name: 'USSAAC - Condiciones generales de Covid (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-covid-1', starter: true, buttons: [
      [{label: "gérmenes", word: "germs"}, {label: "virus"}, {label: "coronavirus"}, {label: "enfermos", word: "sick"}],
      [{label: "pandemia", word: "pandemic"}, {label: "cuarentena", word: "quarantine"}, {label: "mantenerse a salvo", word: "safe"}, {label: "distanciamiento social", word: "social-distancing"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-emotions-1-es', name: 'USSAAC - Emociones (2 x 4)', rows: 2, cols: 4, key: 'fernanda-d-gonzalez/ussaac-emotions-1', starter: true, buttons: [
      [{label: "Estoy enojado", word: "mad"}, {label: "Estoy frustrado", word: "frustrated"}, {label: "Estoy triste", word: "sad"}, {label: "Okay", word: "ok"}],
      [{label: "Estoy aburrido", word: "bored"}, {label: "Estoy asustado", word: "scared"}, {label: "Estoy contento", word: "happy"}, {label: "Estoy emocionado", word: "excited"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-hand-washing-1-es', name: 'USSAAC - Lavado de manos (2 x 4)', rows: 2, cols: 4, key: 'kasspriego/ussaac-hand-washing-1', starter: true, buttons: [
      [{label: "lavarse las manos", word: "wash-hands"}, {label: "20 segundos", word: "20-seconds"}, {label: "manos secas", word: "dry-hands"}, {label: "manos limpias", word: "clean-hands"}],
      [{label: "manos sucias", word: "dirty"}, {label: "desinfectante de manos", word: "sanitizer"}, {label: "usar jabón", word: "soap"}, {label: "no toques superficies", word: "dont-touch"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-needs-1-2-es', name: 'USSAAC - Necesidades (2 x 4)', rows: 2, cols: 4, key: 'kasspriego/ussaac-needs-1-2', starter: true, buttons: [
      [{label: "Tengo hambre", word: "hungry"}, {label: " Tengo sed", word: "thirsty"}, {label: "¿Puedo tomar una bebida?", word: "drink"}, {label: "¿Puedo comer un bocadillo?", word: "snak"}],
      [{label: "Estoy cansado", word: "yawn"}, {label: "¿Puedo acostarme?", word: "lay"}, {label: "Tengo frío", word: "cold"}, {label: "¿Puedo tener una cobija?", word: "blanket2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-mask-1-es', name: 'USSAAC - Uso de máscara (2 x 4)', rows: 2, cols: 4, key: 'kasspriego/ussaac-mask-1', starter: true, buttons: [
      [{label: "¿Dónde está mi mascarilla?", word: "mask"}, {label: "No puedo respirar", word: "breathe"}, {label: "Mascarilla", word: "face-mask"}, {label: "Encendido", word: "on"}],
      [{label: "Apagado", word: "off"}, {label: "Necesito una mascarilla", word: "want"}, {label: "¿Puedo quitarme la máscarilla?", word: "take-off"}, {label: "¿Necesito una mascarilla?", word: "ask2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-questions-1-1-es', name: 'USSAAC - Preguntas (2 x 4)', rows: 2, cols: 4, key: 'fernanda-d-gonzalez/ussaac-questions-1_1', starter: true, buttons: [
      [{label: "¿Donde están mis amigos?", word: "frinds"}, {label: "¿Cuándo puedo volver a la escuela?", word: "school"}, {label: "¿Cuándo podemos ir a casa?", word: "home"}, {label: "¿Por qué yo?", word: "dont-know"}],
      [{label: "¿Qué está pasando?", word: "look"}, {label: "¿Porque nosotros?", word: "why"}, {label: "¿Qué vamos hacer?", word: "ask"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-red-cross-1-es', name: 'USSAAC - Cruz Roja (2 x 4)', rows: 2, cols: 4, key: 'kasspriego/ussaac-red-cross-1', starter: true, buttons: [
      [{label: "necesito ayuda", word: "help"}, {label: "necesito dinero", word: "money"}, {label: "necesito comida", word: "food"}, {label: "necesito agua", word: "water"}],
      [{label: "Necesito una linterna", word: "flashlight"}, {label: "Necesito una cobija", word: "blanket"}, {label: "Me he quedado sin medicación", word: "medication"}, {label: "¿Cuánto tiempo estaremos en un refugio?", word: "when"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-sensory-needs-1-es', name: 'USSAAC - Necesidades sensoriales (2 x 4)', rows: 2, cols: 4, key: 'kasspriego/ussaac-sensory-needs-1', starter: true, buttons: [
      [{label: "¡Necesito calmarme!", word: "calm"}, {label: "Necesito taparme los oídos", word: "cover-ears"}, {label: "Necesito una cobija con peso", word: "blanket"}, {label: "Necesito audífonos con cancelación de ruido", word: "headphones"}],
      [{label: "Necesito la caja de arena", word: "sand-box"}, {label: "Necesito un espacio tranquilo", word: "quiet"}, {label: "Necesito", word: "help"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-shelter-sensory-1-es', name: 'USSAAC - Tablero sensorial de refugio (2 x 4)', rows: 2, cols: 4, key: 'fernanda-d-gonzalez/ussaac-shelter-sensory-1', starter: true, buttons: [
      [{label: "¡Esta demasiado ruidoso!", word: "cover-ears"}, {label: "¿Cuando nos vamos ?", word: "leave"}, {label: "¡No quiero estar aquí!", word: "not"}, {label: "Necesito un lugar tranquilo.", word: "quiet"}],
      [{label: "Huele.", word: "smell"}, {label: "¡Hace calor!", word: "hot"}, {label: "¡Hace frío!", word: "cold"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-social-distancing-1-2-es', name: 'USSAAC - Distanciamiento social (2 x 4)', rows: 2, cols: 4, key: 'fernanda-d-gonzalez/ussaac-social-distancing-1_2', starter: true, buttons: [
      [{label: "Quédate en casa", word: "stay-at-home"}, {label: "no des la mano", word: "shake-hands"}, {label: "6 pies de distancia", word: "apart"}, {label: "no parque", word: "park"}],
      [{label: "no centro comercial", word: "mall"}, {label: "no teatro", word: "theater"}, {label: "use mascarilla facial", word: "face-mask"}, {label: "mantenerse seguro", word: "safe"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-statement-after-1-es', name: 'USSAAC - Declaraciones posteriores al hecho (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-statement-after-1', starter: true, buttons: [
      [{label: "¡Eso fue espantoso!", word: 'that-was-scary'}, {label: "¿Cómo estaremos a salvo la próxima vez?", word: "next-time"}, {label: "¿Que pasará ahora?", word: "look"}, {label: "Vete a casa", word: 'go-home'}],
      [{label: "¡No quiero estar aquí!", word: "not"}, {label: "¡Seré valiente!", word: "brave"}, {label: "¡Estaremos bien!", word: "ok"}, {label: "Permanecer juntos", word: "friends"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},  
    {id: 'ussaac-statement-missing-1-es', name: 'USSAAC - Declaraciones de desaparición (2 x 4)', rows: 2, cols: 4, key: 'fernanda-d-gonzalez/ussaac-statement-missing-1', starter: true, buttons: [
      [{label: "Extraño a mi familia", word: "family"}, {label: "Extraño a mis amigos", word: "friends"}, {label: "Extraño a mi mascota", word: "pet"}, {label: "Extraño mi cama", word: "bed"}],
      [{label: "Extraño mi casa", word: "house"}, {label: "Extraño mi televisión", word: "tv"}, {label: "Extraño mi tableta electronica", word: "ipad"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
  ],
  pl: [
    {id: 'ussaac-hand-washing-1-pl', name: 'PLAAC - Mycie rąk (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-hand-washing-1', starter: true, buttons: [
      [{label: "myć ręce", word: "wash-hands"}, {label: "20 sekund", word: "20-seconds"}, {label: "suche ręce", word: "dry-hands"}, {label: "czyste ręce", word: "clean-hands"}],
      [{label: "brudne ręce", word: "dirty"}, {label: "płyn antybakteryjny", word: "sanitizer"}, {label: "użyj mydła", word: "soap"}, {label: "nie dotykaj powierzchni", word: "dont-touch"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-needs-1-2-pl', name: 'PLAAC - Potrzeby (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-needs-1-2', starter: true, buttons: [
      [{label: "jestem głodny", word: "hungry"}, {label: " Chce mi się pić", word: "thirsty"}, {label: "Czy mogę prosić o coś do picia?", word: "drink"}, {label: "Czy mogę dostać przekąskę?", word: "snak"}],
      [{label: "jestem zmęczony", word: "yawn"}, {label: "Czy mogę się położyć?", word: "lay"}, {label: "zimno mi", word: "cold"}, {label: "Czy mogę dostać koc?", word: "blanket2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-mask-1-pl', name: 'PLAAC - Maseczki (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-mask-1', starter: true, buttons: [
      [{label: "Gdzie jest moja maska?", word: "mask"}, {label: "Nie mogę oddychać", word: "breathe"}, {label: "maska", word: "face-mask"}, {label: "na", word: "on"}],
      [{label: "poza", word: "off"}, {label: "Potrzebuję maski", word: "want"}, {label: "Czy mogę zdjąć maskę?", word: "take-off"}, {label: "Czy potrzebuję maski?", word: "ask2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},        
    {id: 'plaac-questions-1-pl', name: 'PLAAC - Pytania (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-questions-1', starter: true, buttons: [
      [{label: "Gdzie są moi przyjaciele?", word: "friends"}, {label: "Kiedy mogę wrócić do szkoły?", word: "school"}, {label: "Kiedy możemy iść do domu?", word: "home"}, {label: "Dlaczego ja?", word: "dont-know"}],
      [{label: "Co się dzieje?", word: "happening"}, {label: "Dlaczego my?", word: "why"}, {label: "Co zrobimy?", word: "ask"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-sensory-needs-1-pl', name: 'PLAAC - Potrzeby 2 (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-sensory-needs-1', starter: true, buttons: [
      [{label: "Muszę się uspokoić!", word: "calm"}, {label: "Muszę zakryć uszy", word: "cover-ears"}, {label: "Potrzebuję kołdry obciążeniowej", word: "blanket"}, {label: "Potrzebuję słuchawek z redukcją szumów", word: "headphones"}],
      [{label: "Potrzebuję piaskownicy", word: "sand-box"}, {label: "Potrzebuję cichej przestrzeni", word: "quiet"}, {label: "potrzebuję", word: "help"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-shelter-sensory-1-pl', name: 'PLAAC - Ciche Miejsce (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-shelter-sensory-1', starter: true, buttons: [
      [{label: "Jest zbyt głośno!", word: "noisy"}, {label: "Kiedy idziemy?", word: "leave"}, {label: "Nie chcę tu być!", word: "not"}, {label: "Potrzebuję spokojnego miejsca.", word: "quiet"}],
      [{label: "To pachnie.", word: "smell"}, {label: "Jest gorące!", word: "hot"}, {label: "Jest zimno!", word: "cold"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-social-distancing-1-pl', name: 'PLAAC - Dystans (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-social-distancing-1', starter: true, buttons: [
      [{label: "Zostań w domu", word: "stay-at-home"}, {label: "nie podawaj sobie rąk", word: "shake-hands"}, {label: "2 metry od siebie", word: "apart"}, {label: "żadnego parku", word: "park"}],
      [{label: "żadnego centrum handlowego", word: "mall"}, {label: "żadnego teatru", word: "theater"}, {label: "nosić maskę na twarz", word: "face-mask"}, {label: "bądź bezpieczny", word: "safe"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-statement-after-1-pl', name: 'PLAAC - Po chorobie (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-statement-after-1', starter: true, buttons: [
      [{label: "To było straszne!", word: "that-was-scary"}, {label: "Jak następnym razem będziemy bezpieczni?", word: "next-time"}, {label: "Co się teraz stanie?", word: "look"}, {label: "Idź do domu", word: "stay-at-home"}],
      [{label: "Nie chcę tu być!", word: "not"}, {label: "Będę odważny!", word: "brave"}, {label: "Będzie dobrze!", word: "ok"}, {label: "Zostać razem", word: "friends"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'plaac-statement-missing-1-pl', name: 'PLAAC - Tęsknota(2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-statement-missing-1', starter: true, buttons: [
      [{label: "Tęsknię za moją rodziną", word: "family"}, {label: "Tęsknię za przyjaciółmi", word: "miss-friends"}, {label: "Tęsknię za moim zwierzakiem", word: "pet"}, {label: "Brakuje mi łóżka", word: "bed"}],
      [{label: "Tęsknię za moim domem", word: "house"}, {label: "Brakuje mi telewizora", word: "tv"}, {label: "Brakuje mi mojego iPada", word: "ipad"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
  ],
  uk: [
    {id: 'ussaac-covid-1-uk', name: 'USSAAC – Загальні умови Covid (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-covid-1', starter: true, buttons: [
      [{label: "мікроби", word: "germs"}, {label: "вірус", word: "virus"}, {label: "коронавірус", word: "coronavirus"}, {label: "хворий", word: "sick"}],
      [{label: "пандемія", word: "pandemic"}, {label: "карантин", word: "quarantine"}, {label: "залишатися в безпеці", word: "safe"}, {label: "соціальне дистанціювання"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-emotions-1-uk', name: 'USSAAC - Емоції (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-emotions-1', starter: true, buttons: [
      [{label: "я божевільний", word: "mad"}, {label: "Я розчарований", word: "frustrated"}, {label: "мені сумно", word: "sad"}, {label: "гаразд"}],
      [{label: "мені нудно", word: "bored"}, {label: "я наляканий", word: "scared"}, {label: "я щасливий", word: "happy"}, {label: "я схвильований", word: "excited"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-hand-washing-1-uk', name: 'USSAAC - Ручне прання (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-hand-washing-1', starter: true, buttons: [
      [{label: "мити руки", word: "wash-hands"}, {label: "20 секунд", word: "20-seconds"}, {label: "сухі руки", word: "dry-hands"}, {label: "чисті руки", word: "clean-hands"}],
      [{label: "брудні руки", word: "dirty"}, {label: "дезінфікуючий засіб для рук", word: "sanitizer"}, {label: "використовувати мило", word: "soap"}, {label: "не торкайтеся поверхонь", word: "dont-touch"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-needs-1-2-uk', name: 'USSAAC - Потреби (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-needs-1-2', starter: true, buttons: [
      [{label: "я голодний", word: "hungry"}, {label: " я хочу пити", word: "thirsty"}, {label: "Можна випити?", word: "drink"}, {label: "Можна перекусити?", word: "snak"}],
      [{label: "я стомився", word: "yawn"}, {label: "Чи можу я лягти?", word: "lay"}, {label: "Мені холодно", word: "cold"}, {label: "Можна мені ковдру?", word: "blanket2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-mask-1-uk', name: 'USSAAC – Носіння маски (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-mask-1', starter: true, buttons: [
      [{label: "Де моя маска?", word: "mask"}, {label: "Я не можу дихати", word: "breathe"}, {label: "маска для обличчя", word: "face-mask"}, {label: "на", word: "on"}],
      [{label: "вимкнено", word: "off"}, {label: "Мені потрібна маска", word: "want"}, {label: "Чи можу я зняти маску?", word: "take-off"}, {label: "Чи потрібна мені маска?", word: "ask2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-questions-1-uk', name: 'USSAAC - Запитання (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-questions-1', starter: true, buttons: [
      [{label: "Де мої друзі?", word: "friends"}, {label: "Коли я можу повернутися до школи?", word: "school"}, {label: "Коли ми можемо поїхати додому?", word: "home"}, {label: "Чому я?", word: "dont-know"}],
      [{label: "Що відбувається?", word: "happening"}, {label: "Чому ми?", word: "why"}, {label: "Що ми будемо робити?", word: "ask"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-red-cross-1-uk', name: 'USSAAC - Червоний Хрест (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-red-cross-1', starter: true, buttons: [
      [{label: "мені потрібна допомога", word: "help"}, {label: "Мені потрібні гроші", word: "money"}, {label: "мені потрібна їжа", word: "food"}, {label: "Мені потрібна вода", word: "water"}],
      [{label: "Мені потрібен ліхтарик", word: "flashlight"}, {label: "Мені потрібна ковдра", word: "blanket"}, {label: "У мене закінчилися ліки", word: "medication"}, {label: "Скільки ми будемо в притулку?", word: "when"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-sensory-needs-1-uk', name: 'USSAAC – Сенсорні потреби (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-sensory-needs-1', starter: true, buttons: [
      [{label: "Мені потрібно заспокоїтися!", word: "calm"}, {label: "Мені потрібно закрити вуха", word: "cover-ears"}, {label: "Мені потрібна обтяжена ковдра", word: "blanket"}, {label: "Мені потрібні навушники з шумопоглинанням", word: "headphones"}],
      [{label: "Мені потрібен ящик з піском", word: "sand-box"}, {label: "Мені потрібен тихий простір", word: "quiet"}, {label: "мені потрібно", word: "help"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-shelter-sensory-1-uk', name: 'USSAAC - сенсорна дошка для притулку (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-shelter-sensory-1', starter: true, buttons: [
      [{label: "Це занадто шумно!", word: "noisy"}, {label: "коли ми йдемо?", word: "leave"}, {label: "Я не хочу бути тут!"}, {label: "Мені потрібно тихе місце.", word: "quiet"}],
      [{label: "Воно пахне.", word: "smell"}, {label: "Жарко!", word: "hot"}, {label: "Холодно!", word: "cold"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-social-distancing-1-uk', name: 'USSAAC – Соціальне дистанціювання (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-social-distancing-1', starter: true, buttons: [
      [{label: "Залишайся вдома", word: "stay-at-home"}, {label: "не тисни руки", word: "shake-hands"}, {label: "6 футів один від одного", word: "apart"}, {label: "немає парку", word: "park"}],
      [{label: "немає торгового центру", word: "mall"}, {label: "немає театру", word: "theater"}, {label: "носити маску для обличчя", word: "face-mask"}, {label: "залишатися в безпеці", word: "safe"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-statement-after-1-uk', name: 'USSAAC - Заяви після факту (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-statement-after-1', starter: true, buttons: [
      [{label: "Це було страшно!", word: "that-was-scary"}, {label: "Як ми будемо в безпеці наступного разу?", word: "next-time"}, {label: "Що тепер буде?", word: "look"}, {label: "Іди додому", word: "stay-at-home"}],
      [{label: "Я не хочу бути тут!"}, {label: "Я буду сміливим!", word: "brave"}, {label: "У нас буде добре!", word: "ok"}, {label: "Залишатись разом", word: "friends"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-statement-missing-1-uk', name: 'USSAAC – Заяви про зникнення безвісти (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-statement-missing-1', starter: true, buttons: [
      [{label: "Я сумую за своєю родиною", word: "family"}, {label: "Я сумую за своїми друзями", word: "miss-friends"}, {label: "Я сумую за своїм вихованцем", word: "pet"}, {label: "Я сумую за своїм ліжком", word: "bed"}],
      [{label: "Я сумую за своїм домом", word: "house"}, {label: "Я сумую за своїм телевізором", word: "tv"}, {label: "Я сумую за своїм iPad", word: "ipad"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},                                                
  ],
  pt: [
  ],
  ar: [
    {id: 'ussaac-covid-1-ar', name: 'USSAAC - (2x4) العربية - المصطلحات العامة لكوفيد -19', rows: 2, cols: 4, key: 'maram/ussaac-covid-1', starter: true, buttons: [
      [{label: "جراثيم", word: "germs"}, {label: "فيروس", word: "virus"}, {label: "فيروس كورونا", word: "coronavirus"}, {label: "مريض", word: "sick"}],
      [{label: "جائحة", word: "pandemic"}, {label: "الحجر الصحي", word: "quarantine"}, {label: "ابق آمنا", word: "safe"}, {label: "التباعد الاجتماعي", word: "social-distancing"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},  
    {id: 'ussaac-emotions-1-ar', name: 'USSAAC - (2x4) - العواطف', rows: 2, cols: 4, key: 'maram/ussaac-emotions-1', starter: true, buttons: [
      [{label: "أنا غاضب", word: "mad"}, {label: "أنا محبط", word: "frustrated"}, {label: "انا حزين", word: "sad"}, {label: "موافق", word: "ok"}],
      [{label: "أنا أشعر بالملل", word: "bored"}, {label: "انا خائف", word: "scared"}, {label: "أنا سعيد", word: "happy"}, {label: "أنا متحمس", word: "excited"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-hand-washing-1-ar', name: 'USSAAC - (2x4) - غسل اليدين', rows: 2, cols: 4, key: 'maram/ussaac-hand-washing-1', starter: true, buttons: [
      [{label: "غسل اليدين", word: "wash-hands"}, {label: "٢٠ ثانية", word: "20-seconds"}, {label: "أيدي جافة", word: "dry-hands"}, {label: "أيدي نظيفة", word: "clean-hands"}],
      [{label: "أيدي متسخة", word: "dirty"}, {label: "معقم اليدين", word: "sanitizer"}, {label: "استخدم الصابون", word: "soap"}, {label: "لا تلمس الأسطح", word: "dont-touch"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},    
    {id: 'ussaac-needs-1-2-1-ar', name: 'USSAAC - (2x4) الاحتياجات', rows: 2, cols: 4, key: 'maram/ussaac-needs-1-2_1', starter: true, buttons: [
      [{label: "أنا جائع", word: "hungry"}, {label: " أنا عطشان", word: "thirsty"}, {label: "هل يمكنني الحصول على شراب؟", word: "drink"}, {label: "هل يمكنني تناول وجبة خفيفة؟", word: "snak"}],
      [{label: "انا اشعر بالتعب", word: "yawn"}, {label: "هل يمكنني الاستلقاء؟", word: "lay"}, {label: "انا اشعر بالبرد", word: "cold"}, {label: "هل يمكنني الحصول على بطّانية؟", word: "blanket2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-mask-1-ar', name: 'USSAAC - (2x4) ارتداء الكمامة', rows: 2, cols: 4, key: 'maram/ussaac-mask-1', starter: true, buttons: [
      [{label: "أين كمامتي؟", word: "mask"}, {label: "لا أستطيع التنفس", word: "breathe"}, {label: "كمامة الوجه", word: "face-mask"}, {label: "تشغيل", word: "on"}],
      [{label: "إيقاف", word: "off"}, {label: "أنا بحاجة إلى كمامة", word: "want"}, {label: "هل يمكنني نزع كمامتي؟", word: "take-off"}, {label: "هل أنا بحاجة إلى كمامة؟", word: "ask2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-questions-1-ar', name: 'USSAAC - (2x4) الأسئلة', rows: 2, cols: 4, key: 'maram/ussaac-questions-1', starter: true, buttons: [
      [{label: "اين اصدقائي؟", word: "friends"}, {label: "متى يمكنني العودة إلى المدرسة؟", word: "school"}, {label: "متى يمكننا العودة إلى المنزل؟", word: "home"}, {label: "لماذا أنا؟", word: "dont-know"}],
      [{label: "ماذا يحدث؟", word: "happening"}, {label: "لماذا نحن؟", word: "why"}, {label: "ماذا سنفعل؟", word: "ask"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-red-cross-1-ar', name: 'USSAAC - (2x4) الصليب الأحمر', rows: 2, cols: 4, key: 'maram/ussaac-red-cross-1', starter: true, buttons: [
      [{label: "انا بحاجة الى مساعدة", word: "help"}, {label: "انا بحاجة الى المال", word: "money"}, {label: "انا بحاجة الى الطعام", word: "food"}, {label: "انا بحاجة الى الماء", word: "water"}],
      [{label: "انا بحاجة الى مصباح يدوي", word: "flashlight"}, {label: "انا بحاجة الى غطاء", word: "blanket"}, {label: "نفذ مني دوائي", word: "medication"}, {label: "إلى متى سنبقى في مأوى؟", word: "when"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},    
  ],
  ja: [
    {id: 'ussaac-covid-1-ja', name: 'USSAAC-Covid一般条件（2 x 4）', rows: 2, cols: 4, key: 'emergency/ussaac-covid-1', starter: true, buttons: [
      [{"label":"バイ菌","word":"germs"}, {"label":"ウイルス","word":"virus"}, {"label":"コロナウイルス","word":"coronavirus"}, {"label":"病気","word":"sick"}],
      [{"label":"パンデミック","word":"pandemic"}, {"label":"検疫","word":"quarantine"}, {"label":" 安全に気をつけましょう","word":"safe"}, {"label":"182 cm 離れましょう","word":"social-distancing"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-emotions-1-ja', name: 'USSAAC - 感情 (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-emotions-1', starter: true, buttons: [
      [{"label":"怒っている","word":"mad"}, {"label":"イライラしている","word":"frustrated"}, {"label":"悲しい","word":"sad"}, {"label":"分かった","word":"ok"}],
      [{"label":"退屈だ。","word":"bored"}, {"label":"怖い","word":"scared"}, {"label":"嬉しい","word":"happy"}, {"label":"ワクワクだ。","word":"excited"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-hand-washing-1-ja', name: 'USSAAC - 手洗い (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-hand-washing-1', starter: true, buttons: [
      [{"label":"手を洗おう","word":"wash-hands"}, {"label":"20秒","word":"20-seconds"}, {"label":"乾いた手","word":"dry-hands"}, {"label":"洗った手","word":"clean-hands"}],
      [{"label":"汚い手","word":"dirty"}, {"label":"手の消毒剤・ハンドサニタイザー","word":"sanitizer"}, {"label":"石鹸を使おう","word":"soap"}, {"label":"表面に触れないでください","word":"dont-touch"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-needs-1-2-ja', name: 'USSAAC - ニーズ (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-needs-1-2', starter: true, buttons: [
      [{"label":"お腹が空いた","word":"hungry"}, {"label":" のどが渇いた","word":"thirsty"}, {"label":"飲み物を頂けますか？","word":"drink"}, {"label":"おやつを頂けますか？","word":"snak"}],
      [{"label":"疲れた","word":"yawn"}, {"label":"横になってもいいですか？","word":"lay"}, {"label":"寒い","word":"cold"}, {"label":"毛布を頂けますか？","word":"blanket2"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-mask-1-ja', name: 'USSAAC - マスク着用 (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-mask-1', starter: true, buttons: [
      [{"label":"私のマスクはどこ？","word":"mask"}, {"label":"息ができない","word":"breathe"}, {"label":"マスク","word":"face-mask"}, {"label":"電気を付けよう","word":"on"}],
      [{"label":"電気を消そう","word":"off"}, {"label":"マスクを下さい","word":"want"}, {"label":"マスクを取っていい？","word":"take-off"}, {"label":"マスクは必要ですか？","word":"ask2"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-questions-1-ja', name: 'USSAAC - 質問 (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-questions-1', starter: true, buttons: [
      [{"label":"私の友達はどこ？","word":"friends"}, {"label":"いつまた学校に行けるの？","word":"school"}, {"label":"いつ家に帰れるの？","word":"home"}, {"label":"何で私？","word":"dont-know"}],
      [{"label":"何が起こってるの？","word":"happening"}, {"label":"何で私達？","word":"why"}, {"label":"私たちは何をするの？","word":"ask"}, null],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-red-cross-1-ja', name: 'USSAAC - 赤十字 (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-red-cross-1', starter: true, buttons: [
      [{"label":"手伝いがいる","word":"help"}, {"label":"お金がいる","word":"money"}, {"label":"食べ物がいる","word":"food"}, {"label":"水がいる","word":"water"}],
      [{"label":"懐中電灯がいる","word":"flashlight"}, {"label":"毛布がいる","word":"blanket"}, {"label":"薬がない","word":"medication"}, {"label":"どんだけ凌ぎ馬にいる予定なの？","word":"when"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-sensory-needs-1-ja', name: 'USSAAC - 感覚の必要性 (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-sensory-needs-1', starter: true, buttons: [
      [{"label":"私は落ち着かなきゃいけない","name":"calm"}, {"label":"耳をふさがなきゃいけない","word":"cover-ears"}, {"label":"加重毛布が必要です","word":"blanket"}, {"label":"ノイズキャンセリングヘッドホンがいります","word":"headphones"}],
      [{"label":"サンドボックスがいります","word":"sand-box"}, {"label":"静かな場所が欲しい","word":"quiet"}, {"label":"私はこれがいる","word":"help"}, null],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-shelter-sensory-1-ja', name: 'USSAAC - シェルター感覚ボード (2 x 4)', rows: 2, cols: 4, key: 'emergency/ussaac-shelter-sensory-1', starter: true, buttons: [
      [{"label":"うるさすぎる","word":"noisy"}, {"label":"私達はいつ行くの？","word":"leave"}, {"label":"ここにいたくない！","word":"not"}, {"label":"静かな場所が必要です。","word":"quiet"}],
      [{"label":"臭い","word":"smell"}, {"label":"ここは暑い","word":"hot"}, {"label":"寒いです！","word":"cold"}, null],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-social-distancing-1-ja', name: 'USSAAC - 社会距離拡大（2 x 4）', rows: 2, cols: 4, key: 'emergency/ussaac-social-distancing-1', starter: true, buttons: [
      [{"label":"家にいおう","word":"stay-at-home"}, {"label":"握手しないでください","word":"shake-hands"}, {"label":"6フィート離れていましょう","word":"apart"}, {"label":"公園も我慢","word":"park"}],
      [{"label":"モールは我慢","word":"mall"}, {"label":"劇場も我慢","word":"theater"}, {"label":"マスクを付けよう","word":"face-mask"}, {"label":"げんきでいてね","word":"safe"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-statement-after-1-ja', name: 'USSAAC - 事実後の声明（2 x 4）', rows: 2, cols: 4, key: 'emergency/ussaac-statement-after-1', starter: true, buttons: [
      [{"label":"あれは怖かった！","word":"that-was-scary"}, {"label":"次回はどうやって安全をたもてますか","word":"next-time"}, {"label":"今何が起こりますか？","word":"look"}, {"label":"家に帰った方がいいよ","word":"stay-at-home"}],
      [{"label":"ここにはいたくない","word":"not"}, {"label":"私は勇敢になります！","word":"brave"}, {"label":"大丈夫です！","word":"ok"}, {"label":"一緒にいましょう","word":"friends"}],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
    {id: 'ussaac-statement-missing-1-ja', name: 'USSAAC - 欠落しているステートメント（2 x 4）', rows: 2, cols: 4, key: 'emergency/ussaac-statement-missing-1', starter: true, buttons: [
      [{"label":"家族に会いたい","word":"family"}, {"label":"友達が恋しい","word":"miss-friends"}, {"label":"ペットが恋しい","word":"pet"}, {"label":"ベッドが恋しい","word":"bed"}],
      [{"label":"家が恋しい","word":"house"}, {"label":"テレビが恋しい","word":"tv"}, {"label":"iPadが恋しい","word":"ipad"}, null],
    ], license: {"type":"CC By","copyright_notice_url":"https://creativecommons.org/licenses/by/4.0/","author_name":"USSAAC","author_url":"https://ussaac.org/"}},
  ],
  vi: [
    {id: 'ussaac-covid-1-vi', name: 'USSAAC - Điều khoản Chung Covid (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-covid-1', starter: true, buttons: [
      [{label: "vi trùng", word: "germs"}, {label: "vi-rút", word: "virus"}, {label: "virus corona", word: "coronavirus"}, {label: "bệnh", word: "sick"}],
      [{label: "đại dịch", word: "pandemic"}, {label: "Cách ly", word: "quarantine"}, {label: "giữ an toàn", word: "safe"}, {label: "hạn chế tiếp xúc xã hội", word: "social-distancing"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-emotions-1-vi', name: 'USSAAC - Những cảm xúc (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-emotions-1', starter: true, buttons: [
      [{label: "tôi giận", word: "mad"}, {label: "Tôi thất vọng", word: "frustrated"}, {label: "tôi buồn", word: "sad"}, {label: "VÂNG", word: "ok"}],
      [{label: "Tôi đang chán", word: "bored"}, {label: "tôi sợ", word: "scared"}, {label: "tôi hạnh phúc", word: "happy"}, {label: "Tôi vui mừng", word: "excited"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-hand-washing-1-vi', name: 'USSAAC - Rửa tay (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-hand-washing-1', starter: true, buttons: [
      [{label: "rửa tay", word: "wash-hands"}, {label: "20 giây", word: "20-seconds"}, {label: "Tay khô", word: "dry-hands"}, {label: "tay sạch", word: "clean-hands"}],
      [{label: "tay bẩn", word: "dirty"}, {label: "nước rửa tay diệt khuẩn", word: "sanitizer"}, {label: "sử dụng xà phòng", word: "soap"}, {label: "đừng chạm vào bề mặt", word: "dont-touch"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-needs-1-2-vi', name: 'USSAAC - Nhu cầu (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-needs-1-2', starter: true, buttons: [
      [{label: "tôi đói", word: "hungry"}, {label: " tôi khát", word: "thirsty"}, {label: "Có thể cho tôi đồ uống chứ?", word: "drink"}, {label: "Tôi có thể ăn nhẹ được không?", word: "snak"}],
      [{label: "tôi mệt", word: "yawn"}, {label: "Tôi có thể nằm xuống không?", word: "lay"}, {label: "toi lanh", word: "cold"}, {label: "Tôi có thể có một cái chăn?", word: "blanket2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-mask-1-vi', name: 'USSAAC - Đeo mặt nạ (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-mask-1', starter: true, buttons: [
      [{label: "Mặt nạ của tôi ở đâu?", word: "mask"}, {label: "Tôi không thở được", word: "breathe"}, {label: "khẩu trang", word: "face-mask"}, {label: "trên, bật", word: "on"}],
      [{label: "tắt", word: "off"}, {label: "Tôi cần một mặt nạ", word: "want"}, {label: "Tôi có thể tháo mặt nạ ra không?", word: "take-off"}, {label: "Tôi có cần mặt nạ không?", word: "ask2"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-red-cross-1-vi', name: 'USSAAC - chữ thập đỏ (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-red-cross-1', starter: true, buttons: [
      [{label: "tôi cần giúp đỡ", word: "help"}, {label: "tôi cần tiền", word: "money"}, {label: "tôi cần thức ăn", word: "food"}, {label: "tôi cần nước", word: "water"}],
      [{label: "Tôi cần đèn pin", word: "flashlight"}, {label: "Tôi cần một cái chăn", word: "blanket"}, {label: "Tôi hết thuốc", word: "medication"}, {label: "Chúng ta sẽ ở trong một nơi trú ẩn bao lâu?", word: "when"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-sensory-needs-1-vi', name: 'USSAAC - Nhu cầu về giác quan (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-sensory-needs-1', starter: true, buttons: [
      [{label: "Tôi cần bình tĩnh lại!", word: "calm"}, {label: "Tôi cần phải bịt tai lại", word: "cover-ears"}, {label: "Tôi cần một cái chăn có trọng lượng", word: "blanket"}, {label: "Tôi cần tai nghe khử tiếng ồn", word: "headphones"}],
      [{label: "Tôi cần hộp cát", word: "sand-box"}, {label: "Tôi cần một không gian yên tĩnh", word: "quiet"}, {label: "tôi cần", word: "help"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-shelter-sensory-1-vi', name: 'USSAAC - Ban cảm giác Shelter (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-shelter-sensory-1', starter: true, buttons: [
      [{label: "Nó là quá ồn ào!", word: "noisy"}, {label: "Khi nào chúng ta đi?", word: "leave"}, {label: "Tôi không muốn ở đây!", word: "not"}, {label: "Tôi cần một nơi yên tĩnh.", word: "quiet"}],
      [{label: "Nó có mùi.", word: "smell"}, {label: "Nó nóng!", word: "hot"}, {label: "Trời lạnh!", word: "cold"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-social-distancing-1-vi', name: 'USSAAC - Hạn chế tiếp xúc xã hội (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-social-distancing-1', starter: true, buttons: [
      [{label: "ở nhà", word: "stay-at-home"}, {label: "đừng bắt tay", word: "shake-hands"}, {label: "Cách nhau 6 feet", word: "apart"}, {label: "không có công viên", word: "park"}],
      [{label: "không có trung tâm mua sắm", word: "mall"}, {label: "không có rạp hát", word: "theater"}, {label: "đeo mặt nạ", word: "face-mask"}, {label: "giữ an toàn", word: "safe"}],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},
    {id: 'ussaac-statement-missing-1-vi', name: 'USSAAC - Tuyên bố mất tích (2 x 4)', rows: 2, cols: 4, key: 'tiffenyn/ussaac-statement-missing-1', starter: true, buttons: [
      [{label: "tôi nhớ gia đình tôi", word: "family"}, {label: "Tôi nhớ những người bạn của tôi", word: "miss-friends"}, {label: "Tôi nhớ thú cưng của tôi", word: "pet"}, {label: "tôi nhớ cái giường của tôi", word: "bed"}],
      [{label: "Tôi nhớ nhà của tôi", word: "house"}, {label: "Tôi nhớ TV của tôi", word: "tv"}, {label: "Tôi nhớ iPad của tôi", word: "ipad"}, null],
    ], license: {type: 'CC By', copyright_notice_url: 'https://creativecommons.org/licenses/by/4.0/', author_name: 'USSAAC', author_url: 'https://ussaac.org/'}},                      
  ],
  ur: [

  ],
  tl: [

  ],
  ps: [

  ],
}
for(var loc in emergency.boards) {
  emergency.boards[loc].forEach(function(b) {
    b.path =  "obf/emergency-" + loc + "_" + b.id;
    b.name = b.name || b.id;
  })
}

export default emergency;
