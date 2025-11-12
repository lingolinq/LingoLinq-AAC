import DS from 'ember-data';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from '../../app';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import Button from '../../utils/button';

describe('Badge', function() {
  describe('progress_out_of_100', function() {
    it('should return correct values', function() {
      var b = LingoLinq.store.createRecord('badge');
      expect(b.get('progress_out_of_100')).toEqual(0);
      b.set('progress', 0.54);
      expect(b.get('progress_out_of_100')).toEqual(54);
      b.set('progress', 0.701);
      expect(b.get('progress_out_of_100')).toEqual(70.1);
    });
  });

  describe('progress_style', function() {
    it('should return correct values', function() {
      var b = LingoLinq.store.createRecord('badge');
      expect(b.get('progress_style').string).toEqual('width: 0%');
      b.set('progress', 0.5);
      expect(b.get('progress_style').string).toEqual('width: 50%');
      b.set('progress', -1);
      expect(b.get('progress_style').string).toEqual('width: 0%');
      b.set('progress', 1.5);
      expect(b.get('progress_style').string).toEqual('width: 100%');
    });
  });

  describe('completion_explanation', function() {
    it('should generate correct explanations', function() {
      var b = LingoLinq.store.createRecord('badge');
      expect(b.get('completion_explanation')).toEqual(null);
      b.set('completion_settings', {instance_count: 5, word_instances: 5, consecutive_units: 3});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 words per day for 3 days in a row');
      b.set('completion_settings', {instance_count: 5, word_instances: 5, matching_units: 3});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 words per day for any 3 days');
      b.set('completion_settings', {instance_count: 5, word_instances: 5, matching_instances: 12});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 words per day for a total of 12 words');
      b.set('completion_settings', {instance_count: 1, interval: "date", level: 3, matching_units: 30, word_instances: 1});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 word per day for any 30 days');

      b.set('completion_settings', {instance_count: 1, button_instances: 1, consecutive_units: 3});
      expect(b.get('completion_explanation')).toEqual('Hit at least 1 button per day for 3 days in a row');
      b.set('completion_settings', {instance_count: 4, session_instances: 6, matching_units: 2, interval: 'weekyear'});
      expect(b.get('completion_explanation')).toEqual('Have at least 4 sessions per week for any 2 weeks');
      b.set('completion_settings', {instance_count: 3, modeled_button_instances: 3, matching_instances: 20, interval: 'biweekyear'});
      expect(b.get('completion_explanation')).toEqual('Have modeled at least 3 buttons every two weeks for a total of 20 modeled buttons');
      b.set('completion_settings', {instance_count: 5, modeled_word_instances: 5, consecutive_units: 3, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Have modeled at least 5 words per day for 3 days in a row');
      b.set('completion_settings', {instance_count: 11, unique_word_instances: 11, matching_instances: 1, interval: 'monthyear'});
      expect(b.get('completion_explanation')).toEqual('Use at least 11 unique words per month for a total of 1 unique word');
      b.set('completion_settings', {instance_count: 1, unique_button_instances: 1, consecutive_units: 1, interval: 'biweekyear'});
      expect(b.get('completion_explanation')).toEqual('Hit at least 1 unique button every two weeks at least once');
      b.set('completion_settings', {instance_count: 1, word_instances: 1, matching_instances: 1, interval: 'weekyear'});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 word per week for a total of 1 word');
      b.set('completion_settings', {instance_count: 1, word_instances: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 word per day at least once');
      b.set('completion_settings', {instance_count: 18, word_instances: 18, matching_units: 5, interval: 'biweekyear'});
      expect(b.get('completion_explanation')).toEqual('Use at least 18 words every two weeks for any 10 weeks');

      b.set('completion_settings', {watchlist: true, words_list: ['cat', 'sat', 'hat'], watch_type_count: 5, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 of the words "cat", "sat", or "hat" per day, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_type_count: 5, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" each day, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, words_list: ['cat', 'sat', 'hat'], watch_type_count: 5, watch_total: 6, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 of the words "cat", "sat", or "hat" at least 6 times per day, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, words_list: ['cat', 'sat', 'hat'], watch_type_count: 5, watch_total: 6, watch_type_minimum: 2, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 of the words "cat", "sat", or "hat" at least 6 times per day, with each word getting used at least 2 times, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, words_list: ['cat', 'sat', 'hat'], watch_type_count: 1, watch_total: 1, watch_type_minimum: 1, consecutive_units: 12, interval: 'biweekyear'});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 of the words "cat", "sat", or "hat" at least 1 time every two weeks, with each word getting used at least 1 time, for 24 weeks in a row');
      b.set('completion_settings', {watchlist: true, words_list: ['cat', 'sat', 'hat'], watch_type_count: 1, watch_total: 1, watch_type_minimum: 1, consecutive_units: 12, interval: 'biweekyear', watch_type_interval: 'biweekyear', watch_type_interval_count: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 of the words "cat", "sat", or "hat" at least 1 time every two weeks, with each word getting used at least 1 time (also use at least 4 different words from the list every two weeks), for 24 weeks in a row');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_type_count: 1, watch_type_minimum: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" each day, at least once');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_type_count: 1, watch_total: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" at least 1 time each day, at least once');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_total: 1, watch_type_minimum: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" at least 1 time each day, at least once');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_total: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" at least 1 time each day, at least once');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_type_count: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" each day, at least once');
      b.set('completion_settings', {watchlist: true, words_list: ['cat'], watch_type_minimum: 1, matching_units: 1, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word "cat" each day, at least once');

      b.set('completion_settings', {watchlist: true, parts_of_speech_list: ['noun', 'verb', 'adjective'], watch_type_count: 5, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 nouns, verbs, or adjectives per day, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, parts_of_speech_list: ['noun'], watch_type_count: 5, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use nouns each day, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, parts_of_speech_list: ['noun', 'verb'], watch_type_count: 5, watch_total: 6, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 nouns, or verbs at least 6 times per day, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, parts_of_speech_list: ['noun', 'verb'], watch_type_count: 5, watch_total: 6, watch_type_minimum: 2, consecutive_units: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 5 nouns, or verbs at least 6 times per day, with each speech type getting used at least 2 times, for 4 days in a row');
      b.set('completion_settings', {watchlist: true, parts_of_speech_list: ['noun', 'verb'], watch_type_count: 1, watch_total: 1, watch_type_minimum: 1, consecutive_units: 12, interval: 'biweekyear'});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 nouns, or verbs at least 1 time every two weeks, with each speech type getting used at least 1 time, for 24 weeks in a row');
      b.set('completion_settings', {watchlist: true, parts_of_speech_list: ['noun', 'verb'], watch_type_count: 1, watch_total: 1, watch_type_minimum: 1, consecutive_units: 12, interval: 'biweekyear', watch_type_interval: 'biweekyear', watch_type_interval_count: 4});
      expect(b.get('completion_explanation')).toEqual('Use at least 1 nouns, or verbs at least 1 time every two weeks, with each speech type getting used at least 1 time (also use at least 4 different speech types from the list every two weeks), for 24 weeks in a row');

      b.set('completion_settings', {watchlist: true, words_list: ['cuttlefish'], watch_total: 1, matching_instances: 3, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word \"cuttlefish\" at least 1 time each day, for a total of 3 times');
      b.set('completion_settings', {watchlist: true, words_list: ['cuttlefish'], matching_instances: 3, interval: 'date'});
      expect(b.get('completion_explanation')).toEqual('Use the word \"cuttlefish\" each day, for a total of 3 times');
    });
  });

  describe('best_next_badge', function() {
    it('should find the correct badge', function() {
      expect('test').toEqual('todo');
    });
  });

  describe('best_earned_badge', function() {
    it('should find the correct badge', function() {
      expect('test').toEqual('todo');
    });
  });
});
