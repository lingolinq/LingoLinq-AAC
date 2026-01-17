import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import modal from '../../utils/modal';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import app_state from '../../utils/app_state';
import { computed, get as emberGet, set as emberSet } from '@ember/object';
import capabilities from '../../utils/capabilities';

export default Controller.extend({
  analysis_subset: computed('focus.analysis.found', function() {
    return (this.get('focus.analysis.found') || []);
  }),
  analysis_extras: computed('focus.analysis.found', 'refresh_id', function() {
    var list = (this.get('focus.analysis.found') || []);
    return list.filter(function(b) { return b.collapsed; });
  }),
  actions: {
    toggle: function(btn) {
      emberSet(btn, 'collapsed', !emberGet(btn, 'collapsed'));
      this.set('refresh_id', (new Date()).getTime());
    },
    print: function() {
      capabilities.print();
    }
  }
});
