// =============================================================================
// VoiceReach AAC — Phrase Bar Component
// app/components/aac/phrase-bar.js
// =============================================================================

import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class AacPhraseBarComponent extends Component {
  @service phraseBuilder;
  @service speechOutput;

  @tracked isSpeaking = false;

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  get tokens() {
    return this.phraseBuilder.tokens;
  }

  get hasTokens() {
    return this.tokens.length > 0;
  }

  get phraseText() {
    return this.phraseBuilder.phraseText;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  @action
  async speak() {
    if (!this.phraseText) return;

    this.isSpeaking = true;
    try {
      await this.speechOutput.speak(this.phraseText);
    } finally {
      this.isSpeaking = false;
    }
  }

  @action
  clearPhrase() {
    this.phraseBuilder.clear();
  }

  @action
  removeToken(token) {
    this.phraseBuilder.removeToken(token);
  }

  @action
  backspace() {
    this.phraseBuilder.backspace();
  }
}
