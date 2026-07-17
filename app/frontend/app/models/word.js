import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';

LingoLinq.Word = BaseModel.extend({
  word: attr('string'),
  locale: attr('string'),
  parts_of_speech: attr('raw'),
  primary_part_of_speech: attr('string'),
  antonyms: attr('raw'),
  inflection_overrides: attr('raw'),
  skip: attr('boolean')
});

export default LingoLinq.Word;
