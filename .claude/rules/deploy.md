---
paths:
  - ".github/workflows/deploy-cloudrun.yml"
  - "Dockerfile"
  - "config/environments/production.rb"
  - "config/initializers/resque.rb"
  - "scripts/gcp/**"
---

# Deploy and infrastructure

- Read `docs/INFRASTRUCTURE.md` before changing anything here. Production, staging, dev
  and n8n all run on GCP Cloud Run; the Render platform was deleted on 2026-09-09 and
  must not be described as live or referenced by `*.onrender.com` hostname.
- `.github/workflows/deploy-cloudrun.yml` is the deployed configuration. `render.yaml`,
  `bin/render-build.sh` and `Procfile` are legacy files kept for history only.
- Staging and dev share one GCP project, one Cloud SQL database, one Redis, one Secret
  Manager secret set, and one worker pool that runs the staging image. A job-class or
  queue change on `develop` is not runnable until it reaches `staging`.
- A push to `main` creates a production deployment that waits for approval in the
  `production` GitHub environment; the migrate Job runs before the web revision takes
  traffic and the worker pool is replaced last. Migrations must be expand-contract.
- Secrets reach Cloud Run by name from Secret Manager (`--set-secrets`). A new secret
  must be seeded in each project and added to the workflow's list before the code that
  reads it merges, or the deploy fails at boot.
- Never print a secret value; confirm sourcing by name only.
