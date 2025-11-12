import session from "./session";
import stashes from "./_stashes";

export function redirect_to_modern_view(loginData = {}) {
  let { user_name, access_token } = loginData;
  if (window.lingolinq_modern_view_host) {
    const betaDomainURL = window.lingolinq_modern_view_host + "/new-login";
    if (!user_name) {
      user_name = session.user_name;
    }
    const device_key = stashes
      .get_raw("coughDropDeviceId")
      .replace(" " + window.capabilities.readable_device_name, "");
    if (!access_token) {
      access_token = session.access_token;
    }
    const queryParams = `?jump_to_beta=true&user_name=${user_name}&device_key=${device_key}&access_token=${access_token}`;
    console.log(betaDomainURL, queryParams);
    window.location.href = betaDomainURL + queryParams;
  }
}

export function isModernViewURL(current_web_version) {
  if (window.lingolinq_modern_view_host) {
    if (current_web_version === window.lingolinq_modern_view_host) {
      return true;
    }
  }
  return false;
}
