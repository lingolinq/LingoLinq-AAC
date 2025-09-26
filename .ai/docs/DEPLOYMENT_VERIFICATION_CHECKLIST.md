# Deployment Verification Checklist - LingoLinq AAC

## 🎯 Pre-Deployment Verification

### Local Docker Build Verification
- [ ] **Docker builds successfully**: `docker build .` completes without errors
- [ ] **No bundle clean errors**: Build logs show no "exit code 15" errors
- [ ] **Correct commit**: On commit `2f2c2f2d1` or later with Docker fixes
- [ ] **Environment variables set**: `DISABLE_OBF_GEM=true` in build environment

### Code Quality Checks
- [ ] **JavaScript namespace fixes present**: Check `app/assets/javascripts/application-preload.js` contains SweetSuite initialization
- [ ] **No obf gem dependencies**: Verify `bundle show obf` returns error (gem not installed)
- [ ] **Clean git status**: No uncommitted changes (or acknowledged)
- [ ] **Asset compilation works**: `rails assets:precompile` succeeds locally

---

## 🚄 Railway Deployment Verification

### Dashboard Setup
- [ ] **Account created**: Railway account with GitHub integration
- [ ] **Project created**: New project from LingoLinq-AAC repository
- [ ] **Build settings configured**: Uses Dockerfile (not Ruby buildpack)
- [ ] **Environment variables set**: All required production env vars configured

### Environment Variables Checklist
```
RAILS_ENV=production
RACK_ENV=production
RAILS_SERVE_STATIC_FILES=true
RAILS_LOG_TO_STDOUT=true
DISABLE_OBF_GEM=true
NODE_ENV=production
SECRET_KEY_BASE=[64-character random string]
```

### Database Setup
- [ ] **PostgreSQL provisioned**: Database service added to project
- [ ] **DATABASE_URL available**: Environment variable automatically set
- [ ] **Connection working**: No database connection errors in logs

### Build Verification
- [ ] **Build starts**: Deployment begins after code push
- [ ] **Docker build succeeds**: No bundle clean or gem compilation errors
- [ ] **Assets compiled**: Frontend and Rails assets build successfully
- [ ] **Deploy succeeds**: Build completes with "✅ Deployed" status

---

## ✈️ Fly.io Deployment Verification

### CLI Setup
- [ ] **Fly CLI installed**: `fly version` returns valid version
- [ ] **Authentication working**: `fly auth whoami` shows logged-in user
- [ ] **App created**: `fly apps create lingolinq-aac` succeeds
- [ ] **Configuration valid**: `fly.toml` uses correct Dockerfile path

### Database Setup
- [ ] **PostgreSQL created**: `fly postgres create` provisions database
- [ ] **Database attached**: App can connect to PostgreSQL instance
- [ ] **Migrations run**: `fly ssh console --command "rails db:migrate"` succeeds
- [ ] **Connection string set**: `DATABASE_URL` environment variable available

### Deployment Success
- [ ] **Build completes**: `fly deploy` finishes without errors
- [ ] **Health checks pass**: `/health` endpoint returns 200 OK
- [ ] **Machines running**: `fly machine list` shows active instances
- [ ] **Domain accessible**: `https://lingolinq-aac.fly.dev` responds

---

## 🌐 Application Health Verification

### HTTP Endpoint Tests
- [ ] **Main page loads**: `GET /` returns 200 OK
- [ ] **Health check works**: `GET /health` returns 200 OK
- [ ] **Login page accessible**: `GET /login` returns 200 OK (not infinite loading)
- [ ] **Static assets serve**: CSS/JS files load correctly

### JavaScript Functionality
- [ ] **No namespace errors**: Browser console shows no "LingoLinqAAC.track_error is not a function"
- [ ] **SweetSuite bridge works**: Compatibility layer functions correctly
- [ ] **Ember app initializes**: Frontend application starts without errors
- [ ] **Login form functional**: Login page displays form elements

### Performance Checks
- [ ] **Response times acceptable**: Pages load within 5 seconds
- [ ] **Memory usage normal**: Application doesn't exceed memory limits
- [ ] **Database queries working**: No SQL connection errors
- [ ] **Asset loading fast**: Static files serve quickly

---

## 🔧 Troubleshooting Verification

### Common Issues Resolved
- [ ] **Bundle clean error fixed**: No exit code 15 errors during gem installation
- [ ] **OBF gem disabled**: `DISABLE_OBF_GEM=true` prevents problematic gem loading
- [ ] **Node version compatible**: Node 18.x works with Ember 3.12 build
- [ ] **Asset compilation succeeds**: Rails assets precompile without errors

### Error Monitoring
- [ ] **Application logs clean**: No critical errors in production logs
- [ ] **Database connections stable**: No connection pool exhaustion
- [ ] **Error tracking functional**: JavaScript error reporting works
- [ ] **Health monitoring active**: Deployment platform health checks enabled

---

## 📊 Post-Deployment Validation

### User Acceptance Testing
- [ ] **Login functionality**: Users can successfully log in
- [ ] **Core features work**: Primary AAC functionality operates correctly
- [ ] **Data persistence**: User data saves and loads properly
- [ ] **Navigation functional**: Application routing works between pages

### Production Readiness
- [ ] **SSL certificate active**: HTTPS works without warnings
- [ ] **Domain configuration**: Custom domain (if applicable) resolves correctly
- [ ] **Backup strategy**: Database backups configured
- [ ] **Monitoring setup**: Application performance monitoring active

### Documentation Updates
- [ ] **Deployment documented**: Process recorded for future deployments
- [ ] **Environment variables documented**: All required env vars listed
- [ ] **Troubleshooting guide updated**: Common issues and solutions documented
- [ ] **Rollback plan ready**: Strategy for reverting deployment if needed

---

## 🎉 Success Criteria

### Primary Success Indicators
✅ **Application accessible**: LingoLinq AAC loads at production URL
✅ **Login works**: Users can access login page and authenticate
✅ **No JavaScript errors**: Browser console clean of namespace errors
✅ **Core functionality**: Primary AAC features operational

### Secondary Success Indicators
✅ **Performance acceptable**: Response times under 5 seconds
✅ **Stability maintained**: No crashes or memory leaks
✅ **Error handling works**: Graceful error reporting and recovery
✅ **Documentation complete**: Process documented for team use

---

## 🚨 Failure Scenarios

### Deploy Blocking Issues
❌ **Bundle clean error**: Docker build fails with exit code 15
❌ **JavaScript namespace error**: "track_error is not a function" appears
❌ **Database connection failure**: Cannot connect to PostgreSQL
❌ **Asset compilation failure**: Rails assets:precompile fails

### Rollback Triggers
❌ **Login completely broken**: Users cannot access application
❌ **Critical functionality lost**: Core AAC features non-functional
❌ **Performance regression**: Response times exceed 30 seconds
❌ **Data corruption**: User data integrity compromised

---

## 📞 Support Resources

### Railway Support
- **Dashboard**: https://railway.app/dashboard
- **Documentation**: https://docs.railway.app
- **Discord**: https://discord.gg/railway
- **Status**: https://status.railway.app

### Fly.io Support
- **Dashboard**: https://fly.io/dashboard
- **Documentation**: https://fly.io/docs
- **Community**: https://community.fly.io
- **Status**: https://status.fly.io

### Internal Resources
- **CLAUDE.md**: Project overview and troubleshooting
- **Local Development Guide**: `.ai/docs/LOCAL_DEVELOPMENT.md`
- **JavaScript Fixes**: `.ai/docs/JAVASCRIPT_NAMESPACE_FIXES.md`
- **Alternative Deployment**: `.ai/docs/ALTERNATIVE_DEPLOYMENT.md`

Use this checklist to systematically verify each deployment step and ensure LingoLinq AAC is production-ready.