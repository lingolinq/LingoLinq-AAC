// =============================================================================
// VoiceReach AAC — Symbol Board Component
// app/components/aac/symbol-board.js
// =============================================================================

import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export const CATEGORIES = [
  { id: 'all',         label: 'All',         emoji: null },
  { id: 'people',      label: 'People',      emoji: '👥' },
  { id: 'actions',     label: 'Actions',     emoji: '🤲' },
  { id: 'feelings',    label: 'Feelings',    emoji: '💛' },
  { id: 'food',        label: 'Food & Drink', emoji: '🍎' },
  { id: 'places',      label: 'Places',      emoji: '📍' },
  { id: 'objects',     label: 'Objects',     emoji: '📦' },
  { id: 'descriptors', label: 'Descriptors', emoji: '🔤' },
  { id: 'social',      label: 'Social',      emoji: '💬' },
];

export const QUICK_PHRASES = [
  { id: 'yes',      label: 'Yes',      emoji: '✅' },
  { id: 'no',       label: 'No',       emoji: '❌' },
  { id: 'please',   label: 'Please',   emoji: '🙏' },
  { id: 'thankyou', label: 'Thank you', emoji: '😊' },
  { id: 'help',     label: 'Help me',  emoji: '🆘' },
  { id: 'wait',     label: 'Wait',     emoji: '⏸️' },
];

export default class AacSymbolBoardComponent extends Component {
  @service phraseBuilder;
  @service speechOutput;
  @service symbolStore;

  @tracked activeCategory = 'all';
  @tracked searchQuery = '';
  @tracked isLoading = false;

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  get categories() {
    return CATEGORIES;
  }

  get quickPhrases() {
    return QUICK_PHRASES;
  }

  get allSymbols() {
    return this.symbolStore.symbols;
  }

  get filteredSymbols() {
    let symbols = this.allSymbols;

    // Filter by category
    if (this.activeCategory !== 'all') {
      symbols = symbols.filter((s) => s.category === this.activeCategory);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      symbols = symbols.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    return symbols;
  }

  get hasResults() {
    return this.filteredSymbols.length > 0;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  @action
  selectCategory(categoryId) {
    this.activeCategory = categoryId;
  }

  @action
  addSymbolToPhrase(symbol) {
    this.phraseBuilder.addToken({
      id:       symbol.id,
      label:    symbol.label,
      category: symbol.category,
      emoji:    symbol.emoji,
    });
  }

  @action
  addQuickPhrase(phrase) {
    this.phraseBuilder.setQuickPhrase(phrase.label);
    if (this.args.autoSpeak) {
      this.speechOutput.speak(phrase.label);
    }
  }

  @action
  updateSearch(event) {
    this.searchQuery = event.target.value;
  }

  @action
  clearSearch() {
    this.searchQuery = '';
  }
}
