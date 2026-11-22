/**
 * THE STARTER BOARD (Traci, 2026-11-11; PR #1268, proposals doc section 16): the one board every new account
 * begins with. The welcome card's "Start talking now" (tours/start_talking.js), Quick Assign in the board
 * picker, the setup page and the tour picker (assign-vocal-flair-home.js) and "pick a board for me"
 * (recommended_home_board.js) all use it, and sign-up likes the account's own copy of it so the offline sync
 * keeps it (lib/user_board_provisioner.rb, User#copy_board_to_library with `like_copy`). The eval report recommends by
 * measured grid size instead (eval-page-set-card.js) and does not read this.
 *
 * The server side of the same decision is SystemBoardSources::STARTER_BOARD_SLUG.
 */
export const STARTER_BOARD_SLUG = 'vocal-flair-60';
export const STARTER_BOARD_KEY = 'lingolinq/' + STARTER_BOARD_SLUG;
export const STARTER_BOARD_NAME = 'Vocal Flair 60';
export const STARTER_BOARD_BUTTONS = 60;
