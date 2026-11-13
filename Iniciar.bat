@echo off
if not "%~1"=="--minimizado" (
  start "VIA-AHK Studio" /min "%~f0" --minimizado
  exit /b
)
cd /d "%~dp0"
:iniciar
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 42 goto iniciar
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o app local com o Windows PowerShell.
  pause
)
