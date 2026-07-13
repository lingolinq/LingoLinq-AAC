import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';

import { computed } from '@ember/object';

LingoLinq.Webhook = BaseModel.extend({
  name: attr('string'),
  user_id: attr('string'),
  url: attr('string'),
  webhook_type: attr('string'),
  webhooks: attr('raw'),
  notifications: attr('raw'),
  include_content: attr('boolean'),
  content_type: attr('raw'),
  advanced_configuration: attr('boolean'),
  custom_configuration: attr('boolean'),
  webhooks_list: computed('webhooks', function() {
    return (this.get('webhooks') || []).join(', ');
  })
});

export default LingoLinq.Webhook;
