import Component from '@ember/component';

// Shared focused-home content (greeting + Talk hero + boards preview grid). Rendered
// by BOTH the real focused view (dashboard/authenticated-view) AND a hidden
// clone-source during the Getting Started modal — so the modal's Focused preview
// clones live markup and can never drift from the real view. tagName '' → the
// template's `.md-main--focused` is the component's root (no wrapper element).
//
// Args:
//   @greetingName  — first name for "Hi <name>"
//   @previewBoards — the board tiles (same source as the dynamic strip)
//   @hideSpeak     — htmlSafe style that hides the Talk hero when Speak is off
//   @hideBoards    — htmlSafe style that hides the boards section when off
//   @onTalk        — closure action fired by the Talk hero (→ speak)
//   @onBoard       — closure action fired by a board tile, called with the board key
export default Component.extend({
  tagName: ''
});
