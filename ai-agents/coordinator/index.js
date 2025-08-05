/**
 * AI Agent Coordinator Service
 * Manages persistent context, version constraints, and agent coordination for LingoLinq development
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 4000;
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/workspace';
const CONTEXT_PATH = process.env.CONTEXT_PATH || '/ai-context';

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(CONTEXT_PATH, 'coordinator.log') })
  ]
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Context storage
let projectConstraints = {};
let sessionContext = {};
let agentChanges = [];
let versionWarnings = [];

// Initialize context files
async function initializeContext() {
  try {
    // Load project constraints
    const constraintsPath = path.join(CONTEXT_PATH, 'project-constraints.json');
    if (await fs.pathExists(constraintsPath)) {
      projectConstraints = await fs.readJson(constraintsPath);
      logger.info('Loaded project constraints');
    }

    // Initialize session context
    const sessionPath = path.join(CONTEXT_PATH, 'session-context.json');
    if (await fs.pathExists(sessionPath)) {
      sessionContext = await fs.readJson(sessionPath);
    } else {
      sessionContext = {
        active_agents: [],
        last_version_check: null,
        current_session_id: generateSessionId(),
        environment_status: 'unknown',
        constraints_violations: []
      };
      await fs.writeJson(sessionPath, sessionContext, { spaces: 2 });
    }

    // Initialize change log
    const changesPath = path.join(CONTEXT_PATH, 'agent-changes.log');
    if (await fs.pathExists(changesPath)) {
      const changesContent = await fs.readFile(changesPath, 'utf8');
      agentChanges = changesContent.split('\n').filter(line => line.trim());
    }

    // Initialize version warnings
    const warningsPath = path.join(CONTEXT_PATH, 'version-warnings.json');
    if (await fs.pathExists(warningsPath)) {
      versionWarnings = await fs.readJson(warningsPath);
    }

    logger.info('Context initialization completed');
  } catch (error) {
    logger.error('Failed to initialize context:', error);
  }
}

// Generate unique session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Watch for file changes in workspace
function setupFileWatcher() {
  const watcher = chokidar.watch([
    path.join(WORKSPACE_PATH, 'package.json'),
    path.join(WORKSPACE_PATH, 'app/frontend/package.json'),
    path.join(WORKSPACE_PATH, 'Gemfile'),
    path.join(WORKSPACE_PATH, '.nvmrc'),
    path.join(WORKSPACE_PATH, '.ruby-version')
  ], { ignoreInitial: true });

  watcher.on('change', async (filePath) => {
    logger.info(`Critical file changed: ${filePath}`);
    await logAgentChange('system', `File modified: ${path.basename(filePath)}`);
    await checkVersionConstraints();
  });
}

// Log agent changes
async function logAgentChange(agentId, action, details = {}) {
  const change = {
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    action: action,
    details: details
  };

  agentChanges.push(JSON.stringify(change));
  
  // Keep only last 1000 changes
  if (agentChanges.length > 1000) {
    agentChanges = agentChanges.slice(-1000);
  }

  // Write to log file
  const changesPath = path.join(CONTEXT_PATH, 'agent-changes.log');
  await fs.writeFile(changesPath, agentChanges.join('\n'));

  logger.info(`Agent change logged: ${agentId} - ${action}`);
}

// Check version constraints
async function checkVersionConstraints() {
  const violations = [];

  try {
    // Check Node.js version if package.json exists
    const frontendPackagePath = path.join(WORKSPACE_PATH, 'app/frontend/package.json');
    if (await fs.pathExists(frontendPackagePath)) {
      const packageJson = await fs.readJson(frontendPackagePath);
      if (packageJson.engines && packageJson.engines.node) {
        const requiredNode = packageJson.engines.node;
        violations.push({
          type: 'version_constraint',
          component: 'node.js',
          required: requiredNode,
          constraint: 'Must remain 18.x for Ember 3.12 compatibility'
        });
      }
    }

    // Check Ruby version from Gemfile
    const gemfilePath = path.join(WORKSPACE_PATH, 'Gemfile');
    if (await fs.pathExists(gemfilePath)) {
      const gemfileContent = await fs.readFile(gemfilePath, 'utf8');
      const rubyMatch = gemfileContent.match(/ruby\s+["']([^"']+)["']/);
      if (rubyMatch) {
        violations.push({
          type: 'version_constraint',
          component: 'ruby',
          required: rubyMatch[1],
          constraint: 'Must remain 3.2.8 for Rails 6.1 compatibility'
        });
      }
    }

    // Update session context
    sessionContext.constraints_violations = violations;
    sessionContext.last_version_check = new Date().toISOString();
    
    const sessionPath = path.join(CONTEXT_PATH, 'session-context.json');
    await fs.writeJson(sessionPath, sessionContext, { spaces: 2 });

    if (violations.length > 0) {
      logger.warn(`Found ${violations.length} version constraint violations`);
    }

  } catch (error) {
    logger.error('Error checking version constraints:', error);
  }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    session_id: sessionContext.current_session_id
  });
});

// Get project constraints
app.get('/api/constraints', (req, res) => {
  res.json(projectConstraints);
});

// Get session context
app.get('/api/context', (req, res) => {
  res.json(sessionContext);
});

// Register agent
app.post('/api/agents/register', async (req, res) => {
  const { agent_id, agent_type, capabilities } = req.body;
  
  const agent = {
    id: agent_id,
    type: agent_type,
    capabilities: capabilities,
    registered_at: new Date().toISOString(),
    last_active: new Date().toISOString()
  };

  // Remove existing agent with same ID
  sessionContext.active_agents = sessionContext.active_agents.filter(a => a.id !== agent_id);
  
  // Add new agent
  sessionContext.active_agents.push(agent);

  // Update session context file
  const sessionPath = path.join(CONTEXT_PATH, 'session-context.json');
  await fs.writeJson(sessionPath, sessionContext, { spaces: 2 });

  await logAgentChange(agent_id, 'registered', { type: agent_type, capabilities });

  logger.info(`Agent registered: ${agent_id} (${agent_type})`);
  res.json({ success: true, agent });
});

// Log agent action
app.post('/api/agents/:agentId/action', async (req, res) => {
  const { agentId } = req.params;
  const { action, details } = req.body;

  // Update agent last active time
  const agent = sessionContext.active_agents.find(a => a.id === agentId);
  if (agent) {
    agent.last_active = new Date().toISOString();
  }

  await logAgentChange(agentId, action, details);

  // Check if action involves version changes
  if (action.includes('version') || action.includes('upgrade') || action.includes('update')) {
    await checkVersionConstraints();
    
    // Add warning if constraint violation detected
    const warning = {
      timestamp: new Date().toISOString(),
      agent_id: agentId,
      action: action,
      warning: 'Version change detected - verify compatibility with project constraints'
    };
    
    versionWarnings.push(warning);
    
    const warningsPath = path.join(CONTEXT_PATH, 'version-warnings.json');
    await fs.writeJson(warningsPath, versionWarnings, { spaces: 2 });
  }

  res.json({ success: true });
});

// Get recent changes
app.get('/api/changes', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentChanges = agentChanges.slice(-limit).map(change => {
    try {
      return JSON.parse(change);
    } catch {
      return { raw: change };
    }
  });
  
  res.json(recentChanges);
});

// Get version warnings
app.get('/api/warnings', (req, res) => {
  res.json(versionWarnings);
});

// Environment verification endpoint
app.post('/api/verify-environment', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, 'scripts', 'verify-environment.sh');
    
    const verification = spawn('bash', [scriptPath], {
      cwd: WORKSPACE_PATH,
      stdio: 'pipe'
    });

    let output = '';
    let error = '';

    verification.stdout.on('data', (data) => {
      output += data.toString();
    });

    verification.stderr.on('data', (data) => {
      error += data.toString();
    });

    verification.on('close', async (code) => {
      const result = {
        success: code === 0,
        output: output,
        error: error,
        timestamp: new Date().toISOString()
      };

      sessionContext.environment_status = code === 0 ? 'verified' : 'failed';
      const sessionPath = path.join(CONTEXT_PATH, 'session-context.json');
      await fs.writeJson(sessionPath, sessionContext, { spaces: 2 });

      res.json(result);
    });

  } catch (error) {
    logger.error('Environment verification failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear session data
app.post('/api/session/reset', async (req, res) => {
  sessionContext = {
    active_agents: [],
    last_version_check: null,
    current_session_id: generateSessionId(),
    environment_status: 'unknown',
    constraints_violations: []
  };

  const sessionPath = path.join(CONTEXT_PATH, 'session-context.json');
  await fs.writeJson(sessionPath, sessionContext, { spaces: 2 });

  logger.info('Session reset completed');
  res.json({ success: true, session_id: sessionContext.current_session_id });
});

// Initialize and start server
async function startServer() {
  await initializeContext();
  setupFileWatcher();
  
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`AI Agent Coordinator running on port ${PORT}`);
    logger.info(`Session ID: ${sessionContext.current_session_id}`);
    console.log(`🤖 AI Agent Coordinator Service`);
    console.log(`📍 Running on: http://localhost:${PORT}`);
    console.log(`🎯 Session: ${sessionContext.current_session_id}`);
    console.log(`📁 Workspace: ${WORKSPACE_PATH}`);
    console.log(`💾 Context: ${CONTEXT_PATH}`);
  });
}

startServer().catch(error => {
  logger.error('Failed to start coordinator service:', error);
  process.exit(1);
});