require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "update" do
    it "should require api token" do
      put :update, params: {:id => "1_1"}
      assert_missing_token
    end
  end
end