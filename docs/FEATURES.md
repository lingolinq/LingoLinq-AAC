# LingoLinq Feature Inventory

> **Purpose:** This document lists features for prioritization, project planning, and identifying premium requirements, role restrictions, and potentially unused functionality.
>
> **Last Updated:** February 2025

---

## 1. User Roles and Permission Model

### Role Types
| Role | Description | Key Limitations |
|------|--------------|------------------|
| **Communicator** | Primary AAC user; uses boards to communicate | Full feature access based on subscription |
| **Supporter/Supervisor** | Therapist, family, or caregiver supporting a communicator | Can view boards, model, and (with edit permission) edit boards for supervisees; many premium features require supervising a premium communicator |
| **Modeling-only** | Free supporter account; cannot edit boards or view reports | Only modeling ideas for supervisees; no cloud sync, no reports, no personal home board |
| **Valet mode** | Limited device session (e.g., shared device) | Can only view boards and model; no edit, no supervision access |
| **Organization manager** | Manages org users and licenses | Org-specific permissions; can manage users, subscriptions |
| **Limited paid supervisor** | Paid supporter with no communicators | Slightly limited to prevent standalone communicator use |

### Permission Types (Backend)
- `view_existence`, `view_detailed` – View user/board details
- `model` – Modeling sessions for communicators
- `supervise` – Full supervisor access (reports, logs, goals)
- `edit`, `edit_boards` – Edit boards and user settings
- `manage_supervision` – Add/remove supervisors
- `set_goals` – Create and manage goals
- `view_deleted_boards` – Access deleted boards
- `view_word_map` – Word map / vocabulary analysis
- `link_auth` – Link authentication

---

## 2. Premium Features

Premium features require either **currently_premium** (active subscription/trial) or **fully_purchased** (long-term purchase), depending on the feature.

### Premium Features (Basic – Trial or Purchase)
| Feature | Description | Role Restrictions |
|---------|-------------|-------------------|
| Speak Mode > 15 min | Extended speak session duration | Communicator only |
| Adding Supervisors | Add supervisors to account | Communicator only |
| Auto-Jump to Speak Mode | Open speak mode automatically | Communicator only |
| Editing Boards | Create and edit boards | Communicator or supervisor with edit permission |
| Premium Voices | Non-built-in TTS voices | Communicator only; modeling-only gets built-in only |

### Full Premium Features (Currently Active Subscription)
| Feature | Description | Role Restrictions |
|---------|-------------|-------------------|
| Usage Reports | Stats and log summaries | Communicator; supervisors can view for premium supervisees |
| Video Recording | Record sessions | Communicator only |
| Modeling Ideas | Cloud-synced modeling suggestions | Communicator + supervisees; requires at least one premium communicator to use |
| Goals | Create and track goals | Communicator; supervisors with non–modeling-only access can set for supervisees |
| Badge Tracking | Badge progress and notifications | Communicator only |
| Quick Assessments | Assessment tools | Communicator or premium supporter |
| Unlimited Evaluations | Evaluation features | Communicator or premium supporter |
| Logs / Team Messaging | Review logs, team messaging | Communicator; supervisors for premium supervisees |
| Share Utterance | Share utterances externally | Communicator must be premium |
| Third-Party Integrations | App connections, webhooks | Premium communicator required; supervisors can preview when linked to premium communicators |
| Button Suggestions | AI/contextual button suggestions | Communicator only, premium |

### Premium Voice Limits
- **Full premium:** 2 premium voices allowed
- **Trial:** 1 premium voice
- **Eval account:** 1 premium voice
- **Non-premium:** 0 premium voices

---

## 3. Feature Flags

Feature flags control UI visibility and behavior. Users can have flags enabled via `user.settings['feature_flags']` or org-wide canary.

### Enabled by Default
| Flag | Description |
|------|-------------|
| `subscriptions` | Subscription and billing UI |
| `assessments` | Assessment tools |
| `custom_sidebar` | Custom sidebar |
| `snapshots` | Board snapshots |
| `video_recording` | Video recording |
| `goals` | Goals feature |
| `modeling` | Modeling ideas |
| `geo_sidebar` | Geolocation sidebar |
| `edit_before_copying` | Edit before copying boards |
| `core_reports` | Core reporting |
| `lessonpix` | LessonPix symbol library integration |
| `translation` | Translation features |
| `fast_render` | Fast board rendering |
| `audio_recordings` | Audio recording |
| `app_connections` | Third-party integrations (webhooks, tools) |
| `enable_all_buttons` | Enable all buttons preference |
| `badge_progress` | Badge progress tracking |
| `premium_symbols` | Premium symbol libraries (PCS, SymbolStix) |
| `board_levels` | Board level customization |
| `native_keyboard` | Native keyboard |
| `app_store_purchases` | In-app purchase (iOS/Android) |
| `find_multiple_buttons` | Find multiple buttons |
| `new_speak_menu` | New speak menu UI |
| `swipe_pages` | Swipe between pages |
| `inflections_overlay` | Inflections overlay |
| `ios_head_tracking` | iOS head tracking |
| `emergency_boards` | Emergency boards |
| `evaluations` | Evaluation tools |
| `vertical_ios_head_tracking` | Vertical iOS head tracking |
| `remote_modeling` | Remote modeling sessions |
| `auto_inflections` | Auto inflections |
| `focus_word_highlighting` | Focus word highlighting |
| `skin_tones` | Skin tone options for symbols |
| `lessons` | Lessons feature |
| `profiles` | User profiles |
| `other_menu` | Other menu |
| `ai_board_generation` | AI board generation |

### Disabled by Default (Available but Not Enabled)
| Flag | Description | Usage Notes |
|------|-------------|-------------|
| `canvas_render` | Canvas-based board rendering | **Not in ENABLED list** – Canvas is controlled by user preference `preferences.device.canvas_render`, not this flag |
| `shallow_clones` | Shallow board clones | Used in start-codes modal; likely low usage |

### Platform-Specific
| Flag | Platform | Notes |
|------|----------|-------|
| `app_store_purchases` | iOS/Android | Stripe vs app store |
| `app_store_monthly_purchases` | iOS/Android | In AVAILABLE but not ENABLED |
| `ios_head_tracking` | iOS | Head-tracking / eye-gaze |
| `vertical_ios_head_tracking` | iOS | Vertical orientation |

---

## 4. Major Feature Areas

### Core Communication
- **Speak Mode** – Primary AAC interface
- **Board browsing/navigation** – Grid, levels, swipe pages
- **Button activation** – Click, dwell, scanning, head-tracking
- **Utterance/sentence box** – Build and speak phrases
- **Speech synthesis** – TTS, premium voices
- **Find-a-button** – Search buttons across boards

### Boards
- **Board creation/editing** – Create, edit, copy boards
- **Board levels** – Multiple levels per board (feature flag)
- **Symbol libraries** – OpenSymbols, PCS, SymbolStix, LessonPix
- **Import/Export** – OBF, OBL formats
- **Snapshots** – Save board states
- **Emergency boards** – Quick-access emergency boards

### Supervision & Modeling
- **Supervisors** – Add/edit supervisors, modeling-only links
- **Modeling ideas** – Cloud-synced suggestions
- **Remote modeling** – Remote modeling sessions
- **Logs** – Session logs (premium)

### Goals & Progress
- **Goals** – Create, track, comment on goals
- **Badges** – Badge progress (premium)
- **Assessments** – Quick assessments
- **Evaluations** – Unlimited evaluations (premium)

### Reports & Analytics
- **Usage reports (Stats)** – Log summaries, reports
- **Video recording** – Session recording
- **Core reports** – Additional report types

### Integrations
- **App connections** – Webhooks, third-party tools
- **LessonPix** – Symbol library
- **Premium symbols** – PCS, SymbolStix (require premium search)

### Organization Features
- **Organizations** – Multi-user management
- **Rooms** – Organization rooms
- **Lessons** – Org lessons
- **Profiles** – User profiles in orgs
- **Reports** – Org-level reports

### Accessibility & Input
- **Scanning mode** – Switch access
- **Head tracking** – iOS head tracking
- **Dwell** – Dwell-to-select
- **Native keyboard** – On-screen keyboard
- **Inflections overlay** – Language inflections

---

## 5. Potentially Unused or Underutilized Features

| Feature | Status | Notes |
|---------|--------|-------|
| `canvas_render` | Disabled flag | Rendering uses `preferences.device.canvas_render`; feature flag not in ENABLED list |
| `shallow_clones` | Disabled flag | Used in start-codes; may have low adoption |
| `app_store_monthly_purchases` | Disabled flag | In AVAILABLE, not ENABLED |
| `lessonpix` | Enabled | Requires paid LessonPix account + connection in Profile; may be niche |
| `edit_before_copying` | Enabled | Copy-flow option; usage unknown |
| `profiles` | Enabled | Org-level; usage unknown |
| `other_menu` | Enabled | Menu reorganization; usage unknown |

---

## 6. Modeling-Only Restrictions

Users with **modeling_only** (or modeling-only supervisor link) cannot:
- Use cloud extras
- Edit boards
- View reports (stats, logs, goals, badges)
- Have a personal home board
- Use premium voices (built-in only)
- Access recordings

They can:
- Model for supervisees (modeling ideas)
- Download boards to practice (offline)

---

## 7. Organization Roles

| Role | Permissions |
|------|-------------|
| **Manager** | Full org management, subscription, extras, reports |
| **Assistant** | View/edit org settings |
| **Supervisor** | View org; supervise org users |

---

## 8. Quick Reference: Where Premium Is Checked

| Action | Check |
|--------|-------|
| Add supervisor | `check_for_currently_premium` (allow_fully_purchased) |
| Quick assessment | `check_for_currently_premium` |
| Evaluation | `check_for_currently_premium` (allow_premium_supporter) |
| Record session | `check_for_currently_premium` |
| Video recording | `user.currently_premium` |
| Share utterance | `referenced_user.currently_premium` |
| Premium voices | `currently_premium` and `premium_voices.allowed` |
| Button suggestions | `currentUser.currently_premium` |
| Edit boards | `check_for_needing_purchase` |
| Third-party integrations (board view) | `currently_premium_or_premium_supporter` |
| Goals, badges, stats, logs | Template gates on `currently_premium` |

---

## 9. Sources and Maintenance

- **docs/premium_features.md** – Original premium feature list
- **lib/feature_flags.rb** – Feature flag definitions
- **app/models/user.rb** – Permission model
- **app/models/concerns/subscription.rb** – Billing states
- **app/frontend/app/models/user.js** – Frontend premium logic
- **app/frontend/app/services/app-state.js** – `check_for_currently_premium`, `check_for_needing_purchase`

---

## 10. Recommendations for Prioritization

1. **Premium clarity** – Audit all `check_for_currently_premium` and `check_for_needing_purchase` paths for consistency.
2. **Feature flag cleanup** – Consider removing or promoting `canvas_render`, `shallow_clones`, `app_store_monthly_purchases` if unused.
3. **Modeling-only UX** – Document and simplify modeling-only vs premium supporter flows.
4. **LessonPix** – Measure usage; consider deprecation or simplification if adoption is low.
5. **Organization features** – Evaluate usage of profiles, lessons, rooms for roadmap decisions.
6. **Backend permission audit** – Ensure all premium features have corresponding backend checks, not just frontend gates.

---

## 11. User Stories by Role

### Communicator

**Core Communication**
- As a communicator, I want to use Speak Mode to express myself using my boards so that I can participate in conversations.
- As a communicator, I want to browse and navigate my boards (grid, levels, swipe) so that I can quickly find the right words.
- As a communicator, I want to activate buttons via click, dwell, scanning, or head-tracking so that I can use the input method that works best for me.
- As a communicator, I want to build phrases in the utterance/sentence box so that I can speak complete sentences.
- As a communicator, I want text-to-speech output so that others can hear what I’m saying.
- As a communicator, I want premium voices (when premium) so that my speech sounds more natural.
- As a communicator, I want to search for buttons across my boards so that I can find words quickly.
- As a communicator, I want Speak Mode to last longer than 15 minutes (when premium) so that I can communicate throughout the day.
- As a communicator, I want auto-jump to Speak Mode (when premium) so that the app opens ready for me to communicate.

**Boards**
- As a communicator, I want to create and edit boards so that my vocabulary matches my needs.
- As a communicator, I want multiple levels per board so that I can organize more content without clutter.
- As a communicator, I want to use symbol libraries (OpenSymbols, PCS, SymbolStix, LessonPix) so that I have images for my words.
- As a communicator, I want to import and export boards (OBF, OBL) so that I can share or backup my boards.
- As a communicator, I want to save board snapshots so that I can restore previous layouts.
- As a communicator, I want quick access to emergency boards so that I can communicate in urgent situations.
- As a communicator, I want to add buttons from multiple sources at once so that I can build boards faster.

**Supervision & Modeling**
- As a communicator, I want to add supervisors to my account so that family and therapists can support me.
- As a communicator, I want modeling ideas synced to my account so that supporters can suggest words for me to try.
- As a communicator, I want remote modeling sessions so that supporters can help me from anywhere.

**Goals & Progress**
- As a communicator, I want to create and track goals so that I can work toward communication milestones.
- As a communicator, I want badge progress and notifications so that I stay motivated.
- As a communicator, I want quick assessments so that my progress can be measured.
- As a communicator, I want unlimited evaluations so that my team can assess my communication.
- As a communicator, I want contextual button suggestions so that relevant words are easier to find.

**Reports & Analytics**
- As a communicator, I want usage reports and stats so that I can see how often I communicate.
- As a communicator, I want to record video sessions so that my team can review my communication.
- As a communicator, I want to view logs and team messaging so that I can stay connected with supporters.

**Integrations**
- As a communicator, I want to share utterances externally so that I can communicate outside the app.
- As a communicator, I want third-party integrations (webhooks, tools) so that I can connect to other services.
- As a communicator, I want to manage app connections and integrations so that tools work the way I need.

**Accessibility & Preferences**
- As a communicator, I want scanning mode so that I can use switch access.
- As a communicator, I want head-tracking (iOS) so that I can select buttons with head movement.
- As a communicator, I want dwell-to-select so that I can use gaze or sustained pressure.
- As a communicator, I want a native keyboard so that I can type when needed.
- As a communicator, I want inflections overlay so that I can use grammatical forms correctly.
- As a communicator, I want skin tone options for symbols so that images represent me.
- As a communicator, I want to enable all buttons so that I can access everything when needed.
- As a communicator, I want focus word highlighting so that key words are easier to see.
- As a communicator, I want AI board generation so that new boards can be created for me quickly.

**Subscription**
- As a communicator, I want to view and manage my subscription so that I can access premium features.

---

### Supporter / Supervisor

**Supervision & Modeling**
- As a supporter, I want to view my supervisee’s boards so that I can understand their vocabulary.
- As a supporter, I want to model for my supervisee so that I can demonstrate communication.
- As a supporter, I want edit permission on a supervisee’s boards so that I can create and update their boards.
- As a supporter, I want modeling-only links for some supervisees so that I can model without full edit access.
- As a supporter, I want modeling ideas for premium supervisees so that I can suggest words for them to try.
- As a supporter, I want remote modeling sessions so that I can support supervisees from another location.
- As a supporter, I want to add and manage supervisors for a supervisee (when I have permission) so that the right team can support them.

**Reports & Logs**
- As a supporter, I want to view logs for my premium supervisees so that I can see their communication patterns.
- As a supporter, I want to view usage reports and stats for my premium supervisees so that I can track progress.
- As a supporter, I want to access team messaging for premium supervisees so that we can coordinate care.

**Goals**
- As a supporter, I want to create and track goals for my supervisees so that we can work toward milestones.
- As a supporter, I want to comment on goals so that we can discuss progress.

**Assessments & Evaluations**
- As a supporter, I want to run quick assessments for my supervisees so that I can measure progress.
- As a supporter, I want to use unlimited evaluations (when premium) so that I can assess communication.

**Boards**
- As a supporter, I want to create and edit boards for supervisees so that their vocabulary matches their needs.
- As a supporter, I want to import/export boards for supervisees so that we can share content.
- As a supporter, I want to use symbol libraries (including LessonPix when connected) so that boards have good images.
- As a supporter, I want to preview third-party integrations for premium supervisees so that I can set up tools for them.

**Switching & Navigation**
- As a supporter, I want to switch between supervisees so that I can support multiple people.
- As a supporter, I want to see the communicators tab so that I can access my supervisees quickly.

**Subscription**
- As a supporter, I want premium supporter access so that I can use reports, goals, and edit features for my supervisees.

---

### Modeling-Only

**Modeling**
- As a modeling-only user, I want to model for my supervisees so that I can demonstrate communication.
- As a modeling-only user, I want modeling ideas when supervising premium communicators so that I can suggest words to try.
- As a modeling-only user, I want to download boards to practice offline so that I can learn the vocabulary.

**Limitations**
- As a modeling-only user, I understand I cannot edit boards, view reports, or use premium voices so that I know my account scope.
- As a modeling-only user, I understand I use only built-in voices so that I know my voice options.

---

### Valet Mode

**Limited Access**
- As a valet mode user, I want to view boards so that I can see what’s available.
- As a valet mode user, I want to model so that I can demonstrate for the communicator.
- As a valet mode user, I understand I cannot edit, supervise, or access cloud features so that the session stays limited.

---

### Organization Manager

**Organization Management**
- As an org manager, I want to manage org users and licenses so that the right people have access.
- As an org manager, I want to manage the org subscription so that we stay within our plan.
- As an org manager, I want to manage extras and add-ons so that our org has the features we need.
- As an org manager, I want to view org-level reports so that I can see usage across users.

**Users & Units**
- As an org manager, I want to add and remove users so that the org roster is correct.
- As an org manager, I want to manage organization units so that we can structure teams.
- As an org manager, I want to assign users to units so that reporting and access are organized.
- As an org manager, I want to sponsor users so that they have premium access through the org.

**Lessons & Rooms**
- As an org manager, I want to create and manage lessons so that we can deliver training.
- As an org manager, I want to manage rooms so that we can organize spaces.
- As an org manager, I want to assign lessons to rooms or users so that content is delivered correctly.

**Profiles**
- As an org manager, I want to use profiles so that we can assess or survey users in the org.
- As an org manager, I want to manage org settings so that branding and defaults are correct.

---

### Organization Assistant

**Organization Support**
- As an org assistant, I want to view org settings so that I understand the configuration.
- As an org assistant, I want to edit org settings (when permitted) so that I can help manage the org.
- As an org assistant, I want to view org users so that I can support day-to-day operations.

---

### Organization Supervisor

**Supervision**
- As an org supervisor, I want to view the org so that I know which users and units exist.
- As an org supervisor, I want to supervise org users so that I can support the communicators in my org.
