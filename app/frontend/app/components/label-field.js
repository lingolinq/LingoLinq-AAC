import Component from '@glimmer/component';
import { action } from '@ember/object';
import $ from 'jquery';
import editManager from '../utils/edit_manager';
import labelFit from '../utils/label_fit';

// Board button label input. @value flows in; label edits are written back through
// editManager (keyed off the closest [data-id] ancestor), NOT to a caller property,
// so no @onChange is needed. Pass class/placeholder/aria-label as plain attributes.
export default class LabelFieldComponent extends Component {
  _original_value = undefined;

  // Find the button ID from the closest parent with data-id
  _getButtonId(el) {
    var $el = $(el);
    var $parent = $el.closest('.button[data-id]');
    if (!$parent.length) {
      $parent = $el.closest('.md-board-detail-symbol-card[data-id]');
    }
    if (!$parent.length) {
      $parent = $el.closest('[data-id]');
    }
    return $parent.attr('data-id');
  }

  _commit(el) {
    var id = this._getButtonId(el);
    var button = editManager.find_button(id);
    if (button && el.value != button.label) {
      editManager.change_button(id, { label: el.value });
    }
    return id;
  }

  @action
  handleChange(event) {
    this._commit(event.target);
  }

  @action
  handleFocusIn(event) {
    editManager.clear_text_edit();
    // Store the original value so Escape can revert changes
    this._original_value = event.target.value;
  }

  @action
  handleKeyDown(event) {
    if (event.keyCode == 13 || event.code == 'Enter') {
      var id = this._commit(event.target);
      editManager.lucky_symbol(id);
      event.target.blur();
    } else if (event.keyCode == 27 || event.code == 'Escape') {
      // Revert to the original value and blur (no commit, so the button keeps its label)
      event.preventDefault();
      event.stopPropagation();
      if (this._original_value !== undefined) {
        event.target.value = this._original_value;
      }
      event.target.blur();
    }
  }

  @action
  handleFocusOut(event) {
    var el = event.target;
    var id = this._getButtonId(el);
    editManager.lucky_symbol(id);
    // Re-fit this one label when it's a board-detail symbol-card label input.
    // Guards against refitting label-fields used elsewhere (button stash,
    // classic board, folder-tab inputs).
    if (el && el.classList && el.classList.contains('md-board-detail-symbol-card__label-input')) {
      var gridEl = el.closest && el.closest('.md-board-detail-grid');
      if (gridEl) {
        labelFit.fit_one(el, gridEl);
      }
    }
  }
}
