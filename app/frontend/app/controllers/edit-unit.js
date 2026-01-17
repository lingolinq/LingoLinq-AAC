import LingoLinq from '../app';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import { get as emberGet, set as emberSet } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    var unit = this.get('model.unit');
    unit.set('topics', unit.get('topics') || []);
    this.set('unit', unit);
    this.set('error', false);
    this.set('saving', false);
    if(this.get('model.curriculum_only') && !this.get('model.unit.topics.length')) {
      this.send('add_curriculum_row');
    }
  },
  actions: {
    add_curriculum_row: function() {
      var topics = [].concat(this.get('model.unit.topics') || []);
      topics.push({title: '', url: ''});
      this.set('model.unit.topics', topics);
    },
    remove_curriculum_row: function(row) {
      var topics = [].concat(this.get('model.unit.topics') || []);
      topics = topics.filter(function(t) { return t != row; });
      this.set('model.unit.topics', topics);
    },
    close: function() {
      this.get('model.unit').rollbackAttributes();
      this.modal.close(false);
    },
    save: function() {
      var _this = this;
      var unit = _this.get('model.unit');
      var topics = [];
      (this.get('model.unit.topics') || []).forEach(function(row) {
        if(row.title || row.url) {
          emberSet(row, 'title', emberGet(row, 'title') || emberGet(row, 'url'));
          topics.push(row);
        }
      });
      this.set('model.unit.topics', topics);
      _this.set('error', false);
      _this.set('saving', true);
      unit.save().then(function() {
        this.modal.close({updated: true});
        _this.set('saving', false);
      }, function() {
        _this.set('error', true);
        _this.set('saving', false);
      });
    }
  }
});
