# LingoLinq-AAC: Every Voice Should Be Heard

LingoLinq-AAC is a cloud-based, open-source Augmentative and Alternative Communication (AAC) application. It empowers individuals who have difficulty speaking to communicate using customizable boards, text-to-speech synthesis, and multi-device synchronization.

This repository contains the full application, including a Rails 6.1 backend and an Ember 3.12 frontend.

---

## 🚀 Getting Started: The Golden Path

This project is fully containerized with Docker, providing a consistent and reliable development environment.

**Prerequisites:**
*   [Docker](https://www.docker.com/get-started) installed and running.

**To start the development server:**

```bash
docker-compose up --build
```

After the build completes, the application will be running at:
*   **URL:** [http://localhost:3000](http://localhost:3000)
*   **Login:** `example` / `password` (after database seeding)

---

## 🛠️ Technology Stack

*   **Backend:** Ruby 3.2.8 / Rails 6.1
*   **Frontend:** JavaScript / Ember 3.12 (located in `app/frontend`)
*   **Database:** PostgreSQL
*   **Background Jobs:** Redis / Resque
*   **Containerization:** Docker / Docker Compose

The legacy stack is intentionally managed within Docker to ensure stability and compatibility. For a detailed explanation of the architecture, see our [Architecture Guide](./docs/ARCHITECTURE.md).

---

## 🤝 How to Contribute

We welcome contributions! To get started, please read our **[Contributing Guide](./CONTRIBUTING.md)**, which includes:

*   Detailed local setup instructions.
*   Branching and pull request strategy.
*   Coding conventions and style guides.
*   Instructions for running tests.

## 🤖 AI-Assisted Development

This repository is equipped with AI agents that have deep project context. To learn how to leverage them for faster onboarding and development, see the **[AI Development Guide](./.ai/docs/AI_DEVELOPMENT_GUIDE.md)**.

## 📄 License

Copyright (C) 2014-2025 LingoLinq AAC & OpenAAC, Inc. Released under the AGPLv3 license or later.