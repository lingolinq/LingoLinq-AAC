'use strict';

/**
 * Flags this.get() / this.set() inside the executor of new RSVP.Promise(...).
 * In that callback, "this" is not the Ember service/controller, so use _this.get/_this.set.
 * Prevents "this.get is not a function" at runtime.
 */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow this.get/this.set inside RSVP.Promise executor; use _this from closure.',
      category: 'Possible Errors',
      recommended: true
    },
    schema: []
  },
  create(context) {
    function isPromiseConstructor(node) {
      if (!node || node.type !== 'NewExpression') return false;
      var callee = node.callee;
      if (callee.type === 'MemberExpression') {
        var prop = callee.property && callee.property.name;
        return prop === 'Promise';
      }
      return false;
    }

    function isInsidePromiseExecutor(ancestors) {
      for (var i = 0; i < ancestors.length; i++) {
        if (ancestors[i].type === 'NewExpression' && ancestors[i].arguments && ancestors[i].arguments[0] && isPromiseConstructor(ancestors[i])) {
          var executor = ancestors[i].arguments[0];
          if (executor.type === 'FunctionExpression' || executor.type === 'ArrowFunctionExpression') {
            if (ancestors.indexOf(executor) !== -1) {
              return true;
            }
          }
          break;
        }
      }
      return false;
    }

    return {
      CallExpression: function(node) {
        var callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.object.type !== 'ThisExpression') return;
        var prop = callee.property && callee.property.name;
        if (prop !== 'get' && prop !== 'set') return;
        var ancestors = context.getAncestors && context.getAncestors();
        if (!ancestors || !isInsidePromiseExecutor(ancestors)) return;
        context.report({
          node: node,
          message: 'Use _this.get/_this.set in RSVP.Promise executor (here "this" is not the Ember object). Capture the outer this as var _this = this and use _this in the callback.'
        });
      }
    };
  }
};
