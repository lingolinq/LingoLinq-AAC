# 🔑 LingoLinq-AAC Secret Configuration Guide

## ✅ **GENERATED SECRETS**

### RAILS_MASTER_KEY
```
91bd903e23368c565c0051a66ed7edb56a9940ed670d7efa36eeef04b3c9ef75
```
**Usage**: This is your Rails production secret key. Use this exact value.

---

## 📋 **REQUIRED: Get Your Existing Service URLs**

Since you manually created database and Redis services, you need to get their connection URLs from your Render dashboard.

### 🔍 **How to Find Your URLs**

#### **DATABASE_URL** (PostgreSQL):
1. Go to https://dashboard.render.com
2. Find your PostgreSQL database service (you mentioned you created one)
3. Click on the database service
4. Look for "Internal Database URL" or "Connection String"
5. Copy the full URL (starts with `postgres://` or `postgresql://`)

**Format should look like:**
```
postgresql://username:password@hostname:port/database_name
```

#### **REDIS_URL**:
1. In your Render dashboard
2. Find your Redis service (you mentioned you created one)
3. Click on the Redis service
4. Look for "Internal Redis URL" or "Connection String"
5. Copy the full URL (starts with `redis://` or `rediss://`)

**Format should look like:**
```
redis://username:password@hostname:port
```

---

## 🚀 **NEXT STEPS - Dashboard Configuration**

### **FOR RENDER:**
1. Go to your web service in Render dashboard
2. Go to "Environment" tab
3. Add these environment variables:
   - `DATABASE_URL` = [Your PostgreSQL URL from above]
   - `REDIS_URL` = [Your Redis URL from above]
   - `RAILS_MASTER_KEY` = `91bd903e23368c565c0051a66ed7edb56a9940ed670d7efa36eeef04b3c9ef75`
4. Save and redeploy

### **FOR FLY.IO:**
Run these commands in your terminal:
```bash
flyctl secrets set RAILS_MASTER_KEY=91bd903e23368c565c0051a66ed7edb56a9940ed670d7efa36eeef04b3c9ef75 --app lingolinq-test-basic
flyctl secrets set DATABASE_URL="[Your PostgreSQL URL]" --app lingolinq-test-basic
flyctl secrets set REDIS_URL="[Your Redis URL]" --app lingolinq-test-basic
```

---

## 🔍 **ALTERNATIVE: Let Me Help You Find The URLs**

If you can't find the URLs in your dashboard, I can help you:

1. **Check if there are any config files** with connection strings
2. **Use Render API** to list your services (if you have API access)
3. **Create new minimal database connections** for testing

**Let me know what you find, and I'll help you configure everything!**

---

## 💡 **QUICK TEST**

Once you set these secrets:
- Render should redeploy automatically
- For Fly.io, run: `flyctl deploy --config fly-basic.toml --dockerfile Dockerfile.basic`
- Check our monitoring script: `bash .ai/tools/deployment-monitor.sh`