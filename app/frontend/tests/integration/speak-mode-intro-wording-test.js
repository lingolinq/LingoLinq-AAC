import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';

/* THE SPEAK MODE TIP NAMES THE MENU THAT IS ON SCREEN (requested 2026-10-13: "in board-detail, the tip says
 * Exit Speak Mode, but the menu says Exit Boards / To Home Page -> make the tip match the menu"; and the Speak
 * button became the speaker icon, so the tip no longer says "microphone"). Modern's board page menu reads
 * "Exit Boards / To Home Page" (templates/user/board-detail.hbs); Basic's menu still reads "Exit Speak Mode"
 * (templates/application.hbs), so Basic's tip keeps that. */
QUnit.module('Integration | speak-mode-intro wording', function(hooks) {
  setupRenderingTest(hooks);

  function view(owner, style) {
    owner.lookup('service:app-state').set('currentUser', EmberObject.create({ user_name: 'aiden', preferences: { board_view_style: style, progress: {} }, save: function() { return Promise.resolve(this); } }));
  }

  QUnit.test('Modern: names Exit Boards: To Home Page, and the speaker button', async function(assert) {
    view(this.owner, 'modern');
    await render(hbs`<SpeakModeIntro />`);
    assert.dom(this.element).includesText('Exit Boards: To Home Page');
    assert.dom(this.element).doesNotIncludeText('Exit Speak Mode');
    assert.dom(this.element).includesText('speaker button');
    assert.dom(this.element).doesNotIncludeText('microphone');
  });

  QUnit.test('Basic: keeps Exit Speak Mode, which is what its menu says', async function(assert) {
    view(this.owner, 'classic');
    await render(hbs`<SpeakModeIntro />`);
    assert.dom(this.element).includesText('Exit Speak Mode');
  });
});
