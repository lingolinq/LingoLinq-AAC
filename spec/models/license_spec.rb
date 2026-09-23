require 'spec_helper'
require Rails.root.join('db/migrate/20260618120000_encrypt_license_metadata.rb')
require Rails.root.join('db/migrate/20260618130000_encrypt_license_external_reference.rb')

describe License, :type => :model do
  let(:org) { Organization.create(:settings => {'name' => 'Test District'}) }

  describe "secure_serialize :metadata (LL-740bcb10fa)" do
    it "encrypts metadata at rest and round-trips it" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active',
                          metadata: {'plan' => 'district', 'note' => 'sensitive'})
      # raw column is NOT the plaintext
      raw = License.connection.select_value("SELECT metadata FROM licenses WHERE id = #{l.id}")
      expect(raw).to_not eq({'plan' => 'district', 'note' => 'sensitive'}.to_json)
      expect(raw).to_not include('sensitive')
      # but the model decrypts it back
      expect(License.find(l.id).metadata).to eq({'plan' => 'district', 'note' => 'sensitive'})
    end

    it "invokes SecureJson.dump on save" do
      l = License.new(organization: org, seat_type: 'student', status: 'active')
      l.metadata = {'a' => 1}
      expect(GoSecure::SecureJson).to receive(:dump).with({'a' => 1}).and_call_original
      l.save!
    end

    it "leaves nil metadata as nil (no read break, no JSON emitted)" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active')
      expect(License.find(l.id).metadata).to eq(nil)
      json = JsonApi::License.build_json(l.reload)
      expect(json).to_not have_key('metadata')
    end

    it "still reads LEGACY plaintext JSON written before the backfill (reads do not break)" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active')
      # simulate a pre-migration plaintext row by writing the raw column directly
      License.where(id: l.id).update_all(metadata: '{"po":"PO-1","tier":"gold"}')
      expect(License.find(l.id).metadata).to eq({'po' => 'PO-1', 'tier' => 'gold'})
    end
  end

  describe "external_reference manual encryption (LL-740bcb10fa follow-up)" do
    it "encrypts external_reference at rest and round-trips it" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active',
                          external_reference: 'PO-12345')
      raw = License.connection.select_value("SELECT external_reference FROM licenses WHERE id = #{l.id}")
      expect(raw).to_not eq('PO-12345')
      expect(raw).to_not include('PO-12345')
      expect(License.find(l.id).external_reference).to eq('PO-12345')
    end

    it "leaves a blank external_reference untouched" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active')
      expect(License.find(l.id).external_reference).to eq(nil)
      json = JsonApi::License.build_json(l.reload)
      expect(json).to_not have_key('external_reference')
    end

    it "still reads LEGACY plaintext external_reference (reads do not break)" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active')
      License.where(id: l.id).update_all(external_reference: 'cus_legacyPlain')
      expect(License.find(l.id).external_reference).to eq('cus_legacyPlain')
    end

    it "is never included in JsonApi::License output (LL-55baae6d40)" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active',
                          external_reference: 'PO-777')
      json = JsonApi::License.build_json(l.reload)
      expect(json).to_not have_key('external_reference')
    end
  end

  describe "EncryptLicenseExternalReference backfill" do
    it "re-encrypts a legacy plaintext external_reference and is idempotent" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active')
      License.where(id: l.id).update_all(external_reference: 'PO-BACKFILL')

      migration = EncryptLicenseExternalReference.new
      migration.verbose = false
      migration.up
      raw1 = License.connection.select_value("SELECT external_reference FROM licenses WHERE id = #{l.id}")
      expect(raw1).to_not include('PO-BACKFILL')
      expect(License.find(l.id).external_reference).to eq('PO-BACKFILL')

      migration.up
      raw2 = License.connection.select_value("SELECT external_reference FROM licenses WHERE id = #{l.id}")
      expect(raw2).to eq(raw1)
      expect(License.find(l.id).external_reference).to eq('PO-BACKFILL')
    end
  end

  describe "EncryptLicenseMetadata backfill" do
    it "re-encrypts a legacy plaintext row and is idempotent" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active')
      License.where(id: l.id).update_all(metadata: '{"po":"PO-9"}')

      migration = EncryptLicenseMetadata.new
      migration.verbose = false
      migration.up
      raw1 = License.connection.select_value("SELECT metadata FROM licenses WHERE id = #{l.id}")
      expect(raw1).to_not include('PO-9')              # now encrypted
      expect(License.find(l.id).metadata).to eq({'po' => 'PO-9'})

      # running again must not double-encrypt
      migration.up
      raw2 = License.connection.select_value("SELECT metadata FROM licenses WHERE id = #{l.id}")
      expect(raw2).to eq(raw1)
      expect(License.find(l.id).metadata).to eq({'po' => 'PO-9'})
    end
  end

  describe "release_user!" do
    # A communicator may be supported by more than one organization at the same time, so a
    # second active license is a normal steady state. License.expire_stale_licenses! releases
    # each expired license independently, so one organization's seat expiring must not disturb
    # another organization that still holds and pays for one.

    it "hands the account back to the family when no other organization holds a seat" do
      u = User.create
      only_org = Organization.create(:settings => {'total_licenses' => 1})
      license = License.create!(organization: only_org, seat_type: 'student', status: 'active')
      only_org.claim_user(u)

      license.reload.release_user!

      u.reload
      expect(license.reload.user_id).to be_nil
      expect(u.managing_organization_id).to be_nil
      # The two-month "own care" trial.
      expect(u.expires_at).to be_within(1.day).of(2.months.from_now)
    end

    it "does not disturb another organization that still holds a seat" do
      u = User.create
      morning = Organization.create(:settings => {'total_licenses' => 1})
      afternoon = Organization.create(:settings => {'total_licenses' => 1})
      morning_license = License.create!(organization: morning, seat_type: 'student',
                                        status: 'active', expires_at: 30.days.from_now)
      afternoon_license = License.create!(organization: afternoon, seat_type: 'student',
                                          status: 'active', expires_at: 300.days.from_now)
      morning.claim_user(u)
      afternoon.claim_user(u.reload)

      # Morning's seat expires and is released while afternoon still holds and pays for one.
      morning_license.reload.release_user!

      u.reload
      # Afternoon keeps its seat and stays the sponsor. Unconditional release used to nil the
      # column and overwrite expires_at with a flat two-month trial here, so the student read as
      # in_trial? while a district was still paying.
      expect(afternoon_license.reload.user_id).to eq(u.id)
      expect(u.managing_organization_id).to eq(afternoon.id)
      expect(u.in_trial?).to eq(false)
      expect(u.expires_at.to_i).to be_within(5).of(afternoon_license.reload.expires_at.to_i)
      # Morning's seat genuinely returns to its pool.
      expect(morning_license.reload.user_id).to be_nil
    end

    it "leaves an uninvolved organization's sponsorship alone when a third org releases" do
      # With three sponsors, releasing a seat the column does NOT name must not move the column.
      # An earlier revision repointed whenever any survivor existed, which took sponsorship away
      # from an organization that had nothing to do with the release.
      u = User.create
      a = Organization.create(:settings => {'total_licenses' => 1})
      b = Organization.create(:settings => {'total_licenses' => 1})
      c = Organization.create(:settings => {'total_licenses' => 1})
      License.create!(organization: a, seat_type: 'student', status: 'active', expires_at: 10.days.from_now)
      b_license = License.create!(organization: b, seat_type: 'student', status: 'active', expires_at: 20.days.from_now)
      c_license = License.create!(organization: c, seat_type: 'student', status: 'active', expires_at: 300.days.from_now)
      a.claim_user(u)
      b.claim_user(u.reload)
      c.claim_user(u.reload)
      expect(u.reload.managing_organization_id).to eq(c.id)

      b_license.reload.release_user!

      u.reload
      # C is untouched: still the sponsor, still holding its seat, expiry still C's.
      expect(u.managing_organization_id).to eq(c.id)
      expect(c_license.reload.user_id).to eq(u.id)
      expect(u.expires_at.to_i).to be_within(5).of(c_license.reload.expires_at.to_i)
      expect(b_license.reload.user_id).to be_nil
    end

    it "repoints the sponsor column when the released seat was the one it named" do
      # The column names whichever organization claimed last. If THAT seat is released, leaving
      # the column alone would point it at an organization holding no seat, which is the state
      # Organization#claim_user checks for before writing it.
      u = User.create
      morning = Organization.create(:settings => {'total_licenses' => 1})
      afternoon = Organization.create(:settings => {'total_licenses' => 1})
      morning_license = License.create!(organization: morning, seat_type: 'student',
                                        status: 'active', expires_at: 30.days.from_now)
      afternoon_license = License.create!(organization: afternoon, seat_type: 'student',
                                          status: 'active', expires_at: 300.days.from_now)
      morning.claim_user(u)
      afternoon.claim_user(u.reload)
      expect(u.reload.managing_organization_id).to eq(afternoon.id)

      # Release the seat the column currently names.
      afternoon_license.reload.release_user!

      u.reload
      # The column must name an organization that actually holds an active seat.
      expect(u.managing_organization_id).to eq(morning.id)
      expect(morning_license.reload.user_id).to eq(u.id)
      expect(u.expires_at.to_i).to be_within(5).of(morning_license.reload.expires_at.to_i)
    end
  end
end
