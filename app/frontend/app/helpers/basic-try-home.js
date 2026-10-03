import Helper from '@ember/component/helper';
import { inject as service } from '@ember/service';
import { basic_try_target } from '../utils/board_picker_landing';

// {{basic-try-home "other"}} / {{basic-try-home "self"}}: is the board on screen a Basic "try",
// and for whom. See utils/board_picker_landing.js#basic_try_target. Reads app state through
// `get`, so it recomputes when the try marker, the board or the signed-in user changes.
export default Helper.extend({
  appState: service('app-state'),
  compute(params) {
    return basic_try_target(this.get('appState')) === params[0];
  }
});
