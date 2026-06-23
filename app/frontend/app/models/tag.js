import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import speecher from '../utils/speecher';
import persistence from '../utils/persistence';
import Utils from '../utils/misc';

LingoLinq.Tag = BaseModel.extend({
  button: attr('raw'),
  tag_id: attr('string'),
  label: attr('string'),
  public: attr('boolean'),
});

export default LingoLinq.Tag;
