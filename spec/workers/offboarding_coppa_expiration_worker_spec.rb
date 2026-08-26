require 'spec_helper'

describe OffboardingCoppaExpirationWorker do
  describe 'perform' do
    it 'calls User.process_expired_offboarding_consents!' do
      expect(User).to receive(:process_expired_offboarding_consents!).and_return(2)
      expect(OffboardingCoppaExpirationWorker.perform).to eq(2)
    end

    it 'is assigned to the default queue' do
      expect(OffboardingCoppaExpirationWorker.instance_variable_get(:@queue)).to eq(:default)
    end
  end
end
