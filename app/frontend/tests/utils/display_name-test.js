import {
  describe,
  it,
  expect
} from 'frontend/tests/helpers/jasmine';
import { display_name_for, SERVER_PLACEHOLDER_NAME } from '../../utils/display_name';

// An Ember-Data-shaped record: reachable only through .get().
function record(attrs) {
  return {
    get: function(key) { return attrs[key]; }
  };
}

describe('display_name', function() {
  describe('display_name_for', function() {
    it('should return a real name unchanged', function() {
      expect(display_name_for({name: 'Ada Lovelace', user_name: 'ada'})).toEqual('Ada Lovelace');
    });

    it("should fall back to the handle when the server sent its placeholder", function() {
      expect(display_name_for({name: SERVER_PLACEHOLDER_NAME, user_name: 'ada'})).toEqual('ada');
    });

    it('should fall back to the handle when the name is absent or blank', function() {
      expect(display_name_for({user_name: 'ada'})).toEqual('ada');
      expect(display_name_for({name: '', user_name: 'ada'})).toEqual('ada');
      expect(display_name_for({name: '   ', user_name: 'ada'})).toEqual('ada');
    });

    it('should trim surrounding whitespace off a real name', function() {
      expect(display_name_for({name: '  Ada  ', user_name: 'ada'})).toEqual('Ada');
    });

    // The whole reason this is a shared function rather than a computed property:
    // limited_identity payloads (shared_users, utterance.user, the org roster)
    // arrive as plain objects, where a computed would never run.
    it('should work on a record and a plain payload alike', function() {
      expect(display_name_for(record({name: SERVER_PLACEHOLDER_NAME, user_name: 'ada'}))).toEqual('ada');
      expect(display_name_for(record({name: 'Ada Lovelace', user_name: 'ada'}))).toEqual('Ada Lovelace');
    });

    // Start codes render an org OR a user through the same slot. Orgs never carry
    // the sentinel and have no handle, so their name must survive.
    it('should return an organization name, which has no handle to fall back to', function() {
      expect(display_name_for({name: 'Springfield Schools'})).toEqual('Springfield Schools');
    });

    it('should never return null or undefined', function() {
      expect(display_name_for(null)).toEqual('');
      expect(display_name_for(undefined)).toEqual('');
      expect(display_name_for({})).toEqual('');
      // The sentinel must never survive to a human, even with no handle to use.
      expect(display_name_for({name: SERVER_PLACEHOLDER_NAME})).toEqual('');
    });
  });
});
