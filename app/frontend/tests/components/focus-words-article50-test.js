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
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';

/**
 * Regression coverage for the EU AI Act Article 50(1) gate on the AI focus-word
 * generator.
 *
 * Before this, focus-words was the one AI ingress of five with no client-side
 * gate. The server-side backstop refused correctly (403
 * `article_50_disclosure_required`), but the failure handler assigned
 * `msg = resp.error` straight into `ai_generate_error`, which focus-words.hbs
 * renders verbatim -- so an EU or unknown-jurisdiction user saw the raw,
 * untranslated token `article_50_disclosure_required` in an alert with no way to
 * acknowledge from that screen.
 *
 * The two behaviours worth locking down are (a) no request is dispatched at all
 * when acknowledgement is needed, and (b) if the server refuses anyway (stale
 * client record), the raw error code never reaches the user.
 */
describe('focus-words Article 50 gate', function() {
  var component = null;
  var ajaxCalls = null;

  function makeUser(attrs) {
    return EmberObject.create(Object.assign({
      id: '1_1',
      article_50_disclosure_required: false,
      article_50_disclosure_shown: false
    }, attrs || {}));
  }

  function setAppState(flagOn, user) {
    // Has to satisfy BOTH access styles the code actually uses, because they do
    // not resolve the same way: article50_gate calls appState.get('currentUser')
    // explicitly, while the component reads the Ember path
    // this.get('appState.currentUser'), and Ember's path get on a plain object
    // is a property lookup -- it never calls the object's own .get(). A stub with
    // only .get() silently hands the component `undefined` for currentUser.
    component.set('appState', {
      currentUser: user,
      feature_flags: {article_50_disclosure: flagOn},
      get: function(key) {
        if(key === 'feature_flags.article_50_disclosure') { return flagOn; }
        if(key === 'currentUser') { return user; }
        return null;
      }
    });
  }

  beforeEach(function() {
    ajaxCalls = [];
    component = this.owner.factoryFor('component:focus-words').create();
    stub(persistence, 'get', function(key) {
      if(key === 'online') { return true; }
      return null;
    });
  });

  afterEach(function() {
    if(component && !component.isDestroyed) { component.destroy(); }
    component = null;
  });

  describe('pre-request gate', function() {
    it('does NOT dispatch the generate request when acknowledgement is needed, and opens the disclosure instead', function() {
      var opened = [];
      stub(persistence, 'ajax', function(url) {
        ajaxCalls.push(url);
        return RSVP.resolve({});
      });
      stub(modal, 'open', function(template, opts) {
        opened.push({template: template, opts: opts});
        return RSVP.resolve({});
      });
      setAppState(true, makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false
      }));
      component.set('model', {board: 'b1'});
      component.set('ai_prompt', 'the grinch');
      component.set('ai_word_count', 12);

      component.send('generate_focus_words_with_ai');

      // The whole point: no prompt reaches the provider.
      expect(ajaxCalls.length).toEqual(0);
      expect(component.get('ai_generating')).toEqual(false);
      expect(opened.length).toEqual(1);
      expect(opened[0].template).toEqual('ai-disclosure');
      // Opened scannable so switch-scanning users can reach the acknowledge
      // control (the modal.js scanner selector only walks .modal_targets).
      expect(opened[0].opts.scannable).toEqual(true);
    });

    it('re-opens focus-words with the typed description and count restored after acknowledgement', function() {
      var opened = [];
      stub(persistence, 'ajax', function(url) {
        ajaxCalls.push(url);
        return RSVP.resolve({});
      });
      stub(modal, 'open', function(template, opts) {
        opened.push({template: template, opts: opts});
        // ai-disclosure resolves with no `replaced` marker on a genuine ack.
        return RSVP.resolve({});
      });
      setAppState(true, makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false
      }));
      component.set('model', {board: 'b1'});
      component.set('ai_prompt', 'fractions lesson');
      component.set('ai_word_count', 30);

      component.send('generate_focus_words_with_ai');

      waitsFor(function() { return opened.length > 1; });
      runs(function() {
        var reopen = opened[1];
        expect(reopen.template).toEqual('modals/focus-words');
        // Original modal settings are preserved, not dropped on the floor.
        expect(reopen.opts.board).toEqual('b1');
        // And the user does not lose what they typed.
        expect(reopen.opts.art50_resume.ai_prompt).toEqual('fractions lesson');
        expect(reopen.opts.art50_resume.ai_word_count).toEqual(30);
      });
    });

    it('carries the re-use selection, list name, and words through the gate too', function() {
      var opened = [];
      stub(persistence, 'ajax', function(url) {
        ajaxCalls.push(url);
        return RSVP.resolve({});
      });
      stub(modal, 'open', function(template, opts) {
        opened.push({template: template, opts: opts});
        return RSVP.resolve({});
      });
      setAppState(true, makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false
      }));
      component.set('model', {board: 'b1'});
      component.set('ai_prompt', 'fractions lesson');
      component.set('ai_word_count', 30);
      // "Save for Re-Use" and its "Word List Name" input render on the same view
      // as the AI panel, so all of this can be filled in when the gate fires.
      component.set('reuse', true);
      component.set('title', 'Fractions Unit');
      component.set('words', 'half, third, quarter');
      component.set('existing', true);
      component.set('focus_id', 'set_9');
      component.set('ai_focus_word_set_id', 'lib_7');

      component.send('generate_focus_words_with_ai');

      waitsFor(function() { return opened.length > 1; });
      runs(function() {
        var resume = opened[1].opts.art50_resume;
        expect(resume.reuse).toEqual(true);
        expect(resume.title).toEqual('Fractions Unit');
        expect(resume.words).toEqual('half, third, quarter');
        expect(resume.existing).toEqual(true);
        expect(resume.focus_id).toEqual('set_9');
        expect(resume.ai_focus_word_set_id).toEqual('lib_7');
      });
    });

    it('does NOT re-open focus-words when the disclosure was bumped rather than acknowledged', function() {
      var opened = [];
      stub(persistence, 'ajax', function(url) {
        ajaxCalls.push(url);
        return RSVP.resolve({});
      });
      stub(modal, 'open', function(template, opts) {
        opened.push({template: template, opts: opts});
        // utils/modal#open resolves a BUMPED modal with {replaced: true}; that is
        // not an acknowledgement and must not let the gated action proceed.
        return RSVP.resolve({replaced: true});
      });
      setAppState(true, makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false
      }));
      component.set('model', {board: 'b1'});
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');

      waitsFor(function() { return opened.length >= 1; });
      runs(function() {
        expect(ajaxCalls.length).toEqual(0);
        expect(opened.length).toEqual(1);
        expect(opened[0].template).toEqual('ai-disclosure');
      });
    });

    it('dispatches normally when the flag is off, so the non-EU and pre-enable paths are unchanged', function() {
      stub(persistence, 'ajax', function(url) {
        ajaxCalls.push(url);
        return RSVP.resolve({words: 'a,b,c'});
      });
      setAppState(false, makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: false
      }));
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');

      expect(ajaxCalls.length).toEqual(1);
      expect(ajaxCalls[0]).toEqual('/api/v1/focus/generate_words');
    });

    it('dispatches normally when the user is already acknowledged', function() {
      stub(persistence, 'ajax', function(url) {
        ajaxCalls.push(url);
        return RSVP.resolve({words: 'a,b,c'});
      });
      setAppState(true, makeUser({
        article_50_disclosure_required: true,
        article_50_disclosure_shown: true
      }));
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');

      expect(ajaxCalls.length).toEqual(1);
    });
  });

  describe('server backstop 403 handling', function() {
    it('never renders the raw article_50_disclosure_required token to the user', function() {
      var reject = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(resolve, innerReject) { reject = innerReject; });
      });
      // Flag reads OFF on this stale client record, which is exactly how the
      // request gets past the pre-request gate and reaches the server backstop.
      setAppState(false, makeUser());
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');
      reject({responseJSON: {error: 'article_50_disclosure_required'}});

      waitsFor(function() { return component.get('ai_generating') === false; });
      runs(function() {
        var shown = component.get('ai_generate_error');
        // makeUser() has no reload(), so there is no route to an accurate gate
        // state and the component says so instead of inviting a doomed retry.
        expect(shown).toEqual(i18n.t('ai_focus_words_disclosure_unavailable', "AI focus words need the AI transparency notice acknowledged first. You can review it in your Preferences."));
        expect(shown.indexOf('article_50_disclosure_required')).toEqual(-1);
      });
    });

    it('holds the action pending across the user refresh, then opens the notice itself', function() {
      var reject = null;
      var opened = [];
      var resolveReload = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(resolve, innerReject) { reject = innerReject; });
      });
      stub(modal, 'open', function(template, opts) {
        opened.push({template: template, opts: opts});
        return RSVP.resolve({});
      });
      var user = makeUser();
      user.reload = function() {
        return new RSVP.Promise(function(res) {
          resolveReload = function() {
            user.set('article_50_disclosure_required', true);
            res(user);
          };
        });
      };
      // Flag ON, cached record says no disclosure needed. That is the exact state
      // of every already-signed-in user the moment the flag is enabled, and it is
      // how a request slips past the client gate into the server backstop.
      setAppState(true, user);
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');
      reject({responseJSON: {error: 'article_50_disclosure_required'}});

      waitsFor(function() { return !!resolveReload; });
      runs(function() {
        // The retry race. While the refresh is in flight the button stays
        // disabled; otherwise a second press re-sends and collects the same 403,
        // because needsAcknowledgement() is still reading the stale record.
        expect(component.get('ai_generating')).toEqual(true);
        expect(component.get('ai_generate_error')).toEqual(null);
        resolveReload();
      });
      waitsFor(function() { return opened.length > 0; });
      runs(function() {
        expect(component.get('ai_generating')).toEqual(false);
        // The user never has to press anything: the notice opens on its own.
        expect(opened[0].template).toEqual('ai-disclosure');
        expect(component.get('ai_generate_error')).toEqual(null);
      });
    });

    it('does not invite a retry when the user refresh itself fails', function() {
      var reject = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(resolve, innerReject) { reject = innerReject; });
      });
      var user = makeUser();
      user.reload = function() { return RSVP.reject('offline'); };
      setAppState(true, user);
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');
      reject({responseJSON: {error: 'article_50_disclosure_required'}});

      waitsFor(function() { return component.get('ai_generating') === false; });
      runs(function() {
        var shown = component.get('ai_generate_error');
        expect(shown).toEqual(i18n.t('ai_focus_words_disclosure_refresh_failed', "We could not check your AI transparency settings. Check your connection, then try again."));
        // The record is still stale, so a retry would loop on the same 403. The
        // message must not promise that pressing Generate again opens anything.
        expect(shown.indexOf('again to open it')).toEqual(-1);
      });
    });

    it('surfaces the refusal when the refresh succeeds but the record still asks for nothing', function() {
      var reject = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(resolve, innerReject) { reject = innerReject; });
      });
      var user = makeUser();
      // Resolves without ever setting article_50_disclosure_required, so the gate
      // cannot be opened. The server's refusal must not be swallowed.
      user.reload = function() { return RSVP.resolve(user); };
      setAppState(true, user);
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');
      reject({responseJSON: {error: 'article_50_disclosure_required'}});

      waitsFor(function() { return component.get('ai_generating') === false; });
      runs(function() {
        expect(component.get('ai_generate_error')).toEqual(i18n.t('ai_focus_words_disclosure_unavailable', "AI focus words need the AI transparency notice acknowledged first. You can review it in your Preferences."));
      });
    });

    it('still surfaces other server errors verbatim, so this change does not swallow unrelated failures', function() {
      var reject = null;
      stub(persistence, 'ajax', function() {
        return new RSVP.Promise(function(resolve, innerReject) { reject = innerReject; });
      });
      setAppState(false, makeUser());
      component.set('ai_prompt', 'the grinch');

      component.send('generate_focus_words_with_ai');
      reject({responseJSON: {error: 'Feature not available'}});

      waitsFor(function() { return component.get('ai_generating') === false; });
      runs(function() {
        expect(component.get('ai_generate_error')).toEqual('Feature not available');
      });
    });
  });

  describe('opening() resume', function() {
    it('restores the AI form from art50_resume instead of clearing it', function() {
      component.set('model', {board: 'b1', art50_resume: {ai_prompt: 'the grinch', ai_word_count: 15}});
      component.set('modal', EmberObject.create({setComponent: function() {}}));

      component.send('opening');

      expect(component.get('ai_prompt')).toEqual('the grinch');
      expect(component.get('ai_word_count')).toEqual(15);
    });

    it('still clears the AI form on a normal open with no resume payload', function() {
      component.set('model', {board: 'b1'});
      component.set('modal', EmberObject.create({setComponent: function() {}}));
      component.set('ai_prompt', 'stale text');

      component.send('opening');

      expect(component.get('ai_prompt')).toEqual(null);
      expect(component.get('ai_word_count')).toEqual(20);
    });

    it('restores the re-use selection, list name, and words alongside the AI fields', function() {
      component.set('model', {board: 'b1', art50_resume: {
        ai_prompt: 'the grinch',
        ai_word_count: 15,
        words: 'grinch, sleigh, whoville',
        existing: true,
        reuse: true,
        title: 'Grinch Unit',
        focus_id: 'set_9',
        ai_focus_word_set_id: 'lib_7'
      }});
      component.set('modal', EmberObject.create({setComponent: function() {}}));

      component.send('opening');

      // The gate has to be transparent: everything the user authored survives it.
      expect(component.get('reuse')).toEqual(true);
      expect(component.get('title')).toEqual('Grinch Unit');
      expect(component.get('words')).toEqual('grinch, sleigh, whoville');
      expect(component.get('existing')).toEqual(true);
      expect(component.get('focus_id')).toEqual('set_9');
      // Attribution for words an earlier generation produced. Without it,
      // record_ai_focus_usage() returns early and applying the retained list
      // records nothing.
      expect(component.get('ai_focus_word_set_id')).toEqual('lib_7');
      // reuse_or_existing gates the "Word List Name" input's visibility, so a
      // restored title is unreachable in the UI unless this is true as well.
      expect(component.get('reuse_or_existing')).toEqual(true);
    });

    it('still clears the re-use selection and list name on a normal open', function() {
      component.set('model', {board: 'b1'});
      component.set('modal', EmberObject.create({setComponent: function() {}}));
      component.set('reuse', true);
      component.set('title', 'stale list');
      component.set('words', 'stale words');
      component.set('existing', true);
      component.set('focus_id', 'set_stale');

      component.send('opening');

      expect(component.get('reuse')).toEqual(null);
      expect(component.get('title')).toEqual(null);
      expect(component.get('words')).toEqual(null);
      expect(component.get('existing')).toEqual(null);
      expect(component.get('focus_id')).toEqual(null);
    });
  });
});
