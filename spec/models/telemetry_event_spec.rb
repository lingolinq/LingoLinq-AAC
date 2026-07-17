require 'spec_helper'

describe TelemetryEvent do
  it "sanitizes user-facing content from telemetry payloads" do
    event = TelemetryEvent.process_new({
      'event_type' => 'board_activation',
      'route' => 'board.index',
      'feature_area' => 'speak_board',
      'data' => {
        'button_id' => '1',
        'board_id' => '2',
        'label' => 'private button',
        'utterance' => 'private sentence',
        'percent_x' => 0.25
      }
    }, user: User.create)

    expect(event.persisted?).to eq(true)
    expect(event.data['button_id']).to eq('1')
    expect(event.data['percent_x']).to eq(0.25)
    expect(event.data['label']).to eq(nil)
    expect(event.data['utterance']).to eq(nil)
  end

  it "allows users without organizations" do
    user = User.create
    event = TelemetryEvent.process_new({
      'event_type' => 'route_visit',
      'route' => 'index',
      'data' => {'duration_ms' => 100}
    }, user: user)

    expect(event.persisted?).to eq(true)
    expect(event.organization_id).to eq(nil)
  end
end
