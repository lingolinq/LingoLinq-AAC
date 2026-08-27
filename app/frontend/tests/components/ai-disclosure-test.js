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
});
