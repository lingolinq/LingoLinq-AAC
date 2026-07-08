import Route from '@ember/routing/route';
import demoBoardLoader from '../../utils/demo_board_loader';
import i18n from '../../utils/i18n';

export default Route.extend({
  queryParams: {
    board_key: {
      refreshModel: true
    },
    source: {
      refreshModel: true
    }
  },

  model: function(params) {
    var boardKey = params.board_key || params.board;
    // "Try a Demo" always loads the manifest root (Project Core 36). Only the
    // offline-board picker passes ?board=...&source=offline_boards.
    if(boardKey && params.source === 'offline_boards') {
      return demoBoardLoader.load_obf_board(boardKey).then(function(board) {
        return {
          board: board,
          manifest: null,
          board_key: boardKey,
          source: params.source
        };
      });
    }
    return demoBoardLoader.load_root().then(function(model) {
      model.board_key = null;
      model.source = params.source;
      return model;
    });
  },

  setupController: function(controller, model) {
    this._super(controller, model);
    controller.setup_demo(model);
  },

  activate: function() {
    this._super(...arguments);
    window.scrollTo(0, 0);
    var appController = this.controllerFor('application');
    if(appController && appController.updateTitle) {
      appController.updateTitle(i18n.t('demo_speak_mode_title', "Try Speak Mode"));
    }
  },

  resetController: function(controller, isExiting) {
    if(isExiting) {
      controller.reset_demo();
    }
  }
});
