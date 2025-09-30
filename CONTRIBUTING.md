# Contributing to LingoLinq-AAC

Thank you for your interest in contributing! This guide provides everything you need to get started with development, from setting up your local environment to submitting your first pull request.

## 🚀 Getting Started: Local Development Setup

While the quickest way to run the app is `docker-compose up`, you may need to interact with the database or run commands directly. Follow these steps for a full local setup.

### 1. Prerequisites

*   [Git](https://git-scm.com/)
*   [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/)
*   A text editor or IDE (like VS Code with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers))

### 2. Clone the Repository

```bash
git clone https://github.com/your-username/LingoLinq-AAC.git
cd LingoLinq-AAC
```

### 3. Configure Environment Variables

The application uses a `.env` file for managing environment variables.

```bash
# Copy the example file
cp .env.example .env
```

Open the `.env` file and uncomment the required variables. For local Docker development, the default database and Redis URLs should work correctly.

### 4. Build and Run the Docker Containers

The `docker-compose.yml` file is configured to build the application, start the Rails server, and run the database and Redis services.

```bash
docker-compose up --build
```

The first build will take several minutes. Subsequent builds will be much faster due to Docker's layer caching.

### 5. Set Up the Database

Once the containers are running, open a new terminal and run the database setup commands inside the running `app` container.

```bash
# Create and migrate the database
docker-compose exec app bundle exec rails db:create db:migrate

# Seed the database with initial data (includes a test user)
docker-compose exec app bundle exec rails db:seed
```

Your local development environment is now ready!

## 🛠️ Development Workflow

*   **Application URL:** [http://localhost:3000](http://localhost:3000)
*   **Default Login:** `example` / `password`
*   **Live Reloading:** The Ember frontend is configured to auto-rebuild when you make changes inside `app/frontend`. Simply save your file and refresh your browser.

### Running Commands

To run any command (like `rails console` or `rspec`) inside the application container:

```bash
docker-compose exec app <your_command_here>

# Example: Open a Rails console
docker-compose exec app bundle exec rails console
```

## 🌿 Branching Strategy

We use a feature-based branching workflow. All new work should be done on a branch created from `main`.

1.  **Create a new branch:**
    *   Branch names should be descriptive and prefixed (e.g., `feature/`, `fix/`, `docs/`).
    *   Example: `git checkout -b feature/new-aac-board-editor`

2.  **Commit your changes:**
    *   Write clear and concise commit messages.

3.  **Push your branch:**
    *   `git push origin feature/new-aac-board-editor`

## ✅ Submitting Pull Requests

When your feature is complete, open a Pull Request (PR) to merge your branch into `main`.

*   Provide a clear description of the changes in your PR.
*   Link to any relevant issues.
*   Ensure all automated checks and tests are passing.
*   A team member will review your PR, provide feedback, and merge it when it's ready.

## 🎨 Coding Conventions

Please adhere to the existing code style to maintain consistency.

*   **Ruby/Rails:** We follow the [RuboCop style guide](https://rubystyle.guide/), enforced by the `.rubocop.yml` configuration in the repository.
*   **JavaScript/Ember:** We follow the standard Ember.js conventions and the `.eslintrc.js` configuration.
*   **User-Facing Strings:** All user-facing text **must** use the internationalization (i18n) helpers. Use double-quotes for these strings. For all other non-user-facing strings, use single-quotes.

## 🧪 Running Tests

The test suite is run inside the Docker container to ensure a consistent testing environment.

```bash
# Run the full RSpec test suite
docker-compose exec app bundle exec rspec
```
