require 'spec_helper'

describe NfcTag, :type => :model do
  describe 'generate_defaults' do
    it 'should generate default values' do
      t = NfcTag.new
      t.generate_defaults
      expect(t.data).to_not eq(nil)
      expect(t.nonce).to_not eq(nil)
      expect(t.public).to eq(false)
    end

    it 'should allow searching by nonce' do
      u = User.create
      t = NfcTag.create(user: u)
      expect(t.nonce).to_not eq(nil)
      expect(t.global_id).to_not eq(nil)
      id = t.global_id
      expect(id.split(/_/).length).to eq(3)
      expect(NfcTag.find_by_global_id(id.split(/_/, 2))).to eq(nil)
    end
  end

  describe 'process_params' do
    it 'should require a user' do
      expect { NfcTag.process_new({'label' => 'bacon'}) }.to raise_error("user required")
    end

    it 'should update the record' do
      u = User.create
      tag = NfcTag.process_new({'label' => 'bacon', 'public' => true}, {'user' => u})
      expect(tag.errored?).to eq(false)
      expect(tag.public).to eq(true)
      expect(tag.data['label']).to eq('bacon')
    end

    it 'should not attach the tag to the user by default' do
      u = User.create
      tag = NfcTag.process_new({'public' => true}, {'user' => u})
      expect(tag.errored?).to eq(false)
      expect(tag.public).to eq(true)
      expect(tag.has_content).to eq(false)
      Worker.process_queues
      expect(u.reload.settings['preferences']['tag_ids']).to eq(nil)
    end

    it 'should attach the tag to the user once it has content' do
      u = User.create
      tag = NfcTag.process_new({'label' => 'bacon', 'public' => true}, {'user' => u})
      expect(tag.errored?).to eq(false)
      expect(tag.public).to eq(true)
      expect(tag.has_content).to eq(true)
      Worker.process_queues
      expect(u.reload.settings['preferences']['tag_ids']).to eq([tag.global_id])
    end
  end
end
# class NfcTag < ApplicationRecord
#   include SecureSerialize

#   before_save :generate_defaults
#   secure_serialize :data
#   belongs_to :user

#   def generate_defaults
#     self.data ||= {}
#     self.nonce ||= GoSecure.nonce('nfc_tag_secure_nonce')[0, 10]
#     self.public ||= false
#   end

#   def process_params(params, non_user_params)
#     raise 'user required' unless non_user_params['user']
#     self.generate_defaults
    
#     self.data['button'] = params['button'] if params['button']
#     self.data['label'] = params['label'] if params['label']
#     self.public = params['public'] if params['public'] != nil
#     self.user ||= non_user_params['user']
#     true
#   end
# end
