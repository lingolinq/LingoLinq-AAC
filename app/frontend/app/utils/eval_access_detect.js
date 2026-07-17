import capabilities from './capabilities';

/*
 * eval_access_detect — best-effort detection of which AAC access
 * methods are usable on the current device. Surfaced on the eval
 * intake form so the SLP sees real signal about what's available
 * before picking the "Suspected access channel" answer.
 *
 * This is intentionally heuristic. The deep scanner.js / weblinger
 * pipelines have their own runtime probing, but we don't need to
 * spin those up just to render a status badge. We check the
 * lightweight signals each pathway exposes:
 *
 *   touch    — always considered available (web fallback works
 *              even without touch hardware via mouse/click)
 *   scan     — switch input. Considered available when bluetooth
 *              HID is supported (real switch devices) OR always
 *              available as a soft-switch (spacebar / single tap)
 *              — we report "soft switch" when no hardware is
 *              detected so the SLP knows the eval can still run
 *              in scanning mode using keyboard as a fallback.
 *   gaze     — eye-gaze. Considered available when:
 *              (a) weblinger library is loaded (the webcam-based
 *                  gaze pathway used by the main board flow), OR
 *              (b) capabilities reports a native head_tracking
 *                  capability (iOS / Android installed app), OR
 *              (c) navigator.mediaDevices.getUserMedia exists
 *                  (raw webcam access possible — gaze library
 *                  could load on demand)
 */

const STATUS = {
  READY: 'ready',
  SOFTWARE_FALLBACK: 'software_fallback',
  UNAVAILABLE: 'unavailable'
};

function detectTouch() {
  // Touch / mouse click is universally available in a browser context.
  // Native touch sensor (capabilities.mobile) is bonus signal, not required.
  return {
    status: STATUS.READY,
    hardware: capabilities && capabilities.mobile ? 'native_touch' : 'pointer_input'
  };
}

function detectScan() {
  // Real switch hardware speaks bluetooth HID. Web Bluetooth API
  // existence means a switch *could* be paired; we don't auto-pair
  // here. Otherwise spacebar / single-tap acts as a soft switch.
  const hasBluetooth = !!(typeof navigator !== 'undefined' && navigator.bluetooth);
  if (hasBluetooth) {
    return { status: STATUS.READY, hardware: 'bluetooth_switch_possible' };
  }
  return { status: STATUS.SOFTWARE_FALLBACK, hardware: 'spacebar_soft_switch' };
}

function detectGaze() {
  // Tier 1: weblinger already initialized (gaze running for the
  // current session — eval would inherit it). This is the most
  // reliable signal.
  if (typeof window !== 'undefined' && window.weblinger) {
    return { status: STATUS.READY, hardware: 'weblinger_active' };
  }
  // Tier 2: native head-tracking via capabilities (installed app
  // with vertical_ios_head_tracking or ios_head_tracking enabled).
  if (capabilities && capabilities.installed_app && capabilities.system === 'iOS' &&
      window && window.cordova && window.cordova.exec) {
    return { status: STATUS.READY, hardware: 'ios_head_tracking' };
  }
  // Tier 3: webcam present — gaze library could load on demand.
  if (typeof navigator !== 'undefined' && navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function') {
    return { status: STATUS.SOFTWARE_FALLBACK, hardware: 'webcam_gaze_loadable' };
  }
  return { status: STATUS.UNAVAILABLE, hardware: null };
}

export function detect() {
  return {
    touch: detectTouch(),
    scan:  detectScan(),
    gaze:  detectGaze()
  };
}

export const STATUSES = STATUS;

export default {
  detect: detect,
  STATUSES: STATUS
};
