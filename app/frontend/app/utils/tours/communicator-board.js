// THE COMMUNICATOR'S BOARD TOUR (2026-10-12, tour redesign: docs/task-management/2026-10-12_tour-redesign.md).
//
// Requested: "4 or 5 steps per role. Communicators: review your board, switching boards, messages and help,
// the grown-ups area." Five steps on the communicator's board in Speak Mode: a welcome, then one spotlight
// per topic, the last one finishing the tour. The same steps and words in both views; only the targets and
// the tour skin differ:
//   - modern: the Modern board page (board-detail), reached through board-detail-speak.js for a communicator;
//   - basic:  the Basic board page (board-alt) in Speak Mode, registered in registry.js.
// Like every tour here it is DOM-driven: a topic whose control is not on screen is skipped. It never names
// the supporter toolbox (Upgrade, Logs, Reports, Subscription, customizing the dashboard).

import i18n from '../i18n';
import { standardButtons, decoratedTitle, tourChecklist, visibleEl, liveTarget, waitForElement } from './shared';

// i18n extraction no-op for the decoratedTitle heading (see classic-home.js for why).
// eslint-disable-next-line no-unused-vars
function _communicator_board_tour_i18n_extractor_no_op() {
  i18n.t('comm_board_tour_welcome_title', "Here's your board");
}

var TARGETS = {
  modern: { board: '.md-board-detail-grid-fade', home: '.md-board-detail-home-btn', message: '.md-board-detail-sentence-row', grownups: '.md-board-detail-actions-toggle' },
  basic: { board: '.board', home: '#home_button', message: '#speak', grownups: '#identity_button' }
};

function topics(view) {
  var t = TARGETS[view] || TARGETS.modern;
  return [
    {
      id: 'comm_board_tour_board', sel: t.board, on: 'top', padded: true,
      title: i18n.t('comm_board_tour_board_title', "Review your board"),
      text: tourChecklist([
        i18n.t('comm_board_tour_board_b1', "Each button says a word or adds it to your message"),
        i18n.t('comm_board_tour_board_b2', "Folders open to more words"),
        i18n.t('comm_board_tour_board_b3', "Take your time and look around")
      ])
    },
    {
      id: 'comm_board_tour_switch', sel: t.home, on: 'bottom',
      title: i18n.t('comm_board_tour_switch_title', "Switching boards"),
      text: tourChecklist([
        i18n.t('comm_board_tour_switch_b1', "Folders take you to other boards"),
        i18n.t('comm_board_tour_switch_b2', "Home always brings you back to your main board"),
        i18n.t('comm_board_tour_switch_b3', "A grown-up can change your main board anytime")
      ])
    },
    {
      id: 'comm_board_tour_message', sel: t.message, on: 'bottom', padded: true,
      title: i18n.t('comm_board_tour_message_title', "Messages and help"),
      text: tourChecklist([
        i18n.t('comm_board_tour_message_b1', "Your words appear here as you tap"),
        i18n.t('comm_board_tour_message_b2', "Speak says your message out loud"),
        i18n.t('comm_board_tour_message_b3', "Backspace or clear to fix it"),
        i18n.t('comm_board_tour_message_b4', "Need help? Ask a grown-up, or take this tour again")
      ])
    },
    {
      id: 'comm_board_tour_grownups', sel: t.grownups, on: 'bottom', last: true,
      title: i18n.t('comm_board_tour_grownups_title', "The grown-ups area"),
      text: tourChecklist([
        i18n.t('comm_board_tour_grownups_b1', "This menu is for grown-ups"),
        i18n.t('comm_board_tour_grownups_b2', "It leads to settings and the home page"),
        i18n.t('comm_board_tour_grownups_b3', "If a PIN is set, a grown-up enters it")
      ])
    }
  ];
}

function buildCommunicatorBoardSteps(view, layout) {
  var basic = view === 'basic';
  var skin = basic ? { classic: true } : undefined;
  var p = basic ? 'ch' : 'md';
  var steps = [{
    id: 'comm_board_tour_welcome',
    title: decoratedTitle('comm_board_tour_welcome_title', "Here's your board", skin),
    text: '<p class="' + p + '-tour__lead">' + i18n.t('comm_board_tour_welcome_lead', "A one-minute look at how you talk with LingoLinq.") + '</p>',
    classes: p + '-tour__step ' + p + '-tour__step--intro',
    buttons: [
      { text: i18n.t('home_tour_skip', "Skip tour"), type: 'cancel', classes: p + '-tour__btn ' + p + '-tour__btn--ghost' },
      { text: i18n.t('home_tour_start', "Start the tour"), type: 'next', classes: p + '-tour__btn ' + p + '-tour__btn--primary' }
    ]
  }];
  topics(view).forEach(function(cfg) {
    var el = visibleEl(cfg.sel);
    if (!el) { return; }
    var buttons = standardButtons(skin);
    if (cfg.last) {
      buttons = [buttons[0], {
        text: i18n.t('board_detail_speak_tour_finish', "Got it"),
        classes: p + '-tour__btn ' + p + '-tour__btn--primary',
        action: function() { return this.complete(); }
      }];
    }
    var step = {
      id: cfg.id,
      attachTo: { element: liveTarget(cfg.sel, el), on: cfg.on },
      beforeShowPromise: waitForElement(cfg.sel),
      title: cfg.title,
      text: cfg.text,
      classes: p + '-tour__step',
      buttons: buttons,
      scrollBlock: 'center'
    };
    if (cfg.padded) {
      step.modalOverlayOpeningPadding = 12;
      step.modalOverlayOpeningRadius = 18;
      step.matchTargetRadius = false;
    }
    steps.push(step);
  });
  if (!basic && layout === 'focused') {
    steps.forEach(function(s) { s.classes = (s.classes + ' md-tour__step--focused').trim(); });
  }
  return steps;
}

export { buildCommunicatorBoardSteps };
export default buildCommunicatorBoardSteps;
