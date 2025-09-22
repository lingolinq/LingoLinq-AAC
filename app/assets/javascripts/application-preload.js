//= require simple_state.js
//= require globals.js

window.app_version = "2025.09.18";

// Initialize LingoLinqAAC early to prevent errors
window.LingoLinqAAC = window.LingoLinqAAC || {
  track_error: function(msg, stack) {
    console.error("LingoLinqAAC Error: " + msg, stack);
  }
};
// Compatibility bridge for legacy SweetSuite references
window.SweetSuite = window.LingoLinqAAC;
