import { module, test } from 'qunit';
import { is_ipad_with_mac_agent } from 'frontend/utils/ipad_detect';

module('Unit | Utility | ipad_detect', function() {
  var mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';

  test('an iPad with a Mac user agent is recognised (#1201)', function(assert) {
    assert.true(is_ipad_with_mac_agent({userAgent: mac, maxTouchPoints: 5}));
  });

  test('a real Mac and everything else are not', function(assert) {
    assert.false(is_ipad_with_mac_agent({userAgent: mac, maxTouchPoints: 0}), 'a Mac');
    assert.false(is_ipad_with_mac_agent({userAgent: mac, maxTouchPoints: 1}), 'a Mac with a single-touch device');
    assert.false(is_ipad_with_mac_agent({userAgent: mac}), 'no touch information');
    assert.false(is_ipad_with_mac_agent({userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10}), 'a Windows touch screen');
    assert.false(is_ipad_with_mac_agent(null));
  });
});
