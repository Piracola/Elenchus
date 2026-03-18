@echo off
chcp 65001 >nul 2>&1
title Elenchus Release Launcher

echo.
echo ========================================
echo   Elenchus Release Launcher
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0start-release.ps1" %*

pause
