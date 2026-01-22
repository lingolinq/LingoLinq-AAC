# 🚀 LingoLinq Full Stack Local Setup Guide

## 📋 **Prerequisites Check**

Before starting, verify you have these installed:

```bash
# Check Ruby (required: 2.7+)
ruby -v
# Example output: ruby 3.0.0p0

# Check PostgreSQL (required: 12+)
psql --version
# Example output: psql (PostgreSQL) 14.1

# Check Node.js (required: 18.x for Ember)
node -v
# Example output: v18.19.0

# Check npm
npm -v
# Example output: 9.2.0

# Check nvm (optional but recommended)
nvm --version
# Example output: 0.39.0
```

### **Missing Prerequisites?**

#### **Install Ruby (macOS):**
```bash
# Using rbenv (recommended)
brew install rbenv ruby-build
rbenv install 3.0.0
rbenv global 3.0.0

# Or using RVM
\curl -sSL https://get.rvm.io | bash -s stable
rvm install 3.0.0
rvm use 3.0.0 --default
```

#### **Install PostgreSQL (macOS):**
```bash
# Using Homebrew
brew install postgresql@14
brew services start postgresql@14

# Or download Postgres.app
# https://postgresapp.com/
```

#### **Install Node.js (with nvm - recommended):**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc  # or ~/.zshrc

# Install Node 18 (required for Ember)
nvm install 18
nvm use 18
```

#### **Install Redis (optional - for background jobs):**
```bash
# macOS
brew install redis
brew services start redis

# Verify
redis-cli ping
# Should return: PONG
```

---

## 🔧 **Step 1: Clone and Checkout Branch**

```bash
# Clone repository (if you haven't already)
git clone https://github.com/swahlquist/LingoLinq-AAC.git
cd LingoLinq-AAC

# Checkout the fix branch
git checkout fix/app-state-boot-crash

# Pull latest changes
git pull origin fix/app-state-boot-crash

# Verify branch
git branch
# Should show: * fix/app-state-boot-crash
```

---

## 🔑 **Step 2: Configure Environment**

```bash
# Copy environment template
cp .env.example .env

# Edit .env file
nano .env  # or use your favorite editor
```

### **Minimum Required Variables:**

```bash
# Database
DATABASE_URL=postgres://localhost/lingolinq-development
DB_USER=your_username
DB_PASS=your_password  # leave empty if no password

# Redis (optional - for background jobs)
REDIS_URL=redis://localhost:6379/0

# AWS (optional - only needed for file uploads)
# AWS_KEY=your_key
# AWS_SECRET=your_secret
# AWS_BUCKET=your_bucket

# Google API (optional - only needed for translation)
# GOOGLE_TRANSLATE_API_KEY=your_key
```

**Save and close** (Ctrl+X, then Y, then Enter in nano)

---

## 📦 **Step 3: Install Dependencies**

### **A. Ruby Dependencies (Backend)**

```bash
# Install Bundler
gem install bundler

# Install Ruby gems
bundle install

# If you get SSL errors, try:
bundle config set --local force_ruby_platform true
bundle install
```

**Expected output:**
```
Bundle complete! 87 Gemfile dependencies, 198 gems now installed.
```

---

### **B. Node Dependencies (Frontend)**

```bash
# Navigate to frontend directory
cd app/frontend

# Ensure you're using Node 18
nvm use 18
# Output: Now using node v18.x.x

# Install npm packages
npm install

# Install Bower packages (legacy dependency manager)
bower install

# Return to root
cd ../..
```

**Expected output:**
```
added 1247 packages in 45s
```

---

## 💾 **Step 4: Setup Database**

```bash
# Create database
bundle exec rake db:create

# Run migrations
bundle exec rake db:migrate

# Seed with example data (RECOMMENDED)
bundle exec rake db:seed
```

### **What Seeding Creates:**
- ✅ User: `example` / `password`
- ✅ Sample boards
- ✅ Default settings
- ✅ Demo content

**Expected output:**
```
Database created successfully!
Migrated to version 20231215...
Seeded database with example user and boards.
```

---

## 🎯 **Step 5: Choose Your Startup Method**

### **Option 1: Automated Script (EASIEST)** ⭐

```bash
# Make script executable (first time only)
chmod +x start_dev.sh

# Run the script
./start_dev.sh
```

**What it does:**
- ✅ Checks prerequisites (Node 18, Ruby, PostgreSQL)
- ✅ Installs dependencies if needed
- ✅ Creates database if missing
- ✅ Prompts to seed database
- ✅ Starts Rails server (port 5000)
- ✅ Starts Ember server (port 8184)
- ✅ Shows login credentials
- ✅ Handles graceful shutdown (Ctrl+C)

**Output:**
```
🚀 Starting LingoLinq Full Stack Development Environment...

✓ Node.js v18.19.0 detected (correct version)
✓ Ruby 3.0.0 detected
✓ PostgreSQL is running

📦 Installing dependencies...
✓ Bundle install complete
✓ npm install complete

💾 Database lingolinq-development already exists

🌱 Would you like to seed the database? (y/n): y
✓ Database seeded successfully

🚀 Starting servers...
✓ Rails server started on port 5000
✓ Ember server started on port 8184

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎉 LingoLinq is now running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Frontend: http://localhost:8184
   Backend:  http://localhost:5000

   Login Credentials:
   Username: example
   Password: password

   Press Ctrl+C to stop all servers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Rails] Listening on http://0.0.0.0:5000
[Ember] Build successful (13582ms)
[Ember] Serving on http://localhost:8184
```

---

### **Option 2: Manual (Two Terminals)**

**Terminal 1 - Rails Backend:**
```bash
# Start Rails server
bundle exec rails server -p 5000

# Or with logging
bundle exec rails server -p 5000 | tee log/rails_dev.log
```

**Terminal 2 - Ember Frontend:**
```bash
# Navigate to frontend
cd app/frontend

# Use Node 18
nvm use 18

# Start Ember server (with proxy to Rails)
ember serve --port 8184 --proxy http://localhost:5000

# Or using npm script
npm start
```

---

### **Option 3: Full Stack with Background Jobs**

```bash
# Use the existing fresh_start script
bin/fresh_start
```

**What it includes:**
- ✅ Rails server
- ✅ Ember server  
- ✅ Redis server
- ✅ Resque workers (background jobs)

**Note:** Requires Redis to be installed and running.

---

## 🌐 **Step 6: Access the Application**

### **Primary URL (Frontend):**
```
http://localhost:8184
```

### **Backend API:**
```
http://localhost:5000
```

### **Login Credentials (if seeded):**
```
Username: example
Password: password
```

---

## ✅ **Step 7: Verify Everything Works**

### **1. Check Frontend Loads:**
Open http://localhost:8184 in your browser.

**You should see:**
- ✅ LingoLinq logo
- ✅ Login form (username and password fields)
- ✅ "Forgot Password?" link
- ✅ Footer with links

**Console should show:**
```javascript
✅ Ember 3.28.12
✅ LINGOLINQ: db succeeded
✅ LINGOLINQ: ready to start
✅ persistence service: Successfully proxying to legacy persistence
✅ app-state service: Successfully proxying to legacy app_state
```

---

### **2. Check Backend Responds:**
Open http://localhost:5000 in your browser.

**You should see:**
- ✅ A welcome page or redirect to frontend
- ✅ No 500 errors
- ✅ Rails console shows request logs

---

### **3. Test Login:**
1. Go to http://localhost:8184
2. Enter username: `example`
3. Enter password: `password`
4. Click "Sign In"

**Expected result:**
- ✅ Login succeeds
- ✅ Redirects to dashboard or home page
- ✅ No errors in console

---

### **4. Check Console (Developer Tools):**

**Good signs (Working):**
```javascript
✅ Ember 3.28.12
✅ LINGOLINQ: db succeeded
✅ LINGOLINQ: ready to start
✅ persistence service: Successfully proxying
✅ app-state service: Successfully proxying
✅ HTTP 200 on /api/v1/token_check
```

**Bad signs (Broken):**
```javascript
❌ app_state.create is not a function
❌ Cannot read property 'lookup' of undefined
❌ Assertion Failed: The controller name 'contact' is not recognized
❌ global_transition is not defined
❌ HTTP 404 on /api/v1/token_check
```

If you see ❌ errors, Rails backend might not be running. Check Terminal 1.

---

## 🔧 **Troubleshooting**

### **Problem: Port 5000 already in use**

**Solution:**
```bash
# Find process using port 5000
lsof -ti:5000

# Kill the process
kill -9 $(lsof -ti:5000)

# Or use a different port
bundle exec rails server -p 5001
# Update Ember proxy: ember serve --proxy http://localhost:5001
```

---

### **Problem: Port 8184 already in use**

**Solution:**
```bash
# Kill process on port 8184
kill -9 $(lsof -ti:8184)

# Or use a different port
cd app/frontend
ember serve --port 8185
# Access at: http://localhost:8185
```

---

### **Problem: Database connection error**

**Error:**
```
FATAL: role "your_username" does not exist
```

**Solution:**
```bash
# Create PostgreSQL user
createuser -s your_username

# Or with password
createuser -s -P your_username

# Update config/database.yml or .env
```

---

### **Problem: Redis connection refused**

**Error:**
```
Error connecting to Redis on localhost:6379 (Errno::ECONNREFUSED)
```

**Solution:**
```bash
# Start Redis
brew services start redis

# Or manually
redis-server

# Verify
redis-cli ping
# Should return: PONG
```

---

### **Problem: Bundle install fails**

**Error:**
```
An error occurred while installing pg (1.2.3)
```

**Solution:**
```bash
# macOS - Install PostgreSQL development headers
brew install postgresql@14

# Linux
sudo apt-get install libpq-dev

# Retry bundle install
bundle install
```

---

### **Problem: Node version wrong**

**Error:**
```
Node v20.19.6 is not tested with Ember CLI
```

**Solution:**
```bash
# Switch to Node 18
nvm use 18

# Verify
node -v
# Should show: v18.x.x

# Restart Ember server
cd app/frontend
ember serve --port 8184
```

---

### **Problem: Build fails with "Cannot find module"**

**Solution:**
```bash
# Clean install
cd app/frontend
rm -rf node_modules bower_components dist tmp
npm install
bower install

# Retry build
ember build --environment=development
```

---

### **Problem: White screen / blank page**

**Check console for errors:**

**If you see `app_state.create is not a function`:**
- ❌ You're not on the `fix/app-state-boot-crash` branch
- Solution: `git checkout fix/app-state-boot-crash && git pull`

**If you see `404 on /api/v1/token_check`:**
- ❌ Rails backend is not running
- Solution: Start Rails in Terminal 1

---

## 📊 **Monitoring and Logs**

### **View Rails Logs:**
```bash
tail -f log/development.log
```

### **View Ember Build Output:**
```bash
# Ember shows build output in the terminal where it's running
# Look for "Build successful" messages
```

### **Check Server Status:**
```bash
# Check if Rails is running
curl http://localhost:5000

# Check if Ember is running
curl http://localhost:8184
```

---

## 🛑 **Stopping Servers**

### **If using start_dev.sh:**
```bash
# Press Ctrl+C once
# Script will gracefully shutdown both servers
```

### **If using manual terminals:**
```bash
# In each terminal, press Ctrl+C
# Then close terminals
```

### **Force kill all (if needed):**
```bash
# Kill Rails
kill -9 $(lsof -ti:5000)

# Kill Ember
kill -9 $(lsof -ti:8184)

# Kill Redis (if running)
redis-cli shutdown
```

---

## 🔄 **Updating Code**

```bash
# Pull latest changes
git checkout fix/app-state-boot-crash
git pull origin fix/app-state-boot-crash

# Update dependencies
bundle install
cd app/frontend && npm install && cd ../..

# Restart servers
./start_dev.sh
```

---

## 📚 **Additional Resources**

### **Documentation:**
- `README.md` - Project overview
- `START_FULL_STACK.md` - Detailed startup guide
- `DEV_VS_DEPLOY.md` - Development vs deployment differences
- `BEFORE_AFTER_COMPARISON.md` - Fix comparison

### **Scripts:**
- `./start_dev.sh` - Automated startup (recommended)
- `bin/fresh_start` - Full stack with Redis/Resque
- `bin/deploy_prep` - Production build

### **Key Directories:**
- `app/` - Rails backend code
- `app/frontend/` - Ember frontend code
- `config/` - Configuration files
- `db/` - Database migrations and seeds
- `public/` - Static assets (served by Rails)

---

## 🎯 **What's Next?**

### **After First Login:**
1. **Explore the dashboard** - See boards and features
2. **Check admin panel** - Configure settings
3. **Test board creation** - Create a communication board
4. **Check user profile** - Update account settings

### **Development Tasks:**
1. **Fix deprecations** - See console warnings
2. **Add new features** - Build on stable foundation
3. **Write tests** - Ensure stability
4. **Upgrade Ember** - Plan for Ember 4.0

---

## ✅ **Success Checklist**

- [ ] Ruby 2.7+ installed
- [ ] PostgreSQL 12+ installed and running
- [ ] Node 18.x installed (via nvm)
- [ ] Redis installed (optional - for jobs)
- [ ] Repository cloned
- [ ] On `fix/app-state-boot-crash` branch
- [ ] `.env` file configured
- [ ] Ruby dependencies installed (`bundle install`)
- [ ] Node dependencies installed (`npm install`)
- [ ] Database created and migrated
- [ ] Database seeded (optional)
- [ ] Rails server running on port 5000
- [ ] Ember server running on port 8184
- [ ] Frontend loads at http://localhost:8184
- [ ] Login form visible (no white screen)
- [ ] Can login with example/password
- [ ] No blocking errors in console

---

## 🆘 **Getting Help**

### **Check Documentation First:**
1. Read `START_FULL_STACK.md`
2. Read `BEFORE_AFTER_COMPARISON.md`
3. Check this troubleshooting section

### **Review Console Errors:**
```javascript
// Open browser DevTools (F12)
// Check Console tab
// Look for red ERROR messages
// Share errors when asking for help
```

### **Check Branch Status:**
```bash
git status
git branch
git log --oneline -5
```

### **Verify Fix Commits:**
```bash
git log --oneline --grep="fix:"
# Should show 8 commits with "fix:" prefix
```

---

## 🎉 **You're Ready!**

If you completed all steps successfully:
- ✅ Frontend loads without white screen
- ✅ Login form renders correctly
- ✅ Can login with example/password
- ✅ No blocking JavaScript errors

**Congratulations! LingoLinq is running locally.** 🎊

---

**Last Updated:** 2026-01-22  
**Branch:** fix/app-state-boot-crash  
**Status:** ✅ VERIFIED WORKING
