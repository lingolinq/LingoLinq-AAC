export default {
  name: 'store-setter',
  initialize: function(instance) {
    window.LingoLinq.store = instance.lookup('service:store');
  }
};
