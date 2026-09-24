import {
  describe,
  it,
  itAsync,
  expect,
  beforeEach,
  afterEach,
  stub
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modalUtil from '../../utils/modal';
import persistence from '../../utils/persistence';
import editManager from '../../utils/edit_manager';

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

  /* Step 1's Next gate. The required field differs by path, and the step-1
     markup already says so: Name carries `required`/`aria-required`, while
     Description shows a "required" pill in AI mode and an "optional" pill
     otherwise. The gate follows those labels -- name on "create my own",
     description on "create with AI". */
  describe('wizard_next_disabled (step 1 Next gate)', function() {
    it('create my own: is true until a name is given, even with a description', function() {
      var c = makeComponent();
      c.set('wizard_step', 1);
      c.set('model.name', '');
      c.set('model.description', 'A board for the playground.');
      expect(c.get('wizard_next_disabled')).toEqual(true);
    });

    it('create my own: is false as soon as a name is given, with no description', function() {
      var c = makeComponent();
      c.set('wizard_step', 1);
      c.set('model.name', 'Playground');
      c.set('model.description', '');
      expect(c.get('wizard_next_disabled')).toEqual(false);
    });

    it('create my own: treats a whitespace-only name as no name', function() {
      var c = makeComponent();
      c.set('wizard_step', 1);
      c.set('model.name', '   ');
      expect(c.get('wizard_next_disabled')).toEqual(true);
    });

    it('AI mode: is true until a description is given, even with a name', function() {
      var c = makeComponent();
      c.set('ai_mode', true);
      c.set('wizard_step', 1);
      c.set('model.name', 'Playground');
      c.set('model.description', '');
      expect(c.get('wizard_next_disabled')).toEqual(true);
    });

    it('AI mode: is false as soon as a description is given, with no name', function() {
      var c = makeComponent();
      c.set('ai_mode', true);
      c.set('wizard_step', 1);
      c.set('model.name', '');
      c.set('model.description', 'A board for the playground.');
      expect(c.get('wizard_next_disabled')).toEqual(false);
    });

    it('never blocks past step 1, in either mode', function() {
      var c = makeComponent();
      c.set('model.name', '');
      c.set('model.description', '');
      c.set('wizard_step', 2);
      expect(c.get('wizard_next_disabled')).toEqual(false);
      c.set('ai_mode', true);
      c.set('wizard_step', 4);
      expect(c.get('wizard_next_disabled')).toEqual(false);
    });
  });

  describe('wizard_hint (Basics header caption)', function() {
    it('captions step 2 with the grid-size line, not the step 1 line', function() {
      var c = makeComponent();
      c.set('wizard_step', 2);
      expect(c.get('wizard_hint')).toEqual('Choose the grid size of your board.');
    });

    it('captions step 1 with the name/description line', function() {
      var c = makeComponent();
      c.set('wizard_step', 1);
      expect(c.get('wizard_hint')).toEqual('Give your board a name and brief description.');
    });

    it('captions step 3 with the core-words line', function() {
      var c = makeComponent();
      c.set('wizard_step', 3);
      expect(c.get('wizard_hint')).toEqual('Choose whether to include core words.');
    });

    /* `user_options` and `show_user_options` are both computeds, so the toggle's
       visibility is driven the only way it can be: through the session user the
       supervisee list is derived from. */
    it('gives step 4 no caption when the supervisee toggle does not apply', function() {
      var c = makeComponent();
      c.set('wizard_step', 4);
      c.set('appState.sessionUser', EmberObject.create({ known_supervisees: [], supporter_role: false }));
      expect(c.get('show_user_options')).toEqual(false);
      expect(c.get('wizard_hint')).toEqual('');
    });

    it('captions step 4 with the audience line when the supervisee toggle applies', function() {
      var c = makeComponent();
      c.set('wizard_step', 4);
      c.set('appState.sessionUser', EmberObject.create({
        known_supervisees: [{ id: '1', user_name: 'kid' }],
        supporter_role: true
      }));
      expect(c.get('show_user_options')).toEqual(true);
      expect(c.get('wizard_hint')).toEqual('Choose who this board is for.');
    });
  });

  /* `wizard_done` is the handover flag: it CLOSES the Basics section (the wizard's own
     container) and opens Board Labels + Advanced below it, all three gated on this one
     boolean. These lock the transition that drives that swap. */
  describe('wizard_done (Basics closes, the rest opens)', function() {
    it('starts false, so Basics is open and the sections below are not', function() {
      var c = makeComponent();
      expect(c.get('wizard_done')).toEqual(false);
      expect(c.get('wizard_step')).toEqual(1);
    });

    it('stays false while there are steps left', function() {
      var c = makeComponent();
      c.set('model.name', 'Playground');
      c.send('wizard_next');
      expect(c.get('wizard_step')).toEqual(2);
      expect(c.get('wizard_done')).toEqual(false);
    });

    it('create my own: Next steps 1 -> 2 -> 4, skipping the AI-only core-words step', function() {
      var c = makeComponent();
      c.set('model.name', 'Playground');
      c.send('wizard_next');
      c.send('wizard_next');
      expect(c.get('wizard_step')).toEqual(4);
      expect(c.get('wizard_done')).toEqual(false);
    });

    it('Next on the last step sets wizard_done instead of advancing', function() {
      var c = makeComponent();
      c.set('wizard_step', 4);
      c.send('wizard_next');
      expect(c.get('wizard_done')).toEqual(true);
      expect(c.get('wizard_step')).toEqual(4);
    });

    /* The REAL wizard_generate runs, with only its downstream collaborator replaced --
       `generate_labels_with_ai` makes the network call and is not what is under test.
       Shadowing the actions hash rather than `send` keeps the action itself honest: if
       it stopped setting the flag, this fails. */
    it('the AI path hands off through Generate rather than Next', function() {
      var c = makeComponent();
      c.set('ai_mode', true);
      c.set('wizard_step', 4);
      var generated = 0;
      c.actions = Object.create(c.actions);
      c.actions.generate_labels_with_ai = function() { generated++; };
      c.send('wizard_generate');
      expect(c.get('wizard_done')).toEqual(true);
      expect(generated).toEqual(1);
    });

    /* The post-handoff page (Board Labels + save) needs its own way back, because the
       wizard's own Back went with Basics. Clearing the flag is the whole action --
       `wizard_step` was never reset, so the wizard reopens where it handed off. */
    it('wizard_reopen returns to the wizard at the step it handed off from', function() {
      var c = makeComponent();
      c.set('wizard_step', 4);
      c.send('wizard_next');
      expect(c.get('wizard_done')).toEqual(true);
      c.send('wizard_reopen');
      expect(c.get('wizard_done')).toEqual(false);
      expect(c.get('wizard_step')).toEqual(4);
    });

    it('wizard_reopen keeps the work already entered', function() {
      var c = makeComponent();
      c.set('model.name', 'Playground');
      c.set('model.grid.rows', 7);
      c.set('wizard_done', true);
      c.send('wizard_reopen');
      expect(c.get('model.name')).toEqual('Playground');
      expect(c.get('model.grid.rows')).toEqual(7);
    });

    it('Back does not reopen Basics once the wizard has handed off', function() {
      var c = makeComponent();
      c.set('wizard_step', 4);
      c.send('wizard_next');
      expect(c.get('wizard_done')).toEqual(true);
      c.send('wizard_back');
      expect(c.get('wizard_done')).toEqual(true);
    });
  });

  /* The Board Labels preview follows the user's app-wide view style: Basic mode
     ("classic" in code -- there is no 'basic' string) previews the board-alt look,
     Modern previews board-detail. Read off `effective_view_user`, NOT `currentUser`:
     while modelling, currentUser is the SUPERVISOR, so reading it would show a
     Basic-view communicator the Modern preview. */
  describe('preview_is_basic (which board the preview imitates)', function() {
    function asUser(style, id) {
      return EmberObject.create({ id: id || 'u1', preferences: { board_view_style: style } });
    }

    /* The ROUTE resolves the view style before this page is entered and passes it in
       (routes/create-board-new.js#setupController). That value wins over the live read:
       the live chain ends at `preferences.board_view_style`, and `preferences` is a plain
       object whose in-place mutation Ember cannot observe, so a computed evaluated before
       the user hydrated could stay stale at "modern". */
    it('prefers the route-resolved entryViewStyle over the live app-state read', function() {
      var c = makeComponent();
      c.set('appState.currentUser', asUser('modern'));
      c.set('entryViewStyle', 'classic');
      expect(c.get('preview_is_basic')).toEqual(true);
    });

    it('honours a route-resolved Modern even if app-state later reads classic', function() {
      var c = makeComponent();
      c.set('appState.currentUser', asUser('classic'));
      c.set('entryViewStyle', 'modern');
      expect(c.get('preview_is_basic')).toEqual(false);
    });

    /* The non-standalone modal has no route of its own to resolve the value. */
    it('falls back to the live read when no entryViewStyle was supplied', function() {
      var c = makeComponent();
      c.set('appState.currentUser', asUser('classic'));
      expect(c.get('entryViewStyle')).toEqual(undefined);
      expect(c.get('preview_is_basic')).toEqual(true);
    });

    /* The per-device mirror has to be cleared explicitly. `effective_view_style` falls
       back to `localStorage['ll_board_view_style']` when the preference is ABSENT
       (utils/view_style_state.js, consumed at app-state.js:5194), which is what keeps a
       cold load from flashing the wrong shell -- but it also means "no preference" only
       reads as Modern on a device that has never stored one. Without this the assertion
       passes or fails depending on which test ran before it. */
    it('is false when no view style is set -- Modern is the default', function() {
      var c = makeComponent();
      try { window.localStorage.removeItem('ll_board_view_style'); } catch(e) { }
      c.set('appState.currentUser', EmberObject.create({ id: 'u1', preferences: {} }));
      expect(c.get('preview_is_basic')).toEqual(false);
    });

    /* THE BUG THIS GUARDS (found in review, 2026-09-23). `is_classic()` bails to false
       for any user that is not an Ember object (`utils/view_style.js:22` --
       `typeof user.get !== 'function'`), and `services/app-state.js:5166-5171` states
       that `currentUser` IS assigned a plain object in several places, which is why
       `effective_view_user` itself uses `emberGet`. Reading the pref through
       `is_classic` therefore made a Basic-view user silently preview as Modern.
       `appState.effective_view_style` resolves it with a PATH get, which works through
       a plain object, and is the same value that drives `body.ll-view-basic` -- so the
       preview and the body class can no longer disagree. */
    it('is true for a Basic-view user held as a PLAIN object, not an Ember record', function() {
      var c = makeComponent();
      c.set('appState.currentUser', { id: 'u1', preferences: { board_view_style: 'classic' } });
      expect(c.get('preview_is_basic')).toEqual(true);
    });

    it('is false for a Modern-view user held as a plain object', function() {
      var c = makeComponent();
      c.set('appState.currentUser', { id: 'u1', preferences: { board_view_style: 'modern' } });
      expect(c.get('preview_is_basic')).toEqual(false);
    });

    it('is true when the effective view user is in Basic view', function() {
      var c = makeComponent();
      c.set('appState.currentUser', asUser('classic'));
      expect(c.get('preview_is_basic')).toEqual(true);
    });

    it('is false when the effective view user is in Modern view', function() {
      var c = makeComponent();
      c.set('appState.currentUser', asUser('modern'));
      expect(c.get('preview_is_basic')).toEqual(false);
    });

    /* INVERTED 2026-09-23. This used to assert that the preview followed the PAGE OWNER --
       a supervisor on a communicator's page got the communicator's preview -- driven through
       the `page_user` branch of `effective_view_user`. That branch was removed on request: the
       view is now absolute and follows the session account everywhere except live modelling,
       because flipping the whole shell as someone clicked between people was the reported bug.
       Kept as an inverted assertion rather than deleted, so the old behaviour cannot return
       unnoticed. */
    it('keeps the session user\'s view on someone else\'s page', function() {
      var c = makeComponent();
      c.set('appState.currentUser', asUser('modern', 'u1'));
      c.set('appState.page_user', asUser('classic', 'u2'));
      c.set('appState.current_route', 'user.boards');
      expect(c.get('appState.effective_view_user.preferences.board_view_style')).toEqual('modern');
      expect(c.get('preview_is_basic')).toEqual(false);
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

  function stubEnglishFirstAppState(flagOn) {
    return EmberObject.create({
      feature_flags: EmberObject.create({ english_first_board_generation: !!flagOn }),
      currentUser: null,
      sessionUser: null
    });
  }

  describe('bilingual English lookup on create', function() {
    itAsync('searches symbols with the English translation and keeps the Spanish label', async function() {
      var c = makeComponent();
      c.set('appState', stubEnglishFirstAppState(true));
      c.set('model.locale', 'es');
      c.set('model.grid.labels', 'sombrero');
      var symbolUrls = [];
      stub(persistence, 'ajax', function(url) {
        if(String(url).indexOf('/users/self/translate') !== -1) {
          return RSVP.resolve({ translations: { sombrero: 'hat' } });
        }
        if(String(url).indexOf('/search/symbols') !== -1) {
          symbolUrls.push(String(url));
          return RSVP.resolve([{ image_url: 'https://example.com/hat.png' }]);
        }
        if(String(url).indexOf('batch_parts_of_speech') !== -1) {
          return RSVP.resolve({ results: { hat: { types: ['noun'] } } });
        }
        return RSVP.resolve({});
      });
      await c._lookup_label_images();
      expect(c.get('parsed_labels')).toEqual(['sombrero']);
      expect(c.get('_label_english.sombrero')).toEqual('hat');
      expect(symbolUrls.length).toEqual(1);
      expect(symbolUrls[0].indexOf('q=hat') !== -1).toEqual(true);
      expect(symbolUrls[0].indexOf('locale=en') !== -1).toEqual(true);
      expect(symbolUrls[0].indexOf('q=sombrero') !== -1).toEqual(false);
      expect(c.get('_label_images.sombrero.image_url')).toEqual('https://example.com/hat.png');
    });

    itAsync('does not call translate when authoring in English', async function() {
      var c = makeComponent();
      c.set('appState', stubEnglishFirstAppState(true));
      c.set('model.locale', 'en');
      c.set('model.grid.labels', 'hat');
      var translateCalled = false;
      var symbolUrls = [];
      stub(persistence, 'ajax', function(url) {
        if(String(url).indexOf('/users/self/translate') !== -1) {
          translateCalled = true;
          return RSVP.resolve({ translations: {} });
        }
        if(String(url).indexOf('/search/symbols') !== -1) {
          symbolUrls.push(String(url));
          return RSVP.resolve([{ image_url: 'https://example.com/hat.png' }]);
        }
        return RSVP.resolve({});
      });
      await c._lookup_label_images();
      expect(translateCalled).toEqual(false);
      expect(symbolUrls.length).toEqual(1);
      expect(symbolUrls[0].indexOf('q=hat') !== -1).toEqual(true);
    });

    it('saves both locales on the create payload', function() {
      var c = makeComponent();
      c.set('appState', stubEnglishFirstAppState(true));
      c.set('model.locale', 'es');
      c.set('model.name', 'Mi tablero');
      c.set('_label_english', { sombrero: 'hat' });
      c.set('_board_name_english', 'My board');
      var blob = c._build_authoring_translations([
        { id: 1, label: 'sombrero' }
      ]);
      expect(blob.default).toEqual('es');
      expect(blob.current_label).toEqual('es');
      expect(blob['1'].es.label).toEqual('sombrero');
      expect(blob['1'].en.label).toEqual('hat');
      expect(blob.board_name.es).toEqual('Mi tablero');
      expect(blob.board_name.en).toEqual('My board');
    });

    it('clears translation caches when the supervisee locale root changes', function() {
      var c = makeComponent();
      c.set('appState', EmberObject.create({
        feature_flags: EmberObject.create({ english_first_board_generation: true }),
        sessionUser: EmberObject.create({
          known_supervisees: [
            { id: 'u-es', locale: 'es' },
            { id: 'u-fr', locale: 'fr' }
          ]
        })
      }));
      c.set('model.locale', 'es');
      c.set('_label_english', { sombrero: 'hat' });
      c.set('_board_name_english', 'My board');
      c.set('_label_colors', { sombrero: { fill: '#f00' } });
      c.set('_label_images', { sombrero: { image_url: 'https://example.com/hat.png' } });
      c._apply_supervisee_authoring_locale('u-fr');
      expect(c.get('model.locale')).toEqual('fr');
      expect(c.get('_label_english')).toEqual({});
      expect(c.get('_board_name_english')).toEqual(null);
      expect(c.get('_label_colors')).toEqual({});
      expect(c.get('_label_images')).toEqual({});
    });

    it('keeps translation caches when the supervisee locale root is unchanged', function() {
      var c = makeComponent();
      c.set('appState', EmberObject.create({
        feature_flags: EmberObject.create({ english_first_board_generation: true }),
        sessionUser: EmberObject.create({
          known_supervisees: [
            { id: 'u-es', locale: 'es' },
            { id: 'u-es-mx', locale: 'es_MX' }
          ]
        })
      }));
      c.set('model.locale', 'es');
      c.set('_label_english', { sombrero: 'hat' });
      c._apply_supervisee_authoring_locale('u-es-mx');
      expect(c.get('model.locale')).toEqual('es_MX');
      expect(c.get('_label_english.sombrero')).toEqual('hat');
    });

    it('does not build translations for an English authoring locale', function() {
      var c = makeComponent();
      c.set('appState', stubEnglishFirstAppState(true));
      c.set('model.locale', 'en');
      expect(c._build_authoring_translations([{ id: 1, label: 'hat' }])).toEqual(null);
    });

    itAsync('looks up Fitzgerald colors from the English word', async function() {
      var c = makeComponent();
      c.set('appState', stubEnglishFirstAppState(true));
      c.set('model.locale', 'es');
      c.set('model.grid.labels', 'sombrero');
      var posWords = null;
      stub(persistence, 'ajax', function(url, opts) {
        if(String(url).indexOf('/users/self/translate') !== -1) {
          return RSVP.resolve({ translations: { sombrero: 'hat' } });
        }
        if(String(url).indexOf('batch_parts_of_speech') !== -1) {
          posWords = opts && opts.data && opts.data.words;
          return RSVP.resolve({ results: {} });
        }
        return RSVP.resolve({});
      });
      await c._lookup_label_colors();
      expect(posWords).toEqual('hat');
    });

    itAsync('bakes translations on save and does not open translation-select', async function() {
      var c = makeComponent();
      var opened = [];
      var origOpen = modalUtil.open;
      var origClose = modalUtil.close;
      var origAuto = editManager.auto_edit;
      modalUtil.open = function(template) { opened.push(template); };
      modalUtil.close = function() {};
      editManager.auto_edit = function() {};
      c.set('appState', EmberObject.create({
        feature_flags: EmberObject.create({ english_first_board_generation: true }),
        currentUser: EmberObject.create({ id: '1' }),
        arm_board_load_overlay: function() {}
      }));
      c.set('router', { transitionTo: function() {} });
      c.set('_label_english', { sombrero: 'hat' });
      c.set('_label_images', { sombrero: { image_url: 'https://example.com/hat.png' } });
      var saved = RSVP.resolve();
      c.set('model', EmberObject.create({
        name: 'Mi tablero',
        locale: 'es',
        grid: EmberObject.create({ rows: 1, columns: 1, labels: 'sombrero', labels_order: 'rows' }),
        license: { type: 'private' },
        key: 'example/mi-tablero',
        id: '1_1',
        save: function() {
          saved = RSVP.resolve(this);
          return saved;
        }
      }));
      try {
        c._completeSaveBoard();
        await saved;
        expect(c.get('model.locale')).toEqual('es');
        var trans = c.get('model.translations') || {};
        expect(trans['1'].es.label).toEqual('sombrero');
        expect(trans['1'].en.label).toEqual('hat');
        expect(opened.indexOf('translation-select')).toEqual(-1);
      } finally {
        modalUtil.open = origOpen;
        modalUtil.close = origClose;
        editManager.auto_edit = origAuto;
      }
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

  /* SAVE BOARD COMPLETENESS GATE.
   *
   * `attemptSave` already refused to save when a REQUIRED field was missing. This gate is a
   * different question -- everything required is present, but is the board FINISHED? -- and
   * the answer is the person's to give, so every one of these paths ends in them choosing.
   *
   * The dialog is stubbed at `modalUtil.open`, which is the seam the component actually
   * calls; the gate itself runs for real, so the grid maths, the model writes and the
   * resolve/reject contract are all under test. */
  describe('Save Board completeness gate', function() {
    /* Labels go in BEFORE the size, because `autoFitGrid` observes `model.grid.labels` and
       re-shapes the grid to the tightest near-square that holds them. Setting the size last
       is therefore not a test convenience -- it is the only way a grid with room to spare
       exists at all, and it mirrors the one real route to one: typing the words, then
       widening the grid with the row/column steppers. */
    function savableComponent(labels, rows, columns, order) {
      var c = makeComponent();
      c.set('model.name', 'Test Board');
      if(order) { c.set('model.grid.labels_order', order); }
      c.set('model.grid.labels', labels);
      c.set('model.grid.rows', rows);
      c.set('model.grid.columns', columns);
      return c;
    }

    /** Runs the gate and reports which way it went, without the caller needing to know
     *  that "cancel" is expressed as a rejection. */
    function settle(c) {
      return c._confirm_grid_completeness().then(function() { return 'proceed'; },
                                                 function() { return 'cancel'; });
    }

    itAsync('a completely filled grid saves with no dialog at all', async function() {
      var c = savableComponent('a,b,c,d', 2, 2);
      var opened = [];
      stub(modalUtil, 'open', function(template) {
        opened.push(template);
        return RSVP.resolve();
      });
      var outcome = await settle(c);
      expect(outcome).toEqual('proceed');
      expect(opened.length).toEqual(0);
    });

    itAsync('an empty grid asks before saving a blank board', async function() {
      var c = savableComponent('', 3, 4);
      var seen = null;
      stub(modalUtil, 'open', function(template, options) {
        seen = { template: template, options: options };
        return RSVP.resolve('save_blank');
      });
      var outcome = await settle(c);
      expect(outcome).toEqual('proceed');
      expect(seen.template).toEqual('confirm-blank-board');
      expect(seen.options.rows).toEqual(3);
      expect(seen.options.columns).toEqual(4);
    });

    itAsync('dismissing the blank-board dialog does not save', async function() {
      var c = savableComponent('', 3, 4);
      stub(modalUtil, 'open', function() { return RSVP.resolve(); });
      var outcome = await settle(c);
      expect(outcome).toEqual('cancel');
    });

    itAsync('a partly filled grid reports its real counts to the dialog', async function() {
      // 3x3 with five words: four cells short, and no row or column is empty end to end.
      var c = savableComponent('a,b,c,d,e', 3, 3);
      var seen = null;
      stub(modalUtil, 'open', function(template, options) {
        seen = { template: template, options: options };
        return RSVP.resolve('save_as_is');
      });
      var outcome = await settle(c);
      expect(outcome).toEqual('proceed');
      expect(seen.template).toEqual('confirm-partial-board');
      expect(seen.options.filled).toEqual(5);
      expect(seen.options.total).toEqual(9);
      expect(seen.options.can_trim).toEqual(true);
    });

    itAsync('scattered gaps that clear no whole row or column are not offered a trim', async function() {
      // 2x2 with three words: one blank cell, but every row and column still has a word.
      var c = savableComponent('a,b,c', 2, 2);
      var seen = null;
      stub(modalUtil, 'open', function(template, options) {
        seen = { template: template, options: options };
        return RSVP.resolve('save_as_is');
      });
      await settle(c);
      expect(seen.options.can_trim).toEqual(false);
      expect(seen.options.empty_rows_count).toEqual(0);
      expect(seen.options.empty_columns_count).toEqual(0);
    });

    itAsync('choosing the trim shrinks the grid before the save runs', async function() {
      // 3x3 holding six words: the last row is untouched.
      var c = savableComponent('a,b,c,d,e,f', 3, 3);
      stub(modalUtil, 'open', function(template, options) {
        expect(options.trim_rows).toEqual(2);
        expect(options.trim_columns).toEqual(3);
        return RSVP.resolve('save_trimmed');
      });
      var outcome = await settle(c);
      expect(outcome).toEqual('proceed');
      expect(c.get('model.grid.rows')).toEqual(2);
      expect(c.get('model.grid.columns')).toEqual(3);
      expect(c.get('model.grid.labels')).toEqual('a,b,c,d,e,f');
    });

    /* PINS THE WRITE ORDER. A 2x6 grid with its last column empty trims to 2x5, whereas
       `autoFitGrid` would re-shape the same ten words to 3x4. Writing the labels after the
       size lets the observer win and the board saves at 3x4 -- a size nobody asked for and
       a different shape from the one the dialog offered. The earlier trim case cannot catch
       this: its trimmed size and autoFit's happen to coincide. */
    itAsync('a trim holds the offered shape against the auto-fit observer', async function() {
      var c = savableComponent('a,b,c,d,e,,f,g,h,i,j,', 2, 6);
      stub(modalUtil, 'open', function(template, options) {
        expect(options.trim_rows).toEqual(2);
        expect(options.trim_columns).toEqual(5);
        return RSVP.resolve('save_trimmed');
      });
      var outcome = await settle(c);
      expect(outcome).toEqual('proceed');
      expect(c.get('model.grid.rows')).toEqual(2);
      expect(c.get('model.grid.columns')).toEqual(5);
      expect(c.get('model.grid.labels')).toEqual('a,b,c,d,e,f,g,h,i,j');
    });

    itAsync('keeping the grid saves it at the size that was chosen', async function() {
      var c = savableComponent('a,b,c,d,e,f', 3, 3);
      stub(modalUtil, 'open', function() { return RSVP.resolve('save_as_is'); });
      var outcome = await settle(c);
      expect(outcome).toEqual('proceed');
      expect(c.get('model.grid.rows')).toEqual(3);
      expect(c.get('model.grid.columns')).toEqual(3);
    });

    itAsync('cancelling the partial dialog leaves the grid exactly as it was', async function() {
      var c = savableComponent('a,b,c,d,e,f', 3, 3);
      stub(modalUtil, 'open', function() { return RSVP.reject({ reason: 'force close' }); });
      var outcome = await settle(c);
      expect(outcome).toEqual('cancel');
      expect(c.get('model.grid.rows')).toEqual(3);
      expect(c.get('model.grid.columns')).toEqual(3);
      expect(c.get('model.grid.labels')).toEqual('a,b,c,d,e,f');
    });

    /* The REAL attemptSave runs; only the gate and the downstream save are replaced. If
       attemptSave ever stopped consulting the gate, or started saving on a cancel, one of
       these two fails. */
    itAsync('attemptSave saves only once the gate has agreed', async function() {
      var c = savableComponent('a,b,c,d', 2, 2);
      var saved = 0;
      c.actions = Object.create(c.actions);
      c.actions.saveBoard = function() { saved++; };
      c._confirm_grid_completeness = function() { return RSVP.resolve(); };
      c.send('attemptSave');
      await RSVP.resolve().then(function() {}).then(function() {});
      expect(saved).toEqual(1);
    });

    itAsync('attemptSave does not save when the gate says cancel', async function() {
      var c = savableComponent('a,b,c,d', 2, 2);
      var saved = 0;
      c.actions = Object.create(c.actions);
      c.actions.saveBoard = function() { saved++; };
      c._confirm_grid_completeness = function() { return RSVP.reject({ reason: 'cancelled' }); };
      c.send('attemptSave');
      await RSVP.resolve().then(function() {}).then(function() {});
      expect(saved).toEqual(0);
    });
  });

  /* THE CHOSEN GRID SIZE MUST SURVIVE TYPING LABELS.
   *
   * `autoFitGrid` observes `model.grid.labels` and re-shapes the board to the tightest
   * near-square that holds them. That is a reasonable default for someone who never thinks
   * about size -- and it was silently overruling everyone who did, including the wizard's
   * own grid-size step, the moment the first word was typed.
   *
   * The split these tests draw: auto-fit is the behaviour for a size NOBODY chose, and stops
   * being the behaviour the instant somebody does. */
  describe('grid size chosen by the user', function() {
    function namedComponent() {
      var c = makeComponent();
      c.set('model.name', 'Test Board');
      return c;
    }

    it('still auto-fits for someone who never picks a size', function() {
      var c = namedComponent();
      c.set('model.grid.labels', 'a,b,c,d,e');
      // ceil(sqrt(5)) = 3 columns, ceil(5/3) = 2 rows.
      expect(c.get('model.grid.columns')).toEqual(3);
      expect(c.get('model.grid.rows')).toEqual(2);
    });

    it('keeps a size picked in the grid step when labels are added', function() {
      var c = namedComponent();
      c.send('setGridSize', 6, 7);
      c.set('model.grid.labels', 'a,b,c,d,e');
      expect(c.get('model.grid.rows')).toEqual(6);
      expect(c.get('model.grid.columns')).toEqual(7);
    });

    it('keeps a size typed into the rows stepper', function() {
      var c = namedComponent();
      c.send('setGridRows', { target: { value: '4' } });
      c.set('model.grid.labels', 'a,b,c,d,e,f,g,h,i');
      expect(c.get('model.grid.rows')).toEqual('4');
      expect(c.get('model.grid.columns')).toEqual(6, 'the untouched dimension is left alone too');
    });

    it('keeps a size typed into the columns stepper', function() {
      var c = namedComponent();
      c.send('setGridColumns', { target: { value: '8' } });
      c.set('model.grid.labels', 'a,b,c');
      expect(c.get('model.grid.columns')).toEqual('8');
      expect(c.get('model.grid.rows')).toEqual(5);
    });

    it('keeps the chosen size across repeated label edits', function() {
      var c = namedComponent();
      c.send('setGridSize', 6, 7);
      c.set('model.grid.labels', 'a');
      c.set('model.grid.labels', 'a,b,c,d,e,f,g,h,i,j,k,l');
      c.set('model.grid.labels', 'a,b');
      expect(c.get('model.grid.rows')).toEqual(6);
      expect(c.get('model.grid.columns')).toEqual(7);
    });

    it('does not resize when labels overflow the chosen grid', function() {
      // Overflow is the existing `too_many_labels` warning's job. Silently growing the board
      // would be the same overrule this fixes, just in the other direction.
      var c = namedComponent();
      c.send('setGridSize', 2, 2);
      c.set('model.grid.labels', 'a,b,c,d,e,f,g,h,i,j');
      expect(c.get('model.grid.rows')).toEqual(2);
      expect(c.get('model.grid.columns')).toEqual(2);
      expect(c.get('too_many_labels')).toEqual(true);
    });

    it('treats agreeing to a trim as choosing that size', function() {
      var c = namedComponent();
      c.set('model.grid.labels', 'a,b,c,d,e,f');
      c.set('model.grid.rows', 3);
      c.set('model.grid.columns', 3);
      stub(modalUtil, 'open', function() { return RSVP.resolve('save_trimmed'); });
      return c._confirm_grid_completeness().then(function() {
        expect(c.get('model.grid.rows')).toEqual(2);
        expect(c.get('model.grid.columns')).toEqual(3);
        // A later label edit must not undo the size the person just agreed to.
        c.set('model.grid.labels', 'a,b,c,d,e,f,g');
        expect(c.get('model.grid.rows')).toEqual(2);
        expect(c.get('model.grid.columns')).toEqual(3);
      });
    });

    it('leaves the mid-edit guard in place', function() {
      // Auto-fit already skipped while an inline cell edit is open, so the input is not
      // pulled out from under the caret. That guard is independent of the chosen-size one.
      var c = namedComponent();
      c.set('_editIdx', 0);
      c.set('model.grid.labels', 'a,b,c,d,e');
      expect(c.get('model.grid.rows')).toEqual(5);
      expect(c.get('model.grid.columns')).toEqual(6);
    });
  });
});
