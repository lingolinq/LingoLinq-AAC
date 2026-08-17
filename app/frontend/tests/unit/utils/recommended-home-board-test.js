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

  var communicator = EmberObject.create({ id: '1_33', user_name: 'hannah_lee' });

  beforeEach(function() {
    previewOpen = false;
    previewed = null;
    app_state.set('setup_user', null);
    // A board whose key matches the exact vocal-flair regex.
    var board = EmberObject.create({ key: 'lingolinq/vocal-flair-60' });
    stub(LingoLinq.store, 'query', function() { return RSVP.resolve([board]); });
    stub(modal, 'board_preview', function(b) { previewed = b; previewOpen = true; });
    stub(modal, 'board_preview_open', function() { return previewOpen; });
  });

  afterEach(function() {
    app_state.set('setup_user', null);
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
    runs(function() {
      expect(!!previewed).toEqual(true);
      expect(app_state.get('setup_user')).toEqual(communicator);
    });
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
    var waited = false;
    runs(function() { setTimeout(function() { waited = true; }, 900); });
    waitsFor(function() { return waited; });
    runs(function() {
      expect(previewOpen).toEqual(true);
      expect(app_state.get('setup_user')).toEqual(communicator);
    });
  });

  it('releases setup_user once the preview closes', function() {
    var done = false;
    openRecommendedHomeBoard(60, communicator).then(function() { done = true; });
    waitsFor(function() { return done; });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(communicator);
      previewOpen = false;
    });
    waitsFor(function() { return app_state.get('setup_user') !== communicator; });
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
    runs(function() {
      // some other flow legitimately takes ownership, then our preview closes
      app_state.set('setup_user', other);
      previewOpen = false;
    });
    var waited = false;
    runs(function() { setTimeout(function() { waited = true; }, 1200); });
    waitsFor(function() { return waited; });
    runs(function() {
      expect(app_state.get('setup_user')).toEqual(other);
    });
  });
});
