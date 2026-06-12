require 'spec_helper'

describe GoSecure do
  describe "sha512" do
    it "should not error on nil values" do
      expect(GoSecure.sha512(nil, nil)).to eq(Digest::SHA512.hexdigest("" + GoSecure.encryption_key))
    end
    
    it "should generate a consistent hash" do
      expect(GoSecure.sha512('a', 'b')).to eq(Digest::SHA512.hexdigest("ab" + GoSecure.encryption_key))
      expect(GoSecure.sha512('b', 'c')).to eq(Digest::SHA512.hexdigest("bc" + GoSecure.encryption_key))
      expect(GoSecure.sha512('a', 'b')).to eq(Digest::SHA512.hexdigest("ab" + GoSecure.encryption_key))
    end
    
    it "should allow using a custom encryption key" do
      expect(GoSecure.sha512('a', 'b', 'cde')).to eq(Digest::SHA512.hexdigest("abcde"))
    end
  end
  
  describe "nonce" do
    it "should generate a 24-character nonce" do
      expect(GoSecure.nonce(nil).length).to eq(24)
      expect(GoSecure.nonce("abcdef").length).to eq(24)
    end
    
    it "should not repeat" do
      a = GoSecure.nonce("Hats")
      b = GoSecure.nonce("Hats")
      expect(a).not_to eq(b)
    end
  end
    
  describe "encrypt" do
    it "should error on empty values" do
      expect{ GoSecure.encrypt(nil, nil) }.to raise_error(NoMethodError)
    end
    
    it "should return a key pair" do
      res = GoSecure.encrypt("happy", "cars")
      expect(res.length).to eq(2)
      expect(res[0]).to be_is_a(String)
      expect(res[1]).to be_is_a(String)
    end

    it "should allow using a custom encryption key" do
      expect(GoSecure.encrypt("I am happy", "something I said one time", "abcdefg").length).to eq(2)
    end
  end

  describe "decrypt" do
    it "should error on empty values" do
      expect{ GoSecure.encrypt(nil, nil, nil) }.to raise_error(NoMethodError)
    end
    
    it "should decrypt an encrypted string" do
      str, salt = GoSecure.encrypt("I am happy", "something I said one time")
      expect(GoSecure.decrypt(str, salt, "something I said one time")).to eq("I am happy")
    end
    
    it "should allow using a custom encryption key" do
      str, salt = GoSecure.encrypt("I am happy", "something I said one time", "abcdefg")
      expect(GoSecure.decrypt(str, salt, "something I said one time", "abcdefg")).to eq("I am happy")
      wrong_key_result = begin
        GoSecure.decrypt(str, salt, "something I said one time", "abcdefgh")
      rescue OpenSSL::Cipher::CipherError
        nil
      end
      expect(wrong_key_result).not_to eq("I am happy")
    end
  end  

  describe "generate_password" do
    it "should raise on empty password" do
      expect{ GoSecure.generate_password(nil) }.to raise_error("password required")
      expect{ GoSecure.generate_password("") }.to raise_error("password required")
    end
    
    it "should generate a hashed password response" do
      res = GoSecure.generate_password("abcdefg")
      expect(res['hash_type']).to eq('pbkdf2-sha256-2')
      expect(res['salt'].length).to be > 10
      
      digest = OpenSSL::Digest::SHA512.new(GoSecure.encryption_key)
      expect(res['hashed_password']).to eq(Base64.urlsafe_encode64(OpenSSL::PKCS5.pbkdf2_hmac("abcdefg", res['salt'], 100000, digest.digest_length, digest)))
    end
  end

  describe "matches_password?" do
    it "should not error on empty settings" do
      expect(GoSecure.matches_password?(nil, nil)).to eq(false)
      expect(GoSecure.matches_password?("abcdefg", nil)).to eq(false)
      expect(GoSecure.matches_password?("what", {})).to eq(false)
    end
    
    it "should match valid password" do
      password = GoSecure.generate_password("bacon")
      expect(GoSecure.matches_password?("bacon", password)).to eq(true)
      
      password = {
        'hash_type' => 'sha512',
        'salt' => 'abcdefg',
        'hashed_password' => Digest::SHA512.hexdigest(GoSecure.encryption_key + 'abcdefgbacon2')
      }
      expect(GoSecure.matches_password?("bacon2", password)).to eq(true)
    end
    
    it "should not match invalid password" do
      password = GoSecure.generate_password("hippos")
      expect(GoSecure.matches_password?("hippo", password)).to eq(false)
      expect(GoSecure.matches_password?("hipposs", password)).to eq(false)
      expect(GoSecure.matches_password?("hippoS", password)).to eq(false)
      password['hash_type'] = 'md5'
      expect(GoSecure.matches_password?("hippos", password)).to eq(false)
    end
  end  

  describe "validate_encryption_key" do
    it "should have specs"
  end
#   def self.validate_encryption_key
#     if !self.encryption_key || self.encryption_key.length < 24
#       raise "SECURE_ENCRYPTION_KEY env variable should be at least 24 characters"
#     end
#     return if !ActiveRecord::Base.connection.table_exists?('settings')
#     config_hash = Digest::SHA1.hexdigest(self.encryption_key)
#     stored_hash = Setting.get('encryption_hash')
#     return if stored_hash == config_hash
# 
#     if stored_hash.nil?
#       Setting.set('encryption_hash', config_hash);
#     else
#       raise "SECURE_ENCRYPTION_KEY env variable doesn't match the value stored in the database." +  
#        " If this is intentional you can try DELETE FROM settings WHERE key='encryption_hash' to reset."
#     end
#   end
end
