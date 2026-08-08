# LingoLinq-AAC

LingoLinq-AAC is an open-source, web-based AAC (Augmentative and Alternative Communication) application. It helps communicators build symbol-based boards and keyboards, speak through their device, and work with supervisors and support teams.

Try the hosted application at <https://www.lingolinq-aac.com>.

## Repository layout

- Rails backend: repository root
- Ember frontend: [app/frontend](app/frontend)
- Backend tests: [spec](spec)
- Shared scripts and libraries: [lib](lib)
- Operational and contributor documentation: [docs](docs)

The application supports offline use, multi-device synchronization, multiple locales, and Open Board Format (OBF) import/export.

## Local development

### Prerequisites

- Ruby 3.4.3
- Node.js 22 (see [.nvmrc](.nvmrc))
- PostgreSQL
- Redis
- ImageMagick and Ghostscript for media/PDF features

Copy the environment template and install dependencies:

```bash
cp .env.example .env
bundle install
cd app/frontend
npm install
```

Configure PostgreSQL and Redis in your private environment. Never commit `.env` or credentials.

Create and migrate the development database from the repository root:

```bash
bundle exec rails extras:assert_js
bundle exec rails db:create
bundle exec rails db:migrate
```

Seed data is optional:

```bash
bundle exec rails db:seed
```

Start the backend and frontend in separate shells:

```bash
# Shell 1, repository root
bundle exec rails server

# Shell 2
cd app/frontend
npx ember serve
```

For the full local process set, see [Procfile](Procfile) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing and linting

Backend:

```bash
bundle exec rspec
```

Frontend:

```bash
cd app/frontend
npx ember test
npm run lint:js
npm run lint:hbs
```

Run the smallest relevant test suite for every change. Backend changes require RSpec coverage; frontend changes require QUnit coverage.

## Development conventions

- Use feature flags for user-facing changes; AAC users may be affected by unexpected interface changes.
- Use the existing internationalization helpers for user-facing strings.
- Use double quotes for user-facing strings and single quotes for internal strings.
- Keep platform-specific behavior behind the capabilities layer.
- Validate inputs and keep secrets in environment variables.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch and pull-request workflow. See [CLAUDE.md](CLAUDE.md) and [GEMINI.md](GEMINI.md) for agent-specific guidance.

## Deployment and operations

The application is deployed through Render. Environment-specific deployment details, scheduled jobs, infrastructure, and incident guidance live in [docs](docs) and [INFRASTRUCTURE.md](INFRASTRUCTURE.md) when present on the target branch.

## License

LingoLinq-AAC is released under the GNU Affero General Public License v3 or later. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
