import DS from 'ember-data';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

LingoLinq.Integration = DS.Model.extend({
  // Explicit service injections (Ember 3.28 migration)
  persistence: service(),
  name: DS.attr('string'),
  user_id: DS.attr('string'),
  custom_integration: DS.attr('boolean'),
  webhook: DS.attr('boolean'),
  render: DS.attr('boolean'),
  render_url: DS.attr('string'),
  icon_url: DS.attr('string'),
  uses: DS.attr('number'),
  template: DS.attr('boolean'),
  template_key: DS.attr('string'),
  user_parameters: DS.attr('raw'),
  user_settings: DS.attr('raw'),
  integration_key: DS.attr('string'),
  description: DS.attr('string'),
  user_token: DS.attr('string'),
  button_webhook_url: DS.attr('string'),
  button_webhook_local: DS.attr('boolean'),
  board_render_url: DS.attr('string'),
  insecure_button_webhook_url: computed('button_webhook_url', 'button_webhook_local', function() {
    var url = this.get('button_webhook_url');
    return url && url.match(/^http:/) && !this.get('button_webhook_local');
  }),
  insecure_board_render_url: computed('board_render_url', function() {
    var url = this.get('board_render_url');
    return url && url.match(/^http:/);
  }),
  access_token: DS.attr('string'),
  truncated_access_token: DS.attr('string'),
  displayable_access_token: computed('access_token', 'truncated_access_token', function() {
    return this.get('access_token') || this.get('truncated_access_token');
  }),
  has_multiple_actions: computed('webhook', 'render', function() {
    return !!(this.get('webhook') && this.get('render'));
  }),
  token: DS.attr('string'),
  truncated_token: DS.attr('string'),
  displayable_token: computed('token', 'truncated_token', function() {
    return this.get('token') || this.get('truncated_token');
  }),
});

export default LingoLinq.Integration;
