import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/*
 * A reply alert carries `prior_author`, the contact hash {id, name, image_url} that
 * lib/json_api/alert.rb builds from the note's prior_contact. inbox.hbs must show its NAME:
 * rendering the hash itself prints "[object Object]".
 *
 * A rendering test cannot load alerts (no referenced_user, so persistence.fetch_inbox rejects;
 * see inbox-footer-scannable-test.js), and the `view` action writes to the fetched inbox, so the
 * message is set as `current` on the component, which `opening` registers with the modal service
 * (components/inbox.js, services/modal.js#setComponent).
 */
QUnit.module('Integration | inbox reply author', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('a reply shows the name of the message it answers', async function(assert) {
    assert.expect(5);
    const modal = this.owner.lookup('service:modal');
    try {
      await render(hbs`<Inbox />`);
      const inbox = modal.get('currentComponent');
      assert.ok(inbox, 'precondition: the inbox registered itself with the modal service');

      inbox.set('current', {
        id: 'a1', note: true, text: 'hi back', prior: 'hello',
        prior_author: { id: '1_1', name: 'Ann', image_url: 'https://example.com/avatars/avatar-1.png' }
      });
      await settled();
      const label = document.querySelector('.la-inbox__prior-label');
      assert.ok(label, 'precondition: the reply label renders');
      assert.ok(label.textContent.includes('Ann'), 'shows the name of the earlier message\'s author');
      assert.notOk(label.textContent.includes('[object'), 'never prints the contact hash');

      inbox.set('current', { id: 'a2', note: true, text: 'hi back', prior: 'hello', prior_author: { id: '1_1' } });
      await settled();
      assert.notOk(document.querySelector('.la-inbox__prior-label').textContent.includes('message from'),
        'no "message from" without a name');
    } finally {
      modal.setComponent(null);
    }
  });
});
