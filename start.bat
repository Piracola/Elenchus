@echo off
chcp 65001 >nul 2>&1
title Elenchus Launcher

echo.
echo ========================================
echo   Elenchus AI Debate Framework
echo ========================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

pause
