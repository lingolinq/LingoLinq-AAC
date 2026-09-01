/* Geometry for paging a scrolling modal with explicit Up/Down controls.

   Why this exists: `components/modal-dialog.js:98` puts `maxHeight` + `overflow: auto` on
   `.modal-content` for EVERY modal, so any modal taller than the viewport is a scroll
   container — and nothing in the app scrolls one for a switch or eye-gaze user. The scanner's
   target filters are display checks (`offsetParent !== null || offsetWidth > 0 || …`), which
   an element scrolled out of an `overflow: auto` box still passes, so those users can neither
   see the content nor reach it. See docs/task-management/HANDOFF-eye-gaze-modal-scrolling.md.

   Kept as a util rather than inlined in one component because the same problem exists in 146
   `<ModalDialog>` templates plus ~74 inner scrollers declared in app.scss. Only the repairs
   modal is wired to it today; this is the seam the shared fix reuses rather than rewrites. */

/* One page less an overlap, so a line is never stepped straight over. Same contract as
   big-button.js#move, which uses `clientHeight - 20` on its own scroller. */
const PAGE_OVERLAP = 24;
/* Floor for a very short scrollport: a step smaller than this reads as "nothing happened". */
const MIN_STEP = 40;
/* Sub-pixel slack. scrollTop is fractional on zoomed/HiDPI displays, so `scrollTop >= max`
   is never exactly true and a strict compare leaves the Down button permanently enabled. */
const EPSILON = 1;

const modal_paging = {
  /* Nearest ancestor that ACTUALLY scrolls. Walks up rather than taking a selector so a
     caller cannot name the wrong element -- the scroller is `.modal-content` for the repairs
     modal but `#speak_menu` for Speak Options, and a hard-coded selector silently pages
     nothing on the other. Requires BOTH an overflow that scrolls and real overflowing
     content, so a container that merely declares `overflow: auto` is skipped. */
  container_for(el) {
    let node = el && el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const flow = window.getComputedStyle(node).overflowY;
      if ((flow === 'auto' || flow === 'scroll') && node.scrollHeight > node.clientHeight + EPSILON) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  },

  /* `needed` is what the caller gates rendering on. It must be false for a non-scrolling
     modal: a control that is present but inert is worse than absent here, because
     `modal.js#scannable_targets` has no visibility filter and a scanning user would stop on
     it regardless. Gate with {{#if}}, never with CSS. */
  state_for(box) {
    if (!box) { return { needed: false, at_top: true, at_bottom: true }; }
    const max = box.scrollHeight - box.clientHeight;
    return {
      needed: max > EPSILON,
      at_top: box.scrollTop <= EPSILON,
      at_bottom: box.scrollTop >= max - EPSILON
    };
  },

  page(box, direction) {
    if (!box) { return; }
    const step = Math.max(MIN_STEP, box.clientHeight - PAGE_OVERLAP);
    /* No explicit clamp. Assigning an out-of-range scrollTop is clamped by the DOM itself,
       so a Math.min/max here is unreachable code that no test can falsify -- it was written,
       and removed again when mutating it away left the suite green. */
    box.scrollTop += (direction === 'up' ? -step : step);
  }
};

export default modal_paging;
