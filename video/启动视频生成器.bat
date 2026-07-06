@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%start-ui.ps1"

if not exist "%PS_SCRIPT%" (
  echo.
  echo start-ui.ps1 was not found next to this launcher.
  pause
  exit /b 1
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Startup failed. Please check the error message above.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo Service stopped. Press any key to close this window.
pause >nul
exit /b 0
