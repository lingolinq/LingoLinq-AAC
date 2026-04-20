// =============================================================================
// VoiceReach AAC — Symbol Card Component
// app/components/aac/symbol-card.js
// =============================================================================

import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AacSymbolCardComponent extends Component {
  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  get symbol() {
    return this.args.symbol;
  }

  get cardClass() {
    return `symbol-card symbol-card--${this.symbol.category} ${this.args.size ? `symbol-card--${this.args.size}` : ''}`.trim();
  }

  get iconWrapClass() {
    return `symbol-card__icon-wrap symbol-card__icon-wrap--${this.symbol.category}`;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  @action
  handleSelect() {
    this.args.onSelect?.(this.symbol);
  }

  @action
  handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleSelect();
    }
  }
}
