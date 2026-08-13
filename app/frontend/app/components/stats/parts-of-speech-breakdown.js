import Component from '@ember/component';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { computed } from '@ember/object';
import { from_counts } from '../../utils/proportions';

// Written as literal `i18n.t` calls so `i18n_generator.rb` can find the keys —
// the part-of-speech name arrives from the server as a bare string, and a
// computed key would be invisible to the generator. Anything the server sends
// that is not listed here falls through to the raw name rather than going blank.
// The existing `noun` / `verb` / ... keys are NOT reused: those carry worked
// examples ("Noun (dog, Dad)") for the word-data editor, far too long for a
// chart row.
function part_of_speech_label(key) {
  var labels = {
    noun: i18n.t('part_of_speech_noun', "Noun"),
    verb: i18n.t('part_of_speech_verb', "Verb"),
    adjective: i18n.t('part_of_speech_adjective', "Adjective"),
    adverb: i18n.t('part_of_speech_adverb', "Adverb"),
    pronoun: i18n.t('part_of_speech_pronoun', "Pronoun"),
    preposition: i18n.t('part_of_speech_preposition', "Preposition"),
    conjunction: i18n.t('part_of_speech_conjunction', "Conjunction"),
    article: i18n.t('part_of_speech_article', "Article"),
    determiner: i18n.t('part_of_speech_determiner', "Determiner"),
    interjection: i18n.t('part_of_speech_interjection', "Interjection"),
    question: i18n.t('part_of_speech_question', "Question"),
    negation: i18n.t('part_of_speech_negation', "Negation"),
    number: i18n.t('part_of_speech_number', "Number"),
    other: i18n.t('part_of_speech_other', "Other")
  };
  return labels[key] || key;
}

export default Component.extend({
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6 col-xs-6');
    } else {
      // Full width on phones: a half-width column leaves the chart ~140px across,
      // which crushes the labels. Compare mode (above) keeps two per row on
      // purpose, since the whole point there is side-by-side reading.
      return htmlSafe('col-sm-4 col-xs-12');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('break-inside: avoid; border-left: 1px solid #eee;');
    } else {
      return htmlSafe('break-inside: avoid;');
    }
  }),
  // Nine-ish categories that all carry meaning: a sorted bar row per part of
  // speech, each labelled with its own name and share, reads them all at a
  // glance where a nine-slice pie could not. Bar width IS the printed
  // percentage, so the mark never disagrees with its label. `draw_id` is in the
  // dependent keys because the controller bumps it to force a redraw.
  rows: computed(
    'usage_stats.{draw_id,modeling,parts_of_speech,modeled_parts_of_speech}',
    function() {
      var stats = this.get('usage_stats');
      var parts = stats && (stats.get('modeling') ? stats.get('modeled_parts_of_speech') : stats.get('parts_of_speech'));
      var res = from_counts(parts, {label_for: part_of_speech_label});
      return res.rows.map(function(row) {
        return Object.assign({}, row, {
          style: htmlSafe('width: ' + row.percent + '%;')
        });
      });
    }
  )
});
