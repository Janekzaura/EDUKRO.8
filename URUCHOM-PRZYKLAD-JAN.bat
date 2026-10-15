@echo off
chcp 65001 >nul
title EDUKRO - przygotowanie konta Jana
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Nie znaleziono Node.js. Zainstaluj wersje LTS ze strony https://nodejs.org
  pause
  exit /b 1
)
node --disable-warning=ExperimentalWarning tools/setup-jan.mjs
echo.
pause
