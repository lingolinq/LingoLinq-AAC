require 'spec_helper'

describe Api::TelemetryEventsController, :type => :controller do
  describe "create" do
    it "requires an api token" do
      post :create, params: {telemetry_event: {event_type: 'route_visit'}}
      assert_missing_token
    end

    it "requires the telemetry feature flag" do
      token_user
      post :create, params: {telemetry_event: {event_type: 'route_visit', route: 'index'}}
      assert_error 'Not authorized', 403
    end

    it "creates sanitized telemetry events for beta users" do
      token_user
      @user.settings['feature_flags'] ||= {}
      @user.settings['feature_flags']['product_telemetry'] = true
      @user.save!

      post :create, params: {
        telemetry_events: [
          {
            event_type: 'board_activation',
            route: 'board.index',
            feature_area: 'speak_board',
            data: {
              button_id: 'abc',
              board_id: 'board-1',
              label: 'private',
              percent_x: 0.5,
              input_method: 'click'
            }
          }
        ]
      }

      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['telemetry_events']['count']).to eq(1)
      event = TelemetryEvent.last
      expect(event.user_id).to eq(@user.id)
      expect(event.event_type).to eq('board_activation')
      expect(event.data['button_id']).to eq('abc')
      expect(event.data['label']).to eq(nil)
    end
  end
end
