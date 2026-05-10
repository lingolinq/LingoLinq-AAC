require 'spec_helper'

describe EvalRecommend do
  describe '.from_quick_screen' do
    let(:intake_pediatric) { { 'age_band' => '6-12', 'etiology' => 'autism', 'current_comm' => 'single_symbol', 'suspected_access' => 'touch' } }

    it 'returns the documented schema' do
      rec = EvalRecommend.from_quick_screen([], intake_pediatric)
      expect(rec.keys).to include('access_method', 'access_secondary', 'grid_size', 'library', 'communicator_stage', 'vocab_recommendation', 'starter_board_spec', 'confidence', 'next_action', 'promote_reasons')
      expect(rec['grid_size']).to be_a(Hash)
      expect(rec['grid_size'].keys).to include('rows', 'cols', 'band')
      expect(rec['vocab_recommendation'].keys).to include('core', 'fringe_categories', 'band')
    end

    it 'falls back to intake when events are empty' do
      rec = EvalRecommend.from_quick_screen([], intake_pediatric)
      expect(rec['access_method']).to eq('touch')
      expect(rec['communicator_stage']).to eq(4) # single_symbol -> stage 4
      expect(rec['confidence']).to eq(0.0)
      expect(rec['next_action']).to eq('promote_to_targeted')
    end

    it 'picks the access method with highest accuracy + lowest latency' do
      events = [
        { 'subtest' => 'access_snapshot', 'access_method' => 'touch', 'response' => 'correct',   'latency_ms' => 1500, 'grid' => [3, 3] },
        { 'subtest' => 'access_snapshot', 'access_method' => 'touch', 'response' => 'correct',   'latency_ms' => 1700, 'grid' => [3, 3] },
        { 'subtest' => 'access_snapshot', 'access_method' => 'gaze',  'response' => 'incorrect', 'latency_ms' => 4500, 'grid' => [3, 3] },
        { 'subtest' => 'access_snapshot', 'access_method' => 'gaze',  'response' => 'incorrect', 'latency_ms' => 5000, 'grid' => [3, 3] }
      ]
      rec = EvalRecommend.from_quick_screen(events, intake_pediatric)
      expect(rec['access_method']).to eq('touch')
    end

    it 'recommends a larger grid when bigger arrays are answered correctly' do
      events = [
        { 'subtest' => 'access_snapshot', 'response' => 'correct', 'grid' => [4, 6], 'access_method' => 'touch', 'latency_ms' => 1200 },
        { 'subtest' => 'access_snapshot', 'response' => 'correct', 'grid' => [4, 6], 'access_method' => 'touch', 'latency_ms' => 1400 }
      ]
      rec = EvalRecommend.from_quick_screen(events, intake_pediatric)
      expect(rec['grid_size']['band']).to eq('large')
    end

    it 'picks the library with the highest accuracy' do
      events = [
        { 'subtest' => 'library_compare', 'library' => 'symbolstix', 'response' => 'correct',   'latency_ms' => 1500 },
        { 'subtest' => 'library_compare', 'library' => 'symbolstix', 'response' => 'correct',   'latency_ms' => 1300 },
        { 'subtest' => 'library_compare', 'library' => 'pcs',        'response' => 'incorrect', 'latency_ms' => 2000 },
        { 'subtest' => 'library_compare', 'library' => 'pcs',        'response' => 'incorrect', 'latency_ms' => 2200 }
      ]
      rec = EvalRecommend.from_quick_screen(events, intake_pediatric)
      expect(rec['library']).to eq('symbolstix')
    end

    it 'flags promote_to_targeted on low event count' do
      rec = EvalRecommend.from_quick_screen([{ 'subtest' => 'stage_probe', 'response' => 'correct' }], intake_pediatric)
      expect(rec['next_action']).to eq('promote_to_targeted')
      expect(rec['promote_reasons']).to include('low_event_count')
    end

    it 'records confidence between 0 and 1' do
      events = (1..12).map {|_| { 'subtest' => 'access_snapshot', 'response' => 'correct', 'grid' => [3, 3], 'access_method' => 'touch', 'latency_ms' => 1500 } }
      rec = EvalRecommend.from_quick_screen(events, intake_pediatric)
      expect(rec['confidence']).to be >= 0.0
      expect(rec['confidence']).to be <= 1.0
    end

    it 'tolerates symbol keys in events' do
      events = [
        { subtest: 'access_snapshot', access_method: 'touch', response: 'correct', latency_ms: 1200, grid: [3, 3] }
      ]
      rec = EvalRecommend.from_quick_screen(events, intake_pediatric)
      expect(rec['access_method']).to eq('touch')
    end
  end
end
