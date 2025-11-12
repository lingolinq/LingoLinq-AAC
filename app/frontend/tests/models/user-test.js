import DS from 'ember-data';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
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
import { } from 'frontend/tests/helpers/ember_helper';
import LingoLinq from '../../app';
import speecher from '../../utils/speecher';
import capabilities from '../../utils/capabilities';
import persistence from '../../utils/persistence';
import Utils from '../../utils/misc';
import { run as emberRun } from '@ember/runloop';

describe('User', function() {
  describe("avatar_url_with_fallback", function() {
    it("should key off avatar_url if defined", function() {
      var u = LingoLinq.store.createRecord('user', {avatar_url: "http://pic.example.com"});
      expect(u.get('avatar_url_with_fallback')).toEqual("http://pic.example.com");
    });
    it("should automatically check for locally-stored avatar data-uri on load", function() {
      var user = LingoLinq.store.createRecord('user');
      user.didLoad();
      expect(user.get('checked_for_data_url')).toEqual(true);
    });
  });

  describe("registration", function() {
    it("should clear password on successful registration");
  });

  describe('has_management_responsibility', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('has_management_responsibility')).toEqual(false);
      user.set('managed_orgs', [{}, {}]);
      expect(user.get('has_management_responsibility')).toEqual(true);
      user.set('managed_orgs', []);
      expect(user.get('has_management_responsibility')).toEqual(false);
    });
  });

  describe('is_sponsored', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('is_sponsored')).toEqual(false);
      user.set('organizations', []);
      expect(user.get('is_sponsored')).toEqual(false);
      user.set('organizations', [{type: 'user', sponsored: false}]);
      expect(user.get('is_sponsored')).toEqual(false);
      user.set('organizations', [{type: 'user', sponsored: false}, {type: 'user', sponsored: true}]);
      expect(user.get('is_sponsored')).toEqual(true);
    });
  });

  describe('is_managed', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('is_managed')).toEqual(false);
      user.set('organizations', []);
      expect(user.get('is_managed')).toEqual(false);
      user.set('organizations', [{type: 'manager'}]);
      expect(user.get('is_managed')).toEqual(false);
      user.set('organizations', [{type: 'manager'}, {type: 'user'}]);
      expect(user.get('is_managed')).toEqual(true);
    });
  });

  describe('managing_org', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('managing_org')).toEqual(undefined);
      user.set('organizations', []);
      expect(user.get('managing_org')).toEqual(undefined);
      user.set('organizations', [{type: 'user', id: '123'}]);
      expect(user.get('managing_org.id')).toEqual('123');
    });
  });

  describe('manages_multiple_orgs', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('manages_multiple_orgs')).toEqual(false);
      user.set('organizations', [{type: 'manager'}]);
      expect(user.get('manages_multiple_orgs')).toEqual(false);
      user.set('organizations', [{type: 'manager'}, {type: 'manager'}]);
      expect(user.get('manages_multiple_orgs')).toEqual(true);
    });
  });

  describe('managed_orgs', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('managed_orgs')).toEqual([]);
      user.set('organizations', [{type: 'user'}, {type: 'manager', id: '123'}]);
      expect(user.get('managed_orgs').length).toEqual(1);
    });
  });

  describe('managing_supervision_orgs', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('managing_supervision_orgs')).toEqual([]);
      user.set('organizations', [{type: 'user'}, {type: 'manager'}, {type: 'supervisor'}, {type: 'supervisor'}]);
      expect(user.get('managing_supervision_orgs').length).toEqual(2);
    });
  });

  describe('pending_org', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('pending_org')).toEqual(undefined);
      user.set('organizations', []);
      expect(user.get('pending_org')).toEqual(undefined);
      user.set('organizations', [{type: 'user'}]);
      expect(user.get('pending_org')).toEqual(undefined);
      user.set('organizations', [{type: 'user', pending: true, id: '123'}]);
      expect(user.get('pending_org.id')).toEqual('123');
    });
  });

  describe('pending_supervision_org', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('pending_supervision_org')).toEqual(undefined);
      user.set('organizations', []);
      expect(user.get('pending_supervision_org')).toEqual(undefined);
      user.set('organizations', [{type: 'supervisor', pending: true, id: '123'}]);
      expect(user.get('pending_supervision_org.id')).toEqual('123');
    });
  });

  describe('supervisor_names', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('supervisor_names')).toEqual("");
      user.set('supervisors', [{name: 'fred'}, {name: 'sam'}]);
      expect(user.get('supervisor_names')).toEqual("fred, sam");
      user.set('is_managed', true);
      user.set('managing_org', {name: 'cool'});
      expect(user.get('supervisor_names')).toEqual("cool, fred, sam");
    });
  });

  describe('supervisee_names', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('supervisee_names')).toEqual("");
      user.set('supervisees', [{name: 'susy'}, {name: 'jeb'}]);
      expect(user.get('supervisee_names')).toEqual("susy, jeb");
    });
  });

  describe('parsed_notifications', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('parsed_notifications')).toEqual([]);
      user.set('notifications', [{type: 'friend', occurred_at: '2016-01-01'}, {type: 'hat', occurred_at: '2016-01-02'}]);
      expect(user.get('parsed_notifications')).toEqual([
        {type: 'friend', friend: true, occurred_at: 1451606400000 },
        {type: 'hat', hat: true, occurred_at: 1451692800000 }
      ]);
    });
  });

  describe('using_for_a_while', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('using_for_a_while')).toEqual(false);
      user.set('joined', window.moment('2015-01-01').toISOString().substring(0, 10));
      expect(user.get('using_for_a_while')).toEqual(true);
    });
  });

  describe('currently_premium', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('currently_premium')).toEqual(false);
      user.set('expired', true);
      expect(user.get('currently_premium')).toEqual(false);
      user.set('free_premium', true);
      expect(user.get('currently_premium')).toEqual(false);
      user.set('expired', false);
      expect(user.get('currently_premium')).toEqual(false);
      user.set('free_premium', false);
      expect(user.get('currently_premium')).toEqual(true);
    });
  });

  describe('free_premium', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('free_premium')).toEqual(false);
      user.set('subscription', {free_premium: false});
      expect(user.get('free_premium')).toEqual(false);
      user.set('subscription', {free_premium: true});
      expect(user.get('free_premium')).toEqual(true);
    });
  });

  describe('expired', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('expired')).toEqual(true);
      user.set('membership_type', 'premium');
      expect(user.get('expired')).toEqual(false);
      user.set('subscription', {expires: '2020-01-01'});
      expect(user.get('expired')).toEqual(false);
      user.set('subscription', {expires: '2010-01-01'});
      expect(user.get('expired')).toEqual(true);
    });
  });

  describe('expired_or_limited_supervisor', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
      user.set('expired', false);
      expect(user.get('expired_or_limited_supervisor')).toEqual(false);
      user.set('subscription', {limited_supervisor: true});
      expect(user.get('expired_or_limited_supervisor')).toEqual(true);
    });
  });

  describe('joined_withing_24_hours', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('joined_within_24_hours')).toEqual(false);
      user.set('joined', window.moment());
      expect(user.get('joined_within_24_hours')).toEqual(true);
    });
  });

  describe('really_expired', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('really_expired')).toEqual(false);
      user.set('subscription', {expires: '2015-01-01'});
      expect(user.get('really_expired')).toEqual(true);
    });
  });

  describe('really_really_expired', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('really_really_expired')).toEqual(false);
      user.set('subscription', {expires: '2010-01-01'});
      expect(user.get('really_really_expired')).toEqual(true);
    });
  });

  describe('expired_or_grace_period', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('expired_or_grace_period')).toEqual(true);
      user.set('expired', false);
      expect(user.get('expired_or_grace_period')).toEqual(false);
      user.set('subscription', {grace_period: true});
      expect(user.get('expired_or_grace_period')).toEqual(true);
    });
  });

  describe('supporter_role', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('supporter_role')).toEqual(false);
      user.set('preferences', {role: 'supporter'});
      expect(user.get('supporter_role')).toEqual(true);
      user.set('preferences', {role: 'communicator'});
      expect(user.get('supporter_role')).toEqual(false);
    });
  });

  describe('profile_url', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user', {user_name: 'bacon'});
      expect(user.get('profile_url')).toEqual(location.protocol + "//" + location.host + "/bacon");
    });
  });

  describe('multiple_devices', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('multiple_devices')).toEqual(false);
      user.set('devices', []);
      expect(user.get('multiple_devices')).toEqual(false);
      user.set('devices', [{}]);
      expect(user.get('multiple_devices')).toEqual(false);
      user.set('devices', [{}, {}]);
      expect(user.get('multiple_devices')).toEqual(true);
    });
  });

  describe('device_count', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('device_count')).toEqual(0);
      user.set('devices', []);
      expect(user.get('device_count')).toEqual(0);
      user.set('devices', [{}]);
      expect(user.get('device_count')).toEqual(1);
      user.set('devices', [{}, {}]);
      expect(user.get('device_count')).toEqual(2);
    });
  });

  describe('current_device_name', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('current_device_name')).toEqual('Unknown device');
      user.set('devices', [{current_device: false, id: '123'}, {current_device: true, name: '234'}]);
      expect(user.get('current_device_name')).toEqual('234');
    });
  });

  describe('hide_symbols', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('hide_symbols')).toEqual(false);
      user.set('preferences', {device: {button_text: 'asdf'}});
      expect(user.get('hide_symbols')).toEqual(false);
      user.set('preferences', {device: {button_text: 'text_only'}});
      expect(user.get('hide_symbols')).toEqual(true);
    });
  });

  describe('remove_device', function() {
    it('should remove correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('user_name', 'bobbyo');
      user.set('devices', [{id: '1234'}, {id: '2345'}, {id: '3456'}]);
      stub(persistence, 'ajax', function(url, args) {
        expect(url).toEqual('/api/v1/users/bobbyo/devices/1234');
        expect(args.type).toEqual('POST');
        expect(args.data._method).toEqual('DELETE');
        return RSVP.resolve();
      });
      user.remove_device('1234');
      waitsFor(function() { return user.get('devices').length == 2; });
      runs();
    });
  });

  describe('rename_device', function() {
    it('should rename correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('user_name', 'bobbyo');
      user.set('devices', [{id: '1234'}, {id: '2345'}, {id: '3456'}]);
      stub(persistence, 'ajax', function(url, args) {
        expect(url).toEqual('/api/v1/users/bobbyo/devices/1234');
        expect(args.type).toEqual('POST');
        expect(args.data._method).toEqual('PUT');
        return RSVP.resolve({id: '1234', name: 'chicken nuggets'});
      });
      user.rename_device('1234', 'chicken nuggets');
      waitsFor(function() { return user.get('devices')[0].name == 'chicken nuggets'; });
      runs();
    });
  });

  describe('sidebar_boards_with_fallbacks', function() {
    it('should return the correct value', function() {
      var user = LingoLinq.store.createRecord('user');
      expect(user.get('sidebar_boards_with_fallbacks')).toEqual([]);
      var resolves = 0;
      stub(persistence, 'find_url', function(url, type) {
        if(url == 'http://www.example.com/pic.png' && type == 'image') {
          resolves++;
          return RSVP.resolve('data:stuff');
        } else if(url == 'http://www.example.com/pic2.png' && type == 'image') {
          resolves++;
          return RSVP.resolve('data:stuff2');
        } else {
          return RSVP.reject();
        }
      });
      user.set('preferences', {sidebar_boards: [
        {image: 'http://www.example.com/pic.png'},
        {image: 'http://www.example.com/pic2.png'}
      ]});
      user.get('sidebar_boards_with_fallbacks');
      waitsFor(function() { return user.get('sidebar_boards_with_fallbacks')[0].get('image') == 'data:stuff'; });
      runs(function() {
        expect(user.get('sidebar_boards_with_fallbacks').length).toEqual(2);
        expect(user.get('sidebar_boards_with_fallbacks')[0].get('image')).toEqual('data:stuff');
        expect(user.get('sidebar_boards_with_fallbacks')[1].get('image')).toEqual('data:stuff2');
      });
    });
  });

  describe('checkForDataURL', function() {
    it("should check correctly", function() {
      var user = LingoLinq.store.createRecord('user');
      stub(persistence, 'find_url', function(url, type) {
        if(url == 'http://www.example.com' && type == 'image') {
          return RSVP.resolve('data:stuff');
        } else {
          return RSVP.reject();
        }
      });
      user.set('avatar_url', 'http://www.example.com');
      expect(user.get('checked_for_data_url')).toEqual(true);
      waitsFor(function() { return user.get('avatar_data_uri'); });
      runs(function() {
        expect(user.get('avatar_data_uri')).toEqual('data:stuff');
      });
    });
  });

  describe('validate_pin', function() {
    it("should validate correctly", function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('preferences', {speak_mode_pin: '1234'});
      expect(user.get('preferences.speak_mode_pin')).toEqual('1234');
      user.set('preferences', {speak_mode_pin: '123456'});
      expect(user.get('preferences.speak_mode_pin')).toEqual('1234');
      user.set('preferences', {speak_mode_pin: 'a1b2c34'});
      expect(user.get('preferences.speak_mode_pin')).toEqual('1234');
    });
  });

  describe('load_active_goals', function() {
    it("should load correctly", function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('id', '1234');
      stub(user.store, 'query', function(type, args) {
        expect(type).toEqual('goal');
        expect(args).toEqual({active: true, user_id: '1234'});
        return RSVP.resolve({
          map: function() {
            return [
              EmberObject.create({id: '5'}),
              EmberObject.create({id: '2'}),
              EmberObject.create({id: '6', primary: true}),
              EmberObject.create({id: '4'}),
              EmberObject.create({id: '1'}),
              EmberObject.create({id: '3'})
            ];
          }
        });
      });
      user.load_active_goals();
      waitsFor(function() { return user.get('active_goals'); });
      runs(function() {
        expect(user.get('active_goals')[0].id).toEqual('6');
        expect(user.get('active_goals')[1].id).toEqual('1');
        expect(user.get('active_goals')[2].id).toEqual('2');
        expect(user.get('active_goals')[3].id).toEqual('3');
        expect(user.get('active_goals')[4].id).toEqual('4');
        expect(user.get('active_goals')[5].id).toEqual('5');
      });
    });
  });

  describe('check_user_name', function() {
    it("should check correctly", function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('user_name', 'bob');
      user.check_user_name();
      expect(user.get('user_name_check')).toEqual(undefined);
      var searched = false;
      stub(user.store, 'findRecord', function(type, key) {
        expect(type).toEqual('user');
        expect(key).toEqual('bob');
        searched = true;
        return RSVP.reject();
      });
      user.set('watch_user_name_and_cookies', true);
      expect(user.get('user_name_check.checking')).toEqual(true);
      waitsFor(function() { return user.get('user_name_check.exists') === false; });
      runs(function() {
      });
    });

    it("should mark found results as existing", function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('user_name', 'bob');
      user.set('id', '1234');
      user.check_user_name();
      expect(user.get('user_name_check')).toEqual(undefined);
      var searched = false;
      stub(user.store, 'findRecord', function(type, key) {
        expect(type).toEqual('user');
        expect(key).toEqual('bob');
        searched = true;
        return RSVP.resolve(EmberObject.create({}));
      });
      user.set('watch_user_name_and_cookies', true);
      expect(user.get('user_name_check.checking')).toEqual(true);
      waitsFor(function() { return user.get('user_name_check.exists') === true; });
      runs(function() {
      });
    });
  });

  describe('update_voice_uri', function() {
    it('should update correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      stub(speecher, 'get', function() {
        return [{voiceURI: 'happy'}, {voiceURI: 'sad'}];
      });
      expect(user.get('preferences.device.voice.voice_uri')).toEqual(undefined);
      user.set('preferences', {device: {voice: {voice_uris: ['sad', 'friend']}}});
      expect(user.get('preferences.device.voice.voice_uri')).toEqual('sad');
    });

    it('should update alternate voice correctly', function() {
      var user = LingoLinq.store.createRecord('user');
      stub(speecher, 'get', function() {
        return [{voiceURI: 'happy'}, {voiceURI: 'sad'}];
      });
      expect(user.get('preferences.device.alternate_voice.voice_uri')).toEqual(undefined);
      user.set('preferences', {device: {alternate_voice: {voice_uris: ['sad', 'friend']}}});
      expect(user.get('preferences.device.alternate_voice.voice_uri')).toEqual('sad');
      user.set('preferences.device.alternate_voice.voice_uri', 'bacon');
      expect(user.get('preferences.device.alternate_voice.voice_uri')).toEqual('sad');
      user.set('preferences.device.alternate_voice.voice_uri', 'happy');
      expect(user.get('preferences.device.alternate_voice.voice_uri')).toEqual('happy');
    });
  });

  describe('load_all_connections', function() {
    it('should not load anything if there are not already records', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('load_all_connections', true);
      waitsFor(function() { return user.get('all_connections.loaded'); });
      runs(function() {
        expect(user.get('supervisors')).toEqual(undefined);
      });
    });

    it('should load supervisors if it is possible there are more', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('id', 'bob');
      user.set('supervisors', [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/bob/supervisors') {
          return RSVP.resolve({
            user: [{}]
          });
        } else {
          return RSVP.reject();
        }
      });
      user.set('load_all_connections', true);
      waitsFor(function() { return user.get('all_connections.loaded'); });
      runs(function() {
        expect(user.get('supervisors').length).toEqual(1);
      });
    });

    it('should load supervisees if it is possible there are more', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('id', 'bob');
      user.set('supervisees', [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/bob/supervisees') {
          return RSVP.resolve({
            user: [{}]
          });
        } else {
          return RSVP.reject();
        }
      });
      user.set('load_all_connections', true);
      waitsFor(function() { return user.get('all_connections.loaded'); });
      runs(function() {
        expect(user.get('supervisees').length).toEqual(1);
      });
    });

    it('should flag as errored on any load error', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('id', 'bob');
      user.set('supervisees', [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      user.set('supervisors', [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/bob/supervisees') {
          return RSVP.resolve({
            user: [{}]
          });
        } else {
          return new RSVP.Promise(function(res, rej) {
            setTimeout(function() {
              rej();
            }, 200);
          });
        }
      });
      user.set('load_all_connections', true);
      waitsFor(function() { return user.get('all_connections.error'); });
      runs(function() {
        expect(user.get('supervisees').length).toEqual(1);
        expect(user.get('all_connections.loaded')).toEqual(undefined);
        expect(user.get('supervisors').length).toEqual(10);
      });
    });

    it('should flag as done when everything is loaded', function() {
      var user = LingoLinq.store.createRecord('user');
      user.set('id', 'bob');
      user.set('supervisees', [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      user.set('supervisors', [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}]);
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/users/bob/supervisees') {
          return RSVP.resolve({
            user: [{}]
          });
        } else if(url == '/api/v1/users/bob/supervisors') {
          return RSVP.resolve({
            user: [{}, {}]
          });
        } else {
          return RSVP.reject();
        }
      });
      user.set('load_all_connections', true);
      waitsFor(function() { return user.get('all_connections.loaded'); });
      runs(function() {
        expect(user.get('supervisees').length).toEqual(1);
        expect(user.get('supervisors').length).toEqual(2);
      });
    });
  });

  describe("check_integrations", function() {
    it('should do nothing if no supervise permission', function() {
      var u = LingoLinq.store.createRecord('user');
      var called = false;
      stub(Utils, 'all_pages', function() {
        called = true;
        return RSVP.reject();
      });
      var rejected = false;
      u.check_integrations().then(null, function() { rejected = true; });
      waitsFor(function() { return rejected; });
      runs(function() {
        expect(called).toEqual(false);
      });
    });

    it('should lookup if supervise permission changes', function() {
      var u = LingoLinq.store.createRecord('user');
      var called = false;
      stub(Utils, 'all_pages', function() {
        called = true;
        return RSVP.reject();
      });
      var rejected = false;
      u.check_integrations().then(null, function() { rejected = true; });
      var updated = false;
      waitsFor(function() { return rejected; });
      runs(function() {
        expect(called).toEqual(false);
        updated = true;
        u.set('permissions', {supervise: true});
      });
      waitsFor(function() { return updated && called; });
      runs();
    });

    it('should return the promise if defined', function() {
      var u = LingoLinq.store.createRecord('user', {id: 'asdf', permissions: {supervise: true}});
      LingoLinq.User.integrations_for = {asdf: null};
      var called = false;
      stub(Utils, 'all_pages', function() {
        called = true;
        return RSVP.reject();
      });
      LingoLinq.User.integrations_for = {asdf: {promise: 'asdf'}};
      var res = u.check_integrations();
      expect(res).toEqual('asdf');
      expect(called).toEqual(false);
    });

    it('should return the result if not set to reload and already loaded', function() {
      var u = LingoLinq.store.createRecord('user', {id: 'asdf', permissions: {supervise: true}});
      u.set('integrations', null);
      var called = false;
      stub(Utils, 'all_pages', function() {
        called = true;
        return RSVP.reject();
      });
      LingoLinq.User.integrations_for = {asdf: []};
      var result = null;
      u.check_integrations().then(function(res) { result = res; });
      waitsFor(function() { return result; });
      runs(function() {
        expect(called).toEqual(false);
        expect(result).toEqual([]);
      });
    });

    it('should look up if forced to and data already there', function() {
      var u = LingoLinq.store.createRecord('user', {id: 'asdf', permissions: {supervise: true}});
      LingoLinq.User.integrations_for = {asdf: null};
      var called = false;
      stub(Utils, 'all_pages', function() {
        called = true;
        return RSVP.reject();
      });
      var error = null;
      u.check_integrations(true).then(null, function(err) {
        error = err;
      });
      waitsFor(function() { return error; });
      runs(function() {
        expect(called).toEqual(true);
        expect(error).toEqual({error: 'error retrieving integrations'});
        expect(LingoLinq.User.integrations_for['asdf']).toEqual({error: true});
      });
    });

    it('should lookup if no data already there', function() {
      var called = false;
      stub(Utils, 'all_pages', function() {
        called = true;
        return RSVP.resolve('asdf');
      });
      var u = LingoLinq.store.createRecord('user', {id: 'asdf', permissions: {supervise: true}});
      LingoLinq.User.integrations_for = {asdf: null};
      var result = null;
      u.check_integrations().then(function(res) { result = res; });
      waitsFor(function() { return result; });
      runs(function() {
        expect(called).toEqual(true);
        expect(result).toEqual('asdf');
      });
      waitsFor(function() { return LingoLinq.User.integrations_for['asdf'] == 'asdf'; });
      runs();
    });
  });

  describe("find_integration", function() {
    it('should wait on the existing promise if defined', function() {
      var u = LingoLinq.store.createRecord('user', {id: 'asdf'});
      LingoLinq.User.integrations_for = {'asdf': RSVP.reject('no way')};
      var error = null;
      u.find_integration('bacon').then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual('no way');
      });
    });

    it('should resolve on found record', function() {
      var u = LingoLinq.store.createRecord('user', {id: 'asdf'});
      LingoLinq.User.integrations_for = {'asdf': RSVP.resolve([EmberObject.create(), EmberObject.create({template_key: 'bacon'})])};
      var result = null;
      u.find_integration('bacon').then(function(res) { result = res; });
      waitsFor(function() { return result; });
      runs(function() {
        expect(result.get('template_key')).toEqual('bacon');
      });
    });

    it('should error if the waiting promise fails', function() {
      var u = LingoLinq.store.createRecord('user', {id: 'asdf'});
      LingoLinq.User.integrations_for = {'asdf': RSVP.reject('no way')};
      var error = null;
      u.find_integration('bacon').then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual('no way');
      });
    });

    it('should error if no integration found', function() {
      var u = LingoLinq.store.createRecord('user');
      stub(LingoLinq.User, 'check_integrations', function() {
        return RSVP.resolve([EmberObject.create({template_key: 'chicken'}), EmberObject.create()]);
      });
      var error = null;
      u.find_integration('bacon').then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual({error: 'no matching integration found'});
      });
    });

    it('should also check for supervisee permission if possible', function() {
      expect('test').toEqual('todo');
    });
  });

  describe('auto_sync', function() {
    it('should set the right values', function() {
      var u = LingoLinq.store.createRecord('user');
      capabilities.installed_app = true;
      expect(u.get('auto_sync')).toEqual(true);
      capabilities.installed_app = false;
      expect(u.get('auto_sync')).toEqual(true);
      u.set('preferences', {device: {'ever_synced': false}});
      expect(u.get('auto_sync')).toEqual(false);
      u.set('preferences.device.ever_synced', true);
      expect(u.get('auto_sync')).toEqual(true);

      capabilities.installed_app = true;
      u.set('preferences.device.ever_synced', false);
      expect(u.get('auto_sync')).toEqual(true);

      u.set('preferences.device.auto_sync', false);
      expect(u.get('auto_sync')).toEqual(false);
      u.set('preferences.device.auto_sync', true);
      expect(u.get('auto_sync')).toEqual(true);
      u.set('preferences.device.ever_synced', false);
      expect(u.get('auto_sync')).toEqual(true);
    });
  });

  describe('load_button_sets', function() {
    it('should return a promise', function() {
      var u = LingoLinq.store.createRecord('user');
      var res = u.load_button_sets();
      expect(res.then).toNotEqual(undefined);
      res.then(null, function() { });
    });

    it('should return all button sets on success', function() {
      var u = LingoLinq.store.createRecord('user');
      u.set('preferences', {home_board: {id: 'asdf'}, sidebar_boards: [{key: 'asdf/qwer'}, {key: 'asdf/zxcv'}]});
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'buttonset' && id == 'asdf') {
          return RSVP.resolve('one');
        } else if(type == 'buttonset' && id == 'asdf/qwer') {
          return RSVP.resolve('two');
        } else if(type == 'buttonset' && id == 'asdf/zxcv') {
          return RSVP.resolve('three');
        } else {
          return RSVP.reject();
        }
      });
      var list = null;
      u.load_button_sets().then(function(l) { list = l; });
      waitsFor(function() { return list; });
      runs(function() {
        expect(list).toEqual(['one', 'two', 'three']);
      });
    });

    it('should error on failing to retrieve any button set', function() {
      var u = LingoLinq.store.createRecord('user');
      u.set('preferences', {home_board: {id: 'asdf'}, sidebar_boards: [{key: 'asdf/qwer'}, {key: 'asdf/zxcv'}]});
      stub(LingoLinq.store, 'findRecord', function(type, id) {
        if(type == 'buttonset' && id == 'asdf') {
          return RSVP.resolve('one');
        } else if(type == 'buttonset' && id == 'asdf/zxcv') {
          return RSVP.resolve('three');
        } else {
          return RSVP.reject();
        }
      });
      var error = null;
      u.load_button_sets().then(null, function(e) { error = true; });
      waitsFor(function() { return error; });
      runs();
    });
  });

  describe('find_button', function() {
    it('should return a promise', function() {
      var u = LingoLinq.store.createRecord('user');
      stub(u, 'load_button_sets', function() { return RSVP.reject(); });
      var res = u.find_button('bacon');
      expect(res.then).toNotEqual(undefined);
      res.then(null, function() { });
    });

    it('should error if load_button_sets fails', function() {
      var u = LingoLinq.store.createRecord('user');
      stub(u, 'load_button_sets', function() { return RSVP.reject(); });
      var res = u.find_button('bacon');
      var error = null;
      res.then(null, function() { error = true; });
      waitsFor(function() { return error; });
      runs();
    });

    it('should return the earliest exact match', function() {
      var u = LingoLinq.store.createRecord('user');
      var list1 = {};
      stub(list1, 'find_buttons', function(label) {
        expect(label).toEqual('bacon');
        return RSVP.resolve([{label: 'bacons', id: 1}]);
      });
      var list2 = {};
      stub(list2, 'find_buttons', function(label) {
        expect(label).toEqual('bacon');
        return new RSVP.Promise(function(res, rej) {
          emberRun.later(function() {
            res([{label: 'baking', id: 2.1}, {label: 'Bacon', id: 2}]);
          }, 100);
        });
      });
      var list3 = {};
      stub(list3, 'find_buttons', function(label) {
        expect(label).toEqual('bacon');
        return RSVP.resolve([{label: 'bacon', id: 3}]);
      });
      stub(u, 'load_button_sets', function() {
        return RSVP.resolve([list1, list2, list3]);
      });
      var button = null;
      u.find_button('bacon').then(function(res) { button = res; });
      waitsFor(function() { return button; });
      runs(function() {
        expect(button.id).toEqual(2);
      });
    });

    it('should error if no matches found', function() {
      var u = LingoLinq.store.createRecord('user');
      var list1 = {};
      stub(list1, 'find_buttons', function(label) {
        expect(label).toEqual('bacon');
        return RSVP.resolve([{label: 'bacons', id: 1}]);
      });
      var list2 = {};
      stub(list2, 'find_buttons', function(label) {
        expect(label).toEqual('bacon');
        return new RSVP.Promise(function(res, rej) {
          emberRun.later(function() {
            res([{label: 'baking', id: 2.1}, {label: 'Bacon!', id: 2}]);
          }, 100);
        });
      });
      var list3 = {};
      stub(list3, 'find_buttons', function(label) {
        expect(label).toEqual('bacon');
        return RSVP.resolve([{label: 'bracon', id: 3}]);
      });
      stub(u, 'load_button_sets', function() {
        return RSVP.resolve([list1, list2, list3]);
      });
      var error = null;
      u.find_button('bacon').then(null, function(e) { error = e; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual({error: 'no exact matches found'});
      });
    });
  });
});
