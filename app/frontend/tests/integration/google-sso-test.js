import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import EmberObject from '@ember/object';

describe('login-form google SSO', function() {
  var component;

  beforeEach(function() {
    component = this.subject('login-form');
  });

  it('enables google button when feature flag is on', function() {
    component.set('app_state', EmberObject.create({
      feature_flags: { google_sso: true }
    }));
    expect(component.get('googleSsoEnabled')).toEqual(true);
  });

  it('hides google button when feature flag is off', function() {
    component.set('app_state', EmberObject.create({
      feature_flags: { google_sso: false }
    }));
    expect(component.get('googleSsoEnabled')).toEqual(false);
  });

  it('requires username picker selection for duplicate emails', function() {
    component.set('google_link_state', {
      mode: 'email_match',
      candidates: [{ user_name: 'alice' }, { user_name: 'bob' }],
      single_candidate: false
    });
    expect(component.get('googleLinkNeedsPicker')).toEqual(true);
    component.set('google_link_password', 'secret123');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(true);
    component.set('google_link_selected_user_name', 'alice');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(false);
  });

  it('shows readonly username for a single email match', function() {
    component.set('google_link_state', {
      mode: 'email_match',
      candidates: [{ user_name: 'alice', display_name: 'Alice Example' }],
      single_candidate: true
    });
    expect(component.get('googleLinkNeedsPicker')).toEqual(false);
    expect(component.get('googleLinkShowsReadonlyCandidate')).toEqual(true);
    expect(component.get('googleLinkEmailMatchCandidates.length')).toEqual(1);
    expect(component.get('googleLinkSingleUsername')).toEqual('alice');
    expect(component.get('googleLinkResolvedUsername')).toEqual('alice');
    component.set('google_link_password', 'secret123');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(false);
  });

  it('shows resolved username from selected_user_name when candidates are missing', function() {
    component.set('google_link_state', {
      mode: 'email_match',
      candidates: [],
      email: 'alice@example.com',
      selected_user_name: 'alice',
      single_candidate: true
    });
    expect(component.get('googleLinkResolvedUsername')).toEqual('alice');
    expect(component.get('googleLinkShowsReadonlyCandidate')).toEqual(false);
  });

  it('requires username entry for manual link mode', function() {
    component.set('google_link_state', {
      mode: 'manual_link',
      candidates: [],
      email: 'someone@gmail.com'
    });
    expect(component.get('googleLinkManualMode')).toEqual(true);
    expect(component.get('googleLinkNeedsUsernameField')).toEqual(true);
    component.set('google_link_password', 'secret123');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(true);
    component.set('google_link_selected_user_name', 'larry');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(false);
  });

  it('does not require password for linked account selection', function() {
    component.set('google_link_state', {
      mode: 'account_select',
      candidates: [{ user_name: 'alice' }, { user_name: 'bob' }]
    });
    expect(component.get('googleLinkAccountSelectMode')).toEqual(true);
    expect(component.get('googleLinkNeedsPassword')).toEqual(false);
    expect(component.get('googleLinkNeedsPicker')).toEqual(true);
    expect(component.get('googleLinkSubmitDisabled')).toEqual(true);
    component.set('google_link_selected_user_name', 'alice');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(false);
    expect(component.get('googleLinkConfirmIsSignIn')).toEqual(true);
  });

  it('requires password when linking an unlinked account from account select', function() {
    component.set('google_link_state', {
      mode: 'account_select',
      allow_manual_link: true,
      candidates: [{ user_name: 'alice' }, { user_name: 'bob' }],
      unlinked_candidates: [{ user_name: 'carol' }]
    });
    component.set('google_link_selected_user_name', 'carol');
    expect(component.get('googleLinkSelectedIsLinked')).toEqual(false);
    expect(component.get('googleLinkNeedsPassword')).toEqual(true);
    expect(component.get('googleLinkSubmitDisabled')).toEqual(true);
    component.set('google_link_password', 'secret123');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(false);
    expect(component.get('googleLinkConfirmIsSignIn')).toEqual(false);
  });

  it('shows manual link fields when linking another account from account select', function() {
    component.set('google_link_state', {
      mode: 'account_select',
      allow_manual_link: true,
      candidates: [{ user_name: 'alice' }, { user_name: 'bob' }]
    });
    expect(component.get('googleLinkShowLinkAnother')).toEqual(true);
    component.send('start_google_link_another');
    expect(component.get('googleLinkNeedsUsernameField')).toEqual(true);
    expect(component.get('googleLinkNeedsPassword')).toEqual(true);
    component.set('google_link_selected_user_name', 'dave');
    component.set('google_link_password', 'secret123');
    expect(component.get('googleLinkSubmitDisabled')).toEqual(false);
  });

  it('sets declined-consent login_error from ?coppa_declined=1', function() {
    var prev = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState({}, '', '/login?coppa_declined=1');
    try {
      component.syncGoogleReturnParams();
      expect(component.get('coppa_awaiting_parent')).toEqual(false);
      expect(component.get('coppa_needs_parent_email')).toEqual(false);
      expect(String(component.get('login_error'))).toMatch(/declined consent/);
    } finally {
      window.history.replaceState({}, '', prev);
    }
  });
});
