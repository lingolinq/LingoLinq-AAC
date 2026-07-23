import Component from '@glimmer/component';
import { action } from '@ember/object';

// Captures a single key's code (used for scanning-key preferences). One-way
// @value in, @onChange out (DDAU): <KeyCodeTextField @value={{this.x}} @onChange={{set-value this "x"}} />
// Placeholder mirrors the original: "##" once a key is captured, otherwise blank.
export default class KeyCodeTextFieldComponent extends Component {
  get placeholder() {
    return this.args.value ? '##' : '';
  }

  @action
  handleKeyDown(event) {
    var current = this.args.value;
    // A captured Tab (double-tap) or Escape lets focus leave the field instead of re-capturing.
    if (current == '9' && event.keyCode == 9) { return; }
    if (current == 'Escape' && event.code == 'Escape') { return; }
    event.preventDefault();
    var code = event.code || event.keyCode;
    event.target.value = code;
    this.args.onChange?.(code);
  }
}
