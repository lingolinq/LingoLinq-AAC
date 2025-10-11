---
description: Deploy to Fly.io using single-stage Dockerfile after local validation
---

# Deploy to Fly.io

Deploy the application to Fly.io production:

**Prerequisites Check:**
- ✅ Local tests passed (verify Memory-Keeper `local-test-success`)
- ✅ On branch: `fix/deploy-single-stage`
- ✅ Dockerfile.singlestage has Ember build step

**Deployment Steps:**

1. **Update fly.toml to use single-stage Dockerfile:**
   ```bash
   # Check current fly.toml dockerfile setting
   grep "dockerfile" fly.toml
   ```

2. **Deploy to Fly.io (TOKEN-EFFICIENT - uses --detach to avoid massive build logs):**
   ```bash
   # Deploy in detached mode to save tokens (returns immediately)
   /c/Users/skawa/.fly/bin/flyctl.exe deploy --app lingolinq-aac --detach

   # Wait for build to complete (2-3 minutes)
   sleep 180
   ```

3. **Monitor deployment (minimal output):**
   ```bash
   # Check status (only ~10 lines output)
   /c/Users/skawa/.fly/bin/flyctl.exe status --app lingolinq-aac

   # Only check logs if status shows problems
   /c/Users/skawa/.fly/bin/flyctl.exe logs --app lingolinq-aac | tail -30
   ```

4. **Verify production health:**
   ```bash
   curl https://lingolinq-aac.fly.dev/health
   curl https://lingolinq-aac.fly.dev/api/v1/status/heartbeat
   ```

5. **Save deployment result to Memory-Keeper:**
   - Key: `fly-deployment-result`
   - Include: deployment status, health check results, any errors

**Rollback if needed:**
- Use `/rollback` command if deployment fails
