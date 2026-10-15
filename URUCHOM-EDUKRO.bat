@echo off
chcp 65001 >nul
title EDUKRO
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Nie znaleziono Node.js. Zainstaluj wersje LTS ze strony https://nodejs.org
  echo  i uruchom ten plik ponownie.
  echo.
  pause
  exit /b 1
)
echo.
echo  Zamykam poprzednie uruchomienie EDUKRO (jesli jeszcze dziala)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force } }"
timeout /t 1 /nobreak >nul
echo.
echo  EDUKRO startuje... Za chwile otworzy sie przegladarka.
echo  Aby zatrzymac EDUKRO, zamknij to okno.
echo.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process http://localhost:3000/?v=%RANDOM%"
call npm start
echo.
pause
