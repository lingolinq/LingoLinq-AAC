require 'spec_helper'

describe SupervisorConsentExpirationWorker do
  describe "perform" do
    it "should call expire_stale_requests! on SupervisorRelationship" do
      expect(SupervisorRelationship).to receive(:expire_stale_requests!).and_return(3)
      result = SupervisorConsentExpirationWorker.perform
      expect(result).to eq(3)
    end

    it "should return 0 when no stale requests exist" do
      expect(SupervisorRelationship).to receive(:expire_stale_requests!).and_return(0)
      result = SupervisorConsentExpirationWorker.perform
      expect(result).to eq(0)
    end

    it "should be assigned to the default queue" do
      expect(SupervisorConsentExpirationWorker.instance_variable_get(:@queue)).to eq(:default)
    end
  end
end
