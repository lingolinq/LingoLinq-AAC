require 'spec_helper'

# The MODERN dashboard nav carries no Account pill.
#
# WHY
#   That component (app/frontend/app/components/dashboard/authenticated-view.hbs) serves
#   two pages: the dashboard home tab and user.extras (templates/user/extras.hbs passes
#   @initialActiveTab="extras"). On the home tab the account rail renders alongside the
#   pill row and its own Account row is the SAME destination, so a communicator in Gentle
#   view saw two Account links on one screen. Traci's decision on 2026-09-21 was to drop
#   the pill from the modern view on both pages and in both layouts, the rail and the
#   navbar being the routes to Account.
#
#   Account remains reachable everywhere from the navbar identity dropdown
#   (app-navbar-authenticated-inner.hbs:142) and its mobile-drawer twin (:217), and on the
#   home tab additionally from the rail's own Account row (account-rail.hbs:58).
#
# WHY A SOURCE GUARD RATHER THAN A RENDERING TEST
#   The pill's visibility used to hang off a `showAccountPill` computed, which a unit test
#   could read directly. That computed is now deleted rather than made to return false, so
#   there is no property left to assert on, and standing up a full render of this
#   component (it drives the whole dashboard) to look for one absent element costs far
#   more than the invariant is worth. What actually has to stay true is that the markup is
#   not there.
#
# SCOPE -- do not widen this to every template.
#   The SHARED nav (components/user-pill-nav.hbs) still has its own Account pill for the
#   pages it serves (Boards, Caseload, Organizations, Updates), none of which render the
#   rail. That is a separate nav and a separate, still-open decision.
describe 'modern dashboard account pill' do
  let(:dashboard_hbs) do
    File.read(Rails.root.join('app/frontend/app/components/dashboard/authenticated-view.hbs'))
  end

  it 'renders no Account pill in the pill row or the collapsed dropdown' do
    offenders = dashboard_hbs.lines.each_with_index.filter_map do |line, idx|
      next unless line.include?('md-pillnav__pill--account') ||
                  (line.include?('@route="user.account"') && line.include?('md-pillnav'))
      "authenticated-view.hbs:#{idx + 1}: #{line.strip[0, 120]}"
    end

    expect(offenders).to be_empty,
      "The modern dashboard nav must not link to Account -- the rail and the navbar " \
      "identity dropdown carry it. Found:\n  #{offenders.join("\n  ")}"
  end

  # Sanity guard, so an emptied or renamed file cannot make the check above pass vacuously.
  # This has now moved twice in one day: the dashboard first stopped hand-writing pill
  # markup and delegated to <UserPillNav>, then stopped mounting a nav AT ALL when the
  # chrome was hoisted to application.hbs. What is pinned is the end state.
  it 'hand-writes no pill markup and mounts no nav of its own' do
    expect(dashboard_hbs).to_not include('md-pillnav__pill'),
      'the dashboard should not hand-write pill markup again; extend UserPillNav instead'
    expect(dashboard_hbs).to_not include('<UserPillNav'),
      'the nav is mounted once in application.hbs; a second mount here would be rebuilt ' \
      'per transition, which is the defect the hoist removed'
  end

  # THE POINT OF THE HOIST. Chrome mounted per-page is chrome that gets destroyed and
  # rebuilt on every transition -- measured at 1/6 hops keeping the same DOM node before
  # this change, and 6/6 after. A single mount is what makes that true, so the count is
  # what gets pinned rather than any one file's contents.
  it 'mounts the rail and the nav exactly once, in application.hbs' do
    root = Rails.root.join('app/frontend/app')
    files = Dir.glob("#{root}/templates/**/*.hbs") + Dir.glob("#{root}/components/**/*.hbs")
    rail = files.select { |f| File.read(f).include?('<AccountRail') }
    nav  = files.select { |f| File.read(f).include?('<UserPillNav') }
    rel  = ->(list) { list.map { |f| f.sub("#{root}/", '') }.sort }

    expect(rel.call(rail)).to eq(['templates/application.hbs']),
      "AccountRail must be mounted only in application.hbs. Found: #{rel.call(rail).join(', ')}"
    expect(rel.call(nav)).to eq(['templates/application.hbs']),
      "UserPillNav must be mounted only in application.hbs. Found: #{rel.call(nav).join(', ')}"
  end

  # 2026-09-21, second decision: Traci listed the nav destinations as Home, Caseload,
  # Organizations, Boards, Extras and Updates -- no Account -- so the SHARED nav dropped
  # its Account pill too. That is what finally makes the two navs' item sets identical,
  # which is the precondition for unifying them. Account is reached from the navbar
  # identity dropdown on every page, and additionally from the rail where it renders.
  it 'renders no Account pill in the shared UserPillNav either' do
    shared = File.read(Rails.root.join('app/frontend/app/components/user-pill-nav.hbs'))
    offenders = shared.lines.each_with_index.filter_map do |line, idx|
      next unless line.include?('md-pillnav__pill--account') ||
                  (line.include?('@route="user.account"') && line.include?('md-pillnav'))
      "user-pill-nav.hbs:#{idx + 1}: #{line.strip[0, 120]}"
    end
    expect(offenders).to be_empty,
      "The shared pill nav must not link to Account either. Found:\n  #{offenders.join("\n  ")}"
  end
end
