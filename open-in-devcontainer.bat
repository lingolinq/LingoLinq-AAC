@echo off
REM Open LingoLinq-AAC in VS Code Dev Container

echo.
echo ========================================
echo Opening LingoLinq-AAC in Dev Container
echo ========================================
echo.
echo This will:
echo  1. Open VS Code in the LingoLinq-AAC folder
echo  2. Prompt you to "Reopen in Container"
echo  3. Build the dev container (first time takes 5-10 minutes)
echo  4. Install Ruby 3.4, Node 18+20, PostgreSQL, Redis
echo  5. Run all setup scripts automatically
echo.
echo Press any key to continue...
pause >nul

cd /d "%~dp0"
code .

echo.
echo ========================================
echo NEXT STEPS IN VS CODE:
echo ========================================
echo.
echo 1. When VS Code opens, look for a popup in the bottom-right
echo    corner that says "Reopen in Container"
echo.
echo 2. Click "Reopen in Container"
echo.
echo 3. Wait for the container to build (first time: ~5-10 min)
echo.
echo 4. Once built, open a terminal in VS Code and verify:
echo    - node -v (should show v20.x.x)
echo    - cd app/frontend ^&^& node -v (should show v18.x.x)
echo    - ruby -v (should show 3.4.x)
echo    - bundle -v (should show 2.6.8)
echo    - psql --version
echo    - redis-cli --version
echo.
echo ========================================
