// =============================================================================
// VoiceReach AAC — Symbol Store Service
// app/services/symbol-store.js
//
// Loads and caches AAC symbols. In a real app this fetches from the
// Rails API via ember-data or a plain fetch. Here we seed with demo data.
// =============================================================================

import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

const DEMO_SYMBOLS = [
  // People
  { id: 'p1', category: 'people',      label: 'Mom',        emoji: '👩', tags: ['family', 'parent'] },
  { id: 'p2', category: 'people',      label: 'Dad',        emoji: '👨', tags: ['family', 'parent'] },
  { id: 'p3', category: 'people',      label: 'Doctor',     emoji: '👩‍⚕️', tags: ['medical', 'clinical'] },
  { id: 'p4', category: 'people',      label: 'Teacher',    emoji: '👩‍🏫', tags: ['school'] },
  { id: 'p5', category: 'people',      label: 'Friend',     emoji: '🧑', tags: ['social'] },

  // Actions
  { id: 'a1', category: 'actions',     label: 'Want',       emoji: '🤲', tags: ['request'] },
  { id: 'a2', category: 'actions',     label: 'Go',         emoji: '🚶', tags: ['movement'] },
  { id: 'a3', category: 'actions',     label: 'Sleep',      emoji: '😴', tags: ['rest', 'tired'] },
  { id: 'a4', category: 'actions',     label: 'Eat',        emoji: '🍽️', tags: ['food', 'hunger'] },
  { id: 'a5', category: 'actions',     label: 'Play',       emoji: '🎮', tags: ['fun'] },
  { id: 'a6', category: 'actions',     label: 'Stop',       emoji: '✋', tags: ['no', 'pause'] },

  // Feelings
  { id: 'f1', category: 'feelings',    label: 'Happy',      emoji: '😊', tags: ['emotion', 'good'] },
  { id: 'f2', category: 'feelings',    label: 'Sad',        emoji: '😢', tags: ['emotion'] },
  { id: 'f3', category: 'feelings',    label: 'Pain',       emoji: '😣', tags: ['hurt', 'medical'] },
  { id: 'f4', category: 'feelings',    label: 'Angry',      emoji: '😠', tags: ['emotion', 'mad'] },
  { id: 'f5', category: 'feelings',    label: 'Scared',     emoji: '😨', tags: ['fear', 'anxiety'] },
  { id: 'f6', category: 'feelings',    label: 'Tired',      emoji: '😪', tags: ['sleep', 'rest'] },

  // Food & Drink
  { id: 'fd1', category: 'food',       label: 'Water',      emoji: '💧', tags: ['drink', 'thirsty'] },
  { id: 'fd2', category: 'food',       label: 'Apple',      emoji: '🍎', tags: ['fruit', 'snack'] },
  { id: 'fd3', category: 'food',       label: 'Breakfast',  emoji: '🥣', tags: ['meal', 'morning'] },
  { id: 'fd4', category: 'food',       label: 'Lunch',      emoji: '🥪', tags: ['meal', 'afternoon'] },
  { id: 'fd5', category: 'food',       label: 'Juice',      emoji: '🧃', tags: ['drink'] },
  { id: 'fd6', category: 'food',       label: 'Cookie',     emoji: '🍪', tags: ['snack', 'sweet'] },

  // Places
  { id: 'pl1', category: 'places',     label: 'Home',       emoji: '🏠', tags: ['house', 'safe'] },
  { id: 'pl2', category: 'places',     label: 'Hospital',   emoji: '🏥', tags: ['medical', 'doctor'] },
  { id: 'pl3', category: 'places',     label: 'School',     emoji: '🏫', tags: ['learn', 'class'] },
  { id: 'pl4', category: 'places',     label: 'Park',       emoji: '🌳', tags: ['outside', 'play'] },
  { id: 'pl5', category: 'places',     label: 'Bathroom',   emoji: '🚿', tags: ['toilet', 'restroom'] },

  // Objects
  { id: 'o1', category: 'objects',     label: 'Phone',      emoji: '📱', tags: ['call', 'device'] },
  { id: 'o2', category: 'objects',     label: 'Book',       emoji: '📚', tags: ['read', 'school'] },
  { id: 'o3', category: 'objects',     label: 'Medicine',   emoji: '💊', tags: ['medical', 'pill'] },
  { id: 'o4', category: 'objects',     label: 'Blanket',    emoji: '🛏️', tags: ['sleep', 'comfort'] },

  // Descriptors
  { id: 'd1', category: 'descriptors', label: 'Hot',        emoji: '🔴', tags: ['temperature'] },
  { id: 'd2', category: 'descriptors', label: 'Cold',       emoji: '🔵', tags: ['temperature'] },
  { id: 'd3', category: 'descriptors', label: 'More',       emoji: '➕', tags: ['quantity'] },
  { id: 'd4', category: 'descriptors', label: 'Big',        emoji: '⬆️', tags: ['size'] },
  { id: 'd5', category: 'descriptors', label: 'Little',     emoji: '⬇️', tags: ['size', 'small'] },

  // Social
  { id: 's1', category: 'social',      label: 'Hello',      emoji: '👋', tags: ['greet'] },
  { id: 's2', category: 'social',      label: 'Goodbye',    emoji: '🫶', tags: ['leave'] },
  { id: 's3', category: 'social',      label: 'Sorry',      emoji: '🙁', tags: ['apologize'] },
];

export default class SymbolStoreService extends Service {
  @service store;  // ember-data store (for API-backed symbols)

  @tracked _localSymbols = DEMO_SYMBOLS;
  @tracked isLoaded = false;

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  get symbols() {
    return this._localSymbols;
  }

  /**
   * Fetch symbols from Rails API.
   * Replace _localSymbols with ember-data records in production.
   */
  async loadSymbols(userProfileId) {
    try {
      // const symbols = await this.store.query('symbol', { profile_id: userProfileId });
      // this._localSymbols = symbols.toArray();
      this.isLoaded = true;
    } catch (err) {
      console.error('[SymbolStore] Failed to load symbols:', err);
    }
  }
}
