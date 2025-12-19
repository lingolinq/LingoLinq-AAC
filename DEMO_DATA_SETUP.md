# LingoLinq Demo Data Setup Guide

This guide explains how to create demo users with realistic usage data for training and demonstration purposes.

## Overview

The demo data seeder creates **3 demo users** with different AAC usage profiles, each with **3 months of realistic usage data**. This allows you to demonstrate:

- **Usage Reports**: Word frequency, words per minute, sessions per week
- **Time-of-Day Analysis**: When the user communicates most
- **Word Cloud Visualizations**: Most frequently used words
- **Core vs Fringe Word Usage**: Language development metrics
- **Parts of Speech Analysis**: Grammatical patterns
- **Device Usage**: Which devices are used
- **Goal Tracking**: Progress over time (if goals are set)

## Demo Users

| Username | Profile | Description |
|----------|---------|-------------|
| `demo_emma` | Beginner | 6-year-old learning to communicate. Low session count, simple vocabulary, high modeling ratio. |
| `demo_jacob` | Intermediate | 10-year-old with growing vocabulary. Moderate usage, expanding word variety. |
| `demo_sophia` | Advanced | 14-year-old fluent communicator. High usage, complex sentences, minimal modeling. |

**Default Password**: `demodemo123`

## Installation

The rake task file is already included at:
```
lib/tasks/demo_data.rake
```

No additional installation is required.

## Usage

### Seed All Demo Users

To create all three demo users with 3 months of data:

```bash
rake demo:seed_all
```

This will:
1. Create each demo user (or find existing ones)
2. Create a demo communication board for each user
3. Generate 90 days of log sessions with realistic patterns
4. Generate weekly stats summaries for reports

**Estimated time**: 2-5 minutes depending on your system.

### Seed a Specific User

To create just one demo user:

```bash
rake demo:seed_user[demo_emma]
rake demo:seed_user[demo_jacob]
rake demo:seed_user[demo_sophia]
```

### Clear Demo Data

To remove all demo users and their data:

```bash
rake demo:clear
```

### Regenerate Stats Summaries

If reports aren't showing correctly, regenerate the weekly summaries:

```bash
rake demo:generate_summaries
```

## Viewing Demo Reports

After seeding, you can view reports at:

- `/demo_emma/stats` - Beginner user reports
- `/demo_jacob/stats` - Intermediate user reports  
- `/demo_sophia/stats` - Advanced user reports

Log in as the demo user or as a supervisor to view their reports.

## Data Characteristics

### Usage Patterns

The generated data includes realistic patterns:

- **Daily Variation**: More sessions on weekdays, fewer on weekends
- **Time-of-Day Distribution**: Sessions spread throughout waking hours
- **Growth Over Time**: Skills improve gradually over the 3-month period
- **Modeling Sessions**: Percentage of sessions marked as modeling (varies by profile)

### Vocabulary

Words are drawn from AAC-appropriate categories:

**Core Words**:
- Pronouns (I, you, he, she, it, we, they)
- Verbs (want, need, like, go, help, stop, more)
- Descriptors (good, bad, big, little, happy, sad)
- Prepositions (in, on, up, down, out)
- Social (hi, bye, please, thank you, sorry)
- Questions (what, where, when, who, why, how)
- Time (now, later, today, tomorrow)

**Fringe Words**:
- Food (apple, cookie, juice, pizza)
- Activities (read, play, swim, dance)
- Places (home, school, park, store)
- People (mom, dad, friend, teacher)
- Animals (dog, cat, bird, fish)
- Objects (phone, tablet, toy, book)
- Feelings (excited, scared, angry, happy)

### Session Structure

Each session includes:
- **Button presses**: Individual word selections
- **Utterances**: Complete spoken phrases
- **Navigation actions**: Home button, board changes
- **Timestamps**: Realistic timing between events

## Customization

### Modifying User Profiles

Edit the `DEMO_PROFILES` hash in `lib/tasks/demo_data.rake`:

```ruby
DEMO_PROFILES = {
  'demo_custom' => {
    name: 'Custom User (Demo)',
    description: 'Your custom description',
    email: 'demo_custom@example.com',
    usage_level: :intermediate,
    sessions_per_day: 3..6,        # Range of daily sessions
    buttons_per_session: 10..25,   # Buttons per session
    utterances_per_session: 2..5,  # Utterances per session
    preferred_vocabulary: [:core_words, :food, :activities],
    modeling_ratio: 0.3,           # 30% modeling sessions
    growth_rate: 0.12              # 12% improvement over 3 months
  }
}
```

### Modifying Vocabulary

Add or modify words in the `DEMO_VOCABULARY` hash:

```ruby
DEMO_VOCABULARY = {
  core_words: {
    # Add new category
    emotions: %w[happy sad angry scared excited],
  },
  fringe_words: {
    # Add new category
    school_supplies: %w[pencil paper notebook backpack],
  }
}
```

### Changing Date Range

By default, data is generated for the past 90 days. To change this, modify the `generate_usage_data` method:

```ruby
def generate_usage_data(user, device, board, profile)
  end_date = Date.today
  start_date = end_date - 180.days  # Change to 6 months
  # ...
end
```

## Troubleshooting

### Reports Show "No Data"

1. Ensure logging is enabled for the user:
   ```ruby
   user.settings['preferences']['logging'] = true
   user.save!
   ```

2. Regenerate weekly summaries:
   ```bash
   rake demo:generate_summaries
   ```

3. Check that log sessions exist:
   ```ruby
   user = User.find_by_path('demo_emma')
   puts user.log_sessions.count
   ```

### User Already Exists

The seeder will use existing users if found. To start fresh:
```bash
rake demo:clear
rake demo:seed_all
```

### Background Jobs Not Running

Some stats calculations require background jobs. Ensure Resque is running:
```bash
env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
```

## Integration with Training

When conducting training sessions:

1. **Before Training**: Run `rake demo:seed_all` to ensure fresh data
2. **During Training**: Log in as demo users to show reports
3. **After Training**: Optionally run `rake demo:clear` to clean up

### Suggested Demo Flow

1. Log in as `demo_sophia` (advanced user) to show full-featured reports
2. Navigate to `/demo_sophia/stats`
3. Demonstrate:
   - Date range selection
   - Word frequency charts
   - Time-of-day usage patterns
   - Core vs fringe word analysis
   - Device usage breakdown
4. Compare with `demo_emma` (beginner) to show growth potential

## Security Notes

- Demo users are created with a known password (`demodemo123`)
- Demo data is clearly marked with "(Demo)" in names
- Consider clearing demo data before production deployment
- Demo users do not have admin privileges

## Demo Organization (School District)

In addition to individual demo users, you can create a complete demo school district organization with teachers, classrooms, and students.

### Organization Structure

| Component | Details |
|-----------|----------|
| **Organization** | Riverside Demo School District |
| **Manager** | demo_org_admin (District AAC Coordinator) |
| **Teachers** | 3 supervisors with different specialties |
| **Students** | 6 students (3 main + 3 additional) |
| **Classrooms** | 3 rooms with teacher/student assignments |

### Demo Teachers

| Username | Name | Role | Classroom |
|----------|------|------|------------|
| `demo_teacher_johnson` | Ms. Johnson | Special Ed - Elementary | Room 101 |
| `demo_teacher_smith` | Mr. Smith | Speech Language Pathologist | Room 102 |
| `demo_teacher_garcia` | Ms. Garcia | Special Ed - Middle School | Room 201 |

### Demo Classrooms

| Room | Teachers | Students |
|------|----------|----------|
| Room 101 - Elementary AAC | Ms. Johnson | Emma, Alex, Maya |
| Room 102 - Speech Therapy | Mr. Smith | Emma, Jacob, Alex |
| Room 201 - Middle School AAC | Ms. Garcia | Jacob, Sophia, Noah |

### Organization Usage

**Create the demo organization:**
```bash
rake demo:seed_org
```

This will:
1. Create the Riverside Demo School District organization
2. Create an org manager (demo_org_admin)
3. Create 3 demo teachers as supervisors
4. Create 3 additional demo students with usage data
5. Add all students to the organization
6. Create 3 classrooms with teacher/student assignments

**Add existing demo users to org:**
```bash
rake demo:add_users_to_org
```

**Clear organization data:**
```bash
rake demo:clear_org
```

### Accessing the Organization Dashboard

1. Log in as `demo_org_admin` (password: `demodemo123`)
2. Navigate to the organization dashboard
3. View:
   - Organization statistics and usage reports
   - Rooms/classrooms with teacher and student assignments
   - Individual student reports and progress
   - Supervisor management

### Complete Demo Setup

For a full demo environment with both individual users and organization:

```bash
# Create individual demo users first
rake demo:seed_all

# Then create the organization structure
rake demo:seed_org
```

### Demonstrating Organization Features

**As Org Manager (demo_org_admin):**
- View organization dashboard with aggregate statistics
- Manage rooms/classrooms
- Add/remove teachers and students
- View usage reports across all students

**As Teacher (demo_teacher_*):**
- View assigned students in their classroom
- Access individual student reports
- Monitor student progress and usage
- See modeling statistics

**As Student (demo_*):**
- Use the AAC board normally
- Data automatically aggregates to org reports

## Support

For issues or questions about the demo data seeder, refer to:
- Main documentation: `README.md`
- Code investigation: `CODE_INVESTIGATION.md`
- Development guide: `CLAUDE.md`
