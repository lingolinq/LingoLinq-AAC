import Controller from '@ember/controller';
import modal from '../../utils/modal';
import i18n from '../../utils/i18n';
import LingoLinq from '../../app';

export default Controller.extend({
  actions: {
    update_org: function() {
      var org = this.get('model');
      org.save().then(null, function(err) {
        console.log(err);
        modal.error(i18n.t('org_update_failed', 'Organization update failed unexpectedly'));
      });
    }
  },

  init() {
    this._super(...arguments);
var self = this;
this.ctrlAction = function(actionName) {
  var bound = Array.prototype.slice.call(arguments, 1);
  return function() {
    var args = bound.concat(Array.prototype.slice.call(arguments));
    var evt = args[args.length - 1];
    if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
      if (evt.preventDefault) { evt.preventDefault(); }
      args.pop();
    }
    self.send.apply(self, [actionName].concat(args));
  };
};
this.ctrlActionNoBubble = function(actionName) {
  var bound = Array.prototype.slice.call(arguments, 1);
  return function(event) {
    if (event && event.stopPropagation) { event.stopPropagation(); }
    if (event && event.preventDefault) { event.preventDefault(); }
    self.send.apply(self, [actionName].concat(bound));
  };
};
this.ctrlActionEventValue = function(actionName, targetProp) {
  return function(event) {
    var value = event && event.target ? event.target[targetProp] : undefined;
    self.send(actionName, value);
  };
};
  },

});
