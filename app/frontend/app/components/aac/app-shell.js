// =============================================================================
// VoiceReach AAC — App Shell Component
// app/components/aac/app-shell.js
// =============================================================================

import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export const NAV_ITEMS = [
  {
    section: 'Communicate',
    items: [
      { id: 'symbol-board', label: 'Symbol Board', icon: '🗣️', route: 'aac.board' },
      { id: 'phrase-builder', label: 'Phrase Builder', icon: '💬', route: 'aac.phrases' },
      { id: 'favorites', label: 'Favorites', icon: '⭐', route: 'aac.favorites' },
      { id: 'recent', label: 'Recent', icon: '🕐', route: 'aac.recent' },
    ],
  },
  {
    section: 'Clinical',
    items: [
      { id: 'progress', label: 'Progress Reports', icon: '📊', route: 'aac.progress' },
      { id: 'sessions', label: 'Sessions', icon: '📅', route: 'aac.sessions' },
      { id: 'profiles', label: 'Profiles', icon: '👤', route: 'aac.profiles' },
      { id: 'goals', label: 'Goal Tracking', icon: '🎯', route: 'aac.goals' },
    ],
  },
  {
    section: 'Settings',
    items: [
      { id: 'preferences', label: 'Preferences', icon: '⚙️', route: 'aac.preferences' },
      { id: 'voice', label: 'Voice & Output', icon: '🔊', route: 'aac.voice' },
    ],
  },
];

export default class AacAppShellComponent extends Component {
  @service session;
  @service router;

  @tracked searchQuery = '';
  @tracked sidebarOpen = true;

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  get navGroups() {
    const isClinical = this.session.currentUser?.role === 'clinical';
    return NAV_ITEMS.filter((group) => {
      if (group.section === 'Clinical' && !isClinical) return false;
      return true;
    });
  }

  get currentUser() {
    return this.session.currentUser;
  }

  get userInitials() {
    const user = this.currentUser;
    if (!user) return '??';
    return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  }

  get isClinicalMode() {
    return this.currentUser?.role === 'clinical';
  }

  get modeLabel() {
    return this.isClinicalMode ? 'Clinical' : 'Personal';
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  @action
  navigate(route) {
    this.router.transitionTo(route);
  }

  @action
  updateSearch(event) {
    this.searchQuery = event.target.value;
    this.args.onSearch?.(this.searchQuery);
  }

  @action
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  @action
  openUserMenu() {
    // trigger user dropdown/modal
    this.args.onOpenUserMenu?.();
  }
}
