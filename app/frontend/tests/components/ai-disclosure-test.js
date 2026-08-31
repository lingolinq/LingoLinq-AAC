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
import 'frontend/tests/helpers/ember_helper';
import persistence from '../../utils/persistence';

describe('ai-disclosure', function() {
  var component = null;

  beforeEach(function() {
    component = this.owner.factoryFor('component:ai-disclosure').create();
  });

  afterEach(function() {
    if(component && !component.isDestroyed) {
      component.destroy();
    }
    component = null;
  });

  it('should have a blank tagName (Ember Component with no wrapping element)', function() {
    expect(component.tagName).toEqual('');
  });

  describe("fetchDisclosure", function() {
    it('should show the offline fallback (never an empty modal) when persistence reports offline', function() {
      stub(persistence, 'get', function(key) {
        if(key === 'online') { return false; }
        return null;
      });
      component.set('loading', true);
      component.fetchDisclosure();
      expect(component.get('loading')).toEqual(false);
      expect(component.get('disclosure_html')).toEqual(null);
    });

    it('should show the offline fallback when the fetch itself fails', function() {
      stub(persistence, 'get', function(key) {
        if(key === 'online') { return true; }
        return null;
      });
      var reject = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(resolve, innerReject) {
          reject = innerReject;
        });
      });
      component.fetchDisclosure();
      expect(component.get('loading')).toEqual(true);
      reject({error: 'boom'});
      waitsFor(function() { return component.get('loading') === false; });
      runs(function() {
        expect(component.get('disclosure_html')).toEqual(null);
      });
    });

    it('should render the fetched notice fragment through the safe-html helper data when the fetch succeeds', function() {
      stub(persistence, 'get', function(key) {
        if(key === 'online') { return true; }
        return null;
      });
      var resolve = null;
      stub(persistence, 'ajax', function(url, opts) {
        // The fetch is locale-aware: config/locales/es.yml carries a full Spanish
        // translation and disclosures_controller reads params[:locale], so the URL
        // MUST carry the reader's locale or the Spanish notice is unreachable.
        // Assert the path plus the presence of the param rather than an exact
        // string, since the locale varies with the test browser.
        expect(url.split('?')[0]).toEqual('/ai_consent/disclosures/art50_v1');
        expect(url.indexOf('locale=') > -1).toEqual(true);
        expect(opts.type).toEqual('GET');
        return new RSVP.Promise(function(innerResolve) {
          resolve = innerResolve;
        });
      });
      component.fetchDisclosure();
      resolve('<div class="article50-disclosure">notice</div>');
      waitsFor(function() { return component.get('loading') === false; });
      runs(function() {
        expect(component.get('disclosure_html')).toEqual('<div class="article50-disclosure">notice</div>');
      });
    });

    it('should unwrap extras.js {text, meta} string wrapping and store the HTML fragment', function() {
      stub(persistence, 'get', function(key) {
        if(key === 'online') { return true; }
        return null;
      });
      var resolve = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(innerResolve) {
          resolve = innerResolve;
        });
      });
      component.fetchDisclosure();
      resolve({
        text: '<div class="article50-disclosure">notice</div>',
        meta: {fakeXHR: {status: 200}}
      });
      waitsFor(function() { return component.get('loading') === false; });
      runs(function() {
        expect(component.get('disclosure_html')).toEqual('<div class="article50-disclosure">notice</div>');
      });
    });

    it('should show the offline fallback when the fetch resolves to a non-string object without text', function() {
      stub(persistence, 'get', function(key) {
        if(key === 'online') { return true; }
        return null;
      });
      var resolve = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(innerResolve) {
          resolve = innerResolve;
        });
      });
      component.fetchDisclosure();
      resolve({meta: {}});
      waitsFor(function() { return component.get('loading') === false; });
      runs(function() {
        expect(component.get('disclosure_html')).toEqual(null);
      });
    });
  });

  describe("acknowledge action", function() {
    var user, modalService, closeCalls;

    beforeEach(function() {
      closeCalls = 0;
      user = EmberObject.create({id: '123', article_50_disclosure_shown: false});
      modalService = EmberObject.create({
        close: function() { closeCalls++; }
      });
      component.set('appState', {
        get: function(key) {
          if(key === 'currentUser') { return user; }
          return null;
        }
      });
      component.set('modal', modalService);
    });

    it('should NOT close the modal and should set ack_error on a failed acknowledgement write', function() {
      var reject = null;
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual('/api/v1/users/123/article_50_disclosure_ack');
        expect(opts.type).toEqual('POST');
        return new RSVP.Promise(function(resolve, innerReject) {
          reject = innerReject;
        });
      });
      component.send('acknowledge');
      reject({error: 'server error'});
      waitsFor(function() { return component.get('ack_error') === true; });
      runs(function() {
        expect(closeCalls).toEqual(0);
        expect(user.get('article_50_disclosure_shown')).toEqual(false);
        expect(component.get('acknowledging')).toEqual(false);
      });
    });

    it('POSTs to the backend global_id when the session record id is the self sentinel', function() {
      user = EmberObject.create({id: 'self', global_id: '1_24', article_50_disclosure_shown: false});
      component.set('appState', {
        get: function(key) {
          if(key === 'currentUser') { return user; }
          return null;
        }
      });
      var posted_url = null;
      stub(persistence, 'ajax', function(url) {
        posted_url = url;
        return RSVP.resolve({article_50_disclosure_shown: true, disclosures_version: 1});
      });
      component.send('acknowledge');
      waitsFor(function() { return posted_url !== null; });
      runs(function() {
        expect(posted_url).toEqual('/api/v1/users/1_24/article_50_disclosure_ack');
      });
    });

    it('should set ack_error and not POST when id is the self sentinel with no parked backend id', function() {
      user = EmberObject.create({id: 'self', article_50_disclosure_shown: false});
      component.set('appState', {
        get: function(key) {
          if(key === 'currentUser') { return user; }
          return null;
        }
      });
      var ajaxCalled = false;
      stub(persistence, 'ajax', function() {
        ajaxCalled = true;
        return RSVP.resolve({});
      });
      component.send('acknowledge');
      expect(ajaxCalled).toEqual(false);
      expect(component.get('ack_error')).toEqual(true);
      expect(closeCalls).toEqual(0);
    });

    it('should close the modal exactly once and mark the user shown on a successful acknowledgement write', function() {
      var resolve = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(innerResolve) {
          resolve = innerResolve;
        });
      });
      component.send('acknowledge');
      resolve({article_50_disclosure_shown: true, disclosures_version: 1});
      waitsFor(function() { return closeCalls === 1; });
      runs(function() {
        expect(user.get('article_50_disclosure_shown')).toEqual(true);
        expect(component.get('ack_error')).toEqual(false);
        expect(closeCalls).toEqual(1);
      });
    });
  });

  /* The acknowledgement must be RECORDED against the account that read the
     notice. users_controller#article_50_disclosure_ack marks whatever user
     params['user_id'] names, gated only by allowed?(user, 'edit') -- which a
     supporter normally passes over their communicator. So reading currentUser
     here wrote an audited Article 50 disclosure onto a communicator who never
     saw it, while the supporter who did stayed unacknowledged and kept
     collecting 403s from the server backstop. */
  describe("acknowledge action in speak mode (supporter modeling for a communicator)", function() {
    var supporter, communicator, modalService, closeCalls;

    beforeEach(function() {
      closeCalls = 0;
      // id: 'self' is the findRecord('user', 'self') load path. The URL must
      // use global_id, not .id — User.find_by_path('self') is a username lookup.
      supporter = EmberObject.create({id: 'self', global_id: 'supporter-1', article_50_disclosure_shown: false});
      communicator = EmberObject.create({id: 'communicator-9', article_50_disclosure_shown: false});
      modalService = EmberObject.create({
        close: function() { closeCalls++; }
      });
      component.set('appState', {
        get: function(key) {
          if(key === 'sessionUser') { return supporter; }
          if(key === 'currentUser') { return communicator; }
          return null;
        }
      });
      component.set('modal', modalService);
    });

    it('POSTs the acknowledgement to the authenticated supporter, not the communicator', function() {
      var posted_url = null;
      var resolve = null;
      stub(persistence, 'ajax', function(url) {
        posted_url = url;
        return new RSVP.Promise(function(innerResolve) { resolve = innerResolve; });
      });
      component.send('acknowledge');
      resolve({article_50_disclosure_shown: true, disclosures_version: 1});
      waitsFor(function() { return closeCalls === 1; });
      runs(function() {
        expect(posted_url).toEqual('/api/v1/users/supporter-1/article_50_disclosure_ack');
        expect(supporter.get('article_50_disclosure_shown')).toEqual(true);
        expect(communicator.get('article_50_disclosure_shown')).toEqual(false);
      });
    });
  });
});
