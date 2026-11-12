require 'spec_helper'

# The speak-mode header's house button goes HOME, in every branch.
#
# WHY
#   Reported 2026-11-09: "in the basic view, when you're in speak mode and press the home button,
#   instead of going to your home board, it exits and goes to the site home page". On a Basic
#   board page (`user.board-alt.index`, the `on_board_or_alt` branch) the house button in
#   templates/application.hbs ran `openMyBoards`, which left speak mode for the boards page. That
#   also skipped `home`'s board-lock check (controllers/application.js `home`). Traci's decision:
#   Home only; My Boards stays in the account menu outside speak mode.
#
# WHY A SOURCE GUARD
#   The header only renders inside the full application template in speak mode on a loaded
#   board, which no rendering test here sets up; the end-to-end check is
#   app/frontend/e2e/basic-speak-home.spec.js, and that does not run in CI. This guard does, so a
#   revert that puts My Boards back on the button fails the build.
describe 'speak-mode header home button' do
  let(:hbs) { File.read(Rails.root.join('app/frontend/app/templates/application.hbs')) }
  # The speak header: from `{{#if (and this.app_state.speak_mode ...)}}` to the end of the
  # TripleClickListener that wraps the house button.
  let(:speak_header) do
    start = hbs.index('{{#if (and this.app_state.speak_mode this.app_state.currentBoardState.id)}}')
    finish = hbs.index('</TripleClickListener>', start)
    hbs[start...finish]
  end

  it 'exists where this spec looks for it' do
    expect(speak_header).to include('id="home_button"')
  end

  it 'never runs My Boards from the house button' do
    # The call, not the name: the template's own comment explains the history by name.
    expect(speak_header).not_to include('ctrlAction "openMyBoards"'),
      'the speak-mode house button must go home; My Boards left speak mode (2026-11-09)'
  end

  it 'runs home from every branch of the house button' do
    buttons = speak_header.scan(/<button[^>]*id="home_button"[^>]*>/)
    expect(buttons.length).to be >= 3
    buttons.each do |button|
      expect(button).to include('(this.ctrlAction "home")'), "#{button} should run `home`"
    end
  end
end
