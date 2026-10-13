import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import utterance from 'frontend/utils/utterance';
import speecher from 'frontend/utils/speecher';
import stashes from 'frontend/utils/_stashes';
import { maybe_offer_tour, accept_tour_offer, dismiss_tour_offer } from 'frontend/utils/tours/tour_offer';
import { start_talking_now } from 'frontend/utils/tours/start_talking';

/* THE TOUR OFFER (tour redesign, 2026-10-12): "Offer the tour after the person has talked once." After a
   communicator's first spoken message, a small one-time "Take a quick tour (1 min)?" prompt with Start and
   Not now. Start runs the communicator board tour on the board they are on. */
module('Unit | Utility | tours | tour offer', function(hooks) {
  setupTest(hooks);

  function user(opts) {
    opts = opts || {};
    var saves = [];
    var u = EmberObject.create({
      supporter_role: !!opts.supporter,
      preferences: { progress: opts.progress || {} },
      saves: saves,
      save: function() { saves.push(true); return RSVP.resolve(); }
    });
    return u;
  }
  function appState(u, opts) {
    opts = opts || {};
    return EmberObject.create({
      currentUser: u,
      speak_mode: opts.speak_mode !== false,
      currentBoardState: { key: 'aiden/vocal-flair-60', id: '1_2' },
      effective_view_user: opts.basic ? { preferences: { board_view_style: 'classic' } } : u
    });
  }

  test('a communicator is offered the tour once, after their first message', function(assert) {
    var u = user();
    var as = appState(u);
    assert.true(maybe_offer_tour(as), 'offered');
    assert.true(as.get('tour_offer_visible'), 'the prompt shows');
    assert.true(u.get('preferences.progress.guided_tours_autoshown.tour_offer'), 'remembered on the user');
    assert.strictEqual(u.saves.length, 1, 'and saved');
    dismiss_tour_offer(as);
    assert.false(as.get('tour_offer_visible'), 'Not now closes it');
    assert.false(maybe_offer_tour(as), 'never offered again');
  });

  test('no offer for a supporter, outside Speak Mode, or after a board tour was finished', function(assert) {
    assert.false(maybe_offer_tour(appState(user({ supporter: true }))), 'supporter');
    assert.false(maybe_offer_tour(appState(user(), { speak_mode: false })), 'not in Speak Mode');
    assert.false(maybe_offer_tour(appState(user({ progress: { guided_tours_completed: { board_alt_speak: true } } }))), 'Basic board tour done');
    assert.false(maybe_offer_tour(appState(user({ progress: { guided_tours_completed: { board_detail_speak_gentle: true } } }))), 'Modern board tour done');
    assert.false(maybe_offer_tour(EmberObject.create({})), 'no user (signed out, or the utterance unit tests)');
    // Stored in a map the server keeps (app/models/user.rb PROGRESS_PARAMS is an allowlist), so it survives a reload.
    assert.false(maybe_offer_tour(appState(user({ progress: { guided_tours_autoshown: { tour_offer: true } } }))), 'already offered, as saved on the server');
  });

  test('Start runs the board tour on the board they are on (Modern)', function(assert) {
    var as = appState(user());
    maybe_offer_tour(as);
    accept_tour_offer(as);
    assert.false(as.get('tour_offer_visible'), 'the prompt closes');
    assert.strictEqual(as.get('board_detail_tour_pending_speak'), 'aiden/vocal-flair-60', 'armed for this board');
    assert.true(as.get('board_detail_tour_speak_manual'), 'as a manual start, so the once-only gate lets it run');
  });

  test('Start runs the board tour on the board they are on (Basic)', function(assert) {
    var as = appState(user(), { basic: true });
    accept_tour_offer(as);
    assert.strictEqual(as.get('board_alt_tour_pending'), 'aiden/vocal-flair-60');
    assert.notOk(as.get('board_detail_tour_pending_speak'), 'not the Modern flag');
  });

  test('speaking a message makes the offer', function(assert) {
    assert.expect(1);
    var u = user();
    var as = appState(u);
    as.set('button_list', [{ label: 'hello' }]);
    var prevAppState = utterance.appState;
    var prevVocalized = utterance.get('list_vocalized');
    var speak = speecher.speak_collection;
    var log = stashes.log;
    speecher.speak_collection = function() {};
    stashes.log = function() {};
    try {
      utterance.appState = as;
      utterance.vocalize_list(null, {});
      assert.true(as.get('tour_offer_visible'), 'offered after the message');
    } finally {
      utterance.appState = prevAppState;
      utterance.set('list_vocalized', prevVocalized); // so the next suite starts with the utterance as it was
      speecher.speak_collection = speak;
      stashes.log = log;
    }
  });

  // Modern's Speak button (controllers/user/board-detail.js#_speak_current_sentence) skips vocalize_list
  // when the bar holds words that are not on the global list (quick phrases, Phrase Builder).
  test('speaking a Modern message built only from quick phrases also makes the offer', function(assert) {
    assert.expect(2);
    var as = appState(user());
    as.set('button_list', []);
    var controller = this.owner.factoryFor('controller:user/board-detail').create();
    var speakText = speecher.speak_text;
    var stop = speecher.stop;
    var said = [];
    speecher.speak_text = function(t) { said.push(t); };
    speecher.stop = function() {};
    try {
      controller.set('app_state', as);
      controller.set('sentence_parts', [{ id: 'q1', raw_index: 0, label: 'good morning' }]);
      controller._speak_current_sentence();
      assert.deepEqual(said, ['good morning'], 'spoken through the fallback');
      assert.true(as.get('tour_offer_visible'), 'offered after the message');
    } finally {
      speecher.speak_text = speakText;
      speecher.stop = stop;
      controller.destroy();
    }
  });

  test('"Take a quick tour" on the welcome counts as the offer', function(assert) {
    assert.expect(1);
    var done = assert.async();
    var u = user();
    var as = appState(u);
    as.home_in_speak_mode = function() {};
    var board = { key: 'aiden/vocal-flair-60', id: '1_2' };
    start_talking_now({ appState: as, user: u, withTour: true, findBoard: function() { return board; }, copyAsHome: function() { return board; } }).then(function() {
      assert.true(u.get('preferences.progress.guided_tours_autoshown.tour_offer'), 'not offered again after their first message');
      done();
    });
  });

  /* SPEAK-AS (adversary review, 2026-10-13). In Speak Mode `currentUser` is the Speak Mode user
     (services/app-state.js#set_current_user), so a supervisor speaking as a communicator was shown the
     communicator's offer, and the "offered" flag was saved on the communicator. */
  test('no offer while speaking as someone else; nothing saved on their account', function(assert) {
    var communicator = user();
    communicator.set('id', '1_2');
    var as = appState(communicator);
    as.set('sessionUser', EmberObject.create({ id: '1_1' }));
    assert.false(maybe_offer_tour(as), 'not offered');
    assert.notOk(as.get('tour_offer_visible'), 'no card');
    assert.notOk(communicator.get('preferences.progress.guided_tours_autoshown'), 'their account untouched');
    assert.strictEqual(communicator.saves.length, 0, 'and not saved');
    as.set('sessionUser', communicator);
    assert.true(maybe_offer_tour(as), 'the communicator themselves is offered it');
  });

  /* THE CARD BELONGS TO ONE PERSON IN ONE SPEAK MODE SESSION (adversary review, 2026-10-13): only Start or
     Not now cleared it, so it came back on every later Speak Mode entry, including a supervisor modeling. */
  test('the card shows only to the person it was offered to', function(assert) {
    var u = user(); u.set('id', '1_2');
    var as = appState(u);
    maybe_offer_tour(as);
    var comp = this.owner.factoryFor('component:tour-offer').create();
    comp.set('appState', as);
    assert.true(comp.get('visible'), 'shown to them');
    as.set('currentUser', EmberObject.create({ id: '1_9' }));
    assert.false(comp.get('visible'), 'not to someone else on the same device');
    comp.destroy();
  });

  test('leaving Speak Mode ends the offer; a brief dip while the page changes does not', async function(assert) {
    var u = user(); u.set('id', '1_2');
    var as = appState(u);
    maybe_offer_tour(as);
    var comp = this.owner.factoryFor('component:tour-offer').create();
    comp.set('appState', as);
    var wait = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
    as.set('speak_mode', false); await wait(200); as.set('speak_mode', true); await wait(1600);
    assert.true(as.get('tour_offer_visible'), 'kept across a brief dip');
    as.set('speak_mode', false); await wait(1700);
    assert.false(!!as.get('tour_offer_visible'), 'ended once they really left');
    as.set('speak_mode', true);
    assert.false(comp.get('visible'), 'and not back on the next entry');
    comp.destroy();
  });

  /* BASIC'S BOARD-TOUR FLAG (adversary review, 2026-10-13): it was cleared only when its tour started, so
     leaving the page first left it set, holding back the Speak Mode intro and firing the tour later, unasked. */
  test('Basic\'s board-tour flag is cleared when its tour cannot start', function(assert) {
    var appStateService = this.owner.lookup('service:app-state');
    appStateService.set('board_alt_tour_pending', 'aiden/vocal-flair-60');
    appStateService.set('currentBoardState', { key: 'aiden/vocal-flair-60' }); // its board, but never a board-alt tour page
    var comp = this.owner.factoryFor('component:guided-tour').create({ boardAltHost: false });
    comp._consumeBoardAltTour(30);
    assert.notOk(appStateService.get('board_alt_tour_pending'), 'cleared after the last attempt');
    comp.destroy();
  });
});
