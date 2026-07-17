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
end
