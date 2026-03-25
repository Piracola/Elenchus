@echo off
chcp 65001 >nul 2>&1
title Elenchus Builder

echo.
echo ========================================
echo   Elenchus Portable Build
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*

pause
