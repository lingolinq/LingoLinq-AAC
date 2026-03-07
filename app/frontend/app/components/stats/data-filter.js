import Component from '@ember/component';

import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';

export default Component.extend({
  customFilterPendingApply: false,
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-xs-6');
    } else {
      return htmlSafe('col-xs-12');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('border-left: 1px solid #eee; padding-top: 20px; padding-bottom: 20px;');
    } else {
      return htmlSafe('padding-top: 20px; padding-bottom: 20px');
    }
  }),
  inner_elem_style: computed('tall_filter', function() {
    if(this.get('tall_filter')) {
      return htmlSafe('height: 110px; line-height: 37px; margin-top: -20px;');
    } else {
      return htmlSafe('line-height: 37px; margin-top: -20px;');
    }
  }),
  filter_list: computed('snapshots', function() {
    var res = [];
    res.push({name: i18n.t('last_2_months', "Last 2 Months"), id: "last_2_months"});
    res.push({name: i18n.t('2_4_months_ago', "2-4 Months Ago"), id: "2_4_months_ago"});
    res.push({name: i18n.t('custom_filter', "Custom Filter"), id: "custom"});
    if(this.get('snapshots')) {
      this.get('snapshots').forEach(function(snap) {
        res.push({name: i18n.t('snapshot_dash', "Snapshot - ") + snap.get('name'), id: 'snapshot_' + snap.get('id')});
      });
    }
    return res;
  }),
  tall_filter: computed(
    'usage_stats.{custom_filter,snapshot_id}',
    'ref_stats.{custom_filter,snapshot_id}',
    function() {
      return this.get('usage_stats.custom_filter') || this.get('ref_stats.custom_filter') || this.get('usage_stats.snapshot_id') || this.get('ref_stats.snapshot_id');
    }
  ),
  actions: {
    onPeriodChange: function(id) {
      this.set('usage_stats.filter', id);
      if (id === 'custom') {
        this.set('customFilterPendingApply', true);
      } else {
        this.set('customFilterPendingApply', false);
        var fn = this.get('update_filter');
        if (typeof fn === 'function') { fn('date'); }
      }
    },
    applyCustomFilter: function() {
      this.set('customFilterPendingApply', false);
      var fn = this.get('update_filter');
      if (typeof fn === 'function') { fn('date'); }
    },
    compare_to: function() {
      var fn = this.get('compare_to');
      if (typeof fn === 'function') { fn(); }
    },
    clear_side: function() {
      var fn = this.get('clear_side');
      if (typeof fn === 'function') { fn(); }
    },
    update_filter: function(type) {
      var fn = this.get('update_filter');
      if (typeof fn === 'function') { fn(type); }
    }
  }
});