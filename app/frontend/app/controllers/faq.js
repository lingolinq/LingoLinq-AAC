import Controller from '@ember/controller';

export default Controller.extend({
  articleAiBoardsExpanded: false,
  articleAacGuideExpanded: false,

  actions: {
    toggleArticleAiBoards() {
      this.toggleProperty('articleAiBoardsExpanded');
    },
    toggleArticleAacGuide() {
      this.toggleProperty('articleAacGuideExpanded');
    }
  }
});
