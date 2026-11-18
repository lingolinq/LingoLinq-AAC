import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';
import AiDisclosure from 'frontend/components/ai-disclosure';
import { clearAiConsentDeferral } from 'frontend/utils/article50_gate';

/*
 * AI data-sharing consent (#1136) on the one-time AI notice. "Not now" and the
 * agreement text exist only while consent is what is being asked; with only the
 * Article 50 acknowledgement outstanding the modal keeps its single button.
 */
QUnit.module('Integration | Component | ai-disclosure consent markup', function(hooks) {
  setupRenderingTest(hooks);

  function appStateFor(user) {
    return {
      get: function(key) {
        if(key === 'sessionUser' || key === 'currentUser') { return user; }
        return null;
      }
    };
  }

  function makeUser(overrides) {
    return EmberObject.create(Object.assign({
      id: 'self',
      global_id: 'render_test_user_1',
      feature_flags: {article_50_disclosure: true},
      article_50_disclosure_required: false,
      article_50_disclosure_shown: false,
      ai_consent_required: true,
      ai_consent_route: 'self',
      ai_consent_disclosures_version: 1
    }, overrides || {}));
  }

  hooks.beforeEach(function() {
    // No network: the Article 50 notice is not fetched, so the modal shows its
    // built-in fallback text in its place. Everything else is the real component.
    this.owner.register('component:ai-disclosure', AiDisclosure.extend({
      fetchDisclosure() { this.set('loading', false); }
    }));
  });

  hooks.afterEach(function() {
    if(this.user) { clearAiConsentDeferral(this.user); }
  });

  QUnit.test('consent only: agreement text, disclosure link, "Not now" and "Agree and Continue"; no Article 50 link', async function(assert) {
    this.user = makeUser();
    this.set('appState', appStateFor(this.user));
    await render(hbs`<AiDisclosure @appState={{this.appState}} />`);

    assert.dom('.la-terms-agree-actions .btn').exists({count: 2}, 'two buttons');
    assert.dom('.la-terms-agree-actions .btn.la-btn--ghost').hasText('Not now');
    assert.dom('.la-terms-agree-actions .btn.la-btn--primary').hasText('Agree and Continue');
    assert.dom('#ai-disclosure-summary').includesText('AI data-sharing disclosure');
    assert.dom('.la-terms-agree-actions a[href="/ai_consent/disclosures/1"]').exists('links to the AI data-sharing disclosure');
    assert.dom('.la-terms-agree-actions a[href*="art50_v1"]').doesNotExist('the Article 50 notice is not part of this prompt');
    assert.false(/AI transparency notice|full notice/.test(this.element.querySelector('#ai-disclosure-summary').textContent), 'no Article 50 notice text (neither the notice nor its loading or fallback line)');
  });

  QUnit.test('both outstanding: the Article 50 notice, the agreement and both buttons', async function(assert) {
    this.user = makeUser({article_50_disclosure_required: true});
    this.set('appState', appStateFor(this.user));
    await render(hbs`<AiDisclosure @appState={{this.appState}} />`);

    assert.dom('.la-terms-agree-actions .btn').exists({count: 2});
    assert.dom('.la-terms-agree-actions .btn.la-btn--ghost').hasText('Not now');
    assert.dom('.la-terms-agree-actions a[href*="art50_v1"]').exists('the Article 50 link is still there');
    assert.true(/AI transparency notice|full notice/.test(this.element.querySelector('#ai-disclosure-summary').textContent), 'the Article 50 notice area (its fallback text, offline) is shown');
  });

  QUnit.test('Article 50 only: unchanged, one button, no "Not now", no agreement text', async function(assert) {
    this.user = makeUser({ai_consent_required: false, article_50_disclosure_required: true});
    this.set('appState', appStateFor(this.user));
    await render(hbs`<AiDisclosure @appState={{this.appState}} />`);

    assert.dom('.la-terms-agree-actions .btn').exists({count: 1}, 'a single button');
    assert.dom('.la-terms-agree-actions .btn.la-btn--primary').hasText('Acknowledge and Continue');
    assert.dom('.la-terms-agree-actions .btn.la-btn--ghost').doesNotExist();
    assert.dom('#ai-disclosure-summary').doesNotIncludeText('AI data-sharing disclosure');
    assert.dom('.la-terms-agree-actions a[href^="/ai_consent/disclosures/"]').exists({count: 1}, 'only the Article 50 link');
  });

  QUnit.test('opened for the Article 50 notice with skipAiConsent: one button, uncloseable look, no "Not now", no consent sentence', async function(assert) {
    this.user = makeUser({article_50_disclosure_required: true});
    this.set('appState', appStateFor(this.user));
    await render(hbs`<AiDisclosure @appState={{this.appState}} @skipAiConsent={{true}} />`);

    assert.dom('.la-terms-agree-actions .btn').exists({count: 1}, 'a single button');
    assert.dom('.la-terms-agree-actions .btn.la-btn--primary').hasText('Acknowledge and Continue');
    assert.dom('.la-terms-agree-actions .btn.la-btn--ghost').doesNotExist();
    assert.dom('#ai-disclosure-summary').doesNotIncludeText('AI data-sharing disclosure');
    assert.dom('.la-terms-agree-actions a[href^="/ai_consent/disclosures/"]').exists({count: 1}, 'only the Article 50 link');
  });

  QUnit.test('a district account is not offered the agreement', async function(assert) {
    this.user = makeUser({ai_consent_route: 'organization', article_50_disclosure_required: true});
    this.set('appState', appStateFor(this.user));
    await render(hbs`<AiDisclosure @appState={{this.appState}} />`);

    assert.dom('.la-terms-agree-actions .btn').exists({count: 1});
    assert.dom('.la-terms-agree-actions .btn.la-btn--ghost').doesNotExist();
  });
});
