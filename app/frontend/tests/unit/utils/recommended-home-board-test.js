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
import openRecommendedHomeBoard, { vocalFlairButtonsForGrid } from 'frontend/utils/recommended_home_board';
import LingoLinq from 'frontend/app';
import modal from 'frontend/utils/modal';
import app_state from 'frontend/utils/app_state';
import { recordOwnerGoneSkips } from 'frontend/tests/helpers/owner-gone';

/*
 * board-preview-overlay#pick_for_home resolves its target as
 * `app_state.setup_user || app_state.currentUser`, and reads it when the SLP
 * picks — seconds AFTER the preview opens. So the override has to outlive the
 * thing that opened it.
 *
 * It used to be owned by the calling component and restored in
 * willDestroyElement. The eval report's page-set card unmounts when the report
 * switches to School mode, so doing that with the preview still open reset
 * setup_user to null and the communicator's board landed on the signed-in SLP's
 * own account.
 */
describe('recommended_home_board setup_user lifetime', function() {
  var previewOpen = false;
  var previewed = null;
  var ownerGoneSkips = null; // restored in afterEach too, so a failed wait cannot leave it installed
  var previewChecks = 0;

  // The watch loop (claim_setup_user in utils/recommended_home_board.js) checks board_preview_open every
  // 400 ms and releases setup_user only after it has SEEN the preview open and then closed. Closing
  // before its first check leaves it polling, unreleased, into later tests. So: wait for a check while
  // open, close, then wait for the next check (the one that releases and stops the loop). Follow with runs().
  // Every runs() in this harness polls its own condition from the moment it is declared (they are not a
  // queue), so `ready` must say when the test's earlier steps are done; the preview closes only after that.
  function closePreviewAndWaitForRelease(ready, beforeClose) {
    var checksAtClose = null;
    waitsFor(function() { return ready() && previewChecks > 0; });
    runs(function() {
      if (beforeClose) { beforeClose(); }
      checksAtClose = previewChecks;
      previewOpen = false;
    });
    waitsFor(function() { return checksAtClose !== null && previewChecks > checksAtClose; });
  }

  var communicator = EmberObject.create({ id: '1_33', user_name: 'hannah_lee' });

  beforeEach(function() {
    previewOpen = false;
    previewed = null;
    previewChecks = 0;
    app_state.set('setup_user', null);
    // A board whose key matches the exact vocal-flair regex.
    var board = EmberObject.create({ key: 'lingolinq/vocal-flair-60' });
    stub(LingoLinq.store, 'query', function() { return RSVP.resolve([board]); });
    stub(modal, 'board_preview', function(b) { previewed = b; previewOpen = true; });
    stub(modal, 'board_preview_open', function() { previewChecks++; return previewOpen; });
  });

  afterEach(function() {
    app_state.set('setup_user', null);
    if (ownerGoneSkips) { ownerGoneSkips.restore(); ownerGoneSkips = null; }
  });

  it('maps a recommended grid to a published Vocal Flair set', function() {
    expect(vocalFlairButtonsForGrid({ rows: 6, cols: 10 })).toEqual(60);
    expect(vocalFlairButtonsForGrid({ rows: 4, cols: 6 })).toEqual(24);
    // off-catalogue falls back to the largest set that does not exceed it
    expect(vocalFlairButtonsForGrid({ rows: 7, cols: 10 })).toEqual(60);
    expect(vocalFlairButtonsForGrid(null)).toEqual(24);
  });

  it('points setup_user at the communicator once the preview opens', function() {
    var done = false;
    openRecommendedHomeBoard(60, communicator).then(function() { done = true; });
    waitsFor(function() { return done; });
    var checked = false;
    runs(function() {
      expect(!!previewed).toEqual(true);
      expect(app_state.get('setup_user')).toEqual(communicator);
      checked = true;
    });
    closePreviewAndWaitForRelease(function() { return checked; });
    runs();
  });

  it('KEEPS setup_user set while the preview is still open', function() {
    // The regression: the caller unmounting must not clear it. Nothing here
    // simulates a component at all — that is the point. Ownership is the
    // preview's, so the value must persist until the preview goes away.
    var done = false;
    openRecommendedHomeBoard(60, communicator).then(function() { done = true; });
    waitsFor(function() { return done; });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(communicator);
    });
    // still open a beat later
    var stillOpenChecked = false;
    var waited = false;
    runs(function() { setTimeout(function() { waited = true; }, 900); });
    waitsFor(function() { return waited; });
    runs(function() {
      expect(previewOpen).toEqual(true);
      expect(app_state.get('setup_user')).toEqual(communicator);
      stillOpenChecked = true;
    });
    closePreviewAndWaitForRelease(function() { return stillOpenChecked; });
    runs();
  });

  it('releases setup_user once the preview closes', function() {
    var done = false;
    openRecommendedHomeBoard(60, communicator).then(function() { done = true; });
    waitsFor(function() { return done; });
    var claimed = false;
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(communicator);
      claimed = true;
    });
    closePreviewAndWaitForRelease(function() { return claimed; });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(null);
    });
  });

  it('does not touch setup_user when no board is found', function() {
    stub(LingoLinq.store, 'query', function() { return RSVP.resolve([]); });
    stub(modal, 'error', function() { });
    var done = false;
    openRecommendedHomeBoard(60, communicator).then(function() { done = true; });
    waitsFor(function() { return done; });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(null);
    });
  });

  it('does not claim setup_user when no user was passed', function() {
    // routes/eval/quick leaves `user` null when the eval is run unattached, and
    // assigning then would copy the board onto the signed-in SLP.
    var done = false;
    openRecommendedHomeBoard(60, null).then(function() { done = true; });
    waitsFor(function() { return done; });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(null);
    });
  });

  it('does not clobber a later claim on release', function() {
    var other = EmberObject.create({ id: '1_44', user_name: 'someone_else' });
    var done = false;
    openRecommendedHomeBoard(60, communicator).then(function() { done = true; });
    waitsFor(function() { return done; });
    // some other flow legitimately takes ownership, then our preview closes
    closePreviewAndWaitForRelease(function() { return done; }, function() { app_state.set('setup_user', other); });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(other);
    });
  });

  it('stops watching the preview once the app that opened it is gone', function() {
    // The watch loop polls the CURRENT app's modal every 400 ms for up to 10 minutes; once the app
    // that opened the preview is torn down it must stop, not act on whichever app is current.
    var realAppState = LingoLinq.appState;
    var owner = EmberObject.create({ setup_user: null });
    var polls = 0;
    var done = false;
    LingoLinq.appState = owner;
    openRecommendedHomeBoard(60, communicator);
    waitsFor(function() { return previewOpen; });
    runs(function() {
      stub(modal, 'board_preview_open', function() { polls++; return true; });
      ownerGoneSkips = recordOwnerGoneSkips(owner);
      owner.destroy();
      LingoLinq.appState = realAppState;
      setTimeout(function() { done = true; }, 900);
    });
    waitsFor(function() { return done; });
    runs(function() {
      expect(polls).toEqual(0);
      // Exactly this loop's own skip. Earlier tests in this module that close the preview before the
      // loop's first 400 ms check leave their loops polling into later tests; a skip of theirs that
      // lands here belongs to another owner, so the recorder passes it on to the harness report.
      expect(ownerGoneSkips.count).toEqual(1);
    });
  });
});
