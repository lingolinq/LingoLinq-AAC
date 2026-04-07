// =============================================================================
// VoiceReach AAC — Phrase Builder Service
// app/services/phrase-builder.js
// =============================================================================

import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class PhraseBuilderService extends Service {
  @tracked tokens = [];

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  get phraseText() {
    return this.tokens.map((t) => t.label).join(' ');
  }

  get isEmpty() {
    return this.tokens.length === 0;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  addToken(token) {
    this.tokens = [...this.tokens, { ...token, _key: crypto.randomUUID() }];
  }

  removeToken(token) {
    this.tokens = this.tokens.filter((t) => t._key !== token._key);
  }

  backspace() {
    if (this.tokens.length === 0) return;
    this.tokens = this.tokens.slice(0, -1);
  }

  clear() {
    this.tokens = [];
  }

  setQuickPhrase(text) {
    this.tokens = text.split(' ').map((word) => ({
      _key:     crypto.randomUUID(),
      label:    word,
      category: 'social',
      emoji:    null,
    }));
  }
}
