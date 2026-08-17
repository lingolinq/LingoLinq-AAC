import i18n from './i18n';

/*
 * eval_board_builder — pure helper that turns a Quick Screen
 * recommendation's `starter_board_spec` into the request payload for
 * POST /api/v1/boards. Frontend-only, mirrors the existing
 * generate-board flow (comma-separated `labels`, OpenSymbols
 * resolution happens server-side).
 *
 * The category vocab bank covers the eight fringe categories the
 * recommendation engine can emit (food / people / play / school /
 * feelings / social / activities / needs). Words are intentionally
 * short, high-frequency AAC vocabulary appropriate for an emerging
 * communicator — the SLP edits the board afterward.
 */

// Core word sets keyed by stage. Stage 4 is single-symbol; stages
// 5–7 are phrase/sentence and add helper verbs.
var CORE_VOCAB = {
  4: ['I', 'want', 'more', 'go', 'stop', 'help', 'look', 'eat', 'drink', 'finished'],
  5: ['I', 'you', 'want', 'more', 'go', 'stop', 'help', 'look', 'eat', 'drink', 'finished', 'like'],
  6: ['I', 'you', 'want', 'more', 'go', 'stop', 'help', 'look', 'eat', 'drink', 'finished', 'like', 'big', 'little', 'hot', 'cold'],
  7: ['I', 'you', 'we', 'want', 'more', 'go', 'stop', 'help', 'look', 'eat', 'drink', 'finished', 'like', 'big', 'little', 'hot', 'cold', 'in', 'on']
};

var CATEGORY_VOCAB = {
  food:       ['eat', 'drink', 'apple', 'cookie', 'water', 'milk', 'snack', 'pizza'],
  people:     ['mom', 'dad', 'me', 'you', 'friend', 'baby', 'teacher', 'family'],
  play:       ['play', 'ball', 'turn', 'fun', 'toy', 'book', 'game', 'music'],
  school:     ['school', 'teacher', 'read', 'write', 'work', 'done', 'bathroom', 'desk'],
  feelings:   ['happy', 'sad', 'mad', 'tired', 'sick', 'hurt', 'scared', 'silly'],
  social:     ['hi', 'bye', 'thanks', 'sorry', 'please', 'ok', 'yes', 'no'],
  activities: ['walk', 'sit', 'wait', 'come', 'eat', 'sleep', 'work', 'play'],
  needs:      ['hot', 'cold', 'tired', 'hungry', 'thirsty', 'bathroom', 'hurt', 'help']
};

function uniqueLabels(labels) {
  var seen = {};
  var out = [];
  for (var i = 0; i < labels.length; i++) {
    var l = (labels[i] || '').trim();
    if (!l) { continue; }
    var key = l.toLowerCase();
    if (seen[key]) { continue; }
    seen[key] = true;
    out.push(l);
  }
  return out;
}

function assembleLabels(spec) {
  spec = spec || {};
  var stage = parseInt(spec.stage, 10) || 4;
  if (stage < 4) { stage = 4; }
  if (stage > 7) { stage = 7; }
  var core = (CORE_VOCAB[stage] || CORE_VOCAB[4]).slice();

  var fringe = [];
  var seeds = spec.fringe_seeds || [];
  for (var i = 0; i < seeds.length; i++) {
    var bucket = CATEGORY_VOCAB[seeds[i]];
    if (bucket) {
      // Pull 4 words per seed so even a single-category board has body
      fringe = fringe.concat(bucket.slice(0, 4));
    }
  }

  var grid = spec.grid || { rows: 3, cols: 3 };
  var capacity = (grid.rows || 3) * (grid.cols || 3);
  var coreFirst = spec.core_layout !== 'choice_grid';

  var ordered = coreFirst ? core.concat(fringe) : fringe.concat(core);
  ordered = uniqueLabels(ordered);

  if (ordered.length > capacity) {
    ordered = ordered.slice(0, capacity);
  }

  return ordered;
}

function fromSpec(spec, opts) {
  opts = opts || {};
  spec = spec || {};
  var labels = assembleLabels(spec);
  var grid = spec.grid || { rows: 3, cols: 3 };
  var stage = spec.stage || 4;
  var name = opts.name || i18n.t('eval_starter_board_name', "Quick Screen Starter Board");
  // One line: i18n_generator.rb parses `i18n.t(` line by line, so a wrapped call
  // never reaches en.json and is never sent for translation.
  var description = opts.description || i18n.t('eval_starter_board_description', "Auto-generated starter board from a Quick Screen evaluation. Stage %{s}, %{lib} symbols.", { s: stage, lib: spec.library || 'open' });
  return {
    name: name,
    description: description,
    locale: opts.locale || 'en',
    grid: {
      rows: grid.rows || 3,
      columns: grid.cols || 3,
      labels: labels.join(', '),
      labels_order: 'columns'
    },
    for_user_id: opts.for_user_id || 'self'
  };
}

export default {
  fromSpec: fromSpec,
  assembleLabels: assembleLabels,
  CORE_VOCAB: CORE_VOCAB,
  CATEGORY_VOCAB: CATEGORY_VOCAB
};
