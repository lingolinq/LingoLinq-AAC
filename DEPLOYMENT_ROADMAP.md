# LingoLinq-AAC Deployment Roadmap

## Executive Summary

Based on analysis of deployment failures across Render, Railway, and Fly.io, the core issues are:

1. **Database connectivity** - PostgreSQL not properly configured locally
2. **Legacy dependency conflicts** - Rails 6.1 + Ember 3.12 + Ruby 3.2.8 compatibility
3. **OBF gem loading** - Conditional dependency causing startup failures
4. **Memory constraints** - Complex build process exceeding platform limits

## Investigation Results

After attempting local deployment, we've identified these specific blocking issues:

### Core Problems
1. **PostgreSQL Migrations** - Multiple migrations use PostgreSQL-specific features (GIN indexes, concurrency algorithms) that fail on SQLite
2. **Database Connection** - Rails initialization tries to connect during startup for auditing/validation
3. **Environment Configuration** - Complex interaction between .env loading, Rails initialization, and database requirements

### What We Learned
- PostgreSQL Docker container runs correctly
- Database connectivity works (tested with direct psql connection)
- Rails 6.1 + Ruby 3.2.8 + gem dependencies load successfully
- The issue is in Rails initialization phase, not the core stack
- You mentioned this worked before, so the fix is environmental/configuration

### Root Cause Analysis
The application expects a full PostgreSQL environment with specific extensions and migration history. The Rails initialization process requires database connectivity before the server starts, making it challenging to use alternative databases for quick testing.

## Immediate Solutions (Choose One Path)

### Path A: Complete Local PostgreSQL Setup (Recommended)
**Goal**: Recreate your previous working local environment

#### What You Need To Remember
Since you mentioned this worked locally before, we need to identify what environment setup you had previously. The application requires:

1. **Full PostgreSQL with Extensions**: The app uses GIN indexes and PostgreSQL-specific features
2. **Complete Migration History**: All 100+ migrations must run successfully
3. **Proper Environment Variables**: All keys from .env must be properly loaded

#### Recovery Steps
```bash
# 1. PostgreSQL with extensions (done)
docker run --name lingolinq-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=lingolinq_development -p 5432:5432 -d postgres:13

# 2. Restore previous DATABASE_URL (if you remember it)
# Or use: postgresql://postgres:password@127.0.0.1:5432/lingolinq_development

# 3. Run full migration suite
bundle exec rails db:migrate

# 4. Start server
bundle exec rails server -p 3000
```

**Key Question**: Do you remember what DATABASE_URL you used before? Or any other environment differences?

---

### Path B: Minimal Cloud Deployment
**Goal**: Deploy with absolute minimum changes to prove viability

#### Option B1: Simple VPS (Recommended for legacy apps)
- **Platform**: DigitalOcean/Linode VPS ($20/month)
- **Approach**: Direct Docker deployment with PostgreSQL
- **Benefits**: Full control, no platform memory limits
- **Setup Time**: 2-3 hours

#### Option B2: Railway (Simplest managed platform)
- **Current Issue**: 404 errors with Dockerfile.temp
- **Fix**: Update railway.toml to use Dockerfile.minimal
- **Required Changes**: None beyond file reference
- **Memory**: 8GB available (higher than Render/Fly.io)

#### Option B3: Render (Current attempts failing)
- **Current Issue**: 502 Bad Gateway during startup
- **Root Cause**: OBF gem + Ember build complexity
- **Fix**: Use Dockerfile.minimal without Ember assets
- **Trade-off**: Static assets won't rebuild automatically

## Minimal Required Changes Analysis

### High Priority Fixes (Must Do)
1. **Database Configuration**
   - Current: No local PostgreSQL setup
   - Fix: Add DATABASE_URL to development environment
   - Impact: Required for any local/cloud deployment

2. **OBF Gem Conditional Loading**
   - Current: Failing to load despite DISABLE_OBF_GEM=true
   - Fix: Modify config/initializers/obf_footer.rb with better error handling
   - Impact: Application won't start without this

3. **Ruby Version Consistency**
   - Current: Gemfile specifies 3.2.8, some configs use 3.2.9
   - Fix: Standardize on 3.2.8 (already done)
   - Impact: Build consistency across environments

### Medium Priority (Should Do)
4. **Simplified Dockerfile**
   - Current: Complex multi-stage build with Ember
   - Fix: Use Dockerfile.minimal for initial deployment
   - Impact: Faster builds, fewer failure points

5. **Health Check Configuration**
   - Current: Complex health checks failing
   - Fix: Use simple root path health check initially
   - Impact: Deployment stability

### Low Priority (Can Defer)
6. **Asset Pipeline Modernization**
   - Current: Legacy Ember 3.12 + Bower
   - Future: Upgrade to Ember 4.x+ or move to Rails 7 asset pipeline
   - Impact: Long-term maintainability

## Recommended Next Steps

### Week 1: Local Environment
1. Setup PostgreSQL Docker container
2. Configure DATABASE_URL environment variable
3. Test Rails server startup and login functionality
4. Document working local development process

### Week 2: Cloud Deployment
1. Deploy to Railway using Dockerfile.minimal
2. Configure PostgreSQL addon
3. Test basic functionality
4. Monitor stability

### Future Modernization Path
1. **Rails 6.1 → 7.1 Upgrade** (Q1 2025)
   - Security critical (Rails 6.1 EOL in 2024)
   - Easier deployment on modern platforms
   - Better performance and stability

2. **Ember 3.12 → 4.x Upgrade** (Q2 2025)
   - Remove Bower dependency
   - Modernize frontend build process
   - Improved maintainability

## Platform Recommendations

| Platform | Cost | Complexity | Success Probability | Notes |
|----------|------|------------|-------------------|-------|
| **Simple VPS** | $20/mo | Medium | 95% | Full control, Docker works reliably |
| **Railway** | $10/mo | Low | 80% | Higher memory limits, simpler config |
| **Render** | $7/mo | Medium | 60% | Current deployment issues |
| **Fly.io** | $5/mo | High | 40% | Memory constraints, complex config |

## Risk Assessment

**High Risk**: Continuing with complex multi-stage builds on memory-constrained platforms
**Medium Risk**: Rails 6.1 security vulnerabilities (EOL December 2024)
**Low Risk**: Local development environment setup

## Budget Considerations

- **VPS Route**: $20/month + setup time (2-3 hours)
- **Managed Platform**: $7-10/month + debugging time (ongoing)
- **Modernization**: Significant development time but addresses root causes

## Decision Matrix

Choose based on:
- **Time constraint**: Use VPS for fastest reliable deployment
- **Budget constraint**: Use Railway for lowest cost managed solution
- **Learning constraint**: Use local development first to understand issues
- **Long-term**: Plan Rails 7 upgrade for sustainable future

## Files Modified for Each Path

### Local Development
- `.env` (create)
- `config/database.yml` (ensure DATABASE_URL support)
- `config/initializers/obf_footer.rb` (better error handling)

### Railway Deployment
- `railway.toml` (change dockerfilePath to Dockerfile.minimal)
- `Dockerfile.minimal` (ensure DISABLE_OBF_GEM handling)

### VPS Deployment
- `docker-compose.yml` (create with PostgreSQL)
- `Dockerfile.minimal` (production environment setup)