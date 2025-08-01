# GEMINI.md

This file provides guidance to Gemini CLI when working with code in this repository.

## Project Overview

LingoLinq AAC is a complex Rails + Ember.js application designed as a cloud-based AAC (Augmentative and Alternative Communication) system for people with complex communication needs.

## Common Development Commands

### Setup and Development
- `bundle install` - Install Ruby dependencies (Ruby 3.2.8 REQUIRED)
- `rails extras:assert_js` - Setup symbolic links for JavaScript files (run before database setup)
- `rails db:create && rails db:migrate && rails db:seed` - Setup database (seed creates example/password login)
- `foreman start` or `heroku local` - Start all processes (web, resque workers, ember)
- `rails server` - Start Rails server only (port 3000)
- `cd app/frontend && ember serve` - Start Ember development server (port 8181)

### Frontend Development (Ember.js)
- `cd app/frontend && npm install && bower install` - Install frontend dependencies
- `cd app/frontend && ember build` - Build frontend assets
- `cd app/frontend && ember test` - Run frontend tests
- `cd app/frontend && ember serve --port 8181` - Development server with auto-reload

### Testing
- `rspec` - Run Ruby/Rails tests
- `cd app/frontend && ember test` - Run Ember tests
- Tests are located in `spec/` for Ruby and `app/frontend/tests/` for Ember

### Background Jobs
- `env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work` - Run background workers
- `rake extras:jobs_list` - View scheduled background jobs
- Jobs are processed using Resque with Redis

### Deployment and Assets
- `bin/deploy_prep` - Precompile assets for deployment
- `rake extras:mobile` - Prepare mobile app releases
- `rake extras:desktop` - Prepare desktop app releases
- `rake extras:version` - Update application version

## Architecture Overview

### Multi-Framework Structure
LingoLinq AAC is a complex application with a **Rails backend** (`/`) and **Ember.js frontend** (`/app/frontend`), designed as a cloud-based AAC (Augmentative and Alternative Communication) system.

### Backend (Rails)
- **Models**: Located in `app/models/`, with key models being `User`, `Board`, `Organization`, `LogSession`  
- **Controllers**: Split between web controllers (`app/controllers/`) and API controllers (`app/controllers/api/`)
- **API**: RESTful API at `/api/v1/` that serves both web frontend and mobile apps
- **Background Jobs**: Uses Resque with Redis for async processing (log analysis, file processing, notifications)
- **Database**: PostgreSQL with migrations in `db/migrate/`

### Frontend (Ember.js)
- **Location**: `app/frontend/` directory contains complete Ember app
- **Components**: Modular UI components in `app/frontend/app/components/`
- **Routes**: Ember routes handle client-side navigation
- **Build**: Ember CLI builds assets to `app/frontend/dist/assets/` which are symlinked to Rails assets

### Key Architectural Patterns
- **API-First**: All frontend-backend communication goes through documented JSON API
- **Offline Support**: Extensive caching and offline capabilities using IndexedDB and Application Cache
- **Multi-Platform**: Same codebase serves web, mobile (Cordova), and desktop (Electron) apps
- **Real-time**: WebSocket integration for live collaboration and status updates
- **Internationalization**: Full i18n support with translations in `public/locales/`

### Data Flow
1. Ember frontend makes API calls to Rails backend
2. Rails processes requests, often queuing background jobs
3. Background workers (Resque) handle heavy processing
4. Real-time updates pushed via WebSockets
5. Offline changes sync when connectivity restored

### External Integrations
- **AWS Services**: S3 (file storage), SES (email), SNS (notifications), Elastic Transcoder (media)
- **Third-party APIs**: Google (Places, Translate, Maps), Stripe (payments), various symbol libraries
- **Symbol Sources**: OpenSymbols.org, LessonPix, PCS symbols for AAC boards

## Development Guidelines

### Code Conventions
- **String Quotes**: Double quotes for user-facing strings, single quotes for everything else
- **Internationalization**: Always use `i18n.t('key', "string")` in controllers and `{{t "string" key='key'}}` in templates
- **Feature Flags**: New features must be behind feature flags in `lib/feature_flags.rb`
- **API Responses**: Use JSON API serializers in `lib/json_api/`

### File Organization
- **Rails**: Follow standard Rails conventions
- **Ember**: Components in `app/frontend/app/components/`, routes in `app/frontend/app/routes/`
- **Specs**: Ruby tests in `spec/`, Ember tests in `app/frontend/tests/`
- **Lib**: Shared utilities and converters in `lib/`

### Environment Setup

## Ruby Version Requirement
- **Ruby 3.2.8 Required**: This application requires Ruby 3.2.8 for Rails 6.1 compatibility
- **Version Check**: Use `ruby -v` to verify your version  
- **Version Management**: Use rbenv/rvm if you need to switch versions

- **Required**: Ruby 3.2.8, Node.js, PostgreSQL, Redis, Ember CLI
- **Optional**: ImageMagick, Ghostscript for file processing
- **Environment**: Copy `.env.example` to `.env` and configure required variables
- **Dependencies**: AWS credentials needed for file uploads, various API keys for full functionality

### Testing Strategy
- **Backend**: RSpec tests cover models, controllers, and lib files
- **Frontend**: Ember QUnit tests for components and routes
- **Integration**: API tests ensure frontend-backend compatibility
- **Performance**: Background job processing and caching are critical

### Background Processing
Key recurring tasks that run via Heroku Scheduler:
- `rake check_for_expiring_subscriptions` (daily)
- `rake generate_log_summaries` (hourly)  
- `rake push_remote_logs` (hourly)
- `rake advance_goals` (hourly)
- `rake flush_users` (daily)

### Multi-Platform Considerations
- **Capabilities**: Use `capabilities` library to detect platform features
- **Mobile**: Cordova apps in separate repos, assets copied via rake tasks
- **Desktop**: Electron apps with auto-update capabilities
- **Web**: Progressive Web App features for offline use

## Additional Key Information

### Linting and Code Quality
- Frontend uses ESLint and Ember Template Lint (configured in `app/frontend/`)
- Run `cd app/frontend && npm run lint:js` for JavaScript linting
- Run `cd app/frontend && npm run lint:hbs` for template linting

### Rails Application Name
- The Rails application is named `Coughdrop` (see `config/application.rb`)
- Module references use `Coughdrop::Application`
- **Note**: User-facing branding is "LingoLinq AAC" but internal Rails app name remains "Coughdrop"

### API Headers (Post-Cleanup)
- **Version Header**: Use `X-LingoLinq-Version` (consistent across frontend/backend)
- **App Installation**: Use `X-INSTALLED-LINGOLINQ` (not `X-INSTALLED-COUGHDROP`)
- **Critical**: Ensure header consistency between Ember frontend and Rails backend

### Process Management
- Uses Procfile for process definitions (web, resque workers, ember development)
- Background job queues: `priority`, `default`, `slow`, `whenever`
- Resque workers handle async processing with different queue priorities

### Security and Permissions
- Implements comprehensive permission system via concerns in `app/models/concerns/`
- Uses secure serialization and encryption for sensitive data
- Console access requires auditing (use `bin/heroku_console` for production)

### Development Workflow
- Feature flags in `lib/feature_flags.rb` control new feature rollout
- All user-facing strings must use i18n for internationalization
- Double quotes for user-facing strings, single quotes for everything else
- JSON API serializers handle all API responses consistently

## Recent Changes (Post-Cleanup by Senior Dev)

### Branding Consistency Fixed
- All API headers now use consistent LingoLinq branding
- Fixed mixed header references that could cause authentication issues
- Updated user-facing strings while preserving technical class names

### Environment Notes
- **Ruby Version**: System requires Ruby 3.2.8 for Rails 6.1 compatibility
- **Local Environment**: Use version managers (rbenv/rvm) to maintain correct Ruby version

### Code Quality Standards
- Follow existing patterns for new code
- Use feature flags for new functionality
- Maintain API compatibility
- Always test both frontend and backend when making changes
- Ensure i18n for all user-facing strings

## Troubleshooting Common Issues

### Bundle Install Fails
- Check Ruby version: `ruby -v` (should be 3.2.8)
- Ensure PostgreSQL and Redis are running
- Check `.env` file exists and is configured

### Frontend Build Issues
- Run `cd app/frontend && npm install && bower install`
- Check Node.js version compatibility
- Clear `app/frontend/tmp` directory if needed

### API Authentication Issues
- Verify headers are using correct LingoLinq format
- Check frontend/backend header consistency
- Review recent API changes in CLEANUP.md

### Background Jobs Not Processing
- Ensure Redis is running
- Check Resque workers are started
- Review queue configurations in Procfile