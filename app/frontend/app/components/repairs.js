import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import stashes from '../utils/_stashes';
import $ from 'jquery';
import utterance from '../utils/utterance';
import i18n from '../utils/i18n';
import app_state from '../utils/app_state';
import capabilities from '../utils/capabilities';
import speecher from '../utils/speecher';

/**
 * Repairs (Modify and Repair Message) Modal Component
 *
 * Converted from modals/repairs template/controller to component.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/repairs';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  update_selected: observer(
    'buttons',
    'button_index',
    'selection_start',
    'selection_end',
    'ghost_index',
    'moving',
    function() {
      const buttons = this.get('buttons') || [];
      let idx = this.get('button_index');
      if (idx == null) { idx = buttons.length - 1; }
      if (idx > buttons.length - 1) { idx = buttons.length - 1; }
      if (idx < -1) { idx = -1; }
      const selection_start = this.get('selection_start');
      const selection_end = this.get('selection_end') || selection_start;
      const moving = this.get('moving');
      buttons.forEach(function(b, jdx) {
        const classes = ['cursor_box'];
        if (idx === jdx) {
          classes.push('cursor');
        }
        if (selection_start != null && jdx >= selection_start && jdx <= selection_end) {
          classes.push('selected');
          if (moving) {
            classes.push('moving');
          }
          if (jdx > selection_start) {
            classes.push('internal_left');
          }
          if (jdx < selection_end) {
            classes.push('internal_right');
          }
          if (selection_start === idx && selection_start !== selection_end) {
            classes.push('prior');
          }
        } else if (idx === jdx) {
          classes.push('over');
        } else if (idx === -1 && jdx === 0) {
          classes.push('cursor');
          classes.push('prior');
        }
        emberSet(b, 'cursor_class', htmlSafe(classes.join(' ')));
      });
      const _this = this;
      runLater(function() {
        _this.snap_scroll();
      });
    }
  ),

  has_selection: computed('selection_start', function() {
    return this.get('selection_start') != null;
  }),

  snap_scroll() {
    const elem = document.getElementsByClassName('cursor_area')[0];
    if (!elem) { return; }
    const box_bounds = document.getElementsByClassName('cursor_box')[0].getBoundingClientRect();
    const styles = window.getComputedStyle(elem, null);
    const cols = Math.floor((elem.clientWidth) / box_bounds.width);
    this.set('columns', cols);
    let idx = this.get('ghost_index') || this.get('button_index') || 0;
    if (idx < 0) { idx = 0; }
    const buttons = this.get('buttons') || [];
    this.set('rows', Math.floor(buttons.length / cols));
    const row = Math.floor(idx / cols);
    if (elem.scrollHeight > elem.clientHeight) {
      elem.scrollTop = box_bounds.height * (row - 1);
    } else {
      elem.scrollTop = 0;
    }
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      const buttons = [];
      (stashes.get('working_vocalization') || []).forEach(function(button) {
        buttons.push($.extend({}, button));
      });
      this.set('buttons', buttons);
      this.set('ghost_index', null);
      this.set('insertion', null);
      this.set('moving', null);
      this.set('selection_start', null);
      this.set('selection_end', null);
      this.set('button_index', app_state.get('insertion.index') || buttons.length - 1);
      this.set('buttons', stashes.get('working_vocalization'));
      app_state.set('insertion', null);
    },
    closing() {},
    done(do_speak) {
      const buttons = this.get('buttons');
      utterance.set('rawButtonList', buttons);
      utterance.set('list_vocalized', false);
      this.get('modal').close();
      if (do_speak) {
        utterance.vocalize_list(null, {});
        if (app_state.get('currentUser.preferences.vibrate_buttons') && app_state.get('speak_mode')) {
          capabilities.vibrate();
        }
      }
    },
    begin_insertion() {
      if (this.get('button_index') != null) {
        app_state.set('insertion', { index: this.get('button_index') });
        this.get('modal').close();
        modal.notice(i18n.t('insertion_instructions', "You are now inserting text. Hit the sentence dropdown again to go back to adding text at the end."), true);
      }
    },
    insert() {
      const insertion = this.get('insertion');
      if (!insertion) { return; }
      if (this.get('selection_start')) {
        this.send('remove');
      }
      const buttons = [].concat(this.get('buttons') || []);
      const idx = this.get('button_index');
      const button = buttons[idx];
      if ((button || idx === -1) && insertion) {
        const new_button = {
          label: insertion,
          modeling: true,
          type: 'speak'
        };
        if (this.get('has_selection') && idx !== -1) {
          buttons[idx] = new_button;
          this.set('buttons', buttons);
          this.set('selection_start', idx);
          this.set('selection_end', null);
        } else {
          const pre = buttons.slice(0, idx + 1);
          const post = buttons.slice(idx + 1);
          const list = pre.concat([new_button]).concat(post);
          this.set('buttons', list);
          this.set('button_index', idx + 1);
        }
        if (this.get('has_selection')) {
          this.send('select');
        }
      }
    },
    oops() {
      speecher.oops();
    },
    remove() {
      let buttons = this.get('buttons') || [];
      let idx = this.get('button_index');
      const start = this.get('selection_start') || idx;
      const end = this.get('selection_end') || start;
      if (buttons[idx]) {
        buttons = buttons.filter(function(b, i) { return i < start || i > end; });
      }
      this.set('buttons', buttons);
      this.set('button_index', Math.max(Math.min(idx - 1, buttons.length - 1), -1));
      this.set('selection_start', null);
      this.set('selection_end', null);
      this.set('insertion', null);
    },
    select(button) {
      const buttons = this.get('buttons') || [];
      let idx = this.get('button_index');
      const button_idx = button ? buttons.indexOf(button) : -1;
      const within_selection = button && this.get('has_selection') && button_idx >= this.get('selection_start') && button_idx <= this.get('selection_end');
      if ((!button && this.get('has_selection')) || (idx === this.get('selection_start') && !this.get('moving')) || within_selection) {
        if (!button && this.get('button_index') === this.get('selection_start') && this.get('selection_end') != null && this.get('selection_start') < this.get('selection_end')) {
          this.set('button_index', Math.max(idx - 1, -1));
        } else if (button) {
          this.set('button_index', button_idx);
        }
        this.set('selection_start', null);
        this.set('selection_end', null);
        this.set('ghost_index', null);
        this.set('moving', null);
        this.set('insertion', null);
        return;
      }
      if (idx === -1) { idx = 0; }
      if (idx == null) { idx = buttons.length; }
      const ref_button = buttons[idx];
      if (!button || ref_button === button) {
        const sel_button = button || ref_button;
        this.set('selection_start', idx);
        this.set('selection_end', null);
        if (sel_button && sel_button.label) {
          this.set('insertion', sel_button.vocalization || sel_button.label);
        }
      } else {
        idx = button_idx;
        if (this.get('has_selection') && this.get('moving')) {
          const start = this.get('selection_start');
          const end = this.get('selection_end') || start;
          const removed = [].concat(buttons);
          const chunk = removed.splice(start, end - start + 1);
          if (idx > end) {
            idx = idx - (end - start);
          }
          removed.splice.apply(removed, [idx, 0].concat(chunk));
          this.set('buttons', removed);
          this.set('selection_start', idx);
          this.set('selection_end', idx + (end - start));
          this.set('button_index', idx);
          this.set('ghost_index', null);
        } else {
          this.set('insertion', null);
        }
      }
      this.set('button_index', idx);
    },
    enable_move() {
      this.set('moving', !this.get('moving'));
      if (!this.get('moving')) {
        this.send('select');
      }
    },
    move(direction) {
      let buttons = this.get('buttons') || [];
      let idx = this.get('button_index');
      const rows = this.get('rows');
      const cols = this.get('columns');
      if (idx == null) { idx = buttons.length - 1; }
      if (this.get('has_selection')) {
        if (direction === 'back' || direction === 'forward') {
          this.set('ghost_index', null);
        } else if (!this.get('ghost_index')) {
          this.set('ghost_index', this.get('button_index'));
        }
        idx = this.get('ghost_index') || this.get('button_index');
        let start = this.get('selection_start');
        if (start == null) { start = this.get('button_index'); }
        let end = this.get('selection_end') || start;
        if (direction === 'back' || direction === 'forward') {
          const movement = direction === 'back' ? -1 : 1;
          if (this.get('moving')) {
            let pre = buttons.slice(0, Math.max(start, 0));
            let post = buttons.slice(end + 1, buttons.length);
            const chunk = buttons.slice(start, end + 1);
            let do_move = false;
            if (chunk.length) {
              if (movement > 0) {
                if (post.length) {
                  do_move = true;
                  pre.push(post.shift());
                }
              } else {
                if (pre.length) {
                  do_move = true;
                  post.unshift(pre.pop());
                }
              }
              if (do_move) {
                const new_list = pre.concat(chunk).concat(post);
                this.set('buttons', new_list);
                idx = idx + movement;
                this.set('selection_start', start + movement);
                this.set('selection_end', end + movement);
              }
            }
          } else {
            if (idx >= end && (movement > 0 || start !== end)) {
              end = Math.max(Math.min(end + movement, buttons.length - 1), 0);
              idx = end;
            } else {
              start = Math.max(Math.min(start + movement, buttons.length - 1), 0);
              idx = start;
            }
            this.set('selection_start', start);
            this.set('selection_end', end);
            const phrase = buttons.slice(start, end + 1).map(function(b) { return b.vocalization || b.label; }).join(' ');
            this.set('insertion', phrase);
          }
        } else if (direction === 'up') {
          if (rows != null && cols != null) {
            if (rows > 3 && idx >= (rows - 1) * cols) {
              idx = Math.max(idx - cols, 0);
            }
            idx = Math.max(idx - cols, 0);
          }
        } else if (direction === 'down') {
          if (rows != null && cols != null) {
            if (rows > 3 && idx <= cols) {
              idx = Math.max(idx, 0) + cols;
            }
            idx = Math.max(idx, 0) + cols;
          }
        }
      } else {
        this.set('ghost_index', null);
        if (direction === 'back') {
          idx--;
        } else if (direction === 'forward') {
          idx++;
        } else if (direction === 'up') {
          if (rows != null && cols != null) {
            idx = idx - cols;
          }
        } else if (direction === 'down') {
          if (rows != null && cols != null) {
            idx = Math.max(idx, 0) + cols;
          }
        }
      }
      if (idx > buttons.length - 1) { idx = buttons.length - 1; }
      if (idx < -1) { idx = -1; }
      if (this.get('ghost_index') != null) {
        this.set('ghost_index', idx);
      } else {
        this.set('button_index', idx);
      }
    }
  }
});
