//= require simple_state.js
//= require globals.js

window.app_version = "2023.11.13b";

// Initialize SweetSuite early to prevent errors
window.SweetSuite = window.SweetSuite || {
  track_error: function(msg, stack) {
    console.error("SweetSuite Error: " + msg, stack);
  }
};
