//= require simple_state.js
//= require globals.js

window.app_version = "2025.09.18";

// Initialize SweetSuite early to prevent errors
window.SweetSuite = window.SweetSuite || {
  track_error: function(msg, stack) {
    console.error("SweetSuite Error: " + msg, stack);
  }
};
