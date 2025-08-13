# Simple PowerShell version of devin for Windows compatibility
# This fixes the Gemini CLI startup issue

param(
    [string]$Command = "context",
    [string]$Section = "all"
)

$RepoPath = git rev-parse --show-toplevel
$ContextPath = Join-Path $RepoPath ".ai\context"

function Update-Context {
    Write-Host "🔄 Updating DeepWiki context..."
    
    try {
        $RecentChangesPath = Join-Path $ContextPath "recent-changes.txt"
        git log --since="7 days ago" --oneline --stat | Out-File -FilePath $RecentChangesPath -Encoding UTF8
        Write-Host "✅ Context updated successfully"
    } catch {
        Write-Host "⚠️ Failed to update context: $_"
    }
}

function Get-ProjectContext {
    param([string]$Section = "all")
    
    $ProjectMapPath = Join-Path $ContextPath "PROJECT_MAP.md"
    $AIContextPath = Join-Path $ContextPath "AI_CONTEXT.md"
    
    if (Test-Path $ProjectMapPath) {
        Get-Content -Path $ProjectMapPath -Raw
    } elseif (Test-Path $AIContextPath) {
        Get-Content -Path $AIContextPath -Raw  
    } else {
        Write-Host "⚠️ No project context found. Run 'devin-simple.ps1 generate' first."
        return $null
    }
}

function Generate-ProjectMap {
    Write-Host "🏗️ Generating fresh architecture map..."
    Update-Context
    
    $ProjectMapPath = Join-Path $ContextPath "PROJECT_MAP.md"
    
    $Content = @"
# LingoLinq AAC Project Architecture

## Overview
Rails + Ember.js AAC system with multi-platform support

## Recent Activity
$(git log --since="7 days ago" --oneline | Select-Object -First 10 | Out-String)

## Key Directories
- app/models/ - Rails models
- app/controllers/ - Rails controllers
- app/frontend/ - Ember.js frontend
- lib/ - Shared utilities
- .ai/context/ - AI context files
- .ai/tools/ - Development tools
- docs/ - Project documentation
"@
    
    $Content | Out-File -FilePath $ProjectMapPath -Encoding UTF8
    Write-Host "✅ Architecture map generated at $ProjectMapPath"
}

# Main command processing
switch ($Command.ToLower()) {
    "context" { 
        Get-ProjectContext -Section $Section
    }
    "update" { 
        Update-Context 
    }
    "generate" { 
        Generate-ProjectMap 
    }
    default { 
        Write-Host "Usage: devin-simple.ps1 [context|update|generate]"
        Write-Host "  context  - Get project context"  
        Write-Host "  update   - Update context from recent changes"
        Write-Host "  generate - Generate fresh architecture map"
    }
}