require 'spec_helper'

describe JsonApi::License do
  let(:org) { Organization.create(:settings => {'name' => 'Test District'}) }

  describe "external_reference exposure (LL-55baae6d40)" do
    it "never includes external_reference for a district manager viewing the org's license list" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active',
                          external_reference: 'cus_stripe12345')
      json = JsonApi::License.build_json(l.reload)
      expect(json).to_not have_key('external_reference')
    end

    it "never includes external_reference when a license is claimed for a user" do
      u = User.create
      l = License.create!(organization: org, seat_type: 'student', status: 'active',
                          user_id: u.id, external_reference: 'PO-99999')
      json = JsonApi::License.build_json(l.reload)
      expect(json).to_not have_key('external_reference')
    end

    it "leaves the rest of the license payload intact" do
      l = License.create!(organization: org, seat_type: 'student', status: 'active',
                          external_reference: 'cus_stripe12345')
      json = JsonApi::License.build_json(l.reload)
      expect(json['id']).to eq(l.global_id)
      expect(json['organization_id']).to eq(org.global_id)
      expect(json['seat_type']).to eq('student')
      expect(json['status']).to eq('active')
    end
  end
end
