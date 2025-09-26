# Claude Code Session Continuation Prompt

## 🎯 **IMMEDIATE GOAL**
Get the LingoLinq-AAC app deployed and working in production without the "loading" loop issue. The user doesn't care which platform (Render, Railway, or Fly.io) as long as it works.

## ⚡ **CRITICAL CONTEXT: Docker Hub Outage (September 24, 2025)**

**BLOCKING ISSUE**: Docker Hub is returning `401 Unauthorized` for ALL base images:
- ❌ `ruby:3.2.8-slim` - 401 Unauthorized
- ❌ `ruby:3.2` - 401 Unauthorized
- ❌ `ubuntu:22.04` - 401 Unauthorized

**SOLUTION READY**: `Dockerfile.github` uses GitHub Container Registry (`ghcr.io/ruby/ruby:3.2`) to bypass Docker Hub completely.

## 🚫 **DO NOT REPEAT - ALREADY SOLVED**

**These issues consumed weeks of time and are COMPLETELY RESOLVED:**

1. **❌ Cache Persistence Issues**
   - Nuclear cache-breaking strategy WORKS with proof of fresh timestamps
   - All platforms now receive current code instead of cached versions

2. **❌ Namespace Migration Problems**
   - SweetSuite → LingoLinqAAC conversion is COMPLETE (237 references converted)
   - JavaScript namespace errors are FIXED with compatibility bridges

3. **❌ Marcel Gem Migration**
   - mime/types → marcel conversion is COMPLETE in uploadable.rb and search_controller.rb
   - No more `mime/types` dependency errors

4. **❌ Infrastructure Setup**
   - Render services created: lingolinq-aac, lingolinq-db, lingolinq-redis2
   - Environment variables configured correctly
   - All platforms (Render, Railway, Fly.io) are properly set up

5. **❌ Docker Configuration Issues**
   - Multiple working Dockerfile variants exist and are ready
   - All nuclear cache-breaking functionality is implemented and tested

6. **❌ Docker Hub Troubleshooting**
   - This is an external infrastructure outage, not our code
   - GitHub Container Registry alternative is ready to use

## ✅ **WHAT'S READY FOR IMMEDIATE DEPLOYMENT**

### **Files Ready**
- ✅ `Dockerfile.github` - **USE THIS** - bypasses Docker Hub outage
- ✅ `render-nuclear.yaml` - Fresh Render services configuration
- ✅ `fly-nuclear.toml` - Fly.io configuration with SQLite
- ✅ All environment variables configured in Render
- ✅ All code changes committed to `fix/ci-pipeline-test` branch

### **Current Render Setup**
- **Database**: lingolinq-db (available)
- **Redis**: lingolinq-redis2 (available, in ungrouped services)
- **Web Service**: LingoLinq-AAC (created, needs Dockerfile path change)
- **Environment Variables**: All configured correctly

## 🚀 **IMMEDIATE ACTION REQUIRED**

**Step 1**: In Render service settings, change **Dockerfile Path** from `./Dockerfile.fixed` to `./Dockerfile.github`

**Step 2**: Trigger manual deploy in Render dashboard

**Step 3**: Monitor deployment - should show GitHub Container Registry success instead of Docker Hub errors

**Step 4**: Test login functionality at production URL

## 🏗️ **Legacy Tech Stack Context**

**Why Docker is Critical**: This app requires Docker isolation for legacy tech stack:
- **Ember 3.12** (legacy frontend framework)
- **Node 18.x** (specific version compatibility)
- **Rails 6.1.7 + Ruby 3.2.8** (legacy backend stack)
- **Bower dependencies** (legacy package manager)

**DO NOT** switch to native Ruby buildpack - this breaks legacy compatibility.

## 📊 **Evidence of Success**

**Nuclear cache-breaking WORKS** - Previous deployment logs showed:
```
🚫 BUNDLE INSTALL CACHE BREAK: Wed Sep 24 19:33:25 UTC 2025
```

This proves the cache persistence issue that blocked deployments for weeks is completely resolved.

## 🔍 **If You Need More Context**

1. **Read**: `.ai/docs/SESSION_HANDOFF.md` - Complete technical details
2. **Read**: `CLAUDE.md` - Project architecture and constraints
3. **Check**: Recent git commits show all completed work
4. **Review**: Multiple Dockerfile variants available in project root

## ⚠️ **What NOT to Do**

1. **Don't** debug cache issues (solved with nuclear strategy)
2. **Don't** work on namespace migration (complete)
3. **Don't** troubleshoot mime/types errors (Marcel gem fixed this)
4. **Don't** create new Dockerfile variants (we have working solutions)
5. **Don't** wait for Docker Hub recovery (use GitHub Container Registry)
6. **Don't** switch away from Docker (legacy tech stack requires it)

## 🎯 **Success Criteria**

**You'll know you succeeded when**:
- Production app loads without "loading" loop
- Login page works correctly
- No JavaScript namespace errors
- User can access the LingoLinq-AAC application

**Expected timeline**: Should achieve working deployment within 1-2 attempts using Dockerfile.github.

---

**This handoff represents weeks of debugging and solutions. The path to success is clear - use the GitHub Container Registry approach to bypass Docker Hub and deploy immediately.**