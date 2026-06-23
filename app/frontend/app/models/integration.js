import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import { computed } from '@ember/object';

LingoLinq.Integration = BaseModel.extend({
  name: attr('string'),
  user_id: attr('string'),
  custom_integration: attr('boolean'),
  webhook: attr('boolean'),
  render: attr('boolean'),
  render_url: attr('string'),
  icon_url: attr('string'),
  uses: attr('number'),
  template: attr('boolean'),
  template_key: attr('string'),
  user_parameters: attr('raw'),
  user_settings: attr('raw'),
  integration_key: attr('string'),
  description: attr('string'),
  user_token: attr('string'),
  button_webhook_url: attr('string'),
  button_webhook_local: attr('boolean'),
  board_render_url: attr('string'),
  insecure_button_webhook_url: computed('button_webhook_url', 'button_webhook_local', function() {
    var url = this.get('button_webhook_url');
    return url && url.match(/^http:/) && !this.get('button_webhook_local');
  }),
  insecure_board_render_url: computed('board_render_url', function() {
    var url = this.get('board_render_url');
    return url && url.match(/^http:/);
  }),
  access_token: attr('string'),
  truncated_access_token: attr('string'),
  displayable_access_token: computed('access_token', 'truncated_access_token', function() {
    return this.get('access_token') || this.get('truncated_access_token');
  }),
  has_multiple_actions: computed('webhook', 'render', function() {
    return !!(this.get('webhook') && this.get('render'));
  }),
  token: attr('string'),
  truncated_token: attr('string'),
  displayable_token: computed('token', 'truncated_token', function() {
    return this.get('token') || this.get('truncated_token');
  }),
});

export default LingoLinq.Integration;
