import i18n from '../../utils/i18n';
import Controller from '@ember/controller';
import Utils from '../../utils/misc';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import { computed } from '@ember/object';

export default Controller.extend({
  refresh_units: function() {
    var _this = this;
    this.set('units', {loading: true});
    Utils.all_pages('unit', {organization_id: this.get('model.id')}, function(list) {
      _this.set('units', list);
      list.forEach(function(unit) {
        unit.load_data(true);
      });
    }).then(function(data) {
      _this.set('units', data);
    }, function() {
      _this.set('units', {error: true});
    });
  },
  reorder_units: function(unit_ids) {
  },
  max_session_count: computed('units.@each.max_session_count', function() {
    var counts = (this.get('units') || []).map(function(u) { return u.get('max_session_count'); });
    console.log("max session count", Math.max.apply(null, counts));
    return Math.max.apply(null, counts);
  }),
  actions: {
    add_unit: function() {
      var name = this.get('new_unit_name');
      var _this = this;
      this.set('new_unit_name', null);
      if(name) {
        var unit = this.store.createRecord('unit', {name: name, organization_id: this.get('model.id')});
        unit.save().then(function() {
          _this.refresh_units();
        }, function() {
          modal.error(i18n.t('room_not_created', "There was an unexpected error creating the new room"));
        });
      }
    },
    delete_unit: function(unit) {
      var _this = this;
      modal.open('confirm-delete-unit', {unit: unit}).then(function(res) {
        if(res && res.deleted) {
          _this.refresh_units();
        }
      });
    },
    add_users: function(unit) {
      unit.set('adding_users', !unit.get('adding_users'));
    },
    add_unit_user: function(unit, user_type) {
      var action = 'add_' + user_type;
      var user_name = null;
      if(user_type.match('communicator')) {
        user_name = unit.get('communicator_user_name');
      } else {
        user_name = unit.get('supervisor_user_name');
      }
      if(!user_name) { return; }
      action = action + "-" + user_name;
      unit.set('management_action', action);
      unit.save().then(function() {
        unit.set('communicator_user_name', null);
        unit.set('supervisor_user_name', null);
      }, function() {
        modal.error(i18n.t('error_adding_user', "There was an unexpected error while trying to add the user"));
      });
    },
    refresh: function() {
      this.refresh_units();
    },
    delete_unit_user: function(unit, user_type, user_id, decision) {
      if(!decision) {
        var _this = this;
        modal.open('modals/confirm-org-action', {action: 'remove_unit_user', unit_user_name: user_id}).then(function(res) {
          if(res.confirmed) {
            _this.send('delete_unit_user', unit, user_type, user_id, true);
          }
        });
        return;
      }
      var action = 'remove_' + user_type + '-' + user_id;
      unit.set('management_action', action);
      unit.save().then(function() {
      }, function() {
        modal.error(i18n.t('error_removing_user', "There was an unexpected error while trying to remove the user"));
      });
    },
    toggle_details: function(unit) {
      unit.set('expanded', !unit.get('expanded'));
    },
    move_up: function(unit) {
    },
    move_down: function(unit) {
    }
  }
});
