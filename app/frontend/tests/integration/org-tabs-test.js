import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import i18n from 'frontend/utils/i18n';

/* THE ORG TABS (components/org-tabs.hbs), shared by Basic (in the page) and Modern (the app shell's
 * menu slot). Added 2026-11-09. Pins what a user and a screen reader get: Admin then the five people
 * sections, the active one lit and announced, and a landmark name that is NOT the org rail's
 * ("Organization Navigation", components/account-rail.js `menuName`): two navigation landmarks with
 * one name cannot be told apart (requested: "Organization Sections", for screen readers). */
module('Integration | Component | org-tabs', function(hooks) {
  setupRenderingTest(hooks);

  test('Admin and the five people sections, in order', async function(assert) {
    this.owner.setupRouter();
    await render(hbs`<OrgTabs @orgId="1_5" @navClass="md-pillnav" @tabClass="md-pillnav__pill" @label="Admin" />`);
    var tabs = Array.from(this.element.querySelectorAll('nav .ch-tab__label')).map(function(e) { return e.textContent.trim(); });
    assert.deepEqual(tabs, [
      i18n.t('admin', "Admin"), i18n.t('managers', "Managers"), i18n.t('supervisors', "Supervisors"),
      i18n.t('communicators', "Communicators"), i18n.t('evals', "Evals"), i18n.t('symbols', "Symbols")
    ]);
  });

  test('the strip and its dropdown are named "Organization Sections", not the rail\'s name', async function(assert) {
    this.owner.setupRouter();
    await render(hbs`<OrgTabs @orgId="1_5" @navClass="md-pillnav" @tabClass="md-pillnav__pill" @label="Admin" />`);
    var sections = i18n.t('org_sections', "Organization Sections");
    assert.dom('nav').hasAttribute('aria-label', sections);
    assert.dom('.md-pillnav-dropdown__list').hasAttribute('aria-label', sections);
    assert.notStrictEqual(sections, i18n.t('org_navigation', "Organization Navigation"), 'distinct from the org rail');
  });

  test('the active section is the one lit and announced', async function(assert) {
    this.owner.setupRouter();
    await render(hbs`<OrgTabs @orgId="1_5" @activeSection="evals" @navClass="md-pillnav" @tabClass="md-pillnav__pill" @label="Evals" />`);
    assert.dom('nav .is-active').exists({ count: 1 });
    assert.dom('nav .is-active .ch-tab__label').hasText(i18n.t('evals', "Evals"));
    assert.dom('nav [aria-current="page"]').exists({ count: 1 });
  });
});
