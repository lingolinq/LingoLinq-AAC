#!/usr/bin/env node

/**
 * Universal DeepWiki MCP Launcher - Cross-platform compatibility
 * Automatically detects OS and runs appropriate devin script
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = process.cwd();
const BIN_DIR = path.join(REPO_ROOT, 'bin');

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Script selection based on platform
function getDevinScript() {
    if (isWindows) {
        const psScript = path.join(BIN_DIR, 'devin-simple.ps1');
        const cmdScript = path.join(BIN_DIR, 'devin.cmd');
        
        // Prefer PowerShell if available, fallback to cmd
        if (fs.existsSync(psScript)) {
            return { command: 'powershell', args: ['-ExecutionPolicy', 'Bypass', '-File', psScript] };
        } else if (fs.existsSync(cmdScript)) {
            return { command: 'cmd', args: ['/c', cmdScript] };
        }
    } else {
        // Unix-like systems (Linux, macOS)
        const bashScript = path.join(BIN_DIR, 'devin');
        if (fs.existsSync(bashScript)) {
            return { command: 'bash', args: [bashScript] };
        }
    }
    
    throw new Error(`No compatible devin script found for platform: ${process.platform}`);
}

// Main execution
function runDevin() {
    try {
        const script = getDevinScript();
        const args = script.args.concat(process.argv.slice(2)); // Pass through all arguments
        
        console.log(`🚀 Launching DeepWiki MCP on ${process.platform}...`);
        
        const child = spawn(script.command, args, {
            stdio: 'inherit',
            shell: isWindows,
            cwd: REPO_ROOT
        });
        
        child.on('error', (error) => {
            console.error(`❌ Failed to launch devin: ${error.message}`);
            process.exit(1);
        });
        
        child.on('close', (code) => {
            process.exit(code);
        });
        
    } catch (error) {
        console.error(`❌ Platform compatibility error: ${error.message}`);
        console.log(`\n🔧 Available platforms:`);
        console.log(`   Windows: devin-simple.ps1 or devin.cmd`);
        console.log(`   Linux/macOS: devin (bash)`);
        process.exit(1);
    }
}

// Help information
function showHelp() {
    console.log(`
🗂️ DeepWiki MCP Universal Launcher

USAGE:
    node devin-universal.js [command] [args...]

COMMANDS:
    context     - Get project context and architecture overview
    update      - Update project context from recent git changes  
    generate    - Generate fresh architecture map and documentation
    analyze     - Deep analysis of repository or recent changes
    ask         - Ask AI with full project context
    review      - AI-powered commit review with context
    
EXAMPLES:
    node devin-universal.js context
    node devin-universal.js generate
    node devin-universal.js ask "What are the main security concerns?"
    node devin-universal.js analyze repo

PLATFORM SUPPORT:
    ✅ Windows (PowerShell/CMD)  
    ✅ macOS (bash)
    ✅ Linux (bash)
    ✅ Node.js cross-platform
`);
}

// Entry point
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
} else {
    runDevin();
}