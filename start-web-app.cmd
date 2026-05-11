@echo off
setlocal
cd /d "%~dp0"

echo Building web app...
call npm run build:web
if errorlevel 1 (
  echo Build failed. Press any key to close.
  pause >nul
  exit /b 1
)

start "WMSU HRMO Tracker Server" /D "%~dp0" cmd /k node backend\dist\index.js
powershell -NoProfile -Command "while ($true) { try { $r = Invoke-WebRequest 'http://localhost:4000/api/reports/summary' -UseBasicParsing; if ($r.StatusCode -eq 200) { break } } catch {} Start-Sleep -Milliseconds 500 }"
start "" "http://localhost:4000"
