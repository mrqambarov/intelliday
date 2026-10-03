@echo off
title IntelliDay - Aqlli Kun Tartibi
echo ========================================================
echo   🌟 IntelliDay - Aqlli Kun Tartibi va Shaxsiy Assistent
echo   Server ishga tushirilmoqda...
echo ========================================================

start http://localhost:8080

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [ENGINE] Node.js server ishga tushmoqda (Real-time Sync + Telegram Bot)...
    node "%~dp0server.js"
) else (
    echo [ENGINE] PowerShell server ishga tushmoqda...
    powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
)

pause
