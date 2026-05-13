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

  describe '.from_targeted' do
    let(:intake_pediatric) { { 'age_band' => '6-12', 'etiology' => 'autism', 'current_comm' => 'single_symbol', 'suspected_access' => 'touch' } }

    it 'returns the targeted schema with eval_mode flag + targeted_report block' do
      rec = EvalRecommend.from_targeted([], intake_pediatric)
      expect(rec['eval_mode']).to eq('targeted')
      expect(rec.keys).to include('access_method', 'grid_size', 'library', 'targeted_report')
      expect(rec['targeted_report']).to be_a(Hash)
      expect(rec['targeted_report'].keys).to include('adaptive_grid', 'library_3way', 'access_co_trial', 'syntax_probe')
    end

    it 'overrides grid_size from the adaptive_grid sweep converge event' do
      events = [
        { 'subtest' => 'adaptive_grid', 'converged' => true,
          'recommendation' => { 'rows' => 6, 'cols' => 6, 'band' => 'large', 'capacity' => 36, 'attempts' => 4, 'history' => [] } }
      ]
      rec = EvalRecommend.from_targeted(events, intake_pediatric)
      expect(rec['grid_size']['rows']).to eq(6)
      expect(rec['grid_size']['cols']).to eq(6)
    end

    it 'overrides library from the library_3way bake-off winner' do
      events = [
        { 'subtest' => 'library_3way', 'converged' => true, 'winner' => 'arasaac',
          'picks' => { 'symbolstix' => 1, 'pcs' => 1, 'arasaac' => 2 } }
      ]
      rec = EvalRecommend.from_targeted(events, intake_pediatric)
      expect(rec['library']).to eq('arasaac')
      expect(rec['targeted_report']['library_3way'][:margin]).to eq(0.25)
    end

    it 'overrides access_method from the access_co_trial winner + surfaces secondary' do
      events = [
        { 'subtest' => 'access_co_trial', 'converged' => true, 'winner' => 'gaze',
          'summary' => [
            { 'method' => 'gaze',  'attempts' => 2, 'accuracy' => 1.0 },
            { 'method' => 'touch', 'attempts' => 2, 'accuracy' => 0.5 },
            { 'method' => 'scan',  'attempts' => 2, 'accuracy' => 0.0 }
          ],
          'tallies' => {
            'touch' => { 'hits' => 1, 'misses' => 1 },
            'scan'  => { 'hits' => 0, 'misses' => 2 },
            'gaze'  => { 'hits' => 2, 'misses' => 0 }
          } }
      ]
      rec = EvalRecommend.from_targeted(events, intake_pediatric)
      expect(rec['access_method']).to eq('gaze')
      expect(rec['access_secondary']).to eq('touch')
    end

    it 'preserves the syntax_probe summary' do
      events = [
        { 'subtest' => 'syntax_probe', 'converged' => true,
          'summary' => { 'receptive_accuracy' => 1.0, 'expressive_accuracy' => 0.33, 'trial_count' => 3 } }
      ]
      rec = EvalRecommend.from_targeted(events, intake_pediatric)
      summary = rec['targeted_report']['syntax_probe']
      expect(summary['receptive_accuracy']).to eq(1.0)
      expect(summary['expressive_accuracy']).to eq(0.33)
    end

    it 'climbs confidence for converged subtests and caps at 0.95' do
      events = [
        { 'subtest' => 'adaptive_grid', 'converged' => true,
          'recommendation' => { 'rows' => 6, 'cols' => 6, 'band' => 'large', 'attempts' => 4, 'history' => [] } },
        { 'subtest' => 'library_3way',  'converged' => true, 'winner' => 'symbolstix',
          'picks' => { 'symbolstix' => 4, 'pcs' => 0, 'arasaac' => 0 } },
        { 'subtest' => 'access_co_trial', 'converged' => true, 'winner' => 'touch',
          'summary' => [{ 'method' => 'touch', 'attempts' => 4, 'accuracy' => 1.0 }],
          'tallies' => { 'touch' => { 'hits' => 4, 'misses' => 0 } } },
        { 'subtest' => 'syntax_probe', 'converged' => true,
          'summary' => { 'receptive_accuracy' => 1.0, 'expressive_accuracy' => 0.67, 'trial_count' => 3 } }
      ]
      rec = EvalRecommend.from_targeted(events, intake_pediatric)
      expect(rec['confidence']).to be > 0
      expect(rec['confidence']).to be <= 0.95
    end

    it 'recommends comprehensive when confidence stays below 0.7' do
      rec = EvalRecommend.from_targeted([], intake_pediatric)
      expect(rec['next_action']).to eq('promote_to_comprehensive')
    end

    it 'tolerates symbol keys in events' do
      events = [
        { subtest: 'library_3way', converged: true, winner: 'arasaac',
          picks: { symbolstix: 1, pcs: 1, arasaac: 2 } }
      ]
      rec = EvalRecommend.from_targeted(events, intake_pediatric)
      expect(rec['library']).to eq('arasaac')
    end
  end

  describe '.from_comprehensive' do
    let(:intake_pediatric) { { 'age_band' => '6-12', 'etiology' => 'autism', 'current_comm' => 'single_symbol', 'suspected_access' => 'touch' } }

    it 'flags eval_mode comprehensive and emits a comprehensive_report block' do
      rec = EvalRecommend.from_comprehensive([], intake_pediatric, nil)
      expect(rec['eval_mode']).to eq('comprehensive')
      expect(rec.keys).to include('comprehensive_report')
      expect(rec['comprehensive_report']).to be_a(Hash)
      expect(rec['comprehensive_report'].keys).to include('dynamic_assessment', 'literacy_probe', 'sett', 'targeted')
    end

    it 'surfaces the dynamic_assessment summary' do
      events = [
        { 'subtest' => 'dynamic_assessment', 'converged' => true,
          'summary' => { 'independence_avg' => 2.4, 'independence_pct' => 40, 'supported_pct' => 40, 'not_yet_pct' => 20, 'trial_count' => 5 } }
      ]
      rec = EvalRecommend.from_comprehensive(events, intake_pediatric, nil)
      expect(rec['comprehensive_report']['dynamic_assessment']['independence_pct']).to eq(40)
    end

    it 'surfaces the literacy_probe summary' do
      events = [
        { 'subtest' => 'literacy_probe', 'converged' => true,
          'summary' => { 'accuracy' => 0.75, 'hits' => 3, 'trials' => 4 } }
      ]
      rec = EvalRecommend.from_comprehensive(events, intake_pediatric, nil)
      expect(rec['comprehensive_report']['literacy_probe']['accuracy']).to eq(0.75)
    end

    it 'preserves the SETT payload' do
      sett = { 'student' => 'AAC user', 'environment' => 'classroom', 'task' => 'requesting' }
      rec = EvalRecommend.from_comprehensive([], intake_pediatric, sett)
      expect(rec['comprehensive_report']['sett']).to eq(sett)
    end

    it 'caps confidence at 0.99' do
      events = [
        { 'subtest' => 'dynamic_assessment', 'converged' => true,
          'summary' => { 'independence_avg' => 1.5, 'independence_pct' => 80 } },
        { 'subtest' => 'literacy_probe', 'converged' => true,
          'summary' => { 'accuracy' => 0.75 } }
      ]
      rec = EvalRecommend.from_comprehensive(events, intake_pediatric, { 'student' => 'x' })
      expect(rec['confidence']).to be <= 0.99
    end

    it 'pushes communicator_stage upward when DA shows high independence' do
      events = [
        { 'subtest' => 'dynamic_assessment', 'converged' => true,
          'summary' => { 'independence_avg' => 1.5, 'independence_pct' => 80 } }
      ]
      base = EvalRecommend.from_targeted([], intake_pediatric)
      rec  = EvalRecommend.from_comprehensive(events, intake_pediatric, nil)
      expect(rec['communicator_stage']).to be >= base['communicator_stage']
    end

    it 'next_action is build_starter_board (comprehensive is the final tier)' do
      rec = EvalRecommend.from_comprehensive([], intake_pediatric, nil)
      expect(rec['next_action']).to eq('build_starter_board')
    end

    it 'tolerates symbol keys in events' do
      events = [
        { subtest: 'dynamic_assessment', converged: true,
          summary: { independence_avg: 2.0, independence_pct: 60 } }
      ]
      rec = EvalRecommend.from_comprehensive(events, intake_pediatric, nil)
      expect(rec['comprehensive_report']['dynamic_assessment']['independence_pct']).to eq(60)
    end
  end
end
