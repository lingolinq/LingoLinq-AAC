// Works out the platform (system, browser, mobile or not) from the browser's own description of itself.
// Moved unchanged out of utils/capabilities.js (2026-11-10, #1201) so it can be tested with a made-up browser:
// there it ran once, when the module loaded, and no test could reach it. The parameters carry the names of the
// globals they stand in for so the body is the same text as before.
import { is_ipad_with_mac_agent } from './ipad_detect';

export function detect_platform(capabilities, navigator, window) {
  capabilities.system = "Desktop";
  capabilities.browser = "Web browser";
  capabilities.mobile = false;
  if(navigator.userAgent.match(/ipod|ipad|iphone/i)) {
    capabilities.mobile = true;
    capabilities.system = "iOS";
    var match = (navigator.appVersion || '').match(/OS (\d+)_(\d+)_?(\d+)?/), version, primary_version;
            
    if (match !== undefined && match !== null) {
        version = [
            parseInt(match[1], 10),
            parseInt(match[2], 10),
            parseInt(match[3] || 0, 10)
        ];
        capabilities.ios_version = version[0];
    }

    if(capabilities.installed_app) {
      capabilities.browser = "App";
    } else if(navigator.userAgent.match(/crios/i)) {
      capabilities.browser = "Chrome";
    } else if(navigator.userAgent.match(/safari/i)) {
      capabilities.browser = "Safari";
    }
    var version = (navigator.userAgent.match(/OS\s+([\d_]+)\s+like/) || [])[1];
    version = parseInt(version && version.split(/_/)[0], 10);
    if(version && isFinite(version)) {
      capabilities.system_version = version;
    }
  } else if(navigator.userAgent.match(/android/i)) {
    capabilities.mobile = true;
    capabilities.system = "Android";
    capabilities.system_version = (navigator.userAgent.match(/Android (\d+(?:\.\d+)*)/) || [])[1];
    if(capabilities.installed_app) {
      capabilities.browser = "App";
      if(window.device && window.device.platform && window.device.platform.match(/fireos/i)) {
        capabilities.subsystem = "Kindle";
      }
    } else if(navigator.userAgent.match(/chrome/i)) {
      capabilities.browser = "Chrome";
    }
  } else if(navigator.userAgent.match(/windows phone/i)) {
    capabilities.mobile = true;
    capabilities.system = "Windows Phone";
  } else {
    if(navigator.userAgent.match(/macintosh/i)) {
      capabilities.system = "Mac"; capabilities.mobile = is_ipad_with_mac_agent(navigator, window); // `system` stays: see #1201
    } else if(navigator.userAgent.match(/windows\snt/i)) {
      capabilities.system = "Windows";
    } else if(navigator.userAgent.match(/LingoLinq Desktop App/)) {
      capabilities.system = "Windows";
      capabilities.browser = "App";
    }
    if(navigator.userAgent.match(/chrome/i)) {
      capabilities.browser = "Chrome";
    } else if(navigator.userAgent.match(/firefox/i)) {
      capabilities.browser = "Firefox";
    } else if(navigator.userAgent.match(/msie/i)) {
      capabilities.browser = "IE";
    } else if(navigator.userAgent.match(/edge/i)) {
      capabilities.browser = "Edge";
    } else if(navigator.userAgent.match(/safari/i)) {
      capabilities.browser = "Safari";
    }
  }
  capabilities.readable_device_name = capabilities.readable_device_name || (capabilities.browser + " for " + capabilities.system);
}
