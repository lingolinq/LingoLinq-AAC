import { helper } from '@ember/component/helper';
import i18n from '../utils/i18n';

export function boardLanguageLabel([board]) {
  if(!board || !board.get) { return null; }
  var locale = board.get('locale');
  var locales = board.get('locales') || [];
  var hasMultiple = locales && locales.length > 1;
  var nonDefault = locale && locale !== 'en' && locale !== 'en-US';
  if(!hasMultiple && !nonDefault) { return null; }
  if(!locale) { return null; }
  return i18n.readable_language(locale);
}

export default helper(boardLanguageLabel);
