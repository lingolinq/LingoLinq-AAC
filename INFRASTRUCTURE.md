# LingoLinq Infrastructure Guide

This document describes the full deployment architecture for LingoLinq-AAC.
AI agents (Claude Code, Cowork, etc.) should read this before making any
infrastructure changes.

## Owner
- **User:** Scot Wahlquist (swahlquist), scot@lingolinq.com
- **GitHub:** lingolinq/LingoLinq-AAC
- **License:** AGPLv3

## Architecture Overview

```
                    GitHub (lingolinq/LingoLinq-AAC)
                    |           |              |
                    main     develop      clean-release
                    |           |              |
              +-----+     +----+         +----+
              v           v              v
         lingolinq-   lingolinq-    lingolinq-
           prod          dev          staging
              |           |              |
              v           v              v
         prod-db     dev-staging-db  dev-staging-db
              |           |              |
              v           v              v
         prod-worker  dev-worker     dev-worker
                    \     |         /
                     \    |        /
                      v   v       v
                    lingolinq-redis (shared)
                          |
                     S3 Buckets (per env)
```

## Render Services

### Web Services
| Service | ID | Branch | URL | Database |
|---------|-----|--------|-----|----------|
| lingolinq-prod | srv-d510bsemcj7s73966i60 | main | https://lingolinq-prod.onrender.com | lingolinq-prod-db |
| lingolinq-dev | srv-d510c5emcj7s73966pug | develop | https://lingolinq-dev.onrender.com | lingolinq-dev-staging-db |
| lingolinq-staging | srv-d510c13e5dus73c8lg10 | clean-release | https://lingolinq-staging.onrender.com | lingolinq-dev-staging-db |

### Background Workers
| Service | ID | Branch | Database | REDIS_NAMESPACE_SUFFIX |
|---------|-----|--------|----------|----------------------|
| lingolinq-prod-worker | TBD (create manually) | main | lingolinq-prod-db | -prod |
| lingolinq-dev-worker | TBD (create manually) | develop | lingolinq-dev-staging-db | -dev |

Worker start command:
```
env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
```

### Other Services
| Service | ID | Type | Notes |
|---------|-----|------|-------|
| lingolinq-n8n | srv-d4kbjqc9c44c73erql8g | Web (Docker) | n8n automation, https://lingolinq-n8n.onrender.com |

### Legacy Services (TO BE SUSPENDED)
| Service | ID | Type | Notes |
|---------|-----|------|-------|
| LingoLinq-AAC (original web) | srv-d473l8s9c44c73dkg2u0 | Web | Replaced by prod/dev/staging. Environment group: evm-d46rgc63jp1c73aorv6g |
| LingoLinq-AAC (original worker) | srv-d4ocpnje5dus73c5itlg | Worker | Connected to wrong DB (lingolinq-db). Replaced by per-env workers |

### Databases
| Database | ID | Used By |
|----------|----|---------|
| lingolinq-prod-db | dpg-d64c5i1r0fns73c5jcp0-a | lingolinq-prod + prod-worker |
| lingolinq-dev-staging-db | dpg-d64c53v5r7bs73acj600-a | lingolinq-dev + lingolinq-staging + dev-worker |
| lingolinq-db (legacy) | dpg-d46rdsi4d50c7392jsn0-a | Original services only (legacy) |

### Redis
| Instance | ID | Plan | Notes |
|----------|----|------|-------|
| lingolinq-redis | red-d46rhqer433s738dha9g | Free | Shared by ALL services. Queue isolation via REDIS_NAMESPACE_SUFFIX |

### Redis Namespace Isolation
All services share one Redis instance. Queue isolation uses REDIS_NAMESPACE_SUFFIX env var:
- lingolinq-prod + prod-worker: `-prod` -> namespace `lingolinq-prod`
- lingolinq-dev + dev-worker: `-dev` -> namespace `lingolinq-dev`
- lingolinq-staging + dev-worker: `-dev` -> namespace `lingolinq-dev` (shares with dev)

Code: `config/initializers/resque.rb` reads `ENV['REDIS_NAMESPACE_SUFFIX']`.
If not set, defaults to `""` for production, `"-#{Rails.env}"` otherwise.

## AWS (Account 239044785114)

### IAM
- User: `lingolinq-app` (CLI access configured on dev machine)
- Permissions: S3 read/write. No CloudFront, IAM, or other service access.

### S3 Buckets
| Bucket | Purpose | Policy |
|--------|---------|--------|
| lingolinq-prod-uploads | Prod user content | Public read on `*` |
| lingolinq-dev-uploads | Dev user content | Public read on `*` (fixed 2026-02-11, was downloads/* only) |
| lingolinq-staging-uploads | Staging user content | Public read on `*` (added 2026-02-11, had no policy) |
| lingolinq-uploads | Original/legacy | Public read on `*` |
| lingolinq-prod-static | Prod static assets | |
| lingolinq-dev-static | Dev static assets | |
| lingolinq-staging-static | Staging static assets | |
| lingolinq-logs-* | Log storage | |

All upload buckets have:
- ACLs disabled (BucketOwnerEnforced) - app code tries `acl: public-read` but it's silently ignored
- BlockPublicAcls: true, IgnorePublicAcls: true
- BlockPublicPolicy: false, RestrictPublicBuckets: false
- CORS: Allows GET/PUT/POST/DELETE/HEAD from the corresponding Render domain + localhost
- Versioning: Enabled

S3 prefixes used by the app:
- `images/*` - button/board images
- `sounds/*` - button sounds
- `downloads/*` - board exports (OBF/OBZ/PDF)
- `extras*/*` - large data (BoardDownstreamButtonSet, LogSession)
- `imports/*` - uploaded OBF/OBZ files for import

### No CloudFront
UPLOADS_S3_CDN is not configured. Download URLs go directly to S3.

## Background Job Architecture (Resque)

### Queues
- `priority` - Board downloads/exports, Progress actions, slicing, translations
- `default` - General background jobs
- `slow` - Long-running operations (transcoding, large imports, button set updates)

### Board Download Flow
1. User clicks download/print in UI
2. Frontend POSTs to `/api/v1/boards/:id/download`
3. `BoardsController#download` calls `Progress.schedule(board, :generate_download, ...)`
4. `Progress.schedule` enqueues to Resque `:priority` queue
5. Worker picks up job, calls `Progress.perform_action`
6. `Board#generate_download` -> `Converters::Utils.board_to_remote`
7. Converter generates OBF/OBZ/PDF, uploads to S3 under `downloads/` prefix
8. Frontend polls progress status URL; shows "Initializing..." (pending), "Processing..." (started), "Ready!" (finished)

PDF generation uses the OBF gem with Prawn. It fetches button images from their S3 URLs during rendering.

### Common Issues
- **Stuck at "Initializing..."**: Worker not processing jobs. Check: wrong database, wrong Redis namespace, worker not running
- **S3 Access Denied on images**: Bucket policy doesn't cover `images/*` prefix. Fix: ensure policy covers `*`
- **Silent job failures**: Resque catches errors and stores in failed queue. Check: `RedisInit.errors` in Rails console

## Key Environment Variables

Required for each web service AND its corresponding worker:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `REDIS_NAMESPACE_SUFFIX` - Queue isolation suffix (-prod, -dev)
- `RAILS_ENV` / `RACK_ENV` - production
- `RAILS_MASTER_KEY` - Rails credentials decryption key
- `AWS_KEY` / `AWS_SECRET` - S3 access
- `UPLOADS_S3_BUCKET` - Upload bucket name
- `STATIC_S3_BUCKET` - Static asset bucket name
- `DEFAULT_HOST` - App hostname for URL generation
- `SECRET_KEY_BASE` - Rails session encryption
- `SECURE_ENCRYPTION_KEY` - Data-at-rest encryption
- `SECURE_NONCE_KEY` - External nonce generation
- `COOKIE_KEY` - Cookie encryption

See `.env.example` for the full list.

## n8n Automation
- URL: https://lingolinq-n8n.onrender.com
- Service: srv-d4kbjqc9c44c73erql8g
- Disk: 1GB at /home/node/.n8n
- Used for workflow automation

## Development Environment
- Platform: WSL2 (Linux on Windows)
- Ruby: 3.4.3 (rbenv)
- Node: 20 (root & Ember frontend)
- Ember: 3.28
- Rails: see Gemfile
- Package managers: Bundler, npm, Bower (legacy, migrating away)

## AI Tool Configuration
- Claude Code: Primary development tool (WSL)
- MCP Servers: GitHub, Filesystem, DeepWiki, Render, n8n-mcp, Sequential-thinking, Notion
- Claude Desktop + Chrome Extension: For browser-based dashboard tasks (Windows native)
- Cowork: For knowledge work and browser automation tasks

## Critical Warnings
- **jQuery integration MUST be true** in optional-features.json. The button event system relies on jQuery events.
- **Never commit secrets** - use env vars, not hardcoded values
- **Feature flags required** for user-facing changes (AAC users find unexpected UI changes disruptive)
- **S3 bucket policies** must cover `*` (not just `downloads/*`) because the app stores content under multiple prefixes
- **Worker DATABASE_URL must match its web service** - a worker connected to the wrong DB silently fails on all jobs
