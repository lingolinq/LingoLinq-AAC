---
description: Rollback to previous working deployment on Fly.io
---

# Rollback Deployment

Emergency rollback to last working deployment:

1. **Check deployment history:**
   ```bash
   /c/Users/skawa/.fly/bin/flyctl.exe releases --app lingolinq-aac
   ```

2. **Rollback to previous version:**
   ```bash
   /c/Users/skawa/.fly/bin/flyctl.exe releases rollback \
     --app lingolinq-aac \
     --version [PREVIOUS_VERSION]
   ```

3. **Verify rollback succeeded:**
   ```bash
   /c/Users/skawa/.fly/bin/flyctl.exe status --app lingolinq-aac
   curl https://lingolinq-aac.fly.dev/health
   ```

4. **Save rollback event to Memory-Keeper:**
   - Key: `rollback-$(date +%Y%m%d-%H%M%S)`
   - Include: reason for rollback, version restored, current status

5. **Review what went wrong:**
   ```bash
   /c/Users/skawa/.fly/bin/flyctl.exe logs --app lingolinq-aac --tail=100
   ```

**After rollback:**
- Document the issue in DEBUGGING_LOG.md
- Fix the problem on the fix branch
- Re-test locally before attempting deployment again
