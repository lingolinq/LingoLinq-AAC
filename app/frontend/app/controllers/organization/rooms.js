import i18n from '../../utils/i18n';
import Controller from '@ember/controller';
import Utils from '../../utils/misc';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import { computed } from '@ember/object';
import { is_classic } from '../../utils/view_style';
import { inject as service } from '@ember/service';

export default Controller.extend({
  // Ember Data 5.x removed automatic `store` injection into controllers.
  store: service('store'),
  app_state: service('app-state'),

  /* Basic view gets the `ch-` tab strip; Modern is untouched. Read through
     `utils/view_style#is_classic`, the single reader for this preference. */
  isBasicView: computed('app_state.effective_view_user.preferences.board_view_style', function() {
    return is_classic(this.get('app_state.effective_view_user'));
  }),

  /* True only for someone who can load this org's units at all -- see the note in
     routes/organization/rooms.js. Everyone else gets `ownRooms` below. */
  canEditOrg: computed('model.permissions.edit', function() {
    return !!this.get('model.permissions.edit');
  }),

  /* EVERY ORGANISATION THIS PERSON SUPERVISES ROOMS IN, for the picker on this page.
   *
   * A supervisor CAN hold rooms in more than one organisation: `OrganizationUnit.supervised_units`
   * (app/models/organization_unit.rb) collects every `org_unit_supervisor` link with no org
   * filter, and each entry carries its own `organization_id`. Nothing in the data model prevents
   * it -- it simply happens not to occur in the current seed data.
   *
   * That matters because the rail's Rooms row resolves its destination with `roomsAllOrgId`,
   * which is `sortedRooms[0].organization_id` -- the FIRST room's org and no other. Without a
   * way to switch, a supervisor with rooms in two districts could reach only one of them and
   * would have no indication the others existed. This picker is that way.
   *
   * Names come from `currentUser.organizations`, since `supervised_units` carries ids only.
   * An org whose name is missing falls back to its id rather than rendering blank. */
  roomOrgs: computed('app_state.currentUser.supervised_units.[]',
                     'app_state.currentUser.organizations.[]', 'model.id', function() {
    var names = {};
    (this.get('app_state.currentUser.organizations') || []).forEach(function(o) {
      if(o && o.id) { names[o.id] = o.name; }
    });
    var counts = {};
    (this.get('app_state.currentUser.supervised_units') || []).forEach(function(u) {
      if(!u || !u.organization_id) { return; }
      counts[u.organization_id] = (counts[u.organization_id] || 0) + 1;
    });
    var current = this.get('model.id');
    var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return Object.keys(counts).map(function(id) {
      return { id: id, name: names[id] || id, room_count: counts[id], is_current: id === current };
    }).sort(function(a, b) { return collator.compare(a.name || '', b.name || ''); });
  }),

  /* THE SUPERVISOR'S OWN ROOMS, from the user record rather than the manager-only units API.
     Filtered to the org being viewed so the page shows this district's rooms and not every
     room the person supervises anywhere. Sorted the same way `dashboard/authenticated-view.js`
     sorts them, so the rail's count and this list cannot disagree. */
  ownRooms: computed('app_state.currentUser.supervised_units.[]', 'model.id', function() {
    var org_id = this.get('model.id');
    var units = (this.get('app_state.currentUser.supervised_units') || []).filter(function(u) {
      return u && (!org_id || u.organization_id === org_id);
    });
    var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return units.slice().sort(function(a, b) {
      return collator.compare((a && a.name) || '', (b && b.name) || '');
    });
  }),
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
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

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
