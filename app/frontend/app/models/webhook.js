import DS from 'ember-data';
import LingoLinq from '../app';

import { computed } from '@ember/object';

LingoLinq.Webhook = DS.Model.extend({
  name: DS.attr('string'),
  user_id: DS.attr('string'),
  url: DS.attr('string'),
  webhook_type: DS.attr('string'),
  webhooks: DS.attr('raw'),
  notifications: DS.attr('raw'),
  include_content: DS.attr('boolean'),
  content_type: DS.attr('raw'),
  advanced_configuration: DS.attr('boolean'),
  custom_configuration: DS.attr('boolean'),
  webhooks_list: computed('webhooks', function() {
    return (this.get('webhooks') || []).join(', ');
  })
});

export default LingoLinq.Webhook;
