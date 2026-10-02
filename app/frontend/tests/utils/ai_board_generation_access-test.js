import {
  describe,
  itAsync,
  expect,
  beforeEach,
  stub
} from 'frontend/tests/helpers/jasmine';
import RSVP from 'rsvp';
import modal from '../../utils/modal';
import { ensureAiBoardGenerationAccess } from '../../utils/ai_board_generation_access';

// The step a person goes through before AI board generation, driven end to end
// with the modal stubbed: what opens, for which account, and whether
// generation may continue afterwards.
describe('ensureAiBoardGenerationAccess', function() {
  var opened;
  var modalResult;

  function makeUser(id, opts) {
    var o = opts || {};
    return {
      id: id,
      get: function(key) {
        if(key === 'preferences') { return o.prefs || {}; }
        if(key === 'permissions') { return o.permissions || { view: true, edit: true }; }
        if(key === 'eu_under_16') { return !!o.eu_under_16; }
        if(key === 'eu_ai_parental_consent_parent_email') { return o.parent_email || null; }
        return null;
      }
    };
  }

  function makeState(sessionUser, currentUser, flagOn) {
    return {
      get: function(key) {
        if(key === 'feature_flags.ai_board_generation') { return flagOn !== false; }
        if(key === 'sessionUser') { return sessionUser; }
        if(key === 'currentUser') { return currentUser || sessionUser; }
        return null;
      }
    };
  }

  var on = { ai_features_enabled: true, ai_board_generation: true };

  beforeEach(function() {
    opened = [];
    modalResult = function() { return RSVP.resolve(false); };
    stub(modal, 'open', function(template, opts) {
      opened.push({ template: template, opts: opts });
      return modalResult(template, opts);
    });
  });

  itAsync('proceeds without a modal when board generation is on for the signed-in person', async function() {
    var result = await ensureAiBoardGenerationAccess(makeState(makeUser('self', { prefs: on })));
    expect(result.proceed).toEqual(true);
    expect(opened.length).toEqual(0);
  });

  itAsync('asks the signed-in person, not the communicator, to turn AI on', async function() {
    var supporter = makeUser('supporter');
    var communicator = makeUser('communicator');
    await ensureAiBoardGenerationAccess(makeState(supporter, communicator));
    expect(opened.length).toEqual(1);
    expect(opened[0].template).toEqual('enable-ai-features');
    expect(opened[0].opts.user).toBe(supporter);
    expect(opened[0].opts.blocked).toEqual(undefined);
  });

  itAsync('continues after Turn on saved board generation', async function() {
    modalResult = function() { return RSVP.resolve({ saved: true, requested_features: { ai_features_enabled: true, ai_board_generation: true } }); };
    var result = await ensureAiBoardGenerationAccess(makeState(makeUser('self')));
    expect(result.proceed).toEqual(true);
  });

  itAsync('does not continue after Not now', async function() {
    modalResult = function() { return RSVP.resolve(false); };
    var result = await ensureAiBoardGenerationAccess(makeState(makeUser('self')));
    expect(result.proceed).toEqual(false);
  });

  itAsync('does not continue when the modal is dismissed with an error', async function() {
    modalResult = function() { return RSVP.reject(new Error('closed')); };
    var result = await ensureAiBoardGenerationAccess(makeState(makeUser('self')));
    expect(result.proceed).toEqual(false);
  });

  itAsync('does not continue when the save turned on something other than board generation', async function() {
    modalResult = function() { return RSVP.resolve({ saved: true, requested_features: { ai_features_enabled: true } }); };
    var result = await ensureAiBoardGenerationAccess(makeState(makeUser('self')));
    expect(result.proceed).toEqual(false);
  });

  itAsync('gives the permission reason, and never continues, when the signed-in person cannot edit the account', async function() {
    var result = await ensureAiBoardGenerationAccess(makeState(makeUser('viewer', { permissions: { view: true } })));
    expect(result.proceed).toEqual(false);
    expect(opened.length).toEqual(1);
    expect(opened[0].template).toEqual('enable-ai-features');
    expect(opened[0].opts.blocked).toEqual(true);
    expect(opened[0].opts.blockedReason).toEqual('permission');
  });

  itAsync('opens the reason modal for the signed-in person, not the communicator', async function() {
    var supporter = makeUser('supporter', { permissions: { view: true } });
    var communicator = makeUser('communicator');
    await ensureAiBoardGenerationAccess(makeState(supporter, communicator));
    expect(opened[0].opts.blocked).toEqual(true);
    expect(opened[0].opts.user).toBe(supporter);
  });

  itAsync('opens EU parental consent for the signed-in person and does not continue', async function() {
    var supporter = makeUser('supporter', { eu_under_16: true, parent_email: 'parent@example.com' });
    var result = await ensureAiBoardGenerationAccess(makeState(supporter, makeUser('communicator')));
    expect(result.proceed).toEqual(false);
    expect(opened[0].template).toEqual('eu-ai-parental-consent');
    expect(opened[0].opts.user).toBe(supporter);
    expect(opened[0].opts.parentEmail).toEqual('parent@example.com');
  });
});
