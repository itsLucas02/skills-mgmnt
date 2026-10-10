@echo off
rem ---------------------------------------------------------------------------
rem Hourly SkillPulse scan across every supported harness.
rem
rem Registered by the "SkillPulse Hourly Scan" scheduled task. Deliberately
rem headless: it does not need the dashboard running, unlike the old 60-second
rem poller which POSTed to localhost:3020 and silently recorded nothing whenever
rem the app was closed.
rem
rem Output is appended to scan.log next to the events so a failed run leaves
rem evidence instead of failing silently.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."

set "SP_DIR=%USERPROFILE%\.codex\skillpulse"
if not exist "%SP_DIR%" mkdir "%SP_DIR%"

echo [%DATE% %TIME%] scan starting >> "%SP_DIR%\scan.log"
node scripts\run-skillpulse-scan.mjs >> "%SP_DIR%\scan.log" 2>&1
set "SCAN_EXIT=%ERRORLEVEL%"
echo [%DATE% %TIME%] scan finished, exit=%SCAN_EXIT% >> "%SP_DIR%\scan.log"

endlocal & exit /b %SCAN_EXIT%
