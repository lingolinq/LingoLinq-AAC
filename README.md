# LingoLinq AAC: Every Voice Should Be Heard

[![License](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![DeepWiki](https://deepwiki.anthropic.com/badge.svg?repo=swahlquist/LingoLinq-AAC)](https://deepwiki.anthropic.com/repo/swahlquist/LingoLinq-AAC)
[![OpenAAC](https://img.shields.io/badge/chat-OpenAAC%20Slack-purple)](https://www.openaac.org)

**LingoLinq AAC** is an open-source, cloud-based Augmentative and Alternative Communication (AAC) application that empowers individuals with speech difficulties to communicate using customizable boards, text-to-speech synthesis, and multi-device synchronization.

📚 [Documentation](.ai/docs/) | 🚀 [Deployment Guide](.ai/docs/DEPLOYMENT_PLAYBOOK.md) | 🤝 [Contributing](CONTRIBUTING.md) | 💬 [Community](https://www.openaac.org)

---

## Table of Contents
- [About LingoLinq AAC](#about-lingolinq-aac)
- [What Makes LingoLinq Different](#what-makes-lingolinq-different)
- [Key Features](#key-features)
- [Current Status & Deployment](#current-status--deployment) ⚠️ **Important**
- [Quick Start](#quick-start)
- [Technology Stack](#technology-stack)
- [Production Deployment](#production-deployment)
- [Traditional Development Setup](#traditional-development-setup)
- [Additional Requirements](#additional-requirements)
- [Production Maintenance](#production-maintenance)
- [Development Guidelines](#development-guidelines)
- [Troubleshooting](#troubleshooting)
- [Contribution Ideas](#contribution-ideas)
- [Contributing](#contributing)
- [Community & Support](#community--support)
- [License](#license)

---

## 🗣️ About LingoLinq AAC

LingoLinq AAC, a fork of SweetSuite AAC, is an open, web-based AAC (Augmentative and Alternative Communication) app designed for people who struggle with speech. Whether due to physical limitations, developmental conditions, or other challenges, LingoLinq provides tools to help users communicate effectively.

### How It Works

Users can communicate in several ways:
- **Typing** - Direct text input with text-to-speech (like Stephen Hawking's approach)
- **Communication Boards** - Grids of labeled pictures that speak when tapped
- **Keyboards** - Visual keyboard layouts optimized for AAC
- **Combination Approaches** - Mix typing, boards, and other modalities

The app leverages modern web standards including:
- **Web Speech API** for text-to-speech
- **Application Cache** for offline functionality
- **IndexedDB** for local data storage
- **HTML5** for cross-platform compatibility

### Platform Support

LingoLinq runs on most modern browsers and platforms:
- **Desktop**: Windows, Mac, ChromeOS
- **Mobile**: iOS, Android
- **Web**: Any modern browser
- **Packaged Apps**: Available for app stores (iOS/Android/Windows/Mac)

Try it out at: https://lingolinq-aac.fly.dev (demo instance)

---

## ✨ What Makes LingoLinq Different

### Cloud-Based Synchronization

Unlike most AAC apps that live on a single device, LingoLinq is **cloud-based** and syncs automatically across all your devices. This is critical because:

- **No Single Point of Failure** - A broken device or dead battery doesn't prevent communication
- **Always Available** - Log in on any device and keep going
- **Shared Vocabulary** - Your carefully-built communication system travels with you
- **Real-Time Updates** - Changes made on one device appear immediately on all others

### Supervisor Model

LingoLinq allows users to add **supervisors** - administrative users who can:
- Modify boards and vocabulary
- Track usage reports and communication patterns
- Coordinate therapy strategies
- Adjust settings and permissions

**Crucially**: Users maintain control over permissions. No more handing over your personal device to therapists or parents - supervisors work from their own devices while respecting user privacy.

### Open Board Format

Boards created in LingoLinq use the **Open Board Format (OBF)** standard (http://www.openboardformat.org), which means:
- Import/export boards across different AAC systems
- Preserve your work if you switch platforms
- Share vocabulary sets with the AAC community
- No vendor lock-in

---

## 🎯 Key Features

LingoLinq offers comprehensive AAC tools and team coordination features:

### Core AAC Functionality
- 🗣️ **Text-to-Speech** with multiple voices and languages
- 📱 **Communication Boards** with customizable layouts
- ⌨️ **Visual Keyboards** for typing-based communication
- 📴 **Offline Mode** - works without internet connection
- 🔄 **Cross-Device Sync** - changes sync automatically
- 🌍 **Multiple Languages** - full internationalization support

### Advanced Features
- 📊 **Usage Tracking & Analytics** - understand communication patterns
- 🎯 **Goal Setting & Tracking** - measure progress toward communication goals
- 📈 **Assessment Tools** - built-in profiling and evaluation
- 👁️ **Real-Time Following** - supervisors can see communication in real-time
- 🎭 **Remote Modeling** - demonstrate communication strategies remotely
- 📱 **Two-Way SMS** - send/receive text messages
- 📚 **Embedded Books & Videos** - rich media integration
- 🎨 **Word Inflections** - automatic grammar adjustments
- 💡 **Modeling Ideas** - AI-suggested communication strategies
- 🎓 **Continuing Education** - track training and certifications

### Team Coordination
- 👥 **Supervisor Management** - controlled access for therapists/parents
- 🏢 **Organization Tools** - manage multiple users and teams
- 🎓 **Classroom Targets** - track goals across student groups
- 📊 **Trend Reporting** - identify patterns and progress
- 🎨 **Organizational Branding** - customize for your organization

---

## ⚠️ Current Status & Deployment

### Production-Ready: Traditional Deployment ✅

**Status**: **WORKING** - Recommended for production use

The original Procfile-based deployment method is **proven and stable**. Successfully deployed and running in production.

**Works on**:
- Heroku (original platform)
- Railway (modern alternative)
- Render
- Any platform supporting Procfile-based deployment

**How to Deploy**: See [Production Deployment](#production-deployment) section below.

### Docker Deployment 🚧

**Local Development**: ✅ **WORKING**
**Production Deployment**: 🚧 **IN PROGRESS** (CSS errors, 500/503 status codes)

**Why Docker?**
LingoLinq uses legacy Ember 3.12, which requires Node 16-18. Docker isolates this from your host system's newer Node versions (20+), preventing version conflicts during development. This allows developers to run modern tooling on their host while maintaining compatibility with the legacy frontend framework.

**Current Docker Production Issues**:
- Asset pipeline skipping critical build steps compared to traditional deployment
- CSS compilation failures resulting in broken UI
- HTTP 500/503 errors on Render, Railway, and Fly.io
- Investigation ongoing - see [DEPLOYMENT_PLAYBOOK.md](.ai/docs/DEPLOYMENT_PLAYBOOK.md) for technical details

**For Production Deployment RIGHT NOW**: Use traditional Procfile-based deployment documented below. It works reliably.

**For Local Development**: Docker works great! Use `docker-compose up` as shown in Quick Start.

---

## 🚀 Quick Start

### Local Development with Docker (Recommended)

**Prerequisites**: Docker & Docker Compose installed

```bash
# Clone the repository
git clone https://github.com/swahlquist/LingoLinq-AAC.git
cd LingoLinq-AAC

# Start all services (PostgreSQL, Redis, Rails, Ember)
docker-compose up --build
```

After the build completes (first time takes ~5 minutes):
- **Application URL**: http://localhost:3000
- **Default Login**: `example` / `password` (after database seeding)

**Note**: Docker is excellent for local development but currently has production deployment issues. See [Current Status](#current-status--deployment) above.

**Troubleshooting Docker Locally**: If you encounter issues, use the [Traditional Development Setup](#traditional-development-setup) instead - it matches production exactly.

---

## 🛠️ Technology Stack

- **Backend**: Ruby 3.2.8 / Rails 6.1.7
- **Frontend**: Ember 3.12 (located in `app/frontend`)
- **Database**: PostgreSQL (required)
- **Cache & Jobs**: Redis + Resque (required)
- **Development**: Docker / Docker Compose
- **Deployment**: Procfile-based (Heroku, Railway, Render compatible)

### Architecture

LingoLinq uses an **API-driven architecture**:
- Rails backend serves a JSON API (undocumented but functional)
- Ember frontend consumes the API
- Mobile and desktop apps share the same API (maintained in separate repos)

This design ensures feature parity across web, mobile, and desktop platforms.

**Platform Support**:
- **Web**: Any modern browser
- **Mobile**: iOS, Android (via Cordova)
- **Desktop**: Windows, Mac, ChromeOS (via Electron)

**Note**: Platform-specific code uses the `capabilities` library to enable features only when available.

---

## 🏭 Production Deployment

### Traditional Deployment (RECOMMENDED - Proven Stable)

This Procfile-based method works on Heroku, Railway, Render, and similar platforms.

#### Prerequisites

- **Ruby 3.2.8**
- **PostgreSQL** (latest stable version)
- **Redis** (latest stable version)
- **Node.js 18.x**
- **ember-cli**: `npm install -g ember-cli`
- **Bundler**: `gem install bundler`

#### Setup Steps

**1. Backend Setup**

```bash
# Install Ruby dependencies
bundle install

# Configure environment variables
cp .env.example .env
# Edit .env and uncomment required variables:
# - REDIS_URL=redis://localhost:6379/
# - Configure DATABASE_URL or edit config/database.yml
```

**2. Database Setup**

```bash
# Create database
rails db:create

# Run migrations
rails db:migrate

# Seed initial data (creates example user: example/password)
rails db:seed  # Optional but recommended for testing
```

**3. Frontend Setup**

```bash
# Navigate to frontend directory
cd app/frontend

# Install Node dependencies
npm install

# Install Bower dependencies (legacy requirement)
bower install
# NOTE: If prompted about file replacements, answer 'n'
```

**4. Compile Assets for Production**

```bash
# Return to project root
cd ../..

# Run the deployment preparation script
bin/deploy_prep
```

This script:
1. Compiles the Ember frontend (`ember build --environment=production`)
2. Precompiles Rails assets (`rails assets:precompile`)
3. Ensures all assets are production-ready

**5. Start the Application**

```bash
# For production (single process)
rails server

# For development (multiple processes with background jobs)
gem install foreman
foreman start
# OR: heroku local
```

#### Procfile Processes

The `Procfile` defines these processes:
- `web`: Puma server (Rails application)
- `resque`: Background job processor (priority, default, slow queues)
- `resque_priority`: High-priority job processor
- `resque_slow`: Slow/whenever job processor
- `ember` (dev only): Auto-compiling frontend development server

**First-Time Startup**: The ember process takes ~1 minute for initial compilation. Wait for "Build successful" in the console before visiting http://localhost:3000.

---

### Platform-Specific Deployment

#### Heroku (Original Platform - Known to Work)

```bash
# Install Heroku CLI
# Visit: https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create application
heroku create lingolinq-aac

# Add PostgreSQL database
heroku addons:create heroku-postgresql:mini

# Add Redis (optional but recommended for background jobs)
heroku addons:create heroku-redis:mini

# Set environment variables
heroku config:set RAILS_ENV=production
heroku config:set SECRET_KEY_BASE=$(openssl rand -hex 64)
heroku config:set DISABLE_OBF_GEM=true

# Deploy application
git push heroku main

# Run database migrations
heroku run rails db:migrate

# Seed database (optional)
heroku run rails db:seed

# Open application
heroku open
```

#### Railway / Render / Other Platforms

The `Procfile` in this repository makes it compatible with any platform that supports Procfile-based deployments. Refer to your platform's documentation for:
- Creating a new project from GitHub
- Configuring environment variables
- Connecting PostgreSQL and Redis
- Deploying via git push

**Detailed platform-specific guides** available in [DEPLOYMENT_PLAYBOOK.md](.ai/docs/DEPLOYMENT_PLAYBOOK.md).

---

## 💻 Traditional Development Setup

**When to use this**:
- Docker is giving you issues locally
- You need production-parity environment
- You're debugging backend/frontend separately

This setup matches the production deployment exactly.

### Prerequisites

Same as [Production Deployment Prerequisites](#prerequisites)

### Setup

Follow the exact same steps as [Production Deployment Setup Steps](#setup-steps), but in step 5:

```bash
# Run with auto-reloading and all processes
foreman start
```

This starts all Procfile processes:
- `web`: Rails server on http://localhost:3000
- `resque`: Background job processing
- `ember`: Frontend auto-compiler (watches for file changes)

**Development Workflow**:
1. Make changes to frontend code in `app/frontend/`
2. Ember automatically recompiles (watch console for "Build successful")
3. Refresh browser to see changes
4. Backend changes reload automatically with Rails

**Wait Time**: First Ember compile takes ~1 minute. Subsequent rebuilds are much faster.

---

## 🔧 Additional Requirements

### Required for Full Functionality

These system dependencies are needed for specific features:

- **ImageMagick** (`convert`, `identify`, `montage`) - Image processing for boards and utterances
- **Ghostscript** (`gs`) - PDF generation for printing communication boards
- **Node.js** (already required) - Utterance generation and sharing

### Optional External Integrations

Configure via `.env` file (see `.env.example` for details):

#### AWS Services
- **SES** - Email delivery
- **SNS** - SMS messaging (supports two-way via callbacks)
- **S3** - File storage (images, videos, audio)
- **Elastic Transcoder** - Audio/video format conversion
  - Requires pipeline configuration
  - Configure callbacks for transcoding status (see `api/callbacks_controller.rb`)

#### Google APIs
- **Places API** - Location-based features
- **Translate API** - Multi-language support
- **Maps API** - Location visualization
- **Text-to-Speech API** - Voice synthesis

#### Other Services
- **WebSocket Server** (separate deployment) - Real-time following and remote modeling features
- **OpenSymbols.org Endpoint** - Image search functionality

**Note**: Not all features degrade gracefully without these integrations. For production deployments, review `.env.example` carefully.

#### PostgreSQL Configuration

If using Postgres.app on Mac:
- Open database config
- Increase `max_connections` to 999 (prevents connection pool issues)

---

## ⏰ Production Maintenance

### Scheduled Tasks

These rake tasks should run periodically in production. Use Heroku Scheduler, Railway Cron, Fly Machines, or standard cron:

```bash
# Daily tasks
rails check_for_expiring_subscriptions  # Check subscription renewals
rails transcode_errored_records         # Retry failed media transcoding
rails flush_users                       # Clean up inactive users
rails clean_old_deleted_boards          # Purge old deleted boards

# Hourly tasks
rails generate_log_summaries            # Aggregate communication logs
rails push_remote_logs                  # Sync logs to remote storage
rails check_for_log_mergers             # Merge related log sessions
rails advance_goals                     # Update goal progress tracking
```

**Heroku Scheduler Example**:
```bash
heroku addons:create scheduler:standard
heroku addons:open scheduler
# Add tasks via dashboard
```

---

## 📐 Development Guidelines

### Internationalization (i18n) - REQUIRED

**CRITICAL**: All user-facing text **MUST** use internationalization helpers.

#### In Templates (Ember/Handlebars)
```handlebars
{{t "This is the text" key="unique_key"}}
```

#### In Controllers/JavaScript
```javascript
i18n.t('unique_key', "This is the text")
```

#### String Quote Convention
**This convention is REQUIRED throughout the codebase:**
- **Double-quotes (`"`)**: User-facing strings
- **Single-quotes (`'`)**: All other strings (code, keys, non-user-facing)

This consistency is essential for:
- Translation file generators (`i18n_generator.rb`)
- Codebase searchability
- Automated string extraction

**Example**:
```javascript
// CORRECT
let userName = i18n.t('user_name', "User Name");

// WRONG
let userName = i18n.t("user_name", 'User Name');
```

#### Translation Management

See `i18n_generator.rb` for scripts to:
- Extract translatable strings
- Generate translation files
- Process locale updates

### Translations & Word Data

The admin organization has a **"Word Data Import"** tool for managing multi-locale data. This powers:
- Automatic button colorization by parts of speech
- Word inflections (e.g., "eat" → "eating", "eaten")
- Contractions
- Auto-inflection preferences (e.g., "I want" + "eat" → "to eat")

**Import Files**:
- `rules.json` - Grammar rules for inflections
- `words.json` - Word definitions and metadata

**Templates available at**: https://tools.openaac.org/inflections/inflections.html

### Feature Flags

New features **should** be added behind Feature Flags (`lib/feature_flags.rb`), especially if they:
- Affect user interactions
- Change the UI (even icon or color changes)
- Introduce new workflows

**Why?** AAC users can find unexpected changes disruptive. Feature Flags allow:
- Gradual rollout strategies
- Change management planning
- Beta testing by organizations
- Opt-in for power users

**Usage**: See existing flags in `lib/feature_flags.rb` for examples.

### Platform-Specific Code

LingoLinq runs on web, mobile (iOS/Android), and desktop (Windows/Mac/ChromeOS). Platform-specific code should:

1. **Use the `capabilities` library** for platform checks
2. **Extract platform-specific code** from core logic
3. **Encapsulate properly** when platform features are required

**Example**:
```javascript
if (capabilities.mobile) {
  // Mobile-specific behavior
}
```

**Mobile & Desktop Apps**: Maintained in separate repositories but share the same API. All features should be API-driven to maintain parity.

---

## 🔍 Troubleshooting

### Common Issues

#### "500 or 503 Errors During Deployment"

**Cause**: This is the known Docker deployment issue.

**Solution**: Use [traditional Procfile-based deployment](#production-deployment) instead. It works reliably.

#### "CSS Not Loading / Styling Broken"

**Cause**: Assets not precompiled before deployment.

**Solution**:
```bash
# Run deployment preparation
bin/deploy_prep

# Verify assets exist
ls public/assets/
```

#### "Ember Not Compiling"

**Symptoms**:
- Page stuck on loading screen
- No JavaScript errors in console
- Blank white page

**Solution**:
1. Wait ~1 minute for initial Ember build
2. Check console logs for "Build successful" message
3. If using foreman/heroku local, ensure ember process is running
4. Check `app/frontend/` for build errors

**Rebuild manually**:
```bash
cd app/frontend
ember build --environment=production
```

### Production Console Access

Production console requires **audit logging** for user data protection:

```bash
# DO NOT use standard rails console in production
# Use the audited console script:
bin/heroku_console

# Or equivalent for your platform (Railway, Fly.io, etc.)
```

### Common Console Commands

```ruby
# Find boards
b = Board.find_by_path('example/keyboard')
downs = Board.find_all_by_global_id(b.downstream_board_ids)

# Find users
u = User.find_by_path('username')
u.global_id
u.settings['preferences']['home_board']

# Check user sessions
s = u.log_sessions.last
s.data['events']

# Check images
bi = ButtonImage.last
bi.url
```

### Background Job Debugging

```ruby
# Check job queue stats
Worker.method_stats('queue_name')

# Remove all instances of a method from queue
Worker.prune_jobs('queue_name', 'method_name')
```

### Redis Management

```ruby
# Check Redis memory usage
RedisInit.size_check

# Clear report tallies if Redis is full
rake extras:clear_report_tallies
```

### Additional Documentation

- **CODE_INVESTIGATION.md** - Detailed code exploration guide (if exists)
- **[DEPLOYMENT_PLAYBOOK.md](.ai/docs/DEPLOYMENT_PLAYBOOK.md)** - Comprehensive deployment troubleshooting
- **[.ai/docs/](.ai/docs/)** - AI development guides and historical context

---

## 💡 Contribution Ideas

LingoLinq has an API-driven architecture that makes it relatively easy to extend. Here are some modular components we'd love help with:

### Feature Development

#### Dynamic Scene Displays
Build photo-based interfaces for activating objects on a scene. Consider using [aac_shim](https://github.com/CoughDrop/aac_shim) for integration.

#### External API Integrations
Add connections to external services:
- Recent news
- Weather
- Movie tickets
- Calendar/scheduling
- Smart home controls

Consider using [aac_shim](https://github.com/CoughDrop/aac_shim) for standardized integration patterns.

#### Core Word Service
Create a service to return word information:
- Most common part of speech
- Common variations and tenses
- Usage frequency
- Related words

#### Dynamic JavaScript Updates
Allow mobile/desktop apps to download the latest JavaScript code dynamically, enabling app updates without app store approval.

#### iOS Personalized Voices
Add support for iOS Personalized Voices feature (should be straightforward with iOS 17+).

### Maintenance & Modernization

#### ⏫ Upgrade Ember Framework
**Priority: HIGH** - Currently on Ember 3.12 (very outdated)

- Target: Ember 4.x or 5.x
- See [EMBER_UPGRADE_RESEARCH.md](.ai/docs/EMBER_UPGRADE_RESEARCH.md) for research and planning
- Tracked in GitHub Issue #5
- This is a multi-step, 3-4 month project
- Community help very welcome!

#### ⏫ Upgrade Rails & Ruby
- Update Rails 6.1 → 7.x
- Update Ruby 3.2 → 3.3
- Ensure all tests still pass
- Update Heroku stack (or equivalent)

#### ⏫ Upgrade Cordova
- Update mobile app dependencies
- Test on latest iOS and Android
- Ensure backward compatibility

#### ⏫ Upgrade Electron
- Update desktop app dependencies
- Rebuild native modules for new Electron version
- Test on Windows, Mac

#### 🐳 Fix Docker Production Deployment
**Priority: HIGH** - Docker works locally but not in production

- Asset pipeline missing steps
- CSS compilation failures
- See [DEPLOYMENT_PLAYBOOK.md](.ai/docs/DEPLOYMENT_PLAYBOOK.md)

#### 📱 Remove Cache Manifests
- Update offline support for mobile apps
- Use modern service workers
- Remove deprecated AppCache

### Documentation

- ✅ **API Documentation** - **COMPLETED!** See [API.md](./API.md)

### Getting Started with Contributions

**Want guidance on any of these?** We're happy to help!

1. Join the [OpenAAC Slack Channel](https://www.openaac.org)
2. Ask for pointers or ideas
3. Review the codebase and ask questions
4. We can provide architectural guidance and code reviews

---

## 🤝 Contributing

We welcome contributions from developers of all skill levels!

### Quick Links

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for comprehensive instructions on:
- 🖥️ **Local development setup** (Docker and traditional)
- 🌿 **Branching strategy** (feature branches from `main`)
- ✅ **Testing requirements** (RSpec for backend, Ember tests for frontend)
- 📝 **Code conventions** (RuboCop, ESLint)
- 🔄 **Pull request process** (reviews, automated checks)

### Contributor Agreement

**Required**: We require a Contributor Agreement before accepting changes into our repository. This protects both contributors and users.

### Code Style

- **Ruby/Rails**: Follow [RuboCop style guide](https://rubystyle.guide/) (enforced by `.rubocop.yml`)
- **JavaScript/Ember**: Follow Ember.js conventions (enforced by `.eslintrc.js`)
- **User-Facing Strings**: MUST use i18n helpers
  - Double-quotes for user-facing text
  - Single-quotes for everything else

---

## 🤖 AI-Assisted Development

This repository includes AI agents with deep project context to help with development and debugging.

### Available Resources

- **[AI Development Guide](.ai/docs/)** - Complete AI integration documentation
- **[CLAUDE.md](CLAUDE.md)** - Claude Code context and instructions
- **[GEMINI.md](GEMINI.md)** - Gemini CLI usage and guidelines
- **[AI Token Monitoring](bin/token-status)** - Track AI usage and quotas

### AI Tools Setup

- **Claude Code**: IDE-integrated development assistance
- **Gemini CLI**: Command-line AI for deployment and analysis
- **DeepWiki**: Automatically updated project documentation

See `.ai/docs/AI_TOOLS_SETUP.md` for setup instructions.

---

## 🌟 Community & Support

### Get Involved

- **OpenAAC Slack**: https://www.openaac.org - Active community of AAC developers and users
- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions, share ideas, get help

### Need Help?

- Check the [Troubleshooting](#troubleshooting) section
- Search existing GitHub issues
- Ask in OpenAAC Slack #lingolinq channel
- Open a GitHub Discussion for questions
- Open a GitHub Issue for bugs/features

---

## 🔐 Security

To report security vulnerabilities privately, please email: [SECURITY_CONTACT_NEEDED]

**Do NOT** open public issues for security vulnerabilities.

---

## 📄 License

Copyright (C) 2014-2025 LingoLinq AAC & OpenAAC, Inc.

Released under the **AGPLv3** license or later. See [LICENSE](LICENSE) file for details.

**Contributor Agreement Required**: We require a code contributor agreement before accepting changes into our repository. This ensures legal clarity for all contributors and users.

---

## 🙏 Acknowledgments

LingoLinq AAC is a fork of **SweetSuite / CoughDrop**, originally developed by the AAC community. We're grateful for the foundation built by the original contributors and continue their mission to make communication accessible to all.

Special thanks to:
- The OpenAAC community
- All contributors past and present
- AAC users and families who guide development
- Therapists and educators who provide feedback

---

**LingoLinq AAC: Because every voice deserves to be heard.** 🗣️

*Making communication accessible, one board at a time.*
