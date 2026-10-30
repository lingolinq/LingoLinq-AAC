require 'spec_helper'

describe DemoDistrict::UsageGenerator do
  # Absences are keyed on the student's database id, which changes from run to run, so they are
  # pinned off here; spec/lib/demo_district_spec.rb covers them.
  before { allow_any_instance_of(DemoDistrict::UsageGenerator).to receive(:absent?).and_return(false) }

  let(:tz) { ActiveSupport::TimeZone['America/Los_Angeles'] }
  let(:student) { User.create(settings: { 'email' => 'kid@demoschooldistrict.org' }) }
  let(:board) { { 'id' => '1_1', 'key' => 'example/home' } }

  def generator(profile, index: 0)
    DemoDistrict::UsageGenerator.new(student: student, profile: profile, index: index, author: student,
                                     board: board, device: Device.create(user: student))
  end

  def modeled_events(session)
    (session.data['events'] || []).select { |e| e['modeling'] }
  end

  describe "schedules" do
    let(:lunch_profile) { { name: 'Spec Kid', user_name: 'spec_kid', skill: :beginner, freq: :low, schedule: :lunch_and_speech } }

    it "gives a lunch-and-speech student one lunchtime session a day and a Thursday afternoon speech session" do
      gen = generator(lunch_profile)
      monday = gen.generate_day(Date.new(2026, 10, 19))
      thursday = gen.generate_day(Date.new(2026, 10, 22))

      expect(monday.map { |s| s.started_at.in_time_zone(tz).hour }).to eq([12])
      expect(thursday.map { |s| s.started_at.in_time_zone(tz).hour }.sort).to eq([12, 14])
      (monday + thursday).each { |s| expect(s.started_at.in_time_zone(tz).min).to be < 20 }
      expect(gen.generate_day(Date.new(2026, 10, 24))).to eq([])
    end

    it "models with a lunch-and-speech student at lunch" do
      gen = generator(lunch_profile)
      lunches = (19..23).map { |d| gen.generate_day(Date.new(2026, 10, d)) }.flatten
                        .select { |s| s.started_at.in_time_zone(tz).hour == 12 }
      expect(lunches.length).to eq(5)
      # About 3 buttons or more a lunch at a 60% modeling rate: no modeling at all in a week is
      # about a one in a million chance.
      expect(lunches.sum { |s| modeled_events(s).length }).to be > 0
      expect(lunches.sum { |s| s.data['stats']['modeling_events'].to_i }).to eq(lunches.sum { |s| modeled_events(s).length })
    end

    it "uses a sporadic student's device only on the days sporadic_day? picks" do
      gen = generator({ name: 'Spec Kid', user_name: 'spec_kid', skill: :intermediate, freq: :medium, schedule: :sporadic })
      allow(gen).to receive(:sporadic_day?) { |date| date == Date.new(2026, 10, 21) }

      days = (19..23).map { |d| [d, gen.generate_day(Date.new(2026, 10, d)).length] }.to_h
      expect(days[21]).to be > 0
      expect(days.except(21).values).to eq([0, 0, 0, 0])
    end

    it "picks about SPORADIC_DAY_RATE of school days for a sporadic student, the same way on a rerun" do
      gen = generator({ name: 'Spec Kid', user_name: 'spec_kid', skill: :intermediate, freq: :medium, schedule: :sporadic })
      dates = (0..400).map { |i| Date.new(2026, 1, 5) + i }.reject { |d| d.saturday? || d.sunday? }
      picked = dates.select { |d| gen.sporadic_day?(d) }
      # 287 school days at 0.3: the bounds are more than five standard deviations out.
      expect(picked.length).to be_between(40, 135)
      expect(dates.select { |d| gen.sporadic_day?(d) }).to eq(picked)
    end

    it "keeps a daily student on every school day" do
      gen = generator(DemoDistrict::UsageGenerator::DEFAULT_PROFILE)
      expect((19..23).map { |d| gen.generate_day(Date.new(2026, 10, d)).length }).to all(be > 0)
    end

    it "refuses a schedule it does not know" do
      expect {
        generator({ name: 'Spec Kid', user_name: 'spec_kid', skill: :beginner, freq: :low, schedule: :weekly })
      }.to raise_error(ArgumentError, /unknown schedule/)
    end
  end

  describe "heat maps" do
    it "never places a top-right-blocked student's touches in the top right of the board" do
      gen = generator({ name: 'Spec Kid', user_name: 'spec_kid', skill: :intermediate, freq: :medium, heat: :top_right_blocked })
      points = Array.new(500) { gen.send(:touch_position) }
      expect(points.select { |x, y| x > 0.5 && y < 0.5 }).to eq([])
      # The rest of the board is still used: top left, bottom left and bottom right.
      expect(points.any? { |x, y| x < 0.5 && y < 0.5 }).to eq(true)
      expect(points.any? { |x, y| x < 0.5 && y > 0.5 }).to eq(true)
      expect(points.any? { |x, y| x > 0.5 && y > 0.5 }).to eq(true)
    end

    it "still picks the original five patterns by index for a student who names none" do
      names = (0..5).map { |i| generator(DemoDistrict::UsageGenerator::DEFAULT_PROFILE, index: i).description.split(', ')[1] }
      expect(names).to eq(%w[full_access left_bias top_left_quad bottom_right center_cluster full_access])
    end
  end

  describe "the demo district's students" do
    let(:profiles) { DemoDistrict::UsageGenerator::STUDENT_PROFILES }

    it "include sporadic, lunch-and-speech, top-right-blocked and full-coverage students" do
      expect(profiles.count { |p| p[:schedule] == :sporadic }).to be >= 2
      expect(profiles.count { |p| p[:schedule] == :lunch_and_speech }).to be >= 1
      expect(profiles.count { |p| p[:heat] == :top_right_blocked }).to be >= 1
      descriptions = profiles.each_with_index.map { |p, i| generator(p, index: i).description }
      expect(descriptions.count { |d| d.include?('full_access') }).to be >= 2
      expect(descriptions.count { |d| d.end_with?('daily') }).to be >= 10
    end
  end
end
