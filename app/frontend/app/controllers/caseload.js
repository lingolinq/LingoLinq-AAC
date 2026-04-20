import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

export default Controller.extend({
  appState: service('app-state'),
  persistence: service('persistence'),
  router: service('router'),

  supervisees: computed('model.known_supervisees.[]', function() {
    return this.get('model.known_supervisees') || [];
  }),

  actions: {
    homeInSpeakMode: function(userId, asModeling) {
      var user = this.get('model');
      if (!user) { return; }
      var supervisees = user.get('known_supervisees') || [];
      var supervisee = null;
      supervisees.forEach(function(s) {
        if (s.id === userId) { supervisee = s; }
      });
      if (!supervisee || !supervisee.home_board_key) { return; }
      var app_state = this.get('appState');
      if (asModeling) {
        app_state.set('modeling_for_user', supervisee);
      } else {
        app_state.set('speak_as_user', supervisee);
      }
      this.get('router').transitionTo('board', supervisee.home_board_key);
    },

    stats: function(userName) {
      this.get('router').transitionTo('user.stats', userName);
    },

    modeling_ideas: function(userName) {
      this.get('router').transitionTo('user.goals', userName);
    },

    set_goal: function(supervisee) {
      modal.open('set-goal', { user_name: supervisee.user_name });
    },

    record_note: function(supervisee) {
      modal.open('record-note', { user: { user_name: supervisee.user_name, id: supervisee.id } });
    },

    quick_assessment: function(supervisee) {
      modal.open('quick-assessment', { user_name: supervisee.user_name });
    },

    run_eval: function(supervisee) {
      modal.open('run-eval', { user_name: supervisee.user_name });
    },

    intro: function(userId) {
      var user = this.get('model');
      var supervisees = user.get('known_supervisees') || [];
      var supervisee = null;
      supervisees.forEach(function(s) {
        if (s.id === userId) { supervisee = s; }
      });
      if (supervisee) {
        this.get('router').transitionTo('user', supervisee.user_name);
      }
    },

    // Keyboard navigation for the per-supervisee "extras" dropdown.
    // Wired to `keydown` on `.md-caseload__extras-dropdown`.
    // Bootstrap 3's native dropdown plugin handles open-on-click and
    // outside-click-to-close, but provides no arrow-key navigation,
    // Home/End shortcuts, or Escape support. This handler implements
    // the WAI-ARIA menu keyboard pattern on top of it.
    extras_dropdown_keydown: function(event) {
      if (!event) { return; }
      var key = event.key;
      var keyCode = event.keyCode;
      var container = event.currentTarget;
      if (!container) { return; }

      // Find the dropdown items (LinkTo + button children of <li>).
      // Filter to visible elements only, since {{#if}} branches in
      // the template can hide some items conditionally.
      var items = Array.prototype.slice.call(
        container.querySelectorAll('.dropdown-menu > li > a, .dropdown-menu > li > button')
      ).filter(function(el) { return el.offsetParent !== null; });
      if (items.length === 0) { return; }

      var trigger = container.querySelector('[data-toggle="dropdown"]');
      var menu = container.querySelector('.dropdown-menu');
      var is_open = menu && menu.parentElement && menu.parentElement.classList.contains('open');
      var current_idx = items.indexOf(document.activeElement);

      // Escape: close the dropdown and restore focus to the trigger.
      if (key === 'Escape' || key === 'Esc' || keyCode === 27) {
        if (is_open) {
          event.preventDefault();
          if (trigger) {
            trigger.click(); // Bootstrap toggles via click
            trigger.focus();
          }
        }
        return;
      }

      // ArrowDown: from trigger or any item, move to the next item.
      if (key === 'ArrowDown' || keyCode === 40) {
        if (!is_open && document.activeElement === trigger) {
          event.preventDefault();
          trigger.click(); // open the menu
          // Focus the first item after the menu opens
          var first = items[0];
          if (first) { setTimeout(function() { first.focus(); }, 0); }
          return;
        }
        if (is_open && current_idx >= 0) {
          event.preventDefault();
          var next = items[(current_idx + 1) % items.length];
          if (next) { next.focus(); }
        }
        return;
      }

      // ArrowUp: previous item; from first wraps to last.
      if (key === 'ArrowUp' || keyCode === 38) {
        if (is_open && current_idx >= 0) {
          event.preventDefault();
          var prev = items[(current_idx - 1 + items.length) % items.length];
          if (prev) { prev.focus(); }
        }
        return;
      }

      // Home: jump to first item.
      if (key === 'Home' || keyCode === 36) {
        if (is_open) {
          event.preventDefault();
          if (items[0]) { items[0].focus(); }
        }
        return;
      }

      // End: jump to last item.
      if (key === 'End' || keyCode === 35) {
        if (is_open) {
          event.preventDefault();
          if (items[items.length - 1]) { items[items.length - 1].focus(); }
        }
        return;
      }
    }
  }
});
