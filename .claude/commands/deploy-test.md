---
description: Test deployment by building Dockerfile.singlestage locally and verifying container health
---

# Local Deployment Test

Build and test the single-stage Dockerfile locally:

1. **Build the Docker image:**
   ```bash
   docker build -f Dockerfile.singlestage -t lingolinq-test:single-stage .
   ```

2. **Run the container:**
   ```bash
   docker run -d -p 3000:3000 \
     -e DATABASE_URL="sqlite3:db/development.sqlite3" \
     -e SECRET_KEY_BASE="test-$(openssl rand -hex 32)" \
     -e RAILS_MASTER_KEY="dummy-test" \
     --name lingolinq-test \
     lingolinq-test:single-stage
   ```

3. **Check container logs:**
   ```bash
   docker logs lingolinq-test
   ```

4. **Test health endpoints:**
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/api/v1/status/heartbeat
   ```

5. **Verify bundler version:**
   ```bash
   docker exec lingolinq-test bundle --version
   docker exec lingolinq-test bundle list | grep -E "(concurrent-ruby|rails)"
   ```

6. **Save results to Memory-Keeper:**
   - If success: Save with key `local-test-success`
   - If failure: Save with key `local-test-failure` including error logs

After testing, report findings and stop container:
```bash
docker stop lingolinq-test
docker rm lingolinq-test
```
