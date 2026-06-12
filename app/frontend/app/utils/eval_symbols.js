/*
 * eval_symbols — label-to-slug helper for the inline eval-symbol
 * component. Maps eval-item option labels to slugs the eval-symbol
 * component knows how to render as inline SVGs.
 *
 * This replaces an earlier URL-based approach that pulled symbols
 * from OpenSymbols. Inline SVGs render reliably (no network, no
 * broken images), guarantee a consistent visual style across all
 * eval items, and let us draw AAC-appropriate symbols for abstract
 * concepts (more, help, stop, pronouns) that public symbol libraries
 * handle inconsistently.
 *
 * The slug map is conservative: only labels the eval-symbol
 * component has a defined SVG for are mapped. Unmapped labels return
 * null and the renderer falls back to label-only display.
 */

// label (lowercase) -> slug key into eval-symbol's SLUG_TO_SVG
const LABEL_TO_SLUG = {
  // foods + drink
  'apple': 'apple', 'bread': 'bread', 'pasta': 'pasta', 'cookie': 'cookie',
  'juice': 'juice', 'food': 'food', 'cup': 'cup', 'plate': 'plate',
  'spoon': 'spoon', 'fork': 'fork', 'drink': 'drink',
  'hot tea': 'hot tea',
  // animals
  'dog': 'dog', 'cat': 'cat', 'animal': 'animal',
  // common nouns / objects
  'ball': 'ball', 'book': 'book', 'toy': 'toy', 'car': 'car', 'truck': 'truck',
  'phone': 'phone', 'pencil': 'pencil', 'hat': 'hat', 'shoe': 'shoe',
  'sock': 'sock', 'pillow': 'pillow', 'hammer': 'hammer', 'tree': 'tree',
  'cloud': 'cloud', 'stair': 'stairs', 'razor': 'razor',
  // body / health
  'pain': 'pain', 'painful': 'painful',
  // people
  'family': 'family', 'friend': 'friend', 'doctor': 'doctor',
  'stranger': 'stranger', 'caregiver': 'caregiver',
  'my family': 'family', 'my caregiver': 'caregiver',
  'a stranger': 'stranger', 'a pet': 'pet', 'a landmark': 'landmark',
  // pronouns
  'i': 'i', 'you': 'you', 'they': 'they', 'it': 'it',
  // verbs
  'more': 'more', 'help': 'help', 'stop': 'stop',
  'eat': 'eat', 'play': 'play', 'go': 'go', 'sleep': 'sleep',
  'walk': 'walk', 'run': 'run',
  'remember': 'remember', 'forget': 'forget',
  // feelings / adjectives
  'happy': 'happy', 'sad': 'sad', 'tired': 'tired',
  'big': 'big', 'hungry': 'hungry', 'comfortable': 'comfortable',
  // colored variants
  'red apple': 'red apple', 'green leaf': 'green leaf',
  'blue ball': 'blue ball', 'yellow sun': 'yellow sun',
  'ice cube': 'ice cube', 'snow': 'snow', 'river': 'river',
  // yes/no
  'yes': 'yes', 'no': 'no',
  // time / orientation
  'morning': 'morning', 'bedtime': 'bedtime', 'last week': 'week',
  'daytime': 'sun', 'sun': 'sun'
  // Function words (because, and, but, so) intentionally omitted —
  // no clean visual representation; users who answer these probes
  // are presumed literate enough to read the text.
};

export function slugFor(label) {
  if (!label || typeof label !== 'string') { return null; }
  return LABEL_TO_SLUG[label.toLowerCase().trim()] || null;
}

export function decorateOptions(options) {
  return (options || []).map(function(opt) {
    if (opt.symbol_slug) { return opt; }
    return Object.assign({}, opt, { symbol_slug: slugFor(opt.label) });
  });
}

export default {
  slugFor: slugFor,
  decorateOptions: decorateOptions,
  LABEL_TO_SLUG: LABEL_TO_SLUG
};
