import Controller from '@ember/controller';
import EmberObject from '@ember/object';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import LingoLinq from '../app';
import app_state from '../utils/app_state';
import modal from '../utils/modal';
import speecher from '../utils/speecher';
import utterance from '../utils/utterance';
import Utils from '../utils/misc';
import Stats from '../utils/stats';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Controller.extend({
  lookup: function() {
    var _this = this;
    _this.set('result', {loading: true});
    persistence.ajax("/api/v1/start_code?code=" + this.get('code'), { type: 'GET'}).then(function(res) {
      _this.set('result', res);
    }, function(err) {
      _this.set('result', {error: true});
    })
  },
  actions: {

  }
});
