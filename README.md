## LingoLinq-AAC - Every Voice Should Be Heard

[![OpenAAC](https://www.openaac.org/images//OpenAAC-advocate-blue.svg)](https://www.openaac.org/advocates.html)
[![DeepWiki](https://deepwiki.com/badge/lingolinq/LingoLinq-AAC)](https://deepwiki.com/lingolinq/LingoLinq-AAC)

LingoLinq-AAC is an open, web-based AAC (Augmentative and Alternative Communication) app. This project aims to modernize the existing tech stack and user interface, as well as integrate advanced AI features and tools to significantly enhance the AAC experience. If people struggle getting their words out for whatever reason, they can use the speech synthesis engine on a computing device to "speak" for them. Sometimes they'll just type on a keyboard (think Stephen Hawking), but sometimes typing is too slow or not a reasonable expectation, so communication "boards", which are just grids of labeled pictures, can also be used. LingoLinq supports building these grids and keyboards, optionally tracks their usage, and also offers tools for the team supporting the communicator.

Try it out for free at <https://www.lingolinq-aac.com>. It leverages modern web standards like the Web Speech API, IndexedDB and HTML5 to work both online and offline. It should run on Windows, Mac, ChromeOS, iOS and Android, and can be packaged up for app stores as well.

Unlike most other AAC apps, which are installed and live on a single device, LingoLinq is cloud-based, and syncs edits across multiple devices automatically. This may seem unimportant, but when you spend a lot of time building a very personalized vocabulary, you don't want a broken device or a dead battery to prevent you from communicating. With LingoLinq-AAC you can just log into a different device and keep going.

Additionally, LingoLinq-AAC allows users to add "supervisors", which are administrative users that can help modify boards, track usage reports, and coordinate strategy. In the past users would have to hand over their device so therapists or parents could make changes or review usage logs, but with LingoLinq-AAC supervisors can do their thing on their own devices. And permission controls always stay in the hands of the user.

LingoLinq-AAC includes built-in assessment and profiling tools, real-time following and remote modeling, embedded books and videos, two way SMS messaging, modeling ideas and trend reporting, focus words mode, goal setting and automated tracking, team coordination, organizational branding and management tools, classroom-level targets and goal tracking, continuing education linking and tracking, and more.

The code is open source so you're free to run it yourself. We require a code contributor agreement before accepting changes into our repo. Boards created in LingoLinq-AAC use the Open Board Format (<http://www.openboardformat.org>) so they should export/import across instances of LingoLinq-AAC and a few other systems without having to dig around in the database.

### Contributing

We welcome contributions! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening a pull request. Key points:

- All PRs should target the `develop` branch (not `main`)
- Every PR receives an automated AI code review from Gemini Code Assist
- See CONTRIBUTING.md for branch naming conventions, the review process, and deployment workflow

### Technical Notes

LingoLinq-AAC has a Rails backend (`/`) and an Ember frontend (`/app/frontend`), both contained in this repository. If you're familiar with those frameworks you should be able to pick up the basic makeup of the app quickly. These notes are not comprehensive -- feel free to help flesh them out.

The frontend and backend communicate via the API. By only using the API, the mobile apps can easily maintain feature parity (and shared codebase) with the web version.

#### Development Considerations

LingoLinq-AAC supports multiple locales, so when developing anything on the frontend, whether in templates or modals and alerts, you will need to use the internationalization libraries in order to support locales. Do not ever add raw text strings to any user-facing resources, always use the i18n helpers. You can find examples of the helpers throughout the code, using commands such as `i18n.t('key', "string")` or `{{t "this is some test" key='key'}}`. Instructions for generating and processing string files is located in `/i18n_generator.rb`.

NOTE: as a standardized convention for the codebase, all user-facing strings should use double-quotes and all other strings should use single quotes.

#### Backend Setup

Dev dependencies: Ruby, Postgres, Redis, Node 20, ember-cli, AWS, Google API

The backend relies on Redis and Postgres both being installed. Both are required in development and production. If you have ruby installed in your environment, you'll need the bundler gem:

```
gem install bundler
```

After that you can install ruby dependencies with:

```
bundle install
```

Next, you'll need to set some environment variables. The easiest way to do this is with a `.env` file:

```
cp .env.example .env
```

You'll need to uncomment (remove the "# " at the beginning of) the first group of variables since they're required. For the `REDIS_URL` line, enter a valid redis url (default would be `REDIS_URL=redis://localhost:6379/`). Then update `config/database.yml` to match your settings (the defaults may work fine) if you setup a vanilla postgres instance.

<i>Redis quickstart: https://redis.io/topics/quickstart</i>

Next you'll want to setup your database. Before you can do that, you'll need to address a couple of dangling symbolic links, but we have a command to help with that. Here's the sequence that should work:

```
rails extras:assert_js
rails db:create
rails db:migrate
rails db:seed
```

You can skip the last command if you want, it'll populate with some bootstrap data including a login, `example` and `password` to get you started.

You can use the rake task with environment variables to customize:

#### Basic usage (default: "Sample Organization")

`bundle exec rake db:seed_organization`

#### Custom organization name

`ORG_NAME="My Company" bundle exec rake db:seed_organization`

#### Custom organization name and user counts

`ORG_NAME="Test Org" MANAGER_COUNT=3 USER_COUNT=20 SUPERVISOR_COUNT=5 EVAL_COUNT=2 bundle exec rake db:seed_organization`

Once the database is created, you can start the server. If you run `rails server` you can start a single server process and hit it up in your browser at the default address (`http://localhost:3000` or whatever you changed it to). You'll be stuck on the loading page because the frontend hasn't compiled the frontend javascript yet.

#### Frontend Setup

The frontend is an Ember app. Install ember-cli (<https://ember-cli.com/user-guide/>) and make sure you are running **Node 20** (`nvm use 20`). Then run:

```
cd app/frontend
npm install
ember serve
```

To download all the app dependencies. Once you have the dependencies downloaded, any code changes within `frontend` should automatically regenerate `frontend.js` which is what the Rails app makes sure to deliver to the browser.

#### Running the Full System

LingoLinq-AAC has more than one process needed for things to run correctly. You can look in `Procfile` for the commands we use to run a web server or a resque (background job) server. The ember process is for development. It auto-compiles code as it's written, and shouldn't be run in production. The easiest way to get things up and running is with the foreman gem:

```
gem install foreman
foreman start
```

That'll run one instance of each process in the Procfile, which is more than you need but it'll work. After you start the ember process, it'll probably take around a minute or so for it to compile the javascript for the first time. You should see some notes on the console about a successful build, then you can reload your browser and see the welcome page. You should be able to log in and go to town.

To deploy the app, you'll want to precompile all assets. The easiest way to do this is to run `bin/deploy_prep`. To prep mobile and desktop app releases you can run `rake extras:mobile` and `rake extras:desktop` to push the latest code to those directories, assuming they are available on your dev system.

##### Additional Dependencies

In order to support generating utterances for sharing, downloading pdfs, and uploading images, you'll need to have ImageMagick (`convert`, `identify`, `montage`), ghostscript (`gs`), and Node (`node`) installed in the execution path. There are also a number of server-side integrations you can install that require secure keys, they are listed in `.env.example` with explanations of where they are required. Note that if you're trying to run a production environment, not all functionality will degrade gracefully without these environment variables.

If using Postgres.app on a Mac, you'll want to open the config for the db and increase max_connections to, say, 999.

There are also some rake tasks you'll want to schedule to run periodically. On Render, these are configured as cron jobs:

```
rake check_for_expiring_subscriptions (run daily)
rake generate_log_summaries (run hourly)
rake push_remote_logs (run hourly)
rake check_for_log_mergers (run hourly)
rake advance_goals (run hourly)
rake transcode_errored_records (run daily)
rake flush_users (run daily)
rake clean_old_deleted_boards (run daily)
```

LingoLinq also utilizes a separate site that it uses for web sockets to track online status and support real-time interactions. Additionally, LingoLinq relies on access to an opensymbols.org-type endpoint for image search. Also there are multiple AWS and Google API endpoints that can and probably should be enabled. Google API is straightforward, just needs an access token for Places, Translate, Maps, & TTS. AWS is a little more complicated, you can implement access keys for SES (emails), SNS (notifications, potentially two-way so see api/callbacks_controller), S3 storage (probably required at this point), Elastic Transcoder (need pipelines for converting audio & video to standardized formats, also need to configure pipeline callbacks -- see api/callbacks_controller). Additional less-vital integrations are listed in .env.example

When developing code for LingoLinq-AAC, make sure to take into consideration that the codebase is deployed both as a web app, and as a packaged app on mobile and desktop apps. All platform-specific code should be extracted from the codebase or encapsulated within the `capabilities` library when necessary. Capabilities checks may be used to enable features only when their associated capabilities are available.

On a related front, new features should be added first behind a Feature Flag (`lib/feature_flags.rb`), especially if it will affect any interactions for the end-user. Some AAC users can find it difficult when things change unexpectedly (even something as innocuous as an icon or color change can be disruptive), so new features and interfaces should be held behind a Feature Flag, and released once a change management strategy is sufficiently implemented. We also use Feature Flags to hold back beta features and interfaces until they have had time to be fully tested. Keep in mind that some users are opted in to access to all beta features, to allow organizations proper time to test on their own as well.

##### Translations

See `i18n_generator.rb` for scripts to manage translation files. In controller code, use the `i18n` library for any user-facing strings, and in templates use the `{{t }}` template helper for translations. The convention throughout the codebase should ALWAYS remain double-quotes for user-facing strings, single-quotes for everything else. The generator libraries depend on this consistency, and it helps significantly when searching the codebase.

Additionally, the admin organization has a special importing tool, "Word Data Import" that can be used to import data from multiple locales. This data is used when buttons are created or modified, to automatically colorize by parts of speech, and to generate inflections for buttons, contractions, and for auto-inflection preferences (i.e. when a user hits "I want" and then "eat" automatically changes to "to eat"). There are two separate file types, rules.json and words.json, which both have templates available at [OpenAAC](https://tools.openaac.org/inflections/inflections.html).

##### Troubleshooting

Need console access? On Render, use the Shell tab in your service dashboard, or run `bundle exec rails console` locally. Since LingoLinq needs to ensure user data remains protected, all production requests need to be audited (see the model `AuditEvent`), so there are some safeguards to prevent unaudited console access.

```
b = Board.find_by_path('example/keyboard')
downs = Board.find_all_by_global_id(b.downstream_board_ids)
u = User.find_by_path('username')
u.global_id
u.settings['preferences']['home_board']
s = u.log_sessions.last
s.data['events']
bi = ButtonImage.last
bi.url
```

Redis memory too full? `RedisInit.size_check` also `rake extras:clear_report_tallies`

Job queues backed up? `Worker.method_stats(queue_name)`

Want to remove all instances of a method from the background? `Worker.prune_jobs(queue_name, method_name)`

See also docs/CODE_INVESTIGATION.md

### Contribution Ideas

LingoLinq-AAC is undergoing a significant transformation to modernize its tech stack, enhance the UI, and integrate advanced AI features. This is an exciting time to contribute! If you would like to contribute, you can join the [OpenAAC community](https://www.openaac.org) and ask for ideas or pointers.

We are actively seeking contributions in the following areas:

- **Tech Stack Modernization:**
  - Upgrading Rails & Ruby to the latest stable versions.
  - Upgrading the Ember frontend to the latest stable version.
  - Migrating from Cordova to Capacitor for mobile app releases.
  - Refactoring existing code to improve maintainability, performance, and adherence to modern best practices.

- **UI/UX Enhancements:**
  - Redesigning the user interface for a more modern, intuitive, and accessible experience.
  - Improving responsiveness and cross-device compatibility.
  - Implementing new visual components and interactions.

- **AI Feature Integration:**
  - Exploring and implementing AI models for improved speech synthesis, natural language understanding, and predictive text.
  - Developing AI-powered tools for personalized vocabulary suggestions and communication assistance.
  - Integrating multimodal AI capabilities for image and context analysis.

- **General Improvements:**
  - Dynamic Scene Displays framework to build photo-based interfaces for activating objects on a scene.
  - External API Integrations (recent news, movie tickets, etc.).
  - Core word service to return information on a word including most common part of speech, common variations/tenses, etc.
  - Add support for iOS Personalized Voices.

We're happy to provide guidance for any of these projects to help get them underway.

### License

LingoLinq-AAC is a fork of Sweet-suite, which was originally forked from CoughDrop AAC. We are grateful to the original developers for creating a strong open-source foundation for AAC.

Copyright (C) 2014-2023 CoughDrop, Inc.
Copyright (C) 2023-2024 Sweet-suite Contributors
Copyright (C) 2024-2026 LingoLinq-AAC & OpenAAC, Inc.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

Released under the AGPLv3 license or later. See the [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) files for more details.
