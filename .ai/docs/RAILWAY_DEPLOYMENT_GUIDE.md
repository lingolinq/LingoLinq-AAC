# Railway Deployment Guide - LingoLinq AAC

## 🚄 Simple Railway Deployment (Non-Technical Users)

### Prerequisites Check
- [ ] Docker is working locally (you've tested `docker build .`)
- [ ] Latest commit (2f2c2f2d1) contains the working Docker configuration
- [ ] You have admin access to create Railway accounts

### Step-by-Step Railway Dashboard Deployment

#### 1. Create Railway Account
1. Go to https://railway.app
2. Click **"Sign up"**
3. Use **GitHub** login (recommended) or email
4. Verify your email if required

#### 2. Create New Project
1. Click **"New Project"** button (purple/blue button on dashboard)
2. Select **"Deploy from GitHub repo"**
3. Connect your GitHub account if not already connected
4. Search for **"LingoLinq-AAC"** repository
5. Click **"Deploy Now"**

#### 3. Configure Build Settings
1. Railway will automatically detect it's a Rails app
2. **IMPORTANT:** Force Docker build by clicking **"Settings"** tab
3. Under **"Build"** section:
   - Set **Build Command**: Leave empty (uses Dockerfile)
   - Set **Dockerfile Path**: `Dockerfile` (not `docker/Dockerfile`)
4. Click **"Save Changes"**

#### 4. Set Environment Variables
1. Click **"Variables"** tab in your project
2. Add these environment variables by clicking **"+ New Variable"**:
   ```
   RAILS_ENV=production
   RACK_ENV=production
   RAILS_SERVE_STATIC_FILES=true
   RAILS_LOG_TO_STDOUT=true
   DISABLE_OBF_GEM=true
   NODE_ENV=production
   SECRET_KEY_BASE=your-secret-key-here
   ```
3. For `SECRET_KEY_BASE`, generate a secure key:
   - Go to https://randomkeygen.com/
   - Copy a "CodeIgniter Encryption Key" (504-bit)
   - Paste it as the SECRET_KEY_BASE value

#### 5. Add Database
1. Click **"+ New"** button in your project
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically provision and connect the database
4. The `DATABASE_URL` environment variable will be set automatically

#### 6. Deploy
1. Railway starts building automatically after configuration
2. Watch the **"Deployments"** tab for build progress
3. Build should take 5-10 minutes for first deployment
4. Look for **"✅ Deployed"** status

#### 7. Access Your Application
1. In **"Settings"** tab, find **"Domains"** section
2. Click **"Generate Domain"** to get a public URL
3. Your app will be available at: `https://your-app-name.up.railway.app`

### 🔍 Verifying Successful Deployment

#### Check These URLs Work:
- `https://your-app-name.up.railway.app` - Should show LingoLinq homepage
- `https://your-app-name.up.railway.app/login` - Should show login page (NOT infinite loading)
- `https://your-app-name.up.railway.app/health` - Should return "OK"

#### Browser Console Check:
1. Open browser developer tools (F12)
2. Go to **Console** tab
3. Visit your login page
4. Should NOT see: `LingoLinqAAC.track_error is not a function`

### 🚨 Troubleshooting Common Issues

#### Build Fails with "Bundle Clean Error"
- **Cause**: Railway is using cached Dockerfile
- **Solution**: In Railway dashboard:
  1. Go to **Settings** → **General**
  2. Scroll to **Danger Zone**
  3. Click **"Reset Build Cache"**
  4. Redeploy

#### Database Connection Errors
- **Check**: Variables tab shows `DATABASE_URL` is set
- **Fix**: If missing, go to **Data** tab and reconnect PostgreSQL service

#### App Shows 500 Error
- **Check**: Deployments tab → View logs for detailed error messages
- **Common Fix**: Make sure `SECRET_KEY_BASE` is set correctly

### 📞 Getting Help
- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app
- Support Email: team@railway.app

---

## 🔧 Technical Notes (For Developers)

### Dockerfile Configuration
Railway correctly uses the root `Dockerfile` which:
- ✅ Uses Node 18.x for compatibility
- ✅ Installs Ruby gems without bundle clean
- ✅ Builds Ember 3.12 frontend assets
- ✅ Precompiles Rails assets with obf gem disabled
- ✅ Contains fixed Docker build (commit 2f2c2f2d1)

### Environment Variables Explained
- `DISABLE_OBF_GEM=true` - Prevents problematic obf gem from loading
- `RAILS_SERVE_STATIC_FILES=true` - Enables static asset serving in production
- `RAILS_LOG_TO_STDOUT=true` - Sends logs to Railway's log viewer

### Database Setup
Railway PostgreSQL automatically provides:
- `DATABASE_URL` environment variable
- Connection pooling and SSL
- Automated backups
- Database metrics and monitoring

### Build Process
1. Railway clones your GitHub repository
2. Detects Dockerfile in root directory
3. Runs `docker build .` with your Dockerfile
4. Deploys container to Railway's infrastructure
5. Provides HTTPS domain automatically

### Monitoring
Railway provides:
- Real-time deployment logs
- Application metrics (CPU, memory, requests)
- Database connection monitoring
- Alert notifications for downtime

This configuration should deploy successfully without the cache issues that plagued Render.com deployment.