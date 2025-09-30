# LingoLinq-AAC Render Deployment Guide

## 🚀 Quick Deploy Steps

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up with your GitHub account

### 2. Deploy Using Blueprint
- In Render dashboard, click "New +"
- Select "Blueprint"
- Connect to this repository
- Render will read `render.yaml` and create all services

### 3. Set Required Environment Variables

After blueprint deployment, you'll need to manually set these in the Render dashboard:

#### Web Service Environment Variables:
```
RAILS_MASTER_KEY=your_rails_master_key_from_config/master.key
```

#### Additional Environment Variables (if needed):
```
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-west-2
BUGSNAG_API_KEY=your_bugsnag_key
STRIPE_PUBLISHABLE_KEY=your_stripe_key
STRIPE_SECRET_KEY=your_stripe_secret
NEWRELIC_LICENSE_KEY=your_newrelic_key
```

## 📋 Services Created

1. **PostgreSQL Database** (`lingolinq-db`)
   - Starter plan: $7/month
   - Handles all application data

2. **Redis Cache** (`lingolinq-redis`)
   - Starter plan: $7/month
   - Used for session storage and caching

3. **Web Application** (`lingolinq-web`)
   - Starter plan: $7/month
   - Main Rails app with Ember frontend

4. **Background Worker** (`lingolinq-worker`)
   - Starter plan: $7/month
   - Processes background jobs (Resque)

**Total Cost: ~$28/month for full production setup**

## 🔧 Manual Deployment (Alternative)

If you prefer to set up services individually:

### Step 1: Create PostgreSQL Database
1. New + → PostgreSQL
2. Name: `lingolinq-db`
3. Database: `lingolinq_production`
4. User: `lingolinq_user`

### Step 2: Create Redis Instance
1. New + → Redis
2. Name: `lingolinq-redis`

### Step 3: Create Web Service
1. New + → Web Service
2. Connect GitHub repo
3. Build Command: `./bin/render-build.sh`
4. Start Command: `bundle exec puma -C config/puma.rb`
5. Add environment variables (see above)

### Step 4: Create Background Worker
1. New + → Background Worker
2. Connect same GitHub repo
3. Build Command: `./bin/render-build.sh`
4. Start Command: `bundle exec resque:work QUEUE=*`

## 🔍 Troubleshooting

### Build Failures
- Check build logs in Render dashboard
- Ensure `bin/render-build.sh` is executable
- Verify Node.js version compatibility

### Database Issues
- Ensure `RAILS_MASTER_KEY` is set correctly
- Check database migrations ran successfully
- Verify DATABASE_URL connection

### Frontend Assets
- Check Ember build completed successfully
- Verify `npm install` runs without errors
- Ensure `npm run build` generates dist files

## 🎯 Next Steps After Deployment

1. **Custom Domain**: Add your domain in Render dashboard
2. **SSL Certificate**: Automatically provided by Render
3. **Monitoring**: Set up Render's built-in monitoring
4. **Backups**: Configure automatic database backups
5. **CI/CD**: Connect GitHub for auto-deployments

## 📞 Support

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Rails on Render**: [render.com/docs/deploy-rails](https://render.com/docs/deploy-rails)
- **Community**: [community.render.com](https://community.render.com)

---

✅ Your LingoLinq-AAC app is ready for production deployment on Render!