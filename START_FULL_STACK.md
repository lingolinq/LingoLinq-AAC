# 🚀 LingoLinq Full Stack Startup Guide

## Prerequisites

### Required Software
- **Ruby**: ~3.4.3 (check: `ruby -v`)
- **Node.js**: 18.x or 20.x (check: `node -v`)
- **PostgreSQL**: 12+ (check: `psql --version`)
- **Bundler**: Latest (check: `bundle -v`)
- **npm**: 8+ (check: `npm -v`)

### Environment Setup
```bash
# Install Ruby (if needed)
# Use rbenv or rvm to install Ruby 3.4.3

# Install PostgreSQL (if needed)
# macOS: brew install postgresql
# Ubuntu: sudo apt-get install postgresql postgresql-contrib
# Windows: Download from postgresql.org

# Start PostgreSQL service
# macOS: brew services start postgresql
# Ubuntu: sudo service postgresql start
# Windows: Start from Services
```

---

## 🔧 First-Time Setup

### 1. Install Dependencies

```bash
cd /path/to/LingoLinq-AAC

# Install Ruby gems
bundle install

# Install Node packages (for Ember frontend)
cd app/frontend
npm install
cd ../..
```

### 2. Database Setup

```bash
# Create database
bundle exec rake db:create

# Run migrations
bundle exec rake db:migrate

# Seed initial data (optional but recommended)
bundle exec rake db:seed
```

### 3. Environment Variables

Create a `.env` file in the project root:

```bash
# Copy example if it exists
cp .env.example .env

# Or create manually with essential variables:
cat > .env << 'EOF'
# Database
DB_USER=postgres
DATABASE_URL=postgresql://localhost/lingolinq-development

# Rails
RAILS_ENV=development
SECRET_KEY_BASE=your-secret-key-here-generate-with-rake-secret

# API Keys (optional for basic testing)
# AWS_KEY=your-aws-key
# AWS_SECRET=your-aws-secret

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:8184

# Backend URL
BACKEND_URL=http://localhost:5000
EOF

# Generate a secret key
bundle exec rake secret
# Copy output and paste into .env as SECRET_KEY_BASE
```

---

## 🚀 Starting the Full Stack

### Option A: Manual Start (Recommended for debugging)

#### Terminal 1: Rails Backend
```bash
cd /path/to/LingoLinq-AAC

# Start Rails server
bundle exec rails s -p 5000

# Server will be available at: http://localhost:5000
```

#### Terminal 2: Ember Frontend
```bash
cd /path/to/LingoLinq-AAC/app/frontend

# Start Ember dev server with proxy
ember serve --port 8184 --proxy http://localhost:5000

# App will be available at: http://localhost:8184
```

### Option B: Using Foreman/Procfile (If configured)

```bash
cd /path/to/LingoLinq-AAC

# If Procfile exists:
foreman start

# Or if using bin/fresh_start:
./bin/fresh_start
```

---

## 🌐 Accessing the Application

Once both servers are running:

- **Frontend**: http://localhost:8184
- **Backend API**: http://localhost:5000/api/v1
- **Health Check**: http://localhost:5000/api/v1/token_check

---

## ✅ Verification Checklist

### Backend Health Check
```bash
# Test if Rails is responding
curl http://localhost:5000/api/v1/token_check
# Expected: JSON response (even if error, shows server is running)

# Test a simple endpoint
curl http://localhost:5000/health
```

### Frontend Health Check
Open http://localhost:8184 in your browser and verify:

- ✅ No white screen
- ✅ Login form renders
- ✅ LingoLinq logo appears
- ✅ No "controller not found" errors in console (F12)
- ✅ No "app_state.create" errors
- ✅ Console shows: "LINGOLINQ: ready to start"
- ✅ IndexedDB initialized: "LINGOLINQ: db succeeded"

### Expected Console Messages
```javascript
// GOOD - These are normal:
DEBUG: Ember      : 3.28.12
DEBUG: Ember Data : 3.28.13
DEBUG: jQuery     : 3.7.1
LINGOLINQ: db succeeded
LINGOLINQ: extras ready
LINGOLINQ: ready to start
persistence service: Successfully proxying to legacy persistence
app-state service: Successfully proxying to legacy app_state

// EXPECTED (without authentication):
ember ajax error: 404: (GET /api/v1/token_check?access_token=none)
[check_token] Token check failed

// BAD - These indicate problems:
❌ "controller not found" or "Expected to find: controller:X"
❌ "app_state.create is not a function"
❌ "global_transition is not a function"
❌ White screen with no UI
```

---

## 🐛 Troubleshooting

### Problem: Rails won't start

#### Error: "database does not exist"
```bash
bundle exec rake db:create
bundle exec rake db:migrate
```

#### Error: "PG::ConnectionBad: connection refused"
```bash
# Check if PostgreSQL is running
# macOS: brew services list
# Ubuntu: sudo service postgresql status

# Start PostgreSQL if needed
# macOS: brew services start postgresql
# Ubuntu: sudo service postgresql start
```

#### Error: "Bundler version mismatch"
```bash
gem install bundler
bundle install
```

### Problem: Ember won't start

#### Error: "ember: command not found"
```bash
cd app/frontend
npm install -g ember-cli
npm install
```

#### Error: "bower packages not installed"
```bash
cd app/frontend
npx bower install
```

#### Error: "EADDRINUSE: port already in use"
```bash
# Find and kill process on port 8184
# macOS/Linux:
lsof -ti:8184 | xargs kill -9

# Windows:
netstat -ano | findstr :8184
taskkill /PID <PID> /F
```

### Problem: CORS errors in browser

**Check**: Is Rails configured correctly?
```bash
# Verify CORS middleware in config/environments/development.rb
grep -A 10 "Rack::Cors" config/environments/development.rb
```

**Solution**: Already configured in this project!

### Problem: Frontend shows but API calls fail

**Check**: Is Rails actually running?
```bash
curl http://localhost:5000/api/v1/token_check
```

**Check**: Is Ember proxying correctly?
```bash
# In app/frontend/config/environment.js, verify:
# ENV.APP.API_HOST should be set or empty (uses proxy)
```

### Problem: Images/logos don't show

**Check**: Are assets built and copied?
```bash
cd app/frontend
npm run build
cp -r dist/* ../../public/

# Restart Rails to serve new assets
```

**Note**: When using `ember serve`, assets are served from Ember dev server, not Rails.

---

## 🔄 Development Workflow

### Making Frontend Changes
```bash
# Ember dev server watches for changes automatically
# Just edit files in app/frontend/app/
# Changes will hot-reload in browser
```

### Making Backend Changes
```bash
# Rails reloads automatically in development
# Just edit files in app/ or config/
# Refresh browser to see changes
```

### Rebuilding Frontend for Production
```bash
cd app/frontend

# Build optimized assets
npm run build -- --environment=production

# Copy to Rails public directory
cp -r dist/* ../../public/

# Restart Rails
# (Ctrl+C in Rails terminal, then restart)
```

---

## 📝 Quick Reference

| Service | Port | URL |
|---------|------|-----|
| Rails Backend | 5000 | http://localhost:5000 |
| Ember Frontend | 8184 | http://localhost:8184 |
| PostgreSQL | 5432 | localhost:5432 |

| Command | Purpose |
|---------|---------|
| `bundle exec rails s -p 5000` | Start Rails |
| `ember serve --port 8184` | Start Ember |
| `bundle exec rake db:migrate` | Run migrations |
| `bundle exec rake db:reset` | Reset database |
| `npm run build` | Build frontend |

---

## 🎯 Success Criteria

Your full stack is working correctly when:

1. ✅ Rails responds at http://localhost:5000
2. ✅ Ember loads at http://localhost:8184
3. ✅ Login form appears (no white screen)
4. ✅ No JavaScript errors in browser console
5. ✅ Logo and images load
6. ✅ API calls reach Rails (check Rails logs)
7. ✅ No CORS errors in browser console

---

## 📞 Need Help?

If you're still having issues:

1. **Check Rails logs**: `tail -f log/development.log`
2. **Check browser console**: F12 → Console tab
3. **Check network tab**: F12 → Network tab (see API calls)
4. **Verify all services running**: `ps aux | grep -E 'rails|ember'`

---

## 🎉 You're Ready!

Once both servers are running and the verification checklist passes, you have a fully functional LingoLinq stack for development!
