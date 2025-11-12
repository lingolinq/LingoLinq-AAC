import DS from 'ember-data';
import LingoLinq from '../app';

LingoLinq.Word = DS.Model.extend({
  word: DS.attr('string'),
  locale: DS.attr('string'),
  parts_of_speech: DS.attr('raw'),
  primary_part_of_speech: DS.attr('string'),
  antonyms: DS.attr('raw'),
  inflection_overrides: DS.attr('raw'),
  skip: DS.attr('boolean')
});

export default LingoLinq.Word;
