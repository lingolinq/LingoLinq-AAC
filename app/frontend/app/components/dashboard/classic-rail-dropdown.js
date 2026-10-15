import Component from '@ember/component';
import { guidFor } from '@ember/object/internals';

/* BASIC LEFT MENU AS A DROPDOWN AT 900px AND BELOW (requested 2026-10-12).
 *
 * Wraps the rows of a Basic left menu: the home page's (dashboard/classic-view.hbs),
 * Dashboard::ClassicRail and Dashboard::ClassicAccountRail. It renders a trigger and the menu's
 * own rows inside one wrapper, so the rows are the same elements at every width:
 *   - above 900px the CSS hides the trigger and makes the wrapper `display: contents`, so the menu
 *     lays out exactly as before;
 *   - at 900px and below the rows are hidden until the trigger opens them, as a panel under it.
 * The styles are in _classic-home.scss, beside `.ch-rail`.
 *
 * Closes the ways a menu closes (the same as Modern's account menu dropdown,
 * components/account-rail.js, which this mirrors but does not share): choosing something in it,
 * clicking away, or Escape, which puts focus back on the trigger. The outside click listens in the
 * capture phase so it still runs when something stops propagation.
 *
 * Args: @user (avatar and name on the trigger); @pageLabel, the page the menu belongs to, shown as
 *   "<page> Menu" (requested 2026-10-12: "on home page it would be Home Page Menu"), or "Menu".
 */
export default Component.extend({
  tagName: '',
  open: false,

  init() {
    this._super(...arguments);
    var _this = this;
    var id = guidFor(this);
    this.set('rowsId', 'ch_rail_rows_' + id);
    this.set('triggerId', 'ch_rail_trigger_' + id);
    this.toggle = function() { _this.set('open', !_this.get('open')); };
    this._outside = function(event) {
      if(!_this.get('open') || _this.isDestroyed || _this.isDestroying) { return; }
      var target = event.target;
      var trigger = document.getElementById(_this.get('triggerId'));
      if(trigger && target && trigger.contains(target)) { return; } // the trigger's own click toggles
      var rows = document.getElementById(_this.get('rowsId'));
      if(rows && target && rows.contains(target)) {
        var chosen = target.closest && target.closest('a, button');
        if(chosen) { _this.set('open', false); }
        return;
      }
      _this.set('open', false);
    };
    this._escape = function(event) {
      if(event.key !== 'Escape' || !_this.get('open') || _this.isDestroyed || _this.isDestroying) { return; }
      _this.set('open', false);
      var trigger = document.getElementById(_this.get('triggerId'));
      if(trigger) { try { trigger.focus(); } catch(e) { /* not focusable */ } }
    };
    document.addEventListener('click', this._outside, true);
    document.addEventListener('keydown', this._escape);
  },

  willDestroy() {
    document.removeEventListener('click', this._outside, true);
    document.removeEventListener('keydown', this._escape);
    this._super(...arguments);
  }
});
