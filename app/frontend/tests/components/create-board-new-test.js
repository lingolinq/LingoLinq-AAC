import {
  describe,
  it,
  itAsync,
  expect,
  beforeEach,
  afterEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modalUtil from '../../utils/modal';
import persistence from '../../utils/persistence';

/*
 * create-board-new component coverage — Scot #3 (High) pre-merge review.
 *
 * Targets the high-value computed gates around the Create Board flow:
 *   - createBoardDisabled (the Save/Create button enabled-state)
 *   - ai_button_count_over_limit (112-button cap warning gate)
 *   - ai_generate_disabled ("Generate with AI" button enabled-state)
 *
 * These computeds gate the destructive create-board action and the
 * AI-generation network call respectively; a regression in either is
 * a user-visible blocker. Tests use direct property sets on a stub
 * model rather than full Ember Data integration — matches the existing
 * test style in this codebase (see tests/controllers/user/index-test.js).
 *
 * See docs/task-management/2026-05-27-pr281-test-coverage.md.
 */
describe('CreateBoardNewComponent', 'component:create-board-new', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  function makeComponent() {
    var component = testOwner.factoryFor('component:create-board-new').create();
    // Bypass init's createRecord call (would require a real store) by
    // overwriting the model with a plain stub. The component reads via
    // .get('model.*'), so a plain EmberObject is sufficient.
    component.set('model', EmberObject.create({
      name: '',
      description: '',
      grid: EmberObject.create({ rows: 5, columns: 6, labels: '' }),
      license: { type: 'private' }
    }));
    component.set('status', null);
    component.set('ai_mode', false);
    component.set('ai_labels_generated', false);
    component.set('ai_generating', false);
    return component;
  }

  describe('createBoardDisabled', function() {
    it('returns true when board name is empty', function() {
      var c = makeComponent();
      c.set('model.name', '');
      expect(c.get('createBoardDisabled')).toEqual(true);
    });

    it('returns true when board name is whitespace-only', function() {
      var c = makeComponent();
      c.set('model.name', '   ');
      expect(c.get('createBoardDisabled')).toEqual(true);
    });

    it('returns false in regular mode when name is set', function() {
      var c = makeComponent();
      c.set('model.name', 'My Board');
      expect(c.get('createBoardDisabled')).toEqual(false);
    });

    it('returns true while status.saving is true (even with name set)', function() {
      var c = makeComponent();
      c.set('model.name', 'My Board');
      c.set('status', EmberObject.create({ saving: true }));
      expect(c.get('createBoardDisabled')).toEqual(true);
    });

    it('AI mode: returns true when description is empty', function() {
      var c = makeComponent();
      c.set('model.name', 'My Board');
      c.set('ai_mode', true);
      c.set('model.description', '');
      c.set('ai_labels_generated', false);
      expect(c.get('createBoardDisabled')).toEqual(true);
    });

    it('AI mode: returns true when ai_labels_generated is false (even with description)', function() {
      var c = makeComponent();
      c.set('model.name', 'My Board');
      c.set('ai_mode', true);
      c.set('model.description', 'A board for elementary math.');
      c.set('ai_labels_generated', false);
      expect(c.get('createBoardDisabled')).toEqual(true);
    });

    it('AI mode: returns false when description AND ai_labels_generated are set', function() {
      var c = makeComponent();
      c.set('model.name', 'My Board');
      c.set('ai_mode', true);
      c.set('model.description', 'A board for elementary math.');
      c.set('ai_labels_generated', true);
      expect(c.get('createBoardDisabled')).toEqual(false);
    });
  });

  describe('ai_button_count_over_limit (112-button cap)', function() {
    it('is false at exactly 112 buttons (boundary — recommended max)', function() {
      var c = makeComponent();
      c.set('model.grid.rows', 14);
      c.set('model.grid.columns', 8);
      expect(c.get('ai_button_count')).toEqual(112);
      expect(c.get('ai_button_count_over_limit')).toEqual(false);
    });

    it('is true at 113 buttons (one over the boundary)', function() {
      var c = makeComponent();
      c.set('model.grid.rows', 14);
      c.set('model.grid.columns', 9);
      expect(c.get('ai_button_count')).toEqual(126);
      expect(c.get('ai_button_count_over_limit')).toEqual(true);
    });

    it('handles non-numeric rows/columns gracefully (parseInt falls to 0)', function() {
      var c = makeComponent();
      c.set('model.grid.rows', 'asdf');
      c.set('model.grid.columns', 'asdf');
      expect(c.get('ai_button_count')).toEqual(0);
      expect(c.get('ai_button_count_over_limit')).toEqual(false);
    });
  });

  describe('ai_generate_disabled', function() {
    it('is true when description is empty', function() {
      var c = makeComponent();
      c.set('model.description', '');
      expect(c.get('ai_generate_disabled')).toEqual(true);
    });

    it('is true when ai_generating is true (in-flight)', function() {
      var c = makeComponent();
      c.set('model.description', 'A board for elementary math.');
      c.set('ai_generating', true);
      expect(c.get('ai_generate_disabled')).toEqual(true);
    });

    it('is true when button count exceeds the 112 cap', function() {
      var c = makeComponent();
      c.set('model.description', 'A board for elementary math.');
      c.set('model.grid.rows', 14);
      c.set('model.grid.columns', 9);  // 126 > 112
      expect(c.get('ai_generate_disabled')).toEqual(true);
    });

    it('is false when description is set, not generating, and within button cap', function() {
      var c = makeComponent();
      c.set('model.description', 'A board for elementary math.');
      c.set('model.grid.rows', 5);
      c.set('model.grid.columns', 6);  // 30 buttons, well under cap
      c.set('ai_generating', false);
      expect(c.get('ai_generate_disabled')).toEqual(false);
    });
  });

  describe('_ensure_label_images_before_save waits for manual image drops', function() {
    // Jasmine helper has no mocha-style `done` callback — use itAsync + await.
    itAsync('resolves only after pending drop uploads settle', async function() {
      var c = makeComponent();
      var settled = false;
      var deferredResolve;
      var pending = new Promise(function(resolve) { deferredResolve = resolve; });
      c._pending_label_image_uploads = [pending];
      c._lookup_label_images = function() { return Promise.resolve(); };
      var ensurePromise = c._ensure_label_images_before_save();
      // Not settled yet — drop still in flight.
      expect(settled).toEqual(false);
      settled = true;
      deferredResolve();
      await ensurePromise;
      expect(settled).toEqual(true);
    });
  });

  describe('AI enable intercept', function() {
    var originalOpen;

    beforeEach(function() {
      originalOpen = modalUtil.open;
    });

    afterEach(function() {
      modalUtil.open = originalOpen;
    });

    function stubUser(prefs, extras) {
      extras = extras || {};
      return EmberObject.create({
        preferences: prefs || {},
        eu_under_16: !!extras.eu_under_16,
        eu_ai_parental_consent_active: !!extras.eu_consent_active,
        coppa_parental_consent_pending: !!extras.coppa_pending,
        eu_ai_parental_consent_parent_email: extras.parentEmail || ''
      });
    }

    function stubAppState(flagOn, user) {
      return EmberObject.create({
        feature_flags: EmberObject.create({ ai_board_generation: flagOn }),
        currentUser: user
      });
    }

    itAsync('opens enable-ai-features and stays on the chooser when prefs are unset', async function() {
      var c = makeComponent();
      c.set('show_create_chooser', true);
      c.set('ai_mode', false);
      c.set('appState', stubAppState(true, stubUser({})));
      var opened = null;
      modalUtil.open = function(template, options) {
        opened = {
          template: template,
          options: options,
          chooserVisible: c.get('show_create_chooser')
        };
        return RSVP.reject({ reason: 'force close' });
      };
      await c._requestEnterAiMode();
      expect(opened.template).toEqual('enable-ai-features');
      expect(opened.options.triggeredPref).toEqual('ai_board_generation');
      expect(opened.chooserVisible).toEqual(false);
      expect(c.get('ai_mode')).toEqual(false);
      expect(c.get('show_create_chooser')).toEqual(true);
    });

    itAsync('enters AI mode after enabling board generation', async function() {
      var c = makeComponent();
      c.set('show_create_chooser', true);
      c.set('ai_mode', false);
      c.set('appState', stubAppState(true, stubUser({})));
      modalUtil.open = function() {
        return RSVP.resolve({
          saved: true,
          requested_features: { ai_board_generation: true }
        });
      };
      await c._requestEnterAiMode();
      expect(c.get('ai_mode')).toEqual(true);
      expect(c.get('show_create_chooser')).toEqual(false);
    });

    itAsync('stays on the chooser when save omits board generation', async function() {
      var c = makeComponent();
      c.set('show_create_chooser', true);
      c.set('ai_mode', false);
      c.set('appState', stubAppState(true, stubUser({})));
      modalUtil.open = function() {
        return RSVP.resolve({
          saved: true,
          requested_features: { ai_board_generation: false, ai_word_prediction: true }
        });
      };
      await c._requestEnterAiMode();
      expect(c.get('ai_mode')).toEqual(false);
      expect(c.get('show_create_chooser')).toEqual(true);
    });

    itAsync('opens the EU parental-consent modal instead of self-enable', async function() {
      var c = makeComponent();
      c.set('show_create_chooser', true);
      c.set('ai_mode', false);
      c.set('appState', stubAppState(true, stubUser({}, { eu_under_16: true })));
      var opened = null;
      modalUtil.open = function(template, options) {
        opened = { template: template, options: options };
        return RSVP.resolve({ sent: true });
      };
      await c._requestEnterAiMode();
      expect(opened.template).toEqual('eu-ai-parental-consent');
      expect(c.get('ai_mode')).toEqual(false);
      expect(c.get('show_create_chooser')).toEqual(true);
    });

    itAsync('opens a blocked enable modal when the rollout flag is off', async function() {
      var c = makeComponent();
      c.set('show_create_chooser', true);
      c.set('ai_mode', false);
      c.set('appState', stubAppState(false, stubUser({
        ai_features_enabled: true,
        ai_board_generation: true
      })));
      var opened = null;
      modalUtil.open = function(template, options) {
        opened = { template: template, options: options };
        return RSVP.resolve();
      };
      await c._requestEnterAiMode();
      expect(opened.template).toEqual('enable-ai-features');
      expect(opened.options.blocked).toEqual(true);
      expect(opened.options.blockedReason).toEqual('flag');
      expect(c.get('ai_mode')).toEqual(false);
    });

    itAsync('skips the popup when board generation is already explicitly on', async function() {
      var c = makeComponent();
      c.set('show_create_chooser', true);
      c.set('ai_mode', false);
      c.set('appState', stubAppState(true, stubUser({
        ai_features_enabled: true,
        ai_board_generation: true
      })));
      var opened = false;
      modalUtil.open = function() {
        opened = true;
        return RSVP.resolve();
      };
      await c._requestEnterAiMode();
      expect(opened).toEqual(false);
      expect(c.get('ai_mode')).toEqual(true);
    });

    itAsync('generate_labels_with_ai does not continue when opt-in is cancelled', async function() {
      var c = makeComponent();
      c.set('model.description', 'A board for elementary math.');
      c.set('appState', stubAppState(true, stubUser({})));
      persistence.set('online', true);
      var ensureCalled = false;
      c._ensureAiBoardGenerationAccess = function() {
        ensureCalled = true;
        return RSVP.resolve({ proceed: false });
      };
      var fn = (c.actions && c.actions.generate_labels_with_ai) || c.generate_labels_with_ai;
      await fn.call(c);
      expect(ensureCalled).toEqual(true);
      expect(c.get('ai_labels_generated')).toEqual(false);
    });
  });
});
