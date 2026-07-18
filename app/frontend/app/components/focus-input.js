import Component from '@glimmer/component';
import { action } from '@ember/object';

// A text input that auto-focuses + selects its text on insert (see the
// autofocus-select modifier). One-way @value in, @onChange out (DDAU).
// Optional @onEnter / @onFocusOut callbacks; Enter always prevents default +
// stops propagation (so it never submits an enclosing form), matching the
// original. Replaces the deprecated @ember/legacy-built-in-components TextField.
export default class FocusInputComponent extends Component {
  @action
  handleInput(event) {
    this.args.onChange?.(event.target.value);
  }

  @action
  handleKeyDown(event) {
    if (event.keyCode == 13 || event.code == 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.args.onEnter?.();
    }
  }

  @action
  handleFocusOut() {
    this.args.onFocusOut?.();
  }
}
