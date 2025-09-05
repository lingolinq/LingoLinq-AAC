# LingoLinq AAC - Getting Started Guide

**🚀 Get up and running in 15 minutes**

This is the authoritative guide for new team members joining LingoLinq AAC development.

---

## **Prerequisites** ⚡

**All you need:**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (handles Ruby, Node.js, databases)
- [Git](https://git-scm.com/) (for version control)
- Code editor ([VS Code](https://code.visualstudio.com/) recommended)

**Optional but recommended:**
- [Claude CLI](https://claude.ai/cli) (AI development assistant)
- [Chrome/Firefox](https://www.google.com/chrome/) (for testing)

---

## **Quick Start** 🏃‍♂️

### **1. Clone & Navigate**
```bash
git clone https://github.com/swahlquist/LingoLinq-AAC.git
cd LingoLinq-AAC
```

### **2. Validate Your Environment** 
```bash
./bin/doctor
```
*This checks Docker, Git, ports, and project structure*

### **3. Start Development Environment**
```bash
cd docker
docker-compose up
```
*First run takes ~3-5 minutes (downloads images, installs dependencies)*

### **4. Verify It Works**
- **Web App**: http://localhost:3000
- **Database**: localhost:5432 (if needed for tools)
- **Redis**: localhost:6379 (if needed for caching)

**✅ Success?** You should see the LingoLinq AAC application running!

---

## **Development Workflow** 🔄

### **Daily Development**
```bash
# Start services (if not running)
cd docker && docker-compose up -d

# Work on your code in your editor
# Files auto-sync between host and containers

# View logs if needed
docker-compose logs -f web

# Stop when done
docker-compose down
```

### **Branch-Specific Work**
- **Global**: Changes that affect all branches (configs, CI/CD, core dependencies)
- **Branch-Specific**: Feature docs go in `docs/branches/your-branch-name/`

### **AI Development (Optional but Powerful)**
```bash
# If you have Claude CLI installed
claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json"

# Or use the project helper
./bin/devin
```

---

## **Project Structure** 📁

```
LingoLinq-AAC/
├── 🏗️  app/                          # Rails application code
├── 🐳  docker/                       # Docker development environment  
├── 📚  docs/                         # Project documentation
│   └── branches/                     # Branch-specific documentation
├── 🤖  .ai/                          # AI development tools (global)
│   ├── agents/                       # AI agent configurations
│   ├── docs/                         # AI tool documentation
│   └── tools/                        # Development utilities
├── ⚙️  .devcontainer/                # VS Code dev container config
├── 🔧  bin/                          # Project scripts
│   ├── doctor                        # Environment validation
│   └── devin                         # AI development helper
└── 📄  GETTING_STARTED.md           # This file
```

---

## **Key Commands** ⌨️

### **Environment Management**
```bash
./bin/doctor                    # Check environment health
cd docker && docker-compose up # Start development environment
docker-compose logs -f web     # View Rails logs
docker-compose down            # Stop all services
```

### **Development Tasks**
```bash
# Run tests (inside container)
docker-compose exec web bundle exec rspec

# Rails console (inside container)  
docker-compose exec web rails console

# Database operations (inside container)
docker-compose exec web rails db:migrate
docker-compose exec web rails db:seed
```

### **AI Development**
```bash
./bin/devin                     # Start AI development session
claude --mcp-config .ai/...    # Direct Claude integration
```

---

## **Troubleshooting** 🔧

### **Common Issues & Solutions**

**🚨 Docker won't start**
```bash
# Check Docker Desktop is running
docker --version

# On Windows: Restart Docker Desktop
# On Mac/Linux: sudo systemctl restart docker
```

**🚨 Port conflicts (3000, 5432, 6379)**
```bash
# Find what's using the port
netstat -an | grep :3000  # or lsof -i :3000

# Stop conflicting service or change ports in docker-compose.yml
```

**🚨 Permission issues**
```bash
# On Linux/Mac, ensure Docker can access your files
sudo chown -R $USER:$USER .
```

**🚨 Slow performance**
```bash
# Increase Docker resources in Docker Desktop settings
# Memory: 4GB+ recommended
# CPU: 2+ cores recommended
```

### **Getting Help**

1. **Run the doctor**: `./bin/doctor` - identifies most issues
2. **Check logs**: `docker-compose logs web` - see what's failing
3. **Clean restart**: `docker-compose down && docker-compose up --build`
4. **Reset everything**: Remove volumes: `docker-compose down -v`

---

## **Version Requirements** 📋

**Handled by Docker (recommended):**
- Ruby 3.2.8
- Node.js 18.x (for Ember 3.12 compatibility)
- PostgreSQL 15
- Redis 7

**Local development (optional):**
- You can use any Ruby/Node versions locally for modern development
- Use Docker containers when you need legacy compatibility testing

---

## **Branch Guidelines** 🌳

### **Current Active Branches**
- `main` - Production-ready code
- `feature/llm-enhanced-inflections` - Multi-language AI features
- `epic/ai-features` - Broader AI integration work
- `rails-6-to-7-upgrade` - Framework upgrade
- `epic/rebranding-and-ux-ui` - UI/UX modernization

### **Working on a Branch**
```bash
# Switch to your branch
git checkout your-branch-name

# For new branches, create branch-specific docs
mkdir -p docs/branches/your-branch-name
echo "# Your Branch Name" > docs/branches/your-branch-name/README.md
```

### **Documentation Guidelines**
- **Global changes**: Document in main `docs/` directory
- **Branch-specific**: Use `docs/branches/your-branch-name/`
- **AI tools**: Configure in `.ai/` (shared across branches)

---

## **AI Development** 🤖

LingoLinq AAC has sophisticated AI development integration:

### **For Everyone**
- Project structure is optimized for AI assistance
- All documentation is AI-readable
- Development patterns are consistent

### **For AI Power Users**
```bash
# Environment variables (add to .env)
GEMINI_API_KEY=your_key_here
CLAUDE_API_KEY=your_key_here  

# Start enhanced development session
./bin/devin

# Or use Claude directly
claude --mcp-config ".ai/tools/deepwiki-mcp/claude-mcp-config.json"
```

### **AI Features Available**
- Repository analysis and understanding
- Code generation with project context
- Architecture guidance and best practices
- Multi-language development assistance
- Automated testing and validation

---

## **Next Steps** 🎯

### **First Week**
1. ✅ Complete this setup guide
2. 📖 Read project documentation in `docs/`
3. 🏗️ Make a small change and test the workflow
4. 🤝 Join team discussions and code reviews

### **First Month** 
1. 🚀 Contribute to your first feature
2. 🤖 Try AI development tools (optional)
3. 📝 Improve documentation based on your experience
4. 🎓 Learn the AAC domain and user needs

---

## **Resources** 📚

### **Project-Specific**
- [Team Onboarding](TEAM_ONBOARDING.md) - Detailed team processes
- [Development Guide](docs/development/SETUP.md) - In-depth development info
- [Architecture Docs](docs/architecture/) - System design

### **External**
- [AAC Overview](https://en.wikipedia.org/wiki/Augmentative_and_alternative_communication) - Domain knowledge
- [Rails Guides](https://guides.rubyonrails.org/) - Framework documentation
- [Ember.js Guides](https://guides.emberjs.com/) - Frontend framework

---

## **Questions?** 💬

- **Setup issues**: Run `./bin/doctor` and check troubleshooting section
- **Development questions**: Check existing documentation first
- **AI tools**: See `.ai/docs/` for setup and usage guides
- **Domain questions**: Ask team members about AAC concepts

---

*Welcome to the LingoLinq AAC team! 🎉*

**Last updated:** 2025-09-05  
**Validation status:** ✅ Tested with Docker on Windows/Mac/Linux