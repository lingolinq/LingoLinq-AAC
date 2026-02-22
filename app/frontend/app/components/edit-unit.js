import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';

/**
 * Edit Room modal - edit unit/room details, curriculum.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'edit-unit';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    opening() {
      var unit = this.get('model.unit');
      if (unit) {
        unit.set('topics', unit.get('topics') || []);
        this.set('error', false);
        this.set('saving', false);
        if (this.get('model.curriculum_only') && !this.get('model.unit.topics.length')) {
          this.send('add_curriculum_row');
        }
      }
    },
    closing() {},
    add_curriculum_row() {
      var topics = [].concat(this.get('model.unit.topics') || []);
      topics.push({ title: '', url: '' });
      this.set('model.unit.topics', topics);
    },
    remove_curriculum_row(row) {
      var topics = [].concat(this.get('model.unit.topics') || []);
      topics = topics.filter(function(t) { return t !== row; });
      this.set('model.unit.topics', topics);
    },
    close() {
      var unit = this.get('model.unit');
      if (unit && unit.rollbackAttributes) {
        unit.rollbackAttributes();
      }
      this.get('modal').close(false);
    },
    save() {
      var _this = this;
      var unit = _this.get('model.unit');
      if (!unit) { return; }
      var topics = [];
      (this.get('model.unit.topics') || []).forEach(function(row) {
        if (row.title || row.url) {
          emberSet(row, 'title', emberGet(row, 'title') || emberGet(row, 'url'));
          topics.push(row);
        }
      });
      this.set('model.unit.topics', topics);
      _this.set('error', false);
      _this.set('saving', true);
      unit.save().then(function() {
        _this.get('modal').close({ updated: true });
        _this.set('saving', false);
      }, function() {
        _this.set('error', true);
        _this.set('saving', false);
      });
    }
  }
});
