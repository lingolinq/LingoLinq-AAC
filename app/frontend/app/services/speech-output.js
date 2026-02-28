// =============================================================================
// VoiceReach AAC — Speech Output Service
// app/services/speech-output.js
//
// Wraps the Web Speech API (SpeechSynthesis). Falls back gracefully when
// the API is unavailable (e.g. server-side rendering, older browsers).
// =============================================================================

import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class SpeechOutputService extends Service {
  @tracked isSpeaking = false;
  @tracked selectedVoice = null;

  // Expose available voices reactively
  @tracked voices = [];

  constructor() {
    super(...arguments);
    this._loadVoices();

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this._loadVoices();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Speak the given text. Returns a Promise that resolves when done.
   * @param {string} text
   * @param {object} opts  – { rate, pitch, volume }
   */
  speak(text, opts = {}) {
    if (!this._isSupported) {
      console.warn('[SpeechOutput] Web Speech API not supported.');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      window.speechSynthesis.cancel(); // stop any in-progress utterance

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice  = this.selectedVoice;
      utterance.rate   = opts.rate   ?? 0.9;
      utterance.pitch  = opts.pitch  ?? 1.0;
      utterance.volume = opts.volume ?? 1.0;

      utterance.onstart = () => { this.isSpeaking = true; };
      utterance.onend   = () => { this.isSpeaking = false; resolve(); };
      utterance.onerror = (err) => { this.isSpeaking = false; reject(err); };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop() {
    if (!this._isSupported) return;
    window.speechSynthesis.cancel();
    this.isSpeaking = false;
  }

  setVoice(voice) {
    this.selectedVoice = voice;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  get _isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  _loadVoices() {
    if (!this._isSupported) return;
    this.voices = window.speechSynthesis.getVoices();
    // Default to the first English voice if not yet chosen
    if (!this.selectedVoice) {
      this.selectedVoice =
        this.voices.find((v) => v.lang.startsWith('en')) ?? this.voices[0] ?? null;
    }
  }
}
