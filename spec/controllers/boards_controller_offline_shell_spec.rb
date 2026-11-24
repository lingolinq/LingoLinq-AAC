require 'spec_helper'

# What the normal app page (layouts/application) tells the frontend about the offline app shell
# (lib/offline_shell.rb). The frontend registers the worker only when the flag is true and removes
# it when the flag is false.
describe BoardsController, :type => :controller do
  render_views

  env_wrap('OFFLINE_APP_SHELL' => nil) do
    describe "with the offline app shell off" do
      it "tells the frontend it is off and links no manifest" do
        get "index"
        expect(response).to be_successful
        expect(response.body).to include('window.offline_shell_enabled = false;')
        expect(response.body).not_to include('rel="manifest"')
      end

      # config/environments/test.rb turns forgery protection off, which drops the tag everywhere.
      it "keeps the CSRF meta tag on the live page" do
        allow(controller).to receive(:protect_against_forgery?).and_return(true)
        get "index"
        expect(response.body).to include('csrf-token')
      end
    end
  end

  env_wrap('OFFLINE_APP_SHELL' => 'on') do
    describe "with the offline app shell on" do
      it "tells the frontend it is on and links the manifest" do
        get "index"
        expect(response).to be_successful
        expect(response.body).to include('window.offline_shell_enabled = true;')
        expect(response.body).to include('<link rel="manifest" href="/manifest.webmanifest" />')
      end

      it "sets the flag before application.js runs" do
        get "index"
        body = response.body
        flag_at = body.index('window.offline_shell_enabled')
        script_at = body.index(controller.helpers.asset_path('application.js'))
        expect(flag_at).not_to eq(nil)
        expect(script_at).not_to eq(nil)
        expect(flag_at).to be < script_at
      end

      # config/environments/test.rb turns forgery protection off, which drops the tag everywhere.
      it "keeps the CSRF meta tag on the live page" do
        allow(controller).to receive(:protect_against_forgery?).and_return(true)
        get "index"
        expect(response.body).to include('csrf-token')
      end
    end
  end
end
