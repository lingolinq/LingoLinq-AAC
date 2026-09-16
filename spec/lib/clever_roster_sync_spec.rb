require 'spec_helper'

RSpec.describe CleverRosterSync do
  def clever_profile(overrides = {})
    {
      id: 'clever-student-1',
      district_id: 'dist-1',
      email: 'student1@example.com',
      name: 'Ada Student',
      first_name: 'Ada',
      last_name: 'Student',
      roles: ['student'],
      schools: ['school-1']
    }.merge(overrides)
  end

  let(:org) do
    o = Organization.create
    o.settings ||= {}
    o.settings['name'] = 'Sandbox District'
    o.settings['clever_district_id'] = 'dist-1'
    o.settings['clever_sync_enabled'] = true
    o.settings['total_licenses'] = 50
    o.save
    o
  end

  before do
    allow(CleverApi).to receive(:district_app_token).and_return('district-token')
    allow(CleverApi).to receive(:schools).and_return([{ 'id' => 'school-1', 'name' => 'East Elementary' }])
    allow(CleverApi).to receive(:users).and_return([])
    allow(UserBoardProvisioner).to receive(:provision_for)
  end

  it 'creates a student as an org communicator' do
    allow(CleverApi).to receive(:users).with('district-token', role: 'student').and_return([{
      'id' => 'clever-student-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Ada', 'last' => 'Student' },
      'email' => 'student1@example.com',
      'roles' => { 'student' => {} },
      'schools' => ['school-1']
    }])
    described_class.sync_organization!(org)
    user = User.find_by_clever_id('clever-student-1')
    expect(user).to be_present
    expect(user.settings['name']).to eq('Ada Student')
    expect(Organization.attached_orgs(user).any? { |e| e['id'] == org.global_id && e['type'] == 'user' }).to eq(true)
  end

  it 'grants both supervisor and manager links for dual-role users' do
    allow(CleverApi).to receive(:users).with('district-token', role: 'teacher').and_return([{
      'id' => 'clever-dual-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Pat', 'last' => 'Lee' },
      'email' => 'pat@example.com',
      'roles' => { 'teacher' => {}, 'district_admin' => {} }
    }])
    allow(CleverApi).to receive(:users).with('district-token', role: 'district_admin').and_return([{
      'id' => 'clever-dual-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Pat', 'last' => 'Lee' },
      'email' => 'pat@example.com',
      'roles' => { 'teacher' => {}, 'district_admin' => {} }
    }])
    described_class.sync_organization!(org)
    user = User.find_by_clever_id('clever-dual-1')
    expect(user).to be_present
    types = Organization.attached_orgs(user).select { |e| e['id'] == org.global_id }.map { |e| e['type'] }
    expect(types).to include('supervisor', 'manager')
  end

  it 'matches an existing in-org user by email' do
    existing = User.process_new({
      'user_name' => 'existing_clever',
      'name' => 'Existing Person',
      'email' => 'matchme@example.com',
      'password' => 'secret123',
      'terms_agree' => true
    }, { pending: true })
    org.add_user(existing.user_name, false, false)
    allow(CleverApi).to receive(:users).with('district-token', role: 'teacher').and_return([{
      'id' => 'clever-match-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Existing', 'last' => 'Person' },
      'email' => 'matchme@example.com',
      'roles' => { 'teacher' => {} }
    }])
    described_class.sync_organization!(org)
    expect(User.find_by_clever_id('clever-match-1').id).to eq(existing.id)
  end

  it 'archives missing users and restores them when they reappear' do
    user = User.process_new({
      'user_name' => 'archived_clever',
      'name' => 'Gone Student',
      'email' => 'gone@example.com',
      'password' => 'secret123',
      'terms_agree' => true
    }, { pending: true })
    user.link_clever!('clever-gone-1', org_id: org.global_id, district_id: 'dist-1', name: 'Gone Student', roles: ['student'])
    described_class.sync_organization!(org)
    expect(user.reload.clever_archived?).to eq(true)

    allow(CleverApi).to receive(:users).with('district-token', role: 'student').and_return([{
      'id' => 'clever-gone-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Gone', 'last' => 'Student' },
      'email' => 'gone@example.com',
      'roles' => { 'student' => {} }
    }])
    described_class.sync_organization!(org)
    expect(user.reload.clever_archived?).to eq(false)
    expect(User.find_by(id: user.id)).to be_present
  end

  it 'stores school ids on the organization without creating child orgs' do
    described_class.sync_organization!(org)
    expect(org.reload.settings['clever_schools']).to eq([{ 'id' => 'school-1', 'name' => 'East Elementary' }])
    expect(org.children_orgs).to eq([])
  end

  it 'provisions a user with a blank email' do
    allow(CleverApi).to receive(:users).with('district-token', role: 'student').and_return([{
      'id' => 'clever-no-email',
      'district' => 'dist-1',
      'name' => { 'first' => 'No', 'last' => 'Email' },
      'roles' => { 'student' => {} }
    }])
    described_class.sync_organization!(org)
    user = User.find_by_clever_id('clever-no-email')
    expect(user).to be_present
    expect(user.settings['email']).to be_blank
  end

  it 'detaches org membership on archive and restores it when the Clever ID returns' do
    user = User.process_new({
      'user_name' => 'seat_clever',
      'name' => 'Seat Student',
      'email' => 'seat@example.com',
      'password' => 'secret123',
      'terms_agree' => true
    }, { pending: true })
    org.add_user(user.user_name, true, false)
    user.link_clever!('clever-seat-1', org_id: org.global_id, district_id: 'dist-1', name: 'Seat Student', roles: ['student'])
    described_class.sync_organization!(org)
    expect(user.reload.clever_archived?).to eq(true)
    expect(Organization.attached_orgs(user).none? { |e| e['id'] == org.global_id }).to eq(true)

    allow(CleverApi).to receive(:users).with('district-token', role: 'student').and_return([{
      'id' => 'clever-seat-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Seat', 'last' => 'Student' },
      'email' => 'seat@example.com',
      'roles' => { 'student' => {} }
    }])
    described_class.sync_organization!(org)
    expect(user.reload.clever_archived?).to eq(false)
    expect(Organization.attached_orgs(user).any? { |e| e['id'] == org.global_id && e['type'] == 'user' }).to eq(true)
  end

  it 'creates a pending unsponsored communicator when no seats remain' do
    org.settings['total_licenses'] = 0
    org.save
    allow(CleverApi).to receive(:users).with('district-token', role: 'student').and_return([{
      'id' => 'clever-pending-1',
      'district' => 'dist-1',
      'name' => { 'first' => 'Pending', 'last' => 'Student' },
      'roles' => { 'student' => {} }
    }])
    described_class.sync_organization!(org)
    user = User.find_by_clever_id('clever-pending-1')
    expect(user).to be_present
    entry = Organization.attached_orgs(user).detect { |e| e['id'] == org.global_id && e['type'] == 'user' }
    expect(entry).to be_present
    expect(entry['pending'] || entry['sponsored'] == false).to eq(true)
  end

  it 'raises when the district token cannot be fetched' do
    allow(CleverApi).to receive(:district_app_token).and_raise(CleverApi::Error, 'district_token_failed')
    expect { described_class.sync_organization!(org) }.to raise_error(CleverApi::Error, 'district_token_failed')
  end

  it 'schedules sync jobs for orgs with Clever rostering enabled' do
    allow(Organization).to receive(:find_each).and_yield(org)
    expect(org).to receive(:schedule_for).with(:slow, :sync_clever_roster)
    expect(described_class.sync_all!).to eq(1)
  end
end

RSpec.describe Organization do
  it 'stores and clears a Clever district bind from process_params' do
    org = Organization.create
    org.process({ 'clever_district_id' => ' dist-9 ', 'clever_sync_enabled' => false }, { 'updater' => User.create })
    expect(org.settings['clever_district_id']).to eq('dist-9')
    expect(org.settings['clever_sync_enabled']).to eq(false)
    org.process({ 'clever_district_id' => ' ' }, { 'updater' => User.create })
    expect(org.settings['clever_district_id']).to eq(nil)
  end
end
