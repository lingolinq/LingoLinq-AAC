@echo off
REM Windows batch version of devin script for Gemini CLI compatibility

set "REPO_PATH=%cd%"
set "CONTEXT_PATH=%REPO_PATH%\.ai\context"

if "%~1"=="" goto :context
if /i "%~1"=="context" goto :context
if /i "%~1"=="update" goto :update
if /i "%~1"=="generate" goto :generate
goto :usage

:context
if exist "%CONTEXT_PATH%\PROJECT_MAP.md" (
    type "%CONTEXT_PATH%\PROJECT_MAP.md"
) else if exist "%CONTEXT_PATH%\AI_CONTEXT.md" (
    type "%CONTEXT_PATH%\AI_CONTEXT.md"  
) else (
    echo No project context found. Run 'devin generate' first.
)
goto :end

:update
echo Updating DeepWiki context...
git log --since="7 days ago" --oneline --stat > "%CONTEXT_PATH%\recent-changes.txt" 2>nul
if %errorlevel%==0 (
    echo Context updated successfully
) else (
    echo Failed to update context
)
goto :end

:generate
echo Generating fresh architecture map...
call :update
(
    echo # LingoLinq AAC Project Architecture
    echo.
    echo ## Overview  
    echo Rails + Ember.js AAC system with multi-platform support
    echo.
    echo ## Recent Activity
    git log --since="7 days ago" --oneline 2>nul | findstr /n "^" | findstr /b "^[1-9]:"
    echo.
    echo ## Key Directories
    echo - app/models/ - Rails models
    echo - app/controllers/ - Rails controllers  
    echo - app/frontend/ - Ember.js frontend
    echo - lib/ - Shared utilities
    echo - .ai/context/ - AI context files
) > "%CONTEXT_PATH%\PROJECT_MAP.md"
echo Architecture map generated
goto :end

:usage
echo Usage: devin [context^|update^|generate]
echo   context  - Get project context
echo   update   - Update context from recent changes  
echo   generate - Generate fresh architecture map
goto :end

:end