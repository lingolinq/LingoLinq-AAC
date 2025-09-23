# LingoLinq AAC Deployment Scripts

This directory contains automated deployment scripts for LingoLinq AAC to multiple cloud platforms.

## 🚀 Quick Start

### Option 1: One-Command Deployment (Recommended)
```powershell
# Deploy to Railway (easiest)
.\scripts\quick-deploy.ps1 -Platform railway

# Deploy to Fly.io (alternative)
.\scripts\quick-deploy.ps1 -Platform flyio

# Deploy to both platforms
.\scripts\quick-deploy.ps1 -Platform both
```

### Option 2: Manual Platform-Specific Deployment

#### Railway Deployment
```powershell
# Windows
.\scripts\deploy-railway.ps1

# Unix/Linux/Mac
./scripts/deploy-railway.sh
```

#### Fly.io Deployment
```powershell
# Windows
.\scripts\deploy-flyio.ps1

# Unix/Linux/Mac
./scripts/deploy-flyio.sh
```

## 📊 Monitoring and Verification

### Automated Monitoring
```powershell
# Monitor deployment progress
.\scripts\monitor-deployment.ps1 -Url "https://your-app.railway.app"

# Monitor with custom settings
.\scripts\monitor-deployment.ps1 -CheckInterval 30 -MaxAttempts 15
```

### Manual Verification
Use the comprehensive checklist: `.ai\docs\DEPLOYMENT_VERIFICATION_CHECKLIST.md`

## 📋 Available Scripts

| Script | Platform | Purpose |
|--------|----------|---------|
| `quick-deploy.ps1` | Both | One-command deployment to Railway or Fly.io |
| `deploy-railway.ps1/.sh` | Railway | Full Railway deployment automation |
| `deploy-flyio.ps1/.sh` | Fly.io | Full Fly.io deployment automation |
| `monitor-deployment.ps1/.sh` | Both | Health monitoring and verification |

## 🔧 Prerequisites

### Railway Deployment
- [ ] Railway CLI installed: `npm install -g @railway/cli`
- [ ] Railway account created: https://railway.app
- [ ] Logged in: `railway login`

### Fly.io Deployment
- [ ] Fly CLI installed: https://fly.io/docs/hands-on/install-flyctl/
- [ ] Fly.io account created: https://fly.io
- [ ] Logged in: `fly auth login`

## 🎯 What These Scripts Do

### Pre-deployment Checks
- ✅ Verify CLI tools are installed and authenticated
- ✅ Check git status for uncommitted changes
- ✅ Confirm you're on the working Docker build commit (2f2c2f2d1)
- ✅ Validate project structure (Dockerfile, configs present)

### Railway Deployment Process
1. **Project Setup**: Create or connect to Railway project
2. **Configuration**: Set environment variables for production
3. **Database**: Provision PostgreSQL automatically
4. **Build**: Deploy using Docker with our fixed configuration
5. **Verification**: Check deployment status and get URL

### Fly.io Deployment Process
1. **App Creation**: Create Fly.io app with specified name
2. **Secrets**: Generate and set SECRET_KEY_BASE
3. **Database**: Create and attach PostgreSQL cluster
4. **Deployment**: Build and deploy Docker container
5. **Migrations**: Run Rails database migrations
6. **Health Checks**: Verify application is responding

### Monitoring Features
- **Multi-endpoint testing**: Main page, health check, login page
- **JavaScript error detection**: Specifically checks for namespace issues
- **Response time monitoring**: Tracks deployment progress
- **Comprehensive reporting**: Detailed success/failure analysis

## 🚨 Troubleshooting

### Common Issues

#### "Bundle clean error" during build
- **Cause**: Docker build cache contains corrupted gem installation
- **Solution**: Reset build cache in platform dashboard and redeploy

#### "LingoLinqAAC.track_error is not a function"
- **Cause**: JavaScript namespace compatibility issue
- **Solution**: Verify you're on commit 2f2c2f2d1 or later with fixes

#### Database connection errors
- **Cause**: Database not properly attached or configured
- **Solution**: Check environment variables and database connection strings

#### Deployment hangs or times out
- **Cause**: Build process stuck or resource limits exceeded
- **Solution**: Check logs for specific errors and try redeploying

### Getting Help

#### Railway Support
- Dashboard: https://railway.app/dashboard
- Logs: `railway logs`
- Status: `railway status`
- Discord: https://discord.gg/railway

#### Fly.io Support
- Dashboard: https://fly.io/dashboard
- Logs: `fly logs`
- Status: `fly status`
- Community: https://community.fly.io

## 🔍 Script Options

### Common Options (All Scripts)
- `--skip-checks`: Skip pre-deployment validation
- `--force`: Continue despite warnings
- `--verbose`: Show detailed output

### Platform-Specific Options

#### Railway Scripts
- `-ProjectName`: Custom project name (default: lingolinq-aac)

#### Fly.io Scripts
- `-AppName`: Custom app name (default: lingolinq-aac)
- `--region`: Deployment region (default: ord)

#### Monitoring Scripts
- `-Url`: Application URL to monitor
- `-CheckInterval`: Seconds between health checks (default: 30)
- `-MaxAttempts`: Maximum monitoring attempts (default: 20)

## 📝 Example Usage

### Deploy to Railway with monitoring
```powershell
.\scripts\deploy-railway.ps1 -ProjectName "lingolinq-production"
.\scripts\monitor-deployment.ps1 -CheckInterval 15 -MaxAttempts 25
```

### Deploy to Fly.io in different region
```bash
./scripts/deploy-flyio.sh lingolinq-staging --region=lax
./scripts/monitor-deployment.sh "https://lingolinq-staging.fly.dev"
```

### Quick deployment with full automation
```powershell
.\scripts\quick-deploy.ps1 -Platform both -AppName "lingolinq-demo"
```

## 🎯 Success Criteria

Your deployment is successful when:

1. ✅ **Build completes** without bundle clean errors
2. ✅ **Application responds** to HTTP requests
3. ✅ **Login page loads** without infinite loading
4. ✅ **No JavaScript errors** in browser console
5. ✅ **Database connectivity** working correctly

Use the monitoring scripts and verification checklist to confirm all criteria are met.

## 🔗 Related Documentation

- **Main Guide**: `.ai\docs\RAILWAY_DEPLOYMENT_GUIDE.md`
- **Verification**: `.ai\docs\DEPLOYMENT_VERIFICATION_CHECKLIST.md`
- **Alternative Platforms**: `.ai\docs\ALTERNATIVE_DEPLOYMENT.md`
- **Troubleshooting**: `CLAUDE.md` in project root