import Component from '@glimmer/component';
import { action } from '@ember/object';

// A text input that suppresses auto-capitalize/correct. One-way @value in,
// @onChange out (DDAU), emitted on the native change event (blur/commit) to
// match the original component's behavior:
//   <LowercaseTextField @value={{this.x}} @onChange={{set-value this "x"}} />
export default class LowercaseTextFieldComponent extends Component {
  @action
  handleChange(event) {
    this.args.onChange?.(event.target.value);
  }
}
