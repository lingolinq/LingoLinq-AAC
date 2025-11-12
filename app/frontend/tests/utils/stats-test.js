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
import { fakeAudio } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from 'frontend/app';
import stats from '../../utils/stats';


describe('stats', function() {
  describe("no_data", function() {
    it("should return the right value", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('no_data')).toEqual(true);
      stats.set('total_sessions', 5);
      expect(stats.get('no_data')).toEqual(false);
    });
  });

  describe("popular_words", function() {
    it("should return an empty list if no words set", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('popular_words')).toEqual([]);
    });

    it("should return the top 100 words", function() {
      var stats = LingoLinq.Stats.create();
      stats.set('words_by_frequency', [{text: "a", count: 20}, {text: "b", count: 19}, {text: "c", count: 18}, {text: "d", count: 17}, {text: "e", count: 16}, {text: "f", count: 15}, {text: "g", count: 14}, {text: "h", count: 13}, {text: "i", count: 12}, {text: "j", count: 11}, {text: "k", count: 10}]);
      var res = stats.get('popular_words');
      expect(res.length).toEqual(11);
      expect(res[0].text).toEqual('a');
      expect(res[9].text).toEqual('j');
    });

    it("should not return top 100 words if they have a count <= 1", function() {
      var stats = LingoLinq.Stats.create();
      stats.set('words_by_frequency', [{text: "a", count: 20}, {text: "b", count: 19}, {text: "c", count: 18}, {text: "d", count: 1}, {text: "e", count: 1}, {text: "f", count: 1}, {text: "g", count: 1}, {text: "h", count: 1}, {text: "i", count: 1}, {text: "j", count: 1}, {text: "k", count: 1}]);
      var res = stats.get('popular_words');
      expect(res.length).toEqual(3);
      expect(res[0].text).toEqual('a');
      expect(res[2].text).toEqual('c');
    });

    it('should return modeling data if specified', function() {
      var stats = LingoLinq.Stats.create();
      stats.set('words_by_frequency', [{text: "a", count: 20}, {text: "b", count: 19}]);
      stats.set('modeled_words_by_frequency', [{text: "a", count: 20}, {text: "b", count: 19}, {text: "c", count: 18}, {text: "d", count: 17}, {text: "e", count: 16}, {text: "f", count: 15}, {text: "g", count: 14}, {text: "h", count: 13}, {text: "i", count: 12}, {text: "j", count: 11}, {text: "k", count: 10}]);
      var res = stats.get('popular_words');
      expect(res.length).toEqual(2);
      expect(res[0].text).toEqual('a');
      stats.set('modeling', true);
      var res = stats.get('popular_words');
      expect(res.length).toEqual(11);
      expect(res[0].text).toEqual('a');
      expect(res[9].text).toEqual('j');
    });
  });

  describe("weighted_words", function() {
    it("should return an empty list by default", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('weighted_words')).toEqual([]);
    });

    it("should return the list of words with their relative weighted classes", function() {
      var stats = LingoLinq.Stats.create();
      stats.set('words_by_frequency', [{text: "a", count: 20}, {text: "b", count: 19}, {text: "c", count: 18}, {text: "d", count: 17}, {text: "e", count: 16}, {text: "f", count: 15}, {text: "g", count: 14}, {text: "h", count: 13}, {text: "i", count: 12}, {text: "j", count: 11}, {text: "k", count: 10}]);
      var res = stats.get('weighted_words');
      expect(res.length).toEqual(11);
      expect(res[0].weight_class).toEqual("weighted_word weight_10");
      expect(res[3].weight_class).toEqual("weighted_word weight_9");
      expect(res[8].weight_class).toEqual("weighted_word weight_6");
    });

    it("should return the list of words in alphabetical order", function() {
      var stats = LingoLinq.Stats.create();
      stats.set('words_by_frequency', [{text: "b", count: 19}, {text: "f", count: 15}, {text: "C", count: 18}, {text: "e", count: 16}, {text: "d", count: 17}, {text: "g", count: 14}, {text: "h", count: 13}, {text: "i", count: 12}, {text: "j", count: 11}, {text: "k", count: 10}, {text: "a", count: 20}]);
      var res = stats.get('weighted_words');
      expect(res.length).toEqual(11);
      expect(res[0].text).toEqual('a');
      expect(res[1].text).toEqual('b');
      expect(res[2].text).toEqual('C');
      expect(res[3].text).toEqual('d');
      expect(res[4].text).toEqual('e');
      expect(res[5].text).toEqual('f');
    });

    it('should return modeling data if specified', function() {
      var stats = LingoLinq.Stats.create();
      stats.set('words_by_frequency', [{text: "b", count: 19}, {text: "f", count: 15}]);
      stats.set('modeled_words_by_frequency', [{text: "b", count: 19}, {text: "f", count: 15}, {text: "C", count: 18}, {text: "e", count: 16}, {text: "d", count: 17}, {text: "g", count: 14}, {text: "h", count: 13}, {text: "i", count: 12}, {text: "j", count: 11}, {text: "k", count: 10}, {text: "a", count: 20}]);
      var res = stats.get('weighted_words');
      expect(res.length).toEqual(2);
      expect(res[0].text).toEqual('b');
      expect(res[1].text).toEqual('f');
      stats.set('modeling', true);
      var res = stats.get('weighted_words');
      expect(res.length).toEqual(11);
      expect(res[0].text).toEqual('a');
      expect(res[1].text).toEqual('b');
      expect(res[2].text).toEqual('C');
      expect(res[3].text).toEqual('d');
      expect(res[4].text).toEqual('e');
      expect(res[5].text).toEqual('f');
    });
  });

  describe("geo_locations", function() {
    it("should return an empty list by default", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('geo_locations')).toEqual([]);
    });

    it("should return only the geo-typed results", function() {
      var stats = LingoLinq.Stats.create();
      stats.set('locations', [{type: 'geo'}, {type: 'ip_address'}, {type: 'geo'}]);
      expect(stats.get('geo_locations').length).toEqual(2);
    });
  });

  describe("ip_locations", function() {
    it("should return an empty list by default", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('ip_locations')).toEqual([]);
    });

    it("should return only the ip-typed results", function() {
      var stats = LingoLinq.Stats.create();
      stats.set('locations', [{type: 'geo'}, {type: 'ip_address'}, {type: 'geo'}]);
      expect(stats.get('ip_locations').length).toEqual(1);
    });
  });

  describe("local_time_blocks", function() {
    it("should return a complete list of blocks for the week", function() {
      var stats = LingoLinq.Stats.create();
      var blocks = stats.get('local_time_blocks');
      expect(blocks.length).toEqual(7);
      expect(blocks[0].day).toEqual('Su');
      expect(blocks[0].blocks.length).toEqual(24*2);
      expect(blocks[3].day).toEqual('W');
      expect(blocks[3].blocks.length).toEqual(24*2);

      stats.set('time_offset_blocks', {});
      var blocks = stats.get('local_time_blocks');
      expect(blocks.length).toEqual(7);
      expect(blocks[0].day).toEqual('Su');
      expect(blocks[0].blocks.length).toEqual(24*2);
      expect(blocks[3].day).toEqual('W');
      expect(blocks[3].blocks.length).toEqual(24*2);
    });

    it("should mark any non-zero blocks correctly", function() {
      var stats = LingoLinq.Stats.create();
      stub(stats, 'tz_offset', function() { return 300; });
      stats.set('time_offset_blocks', {161: 24, 184: 18, 366: 1, 368: 1, 369: 1, 502: 2});
      stats.set('max_time_block', 24);
      var blocks = stats.get('local_time_blocks');
      expect(blocks.length).toEqual(7);
      expect(blocks[0].day).toEqual('Su');
      expect(blocks[0].blocks.length).toEqual(24*2);
      expect(blocks[0].blocks[0]).toEqual({val: 0, tooltip: "", style_class: "time_block"});
      expect(blocks[1].blocks[22]).toEqual({val: 24, tooltip: "M 11:00, 24 events", style_class: "time_block level_5"});
      expect(blocks[1].blocks[34]).toEqual({val: 18, tooltip: "M 17:00, 18 events", style_class: "time_block level_4"});
      expect(blocks[3].blocks[29]).toEqual({val: 1, tooltip: "W 14:30, 1 event", style_class: "time_block level_1"});
      expect(blocks[3].blocks[30]).toEqual({val: 2, tooltip: "W 15:00, 2 events", style_class: "time_block level_1"});
      expect(blocks[5].blocks[1]).toEqual({val: 2, tooltip: "F 0:30, 2 events", style_class: "time_block level_1"});
    });

    it('should use modeling data if specified', function() {
      var stats = LingoLinq.Stats.create();
      stub(stats, 'tz_offset', function() { return 300; });
      stats.set('modeled_time_offset_blocks', {161: 24, 184: 18, 366: 1, 368: 1, 369: 1, 502: 2});
      stats.set('max_modeled_time_block', 24);
      stats.set('modeling', true);
      var blocks = stats.get('local_time_blocks');
      expect(blocks.length).toEqual(7);
      expect(blocks[0].day).toEqual('Su');
      expect(blocks[0].blocks.length).toEqual(24*2);
      expect(blocks[0].blocks[0]).toEqual({val: 0, tooltip: "", style_class: "time_block"});
      expect(blocks[1].blocks[22]).toEqual({val: 24, tooltip: "M 11:00, 24 events", style_class: "time_block level_5"});
      expect(blocks[1].blocks[34]).toEqual({val: 18, tooltip: "M 17:00, 18 events", style_class: "time_block level_4"});
      expect(blocks[3].blocks[29]).toEqual({val: 1, tooltip: "W 14:30, 1 event", style_class: "time_block level_1"});
      expect(blocks[3].blocks[30]).toEqual({val: 2, tooltip: "W 15:00, 2 events", style_class: "time_block level_1"});
      expect(blocks[5].blocks[1]).toEqual({val: 2, tooltip: "F 0:30, 2 events", style_class: "time_block level_1"});
    });
  });

  describe("start_date_field", function() {
    it("should return an empty string by default", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('start_date_field')).toEqual("");
    });

    it("should return just the date part of the iso8601 string", function() {
      var str = "2015-10-16T22:34:55.661Z";
      var stats = LingoLinq.Stats.create();
      stats.set('start_at', str);
      expect(stats.get('start_date_field')).toEqual("2015-10-16");
    });
  });

  describe("end_date_field", function() {
    it("should return an empty string by default", function() {
      var stats = LingoLinq.Stats.create();
      expect(stats.get('end_date_field')).toEqual("");
    });

    it("should return just the date part of the iso8601 string", function() {
      var str = "2015-10-16T22:34:55.661Z";
      var stats = LingoLinq.Stats.create();
      stats.set('end_at', str);
      expect(stats.get('end_date_field')).toEqual("2015-10-16");
    });
  });
});
