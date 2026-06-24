import assert from 'assert';
import { generateRuleTests } from 'ember-template-lint';
import plugin from '../template-lint-plugin-lingolinq/index.js';

function expectViolation(item) {
  return {
    template: item,
    verifyResults(actual) {
      assert(actual.length >= 1, 'expected at least one lint violation');
      assert(
        actual.some((r) => r.rule === 'no-fn-handler-factory'),
        'expected no-fn-handler-factory violation'
      );
    }
  };
}

generateRuleTests({
  name: 'no-fn-handler-factory',
  plugins: [plugin],
  config: 'error',
  skipDisabledTests: true,
  groupingMethod: describe,
  groupMethodBefore: beforeEach,
  testMethod: it,
  good: [
    '{{on "click" (this.ctrlAction "backspace")}}',
    '{{on "click" (this.ctrlActionNoBubble "toggle")}}',
    '{{on "click" (this.invokeAttr "selectButton" btn)}}',
    '{{board-detail-grid selectButton=(this.ctrlAction "select_button")}}',
    '<button {{on "click" (this.ctrlAction "home" target)}}></button>',
    '{{on "click" (fn this.send "foo")}}'
  ],
  bad: [
    expectViolation('{{on "click" (fn this.ctrlAction "backspace")}}'),
    expectViolation('{{on "click" (fn this.ctrlActionNoBubble "toggle")}}'),
    expectViolation('{{on "click" (fn this.invokeAttr "selectButton" btn)}}'),
    expectViolation('{{board-detail-grid selectButton=(fn this.ctrlAction "select_button")}}'),
    expectViolation('<button {{on "click" (fn this.selfActionNoBubble "paint" level)}}></button>')
  ]
});
