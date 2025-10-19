//= require application-preload.js
//= require action_cable
// NOTE: vendor.js and frontend.js are loaded separately as they are Ember-built assets
// served directly from public/assets/ (not processed by Sprockets)
// See app/views/boards/index.html.erb for loading logic

window.load_state = window.load_state || {};
window.load_state.state = "js_loaded";
window.load_state.js_loaded = true;